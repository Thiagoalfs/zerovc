use crate::audio::{
    list_audio_sinks, set_default_audio_sink, start_process_audio_capture as audio_start,
    stop_process_audio_capture as audio_stop, AudioCaptureOptions, AudioCaptureResult, AudioSinkInfo,
};
use crate::process_monitor::{
    collect_running_process_names, is_any_process_running, scan_processes_once, DetectedActivity,
    StreamerSoftwareStatus,
};
use crate::screenshare::{
    get_screen_sources as ss_get_sources, start_native_screenshare as ss_start,
    stop_native_screenshare as ss_stop, NativeScreenShareOptions, NativeScreenShareResult,
    ScreenSource, ScreenSourcesOptions,
};
use crate::tray::{set_tray_voice_state as tray_set_voice, TrayVoiceState};
use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt as AutostartManagerExt;
use tauri_plugin_global_shortcut::GlobalShortcutExt;
use tauri_plugin_updater::UpdaterExt;
use url::Url;

pub const REMOTE_SERVER_URL: &str = "https://zerovc.safiroko.xyz";
pub const ALLOWED_ORIGINS: &[&str] = &[
    "https://zerovc.safiroko.xyz",
    "http://localhost:5173",
    "http://tauri.localhost",
    "https://tauri.localhost",
];

pub fn is_allowed_origin(raw_url: &str) -> bool {
    let Ok(parsed) = Url::parse(raw_url) else {
        return false;
    };
    if parsed.scheme() == "tauri" && parsed.host_str() == Some("localhost") {
        return true;
    }
    let origin = parsed.origin().ascii_serialization();
    ALLOWED_ORIGINS.contains(&origin.as_str())
}

pub fn validate_external_url(raw_url: &str) -> Result<Url, String> {
    let parsed = Url::parse(raw_url).map_err(|e| format!("Invalid URL: {e}"))?;
    match parsed.scheme() {
        "http" | "https" => Ok(parsed),
        other => Err(format!("Blocked external URL scheme: {other}")),
    }
}

pub fn extract_valid_deep_link_path(raw_url: &str) -> Option<String> {
    let target_path = if let Some(rest) = raw_url.strip_prefix("zerovc://") {
        if rest.starts_with('/') {
            rest.to_string()
        } else {
            format!("/{rest}")
        }
    } else if let Some(rest) = raw_url.strip_prefix(REMOTE_SERVER_URL) {
        rest.to_string()
    } else {
        return None;
    };

    let allowed_prefixes = ["/invite", "/invites", "/channels", "/@me"];
    let valid = allowed_prefixes.iter().any(|prefix| {
        target_path == *prefix || target_path.starts_with(&format!("{prefix}/"))
    });

    if valid {
        Some(target_path)
    } else {
        None
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TitlebarUpdateAction {
    pub action: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SplashColors {
    pub accent: String,
    pub bg: String,
}

#[tauri::command]
pub async fn set_auth_token(
    state: State<'_, AppState>,
    token: Option<String>,
) -> Result<(), String> {
    state.auth_vault.set_token(token).await
}

#[tauri::command]
pub async fn get_screen_sources(opts: Option<ScreenSourcesOptions>) -> Vec<ScreenSource> {
    ss_get_sources(opts).await
}

#[tauri::command]
pub async fn is_process_running(processes: Vec<String>) -> bool {
    if processes.is_empty() {
        return false;
    }
    tokio::task::spawn_blocking(move || {
        let proc_set = collect_running_process_names();
        is_any_process_running(&proc_set, &processes)
    })
    .await
    .unwrap_or(false)
}

#[tauri::command]
pub fn window_minimize(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.minimize();
    }
}

#[tauri::command]
pub fn window_maximize(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_maximized().unwrap_or(false) {
            let _ = win.unmaximize();
        } else {
            let _ = win.maximize();
        }
    }
}

#[tauri::command]
pub fn window_close(app: AppHandle, state: State<'_, AppState>) {
    let is_quitting = state.is_quitting.load(Ordering::SeqCst);
    let minimize_to_tray = state
        .settings
        .try_lock()
        .map(|s| s.minimize_to_tray)
        .unwrap_or(true);
    if let Some(win) = app.get_webview_window("main") {
        if !is_quitting && minimize_to_tray {
            let _ = win.hide();
        } else {
            let _ = win.close();
        }
    }
}

#[tauri::command]
pub fn window_is_maximized(app: AppHandle) -> bool {
    app.get_webview_window("main")
        .and_then(|w| w.is_maximized().ok())
        .unwrap_or(false)
}

#[tauri::command]
pub fn window_set_fullscreen(app: AppHandle, flag: bool) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.set_fullscreen(flag);
    }
}

