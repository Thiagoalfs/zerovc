use crate::audio::resolve_audio_capture_binary;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenSource {
    pub id: String,
    pub name: String,
    pub thumbnail: String,
    pub app_icon: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenSourcesOptions {
    pub thumbnail: Option<bool>,
    pub fetch_window_icons: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeScreenShareOptions {
    pub url: String,
    pub token: String,
    pub source_id: String,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub bitrate: u64,
    pub include_audio: bool,
    pub e2ee_key: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeScreenShareResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub struct ScreenShareState {
    pub active_child: Option<Child>,
}

impl Default for ScreenShareState {
    fn default() -> Self {
        Self { active_child: None }
    }
}

impl ScreenShareState {
    pub async fn stop(&mut self) {
        if let Some(mut child) = self.active_child.take() {
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(b"stop\n").await;
                let _ = stdin.shutdown().await;
            }
            tokio::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                let _ = child.kill().await;
            });
        }
    }
}

pub fn resolve_screenshare_binary(app: &AppHandle) -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    let binary_name = "zerovc-screenshare.exe";
    #[cfg(not(target_os = "windows"))]
    let binary_name = "zerovc-screenshare";

    let mut candidates = Vec::new();
    if let Ok(res_dir) = app.path().resource_dir() {
        candidates.push(res_dir.join("bin").join(binary_name));
        candidates.push(res_dir.join(binary_name));
    }
    if let Ok(Some(dir)) = std::env::current_exe().map(|p| p.parent().map(|d| d.to_path_buf())) {
        candidates.push(dir.join("bin").join(binary_name));
        candidates.push(dir.join(binary_name));
    }
    candidates.push(PathBuf::from("native/bin").join(binary_name));
    candidates.push(PathBuf::from("../native/bin").join(binary_name));
    candidates.push(
        PathBuf::from("../native/native-screenshare/target/release").join(binary_name),
    );

    candidates.into_iter().find(|p| p.exists())
}

pub async fn get_screen_sources(_opts: Option<ScreenSourcesOptions>) -> Vec<ScreenSource> {
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("WAYLAND_DISPLAY").is_some() {
            return vec![ScreenSource {
                id: "screen:wayland-portal".to_string(),
                name: "Selecionar Tela Inteira ou Janela (Portal do Sistema)".to_string(),
                thumbnail: String::new(),
                app_icon: None,
            }];
        }
    }

    vec![ScreenSource {
        id: "screen:0:0".to_string(),
        name: "Tela Principal".to_string(),
        thumbnail: String::new(),
        app_icon: None,
    }]
}

pub async fn start_native_screenshare(
    app: &AppHandle,
    state: Arc<Mutex<ScreenShareState>>,
    options: NativeScreenShareOptions,
) -> NativeScreenShareResult {
    {
        let mut guard = state.lock().await;
        guard.stop().await;
    }

    let Some(bin_path) = resolve_screenshare_binary(app) else {
        return NativeScreenShareResult {
            success: false,
            error: Some("native-screenshare-binary-not-found".to_string()),
        };
    };

    let width = if options.width == 0 { 1280 } else { options.width };
    let height = if options.height == 0 { 720 } else { options.height };
    let fps = if options.fps == 0 { 30 } else { options.fps };
    let bitrate = if options.bitrate == 0 {
        3_500_000
    } else {
        options.bitrate
    };
    let source_id = if options.source_id.is_empty() {
        "screen:0:0".to_string()
    } else {
        options.source_id
    };

    let mut args = vec![
        "--url".to_string(),
        options.url,
        "--token".to_string(),
        options.token,
        "--source-id".to_string(),
        source_id,
        "--width".to_string(),
        width.to_string(),
        "--height".to_string(),
        height.to_string(),
        "--fps".to_string(),
        fps.to_string(),
        "--bitrate".to_string(),
        bitrate.to_string(),
        "--include-audio".to_string(),
        if options.include_audio {
            "true".to_string()
        } else {
            "false".to_string()
        },
        "--self-pid".to_string(),
        std::process::id().to_string(),
    ];

    #[cfg(target_os = "windows")]
    if let Some(audio_helper) = resolve_audio_capture_binary(app) {
        args.push("--audio-helper".to_string());
        args.push(audio_helper.to_string_lossy().to_string());
    }

    if let Some(e2ee) = options.e2ee_key.filter(|k| !k.is_empty()) {
        args.push("--e2ee-key".to_string());
        args.push(e2ee);
    }

    let mut cmd = Command::new(&bin_path);
    cmd.args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            return NativeScreenShareResult {
                success: false,
                error: Some(e.to_string()),
            };
        }
    };

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    {
        let mut guard = state.lock().await;
        guard.active_child = Some(child);
    }

    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let shared_tx = Arc::new(Mutex::new(Some(tx)));

    if let Some(out) = stdout {
        let app_handle = app.clone();
        let tx_ref = Arc::clone(&shared_tx);
        tokio::spawn(async move {
            let mut reader = BufReader::new(out).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                if trimmed.contains("Started capture loop") || trimmed.contains("Capture Started") {
                    if let Some(sender) = tx_ref.lock().await.take() {
                        let _ = sender.send(Ok(()));
                    }
                }
                if let Ok(ev) = serde_json::from_str::<serde_json::Value>(trimmed) {
                    let _ = app_handle.emit("native-screenshare-event", &ev);
                    match ev.get("event").and_then(|v| v.as_str()) {
                        Some("publishing") => {
                            if let Some(sender) = tx_ref.lock().await.take() {
                                let _ = sender.send(Ok(()));
                            }
                        }
                        Some("error") => {
                            let msg = ev
                                .get("message")
                                .and_then(|v| v.as_str())
                                .unwrap_or("native-screenshare-error")
                                .to_string();
                            if let Some(sender) = tx_ref.lock().await.take() {
                                let _ = sender.send(Err(msg));
                            }
                        }
                        _ => {}
                    }
                }
            }
            let _ = app_handle.emit(
                "native-screenshare-event",
                serde_json::json!({ "event": "stopped" }),
            );
            if let Some(sender) = tx_ref.lock().await.take() {
                let _ = sender.send(Err("native-screenshare-exited-before-start".to_string()));
            }
        });
    }

    if let Some(err) = stderr {
        let tx_ref = Arc::clone(&shared_tx);
        tokio::spawn(async move {
            let mut reader = BufReader::new(err).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                eprintln!("[NativeScreenShare] {trimmed}");
                if trimmed.contains("Started capture loop") || trimmed.contains("Capture Started") {
                    if let Some(sender) = tx_ref.lock().await.take() {
                        let _ = sender.send(Ok(()));
                    }
                }
            }
        });
    }

    match tokio::time::timeout(std::time::Duration::from_secs(60), rx).await {
        Ok(Ok(Ok(()))) => NativeScreenShareResult {
            success: true,
            error: None,
        },
        Ok(Ok(Err(msg))) => NativeScreenShareResult {
            success: false,
            error: Some(msg),
        },
        _ => {
            let mut guard = state.lock().await;
            guard.stop().await;
            NativeScreenShareResult {
                success: false,
                error: Some("native-screenshare-startup-timeout".to_string()),
            }
        }
    }
}

pub async fn stop_native_screenshare(state: Arc<Mutex<ScreenShareState>>) -> NativeScreenShareResult {
    let mut guard = state.lock().await;
    guard.stop().await;
    NativeScreenShareResult {
        success: true,
        error: None,
    }
}
