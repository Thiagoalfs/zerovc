use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

pub const AUDIO_CHUNK_BYTES: usize = 3840; // 480 frames * 2 channels * 4 bytes (Float32) = 10ms at 48kHz
pub const RESILIENT_FALLBACK_MARKER: &str = "FULL SCREEN DEFAULT ENDPOINT LOOPBACK";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioCaptureOptions {
    pub source_id: Option<String>,
    pub mode: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioCaptureResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioFallbackInfo {
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AudioSinkInfo {
    pub id: String,
    pub name: String,
    pub driver: String,
    pub state: String,
}

pub struct AudioCaptureState {
    pub active_child: Option<Child>,
    pub linux_sync_abort: Option<tokio::task::AbortHandle>,
}

impl Default for AudioCaptureState {
    fn default() -> Self {
        Self {
            active_child: None,
            linux_sync_abort: None,
        }
    }
}

impl AudioCaptureState {
    pub fn stop(&mut self) {
        if let Some(handle) = self.linux_sync_abort.take() {
            handle.abort();
        }
        if let Some(mut child) = self.active_child.take() {
            let _ = child.start_kill();
        }
    }
}

impl Drop for AudioCaptureState {
    fn drop(&mut self) {
        self.stop();
    }
}

pub fn build_wasapi_args(self_pid: u32, options: Option<&AudioCaptureOptions>) -> Vec<String> {
    let mut args = vec!["--zerovc-pid".to_string(), self_pid.to_string()];
    if let Some(opts) = options {
        if let Some(source_id) = &opts.source_id {
            if source_id.starts_with("window:") {
                if let Some(hwnd) = source_id.split(':').nth(1) {
                    if !hwnd.is_empty() {
                        args.push("--hwnd".to_string());
                        args.push(hwnd.to_string());
                        args.push("--mode".to_string());
                        args.push("include".to_string());
                        return args;
                    }
                }
            }
        }
        if opts.mode.as_deref() == Some("include") {
            args.push("--mode".to_string());
            args.push("include".to_string());
            return args;
        }
    }
    args.push("--mode".to_string());
    args.push("exclude".to_string());
    args
}

#[derive(Debug, PartialEq, Eq)]
pub enum StderrLineAction {
    Started,
    ResilientFallback,
    LogOnly,
}

/// Evaluates a stderr line from `zerovc-audio-capture.exe`.
/// `FULL SCREEN DEFAULT ENDPOINT LOOPBACK` is treated as a resilient fallback (never aborts).
pub fn classify_wasapi_stderr_line(line: &str) -> StderrLineAction {
    if line.contains(RESILIENT_FALLBACK_MARKER) {
        StderrLineAction::ResilientFallback
    } else if line.contains("Capture Started") || line.contains("Started capture loop") {
        StderrLineAction::Started
    } else {
        StderrLineAction::LogOnly
    }
}

pub fn resolve_audio_capture_binary(app: &AppHandle) -> Option<PathBuf> {
    let binary_name = "zerovc-audio-capture.exe";
    let mut candidates = Vec::new();
    if let Ok(res_dir) = app.path().resource_dir() {
        candidates.push(res_dir.join("_up_").join("native").join("bin").join(binary_name));
        candidates.push(res_dir.join("native").join("bin").join(binary_name));
        candidates.push(res_dir.join("bin").join(binary_name));
        candidates.push(res_dir.join(binary_name));
    }
    if let Ok(exe_dir) = std::env::current_exe().map(|p| p.parent().map(|d| d.to_path_buf())) {
        if let Some(dir) = exe_dir {
            candidates.push(dir.join("_up_").join("native").join("bin").join(binary_name));
            candidates.push(dir.join("native").join("bin").join(binary_name));
            candidates.push(dir.join("bin").join(binary_name));
            candidates.push(dir.join(binary_name));
        }
    }
    candidates.push(PathBuf::from("native/bin").join(binary_name));
    candidates.push(PathBuf::from("../native/bin").join(binary_name));

    candidates.into_iter().find(|p| p.exists())
}

pub async fn start_process_audio_capture(
    app: &AppHandle,
    state: Arc<Mutex<AudioCaptureState>>,
    options: Option<AudioCaptureOptions>,
) -> AudioCaptureResult {
    {
        let mut guard = state.lock().await;
        guard.stop();
    }

    #[cfg(target_os = "linux")]
    {
        return start_linux_pipewire_capture(app, state).await;
    }

    #[cfg(target_os = "windows")]
    {
        return start_windows_wasapi_capture(app, state, options).await;
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        let _ = (app, options);
        AudioCaptureResult {
            success: false,
            error: Some("Audio capture supported only on Windows and Linux".to_string()),
        }
    }
}

pub async fn stop_process_audio_capture(state: Arc<Mutex<AudioCaptureState>>) -> AudioCaptureResult {
    let mut guard = state.lock().await;
    guard.stop();
    AudioCaptureResult {
        success: true,
        error: None,
    }
}

#[cfg(target_os = "windows")]
async fn start_windows_wasapi_capture(
    app: &AppHandle,
    state: Arc<Mutex<AudioCaptureState>>,
    options: Option<AudioCaptureOptions>,
) -> AudioCaptureResult {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let Some(bin_path) = resolve_audio_capture_binary(app) else {
        return AudioCaptureResult {
            success: false,
            error: Some("zerovc-audio-capture.exe not found".to_string()),
        };
    };

    let args = build_wasapi_args(std::process::id(), options.as_ref());
    let mut cmd = Command::new(&bin_path);
    cmd.args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW);

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            return AudioCaptureResult {
                success: false,
                error: Some(format!("Failed to spawn audio capture: {e}")),
            };
        }
    };

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    {
        let mut guard = state.lock().await;
        guard.active_child = Some(child);
    }

    if let Some(mut out) = stdout {
        let app_handle = app.clone();
        tokio::spawn(async move {
            let mut accum = Vec::with_capacity(AUDIO_CHUNK_BYTES * 2);
            let mut buf = [0u8; 4096];
            loop {
                match out.read(&mut buf).await {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        accum.extend_from_slice(&buf[..n]);
                        while accum.len() >= AUDIO_CHUNK_BYTES {
                            let packet: Vec<u8> = accum.drain(..AUDIO_CHUNK_BYTES).collect();
                            let _ = app_handle.emit("process-audio-chunk", packet);
                        }
                    }
                }
            }
        });
    }

    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    if let Some(err_stream) = stderr {
        let app_handle = app.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(err_stream).lines();
            let mut tx = Some(tx);
            while let Ok(Some(line)) = reader.next_line().await {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                match classify_wasapi_stderr_line(trimmed) {
                    StderrLineAction::ResilientFallback => {
                        // Never abort on FULL SCREEN DEFAULT ENDPOINT LOOPBACK; notify renderer and keep streaming
                        eprintln!("[AudioCapture Native] Resilient fallback active: {trimmed}");
                        let _ = app_handle.emit(
                            "process-audio-fallback",
                            AudioFallbackInfo {
                                reason: RESILIENT_FALLBACK_MARKER.to_string(),
                            },
                        );
                        if let Some(sender) = tx.take() {
                            let _ = sender.send(Ok(()));
                        }
                    }
                    StderrLineAction::Started => {
                        if let Some(sender) = tx.take() {
                            let _ = sender.send(Ok(()));
                        }
                    }
                    StderrLineAction::LogOnly => {
                        println!("[AudioCapture Native] {trimmed}");
                    }
                }
            }
            if let Some(sender) = tx.take() {
                let _ = sender.send(Err("capture-exited-before-start".to_string()));
            }
        });
    } else {
        let _ = tx.send(Ok(()));
    }

    match tokio::time::timeout(std::time::Duration::from_secs(4), rx).await {
        Ok(Ok(Ok(()))) => AudioCaptureResult {
            success: true,
            error: None,
        },
        Ok(Ok(Err(err_msg))) => {
            let mut guard = state.lock().await;
            guard.stop();
            let _ = app.emit(
                "process-audio-fallback",
                AudioFallbackInfo {
                    reason: err_msg.clone(),
                },
            );
            AudioCaptureResult {
                success: false,
                error: Some(err_msg),
            }
        }
        Ok(Err(_)) | Err(_) => {
            let mut guard = state.lock().await;
            guard.stop();
            let reason = "capture-start-timeout".to_string();
            let _ = app.emit(
                "process-audio-fallback",
                AudioFallbackInfo {
                    reason: reason.clone(),
                },
            );
            AudioCaptureResult {
                success: false,
                error: Some(reason),
            }
        }
    }
}