#[tauri::command]
pub fn window_is_fullscreen(app: AppHandle) -> bool {
    app.get_webview_window("main")
        .and_then(|w| w.is_fullscreen().ok())
        .unwrap_or(false)
}

#[tauri::command]
pub fn is_cursor_in_window(app: AppHandle) -> bool {
    let Some(win) = app.get_webview_window("main") else {
        return false;
    };
    if !win.is_visible().unwrap_or(false) {
        return false;
    }
    let Ok(cursor) = win.cursor_position() else {
        return true;
    };
    let Ok(pos) = win.outer_position() else {
        return true;
    };
    let Ok(size) = win.outer_size() else {
        return true;
    };
    cursor.x >= pos.x as f64
        && cursor.x <= (pos.x as f64 + size.width as f64)
        && cursor.y >= pos.y as f64
        && cursor.y <= (pos.y as f64 + size.height as f64)
}

#[tauri::command]
pub async fn check_for_updates(app: AppHandle) {
    if let Ok(updater) = app.updater() {
        if let Ok(Some(update)) = updater.check().await {
            let _ = app.emit(
                "update-available",
                serde_json::json!({
                    "version": update.version,
                    "releaseNotes": update.body,
                }),
            );
        }
    }
}

#[tauri::command]
pub async fn start_download_update(app: AppHandle) {
    if let Ok(updater) = app.updater() {
        if let Ok(Some(update)) = updater.check().await {
            let app_clone = app.clone();
            let mut downloaded: usize = 0;
            let res = update
                .download_and_install(
                    move |chunk_len, content_len| {
                        downloaded += chunk_len;
                        let total = content_len.unwrap_or(0);
                        let percent = if total > 0 {
                            (downloaded as f64 / total as f64) * 100.0
                        } else {
                            0.0
                        };
                        let _ = app_clone.emit(
                            "update-progress",
                            serde_json::json!({
                                "percent": percent,
                                "bytesPerSecond": 0,
                                "transferred": downloaded,
                                "total": total,
                            }),
                        );
                    },
                    || {},
                )
                .await;
            if res.is_ok() {
                let _ = app.emit(
                    "update-downloaded",
                    serde_json::json!({ "version": update.version }),
                );
            }
        }
    }
}

#[tauri::command]
pub fn quit_and_install(app: AppHandle, state: State<'_, AppState>) {
    state.is_quitting.store(true, Ordering::SeqCst);
    app.restart();
}

#[tauri::command]
pub async fn restart_to_update(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    state.is_quitting.store(true, Ordering::SeqCst);
    if let Ok(updater) = app.updater() {
        if let Ok(Some(update)) = updater.check().await {
            if update.download_and_install(|_, _| {}, || {}).await.is_ok() {
                app.restart();
            }
        }
    }
    app.restart();
}

#[tauri::command]
pub async fn apply_titlebar_update(app: AppHandle) -> TitlebarUpdateAction {
    if let Ok(updater) = app.updater() {
        if let Ok(Some(update)) = updater.check().await {
            let app_clone = app.clone();
            tauri::async_runtime::spawn(async move {
                if update.download_and_install(|_, _| {}, || {}).await.is_ok() {
                    app_clone.restart();
                }
            });
            return TitlebarUpdateAction {
                action: "downloading".to_string(),
            };
        }
    }
    TitlebarUpdateAction {
        action: "reload".to_string(),
    }
}