#[cfg(target_os = "linux")]
async fn start_linux_pipewire_capture(
    app: &AppHandle,
    state: Arc<Mutex<AudioCaptureState>>,
) -> AudioCaptureResult {
    let record_args = [
        "--target",
        "0",
        "-P",
        "node.name=zerovc_capture",
        "-P",
        "node.autoconnect=false",
        "-P",
        "stream.capture.sink=false",
        "--raw",
        "--format",
        "f32",
        "--rate",
        "48000",
        "--channels",
        "2",
        "--channel-map",
        "Stereo",
        "-",
    ];

    let mut child = match Command::new("pw-record")
        .args(record_args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            return AudioCaptureResult {
                success: false,
                error: Some(format!("Failed to start pw-record: {e}")),
            };
        }
    };

    let stdout = child.stdout.take();
    let sync_task = tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(1));
        loop {
            interval.tick().await;
            let _ = sync_linux_pipewire_links().await;
        }
    });

    {
        let mut guard = state.lock().await;
        guard.active_child = Some(child);
        guard.linux_sync_abort = Some(sync_task.abort_handle());
    }

    if let Some(mut out) = stdout {
        let app_handle = app.clone();
        tokio::spawn(async move {
            let mut accum = Vec::with_capacity(AUDIO_CHUNK_BYTES * 2);
            let mut buf = [0u8; 4096];
            loop {
                match out.read(&mut buf).await {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        accum.extend_from_slice(&buf[..n]);
                        while accum.len() >= AUDIO_CHUNK_BYTES {
                            let packet: Vec<u8> = accum.drain(..AUDIO_CHUNK_BYTES).collect();
                            let _ = app_handle.emit("process-audio-chunk", packet);
                        }
                    }
                }
            }
        });
    }

    AudioCaptureResult {
        success: true,
        error: None,
    }
}

#[cfg(target_os = "linux")]
async fn sync_linux_pipewire_links() -> Result<(), String> {
    let output = Command::new("pw-dump")
        .output()
        .await
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err("pw-dump failed".into());
    }
    let dump: Vec<serde_json::Value> =
        serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())?;

    let cap_node_id = dump
        .iter()
        .find(|o| {
            o.get("type").and_then(|v| v.as_str()) == Some("PipeWire:Interface:Node")
                && o.pointer("/info/props/node.name").and_then(|v| v.as_str())
                    == Some("zerovc_capture")
        })
        .and_then(|o| o.get("id").and_then(|v| v.as_u64()));

    let Some(cap_id) = cap_node_id else {
        return Ok(());
    };

    let mut cap_fl = None;
    let mut cap_fr = None;
    for o in &dump {
        if o.get("type").and_then(|v| v.as_str()) != Some("PipeWire:Interface:Port") {
            continue;
        }
        let node_id = o.pointer("/info/props/node.id").and_then(|v| v.as_u64());
        let dir = o.pointer("/info/direction").and_then(|v| v.as_str());
        let ch = o.pointer("/info/props/audio.channel").and_then(|v| v.as_str());
        if node_id == Some(cap_id) && dir == Some("input") {
            match ch {
                Some("FL") => cap_fl = o.get("id").and_then(|v| v.as_u64()),
                Some("FR") => cap_fr = o.get("id").and_then(|v| v.as_u64()),
                _ => {}
            }
        }
    }

    let (Some(fl_id), Some(fr_id)) = (cap_fl, cap_fr) else {
        return Ok(());
    };

    let own_pid = std::process::id() as u64;

    let mut existing_links = std::collections::HashSet::new();
    for o in &dump {
        if o.get("type").and_then(|v| v.as_str()) == Some("PipeWire:Interface:Link") {
            if let (Some(out_id), Some(in_id)) = (
                o.pointer("/info/output-port-id").and_then(|v| v.as_u64()),
                o.pointer("/info/input-port-id").and_then(|v| v.as_u64()),
            ) {
                existing_links.insert((out_id, in_id));
            }
        }
    }

    let mut allowed_node_ids = std::collections::HashSet::new();
    for o in &dump {
        if o.get("type").and_then(|v| v.as_str()) != Some("PipeWire:Interface:Node") {
            continue;
        }
        if o.pointer("/info/props/media.class").and_then(|v| v.as_str())
            != Some("Stream/Output/Audio")
        {
            continue;
        }
        let pid = o
            .pointer("/info/props/application.process.id")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<u64>().ok())
            .or_else(|| {
                o.pointer("/info/props/application.process.id")
                    .and_then(|v| v.as_u64())
            })
            .unwrap_or(0);
        let bin = o
            .pointer("/info/props/application.process.binary")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_lowercase();
        let app_name = o
            .pointer("/info/props/application.name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_lowercase();

        if bin.contains("zerovc") || app_name.contains("zerovc") || pid == own_pid {
            continue;
        }

        if let Some(node_id) = o.get("id").and_then(|v| v.as_u64()) {
            allowed_node_ids.insert(node_id);
        }
    }

    let mut allowed_out_ports = std::collections::HashSet::new();
    for port in &dump {
        if port.get("type").and_then(|v| v.as_str()) != Some("PipeWire:Interface:Port") {
            continue;
        }
        if port.pointer("/info/direction").and_then(|v| v.as_str()) != Some("output") {
            continue;
        }
        let Some(node_id) = port.pointer("/info/props/node.id").and_then(|v| v.as_u64()) else {
            continue;
        };
        if !allowed_node_ids.contains(&node_id) {
            continue;
        }
        let Some(port_id) = port.get("id").and_then(|v| v.as_u64()) else {
            continue;
        };
        let ch = port
            .pointer("/info/props/audio.channel")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if ch == "FL" || ch == "MONO" {
            allowed_out_ports.insert(port_id);
            if !existing_links.contains(&(port_id, fl_id)) {
                let _ = Command::new("pw-link")
                    .args([port_id.to_string(), fl_id.to_string()])
                    .status()
                    .await;
            }
        }
        if ch == "FR" || ch == "MONO" {
            allowed_out_ports.insert(port_id);
            if !existing_links.contains(&(port_id, fr_id)) {
                let _ = Command::new("pw-link")
                    .args([port_id.to_string(), fr_id.to_string()])
                    .status()
                    .await;
            }
        }
    }

    for (out_id, in_id) in existing_links {
        if (in_id == fl_id || in_id == fr_id) && !allowed_out_ports.contains(&out_id) {
            let _ = Command::new("pw-link")
                .args(["-d", &out_id.to_string(), &in_id.to_string()])
                .status()
                .await;
        }
    }

    Ok(())
}