#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    let valid = validate_external_url(&url)?;
    open_url_with_os(valid.as_str())
}

pub fn open_url_with_os(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
            .creation_flags(0x0800_0000)
            .spawn()
            .map_err(|e| format!("Failed to open external URL: {e}"))?;
        return Ok(());
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("Failed to open external URL: {e}"))?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("Failed to open external URL: {e}"))?;
        return Ok(());
    }
}

#[tauri::command]
pub fn reload_app(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let target = if cfg!(debug_assertions) {
            "http://localhost:5173"
        } else {
            REMOTE_SERVER_URL
        };
        if let Ok(parsed) = Url::parse(target) {
            let _ = win.navigate(parsed);
        }
    }
}

#[tauri::command]
pub fn relaunch_app(app: AppHandle, state: State<'_, AppState>) {
    state.is_quitting.store(true, Ordering::SeqCst);
    app.restart();
}

#[tauri::command]
pub async fn register_global_shortcut(
    app: AppHandle,
    state: State<'_, AppState>,
    shortcut: String,
    action: String,
) -> Result<bool, String> {
    if shortcut.trim().is_empty() {
        return Ok(false);
    }
    let gs = app.global_shortcut();
    let _ = gs.unregister(shortcut.as_str());
    match gs.register(shortcut.as_str()) {
        Ok(()) => {
            let mut map = state.registered_shortcuts.lock().await;
            map.insert(shortcut, action);
            Ok(true)
        }
        Err(_) => Ok(false),
    }
}

#[tauri::command]
pub async fn unregister_all_shortcuts(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let gs = app.global_shortcut();
    let ok = gs.unregister_all().is_ok();
    let mut map = state.registered_shortcuts.lock().await;
    map.clear();
    Ok(ok)
}

#[tauri::command]
pub async fn start_process_audio_capture(
    app: AppHandle,
    state: State<'_, AppState>,
    options: Option<AudioCaptureOptions>,
) -> Result<AudioCaptureResult, String> {
    Ok(audio_start(&app, state.audio_state.clone(), options).await)
}

#[tauri::command]
pub async fn stop_process_audio_capture(
    state: State<'_, AppState>,
) -> Result<AudioCaptureResult, String> {
    Ok(audio_stop(state.audio_state.clone()).await)
}

#[tauri::command]
pub async fn list_audio_sinks_cmd() -> Result<Vec<AudioSinkInfo>, String> {
    list_audio_sinks().await
}

#[tauri::command]
pub async fn set_default_audio_sink_cmd(sink_name: String) -> Result<(), String> {
    set_default_audio_sink(&sink_name).await
}

#[tauri::command]
pub async fn start_native_screenshare(
    app: AppHandle,
    state: State<'_, AppState>,
    options: NativeScreenShareOptions,
) -> Result<NativeScreenShareResult, String> {
    Ok(ss_start(&app, state.screenshare_state.clone(), options).await)
}

#[tauri::command]
pub async fn stop_native_screenshare(
    state: State<'_, AppState>,
) -> Result<NativeScreenShareResult, String> {
    Ok(ss_stop(state.screenshare_state.clone()).await)
}

#[tauri::command]
pub async fn set_minimize_to_tray(
    app: AppHandle,
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), String> {
    let mut settings = state.settings.lock().await;
    settings.minimize_to_tray = enabled;
    crate::save_settings(&app, &settings);
    Ok(())
}

#[tauri::command]
pub async fn get_minimize_to_tray(state: State<'_, AppState>) -> Result<bool, String> {
    let settings = state.settings.lock().await;
    Ok(settings.minimize_to_tray)
}

#[tauri::command]
pub async fn set_tray_voice_state(
    state: State<'_, AppState>,
    voice_state: String,
) -> Result<(), String> {
    if let Some(parsed) = TrayVoiceState::from_str(&voice_state) {
        tray_set_voice(&state.tray_state, parsed).await;
    }
    Ok(())
}