pub fn parse_pactl_sinks(stdout: &str) -> Vec<AudioSinkInfo> {
    stdout
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 2 {
                Some(AudioSinkInfo {
                    id: parts[0].trim().to_string(),
                    name: parts[1].trim().to_string(),
                    driver: parts.get(2).map(|s| s.trim().to_string()).unwrap_or_default(),
                    state: parts.last().map(|s| s.trim().to_string()).unwrap_or_default(),
                })
            } else {
                None
            }
        })
        .collect()
}

pub async fn list_audio_sinks() -> Result<Vec<AudioSinkInfo>, String> {
    #[cfg(target_os = "linux")]
    {
        let output = Command::new("pactl")
            .args(["list", "short", "sinks"])
            .output()
            .await
            .map_err(|e| format!("Failed to run pactl: {e}"))?;
        if !output.status.success() {
            return Err("pactl list short sinks failed".to_string());
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(parse_pactl_sinks(&stdout))
    }
    #[cfg(not(target_os = "linux"))]
    {
        Ok(Vec::new())
    }
}

pub async fn set_default_audio_sink(sink_name: &str) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let status = Command::new("pactl")
            .args(["set-default-sink", sink_name])
            .status()
            .await
            .map_err(|e| format!("Failed to run pactl set-default-sink: {e}"))?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("pactl set-default-sink exited with {status}"))
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = sink_name;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_wasapi_args_exclude_and_include() {
        let args_excl = build_wasapi_args(1234, None);
        assert_eq!(args_excl, vec!["--zerovc-pid", "1234", "--mode", "exclude"]);

        let opts_win = AudioCaptureOptions {
            source_id: Some("window:98765:0".to_string()),
            mode: None,
        };
        let args_incl = build_wasapi_args(1234, Some(&opts_win));
        assert_eq!(
            args_incl,
            vec!["--zerovc-pid", "1234", "--hwnd", "98765", "--mode", "include"]
        );
    }

    #[test]
    fn test_stderr_resilient_fallback_detection() {
        assert_eq!(
            classify_wasapi_stderr_line("INFO: FULL SCREEN DEFAULT ENDPOINT LOOPBACK enabled"),
            StderrLineAction::ResilientFallback
        );
        assert_eq!(
            classify_wasapi_stderr_line("Capture Started"),
            StderrLineAction::Started
        );
        assert_eq!(
            classify_wasapi_stderr_line("Started capture loop"),
            StderrLineAction::Started
        );
        assert_eq!(
            classify_wasapi_stderr_line("Initializing WASAPI client"),
            StderrLineAction::LogOnly
        );
    }

    #[test]
    fn test_parse_pactl_sinks() {
        let sample = "42\talsa_output.pci-0000_00_1f.3.analog-stereo\tPipeWire\ts16le 2ch 48000Hz\tRUNNING\n\
                      43\talsa_output.usb-Headset.analog-stereo\tPipeWire\ts16le 2ch 48000Hz\tSUSPENDED\n";
        let sinks = parse_pactl_sinks(sample);
        assert_eq!(sinks.len(), 2);
        assert_eq!(sinks[0].id, "42");
        assert_eq!(sinks[0].name, "alsa_output.pci-0000_00_1f.3.analog-stereo");
        assert_eq!(sinks[0].state, "RUNNING");
        assert_eq!(sinks[1].id, "43");
        assert_eq!(sinks[1].state, "SUSPENDED");
    }
}