#[tauri::command]
pub fn set_auto_start(app: AppHandle, enabled: bool) -> Result<(), String> {
    let mgr = app.autolaunch();
    if enabled {
        mgr.enable().map_err(|e| e.to_string())
    } else {
        mgr.disable().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn get_auto_start(app: AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
pub fn set_zoom_factor(app: AppHandle, factor: f64) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        win.set_zoom(factor).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_gpu_info() -> serde_json::Value {
    serde_json::json!({
        "basic": {},
        "features": {
            "gpu_compositing": "enabled"
        }
    })
}

#[tauri::command]
pub async fn set_hardware_acceleration(
    app: AppHandle,
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), String> {
    let mut settings = state.settings.lock().await;
    settings.hardware_acceleration = enabled;
    crate::save_settings(&app, &settings);
    Ok(())
}

#[tauri::command]
pub async fn get_hardware_acceleration(state: State<'_, AppState>) -> Result<bool, String> {
    let settings = state.settings.lock().await;
    Ok(settings.hardware_acceleration)
}

#[tauri::command]
pub async fn get_current_activity(
    state: State<'_, AppState>,
) -> Result<Option<DetectedActivity>, String> {
    let guard = state.process_monitor.last_detected_activity.lock().await;
    Ok(guard.clone())
}

#[tauri::command]
pub async fn set_custom_streamer_processes(
    app: AppHandle,
    state: State<'_, AppState>,
    processes: Vec<String>,
) -> Result<(), String> {
    {
        let mut guard = state.process_monitor.custom_streamer_processes.lock().await;
        *guard = processes
            .into_iter()
            .map(|p| p.to_lowercase().trim().to_string())
            .filter(|p| !p.is_empty())
            .collect();
    }
    scan_processes_once(&app, &state.process_monitor).await;
    Ok(())
}

#[tauri::command]
pub async fn get_streamer_software_status(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<StreamerSoftwareStatus, String> {
    let initial_done = *state.process_monitor.has_performed_initial_scan.lock().await;
    if !initial_done {
        scan_processes_once(&app, &state.process_monitor).await;
    }
    let running_apps = state
        .process_monitor
        .last_running_streamer_apps
        .lock()
        .await
        .clone();
    Ok(StreamerSoftwareStatus { running_apps })
}

#[tauri::command]
pub async fn set_splash_colors(
    app: AppHandle,
    state: State<'_, AppState>,
    colors: SplashColors,
) -> Result<(), String> {
    let mut settings = state.settings.lock().await;
    settings.splash_colors = Some(colors);
    crate::save_settings(&app, &settings);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_allowed_origin() {
        assert!(is_allowed_origin("https://zerovc.safiroko.xyz/channels/1"));
        assert!(is_allowed_origin("http://localhost:5173/invite/abc"));
        assert!(!is_allowed_origin("https://evil.example.com/"));
        assert!(!is_allowed_origin("http://zerovc.safiroko.xyz/"));
        assert!(!is_allowed_origin("javascript:alert(1)"));
        assert!(!is_allowed_origin("not a url"));
    }

    #[test]
    fn test_validate_external_url() {
        assert!(validate_external_url("https://github.com/safiroko/zerovc").is_ok());
        assert!(validate_external_url("http://localhost:8080").is_ok());
        assert!(validate_external_url("file:///C:/Windows/System32/calc.exe").is_err());
        assert!(validate_external_url("javascript:alert(1)").is_err());
        assert!(validate_external_url("zerovc://invite/abc").is_err());
    }

    #[test]
    fn test_extract_valid_deep_link_path() {
        assert_eq!(
            extract_valid_deep_link_path("zerovc://invite/XYZ"),
            Some("/invite/XYZ".to_string())
        );
        assert_eq!(
            extract_valid_deep_link_path("https://zerovc.safiroko.xyz/channels/123"),
            Some("/channels/123".to_string())
        );
        assert_eq!(
            extract_valid_deep_link_path("zerovc://@me"),
            Some("/@me".to_string())
        );
        assert_eq!(extract_valid_deep_link_path("zerovc://admin/panel"), None);
        assert_eq!(
            extract_valid_deep_link_path("https://evil.com/invite/XYZ"),
            None
        );
    }
}
