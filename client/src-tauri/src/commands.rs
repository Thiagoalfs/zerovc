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
use tauri::{AppHandle, Manager, State};
use tauri_plugin_autostart::ManagerExt as AutostartManagerExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
use tauri_plugin_notification::NotificationExt;
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
    if raw_url.chars().any(|c| c.is_control()) {
        return Err("Blocked control characters in external URL".to_string());
    }
    let parsed = Url::parse(raw_url).map_err(|e| format!("Invalid URL: {e}"))?;
    match parsed.scheme() {
        "http" | "https" if parsed.has_host() => Ok(parsed),
        "http" | "https" => Err("External URL missing host".to_string()),
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
pub async fn get_proxy_url(state: State<'_, AppState>) -> Result<Option<String>, String> {
    Ok(state.auth_vault.proxy_url().await)
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
pub fn window_maximize(app: AppHandle) -> Result<bool, String> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    let was_maximized = win.is_maximized().map_err(|e| e.to_string())?;
    if was_maximized {
        win.unmaximize().map_err(|e| e.to_string())?;
    } else {
        win.maximize().map_err(|e| e.to_string())?;
    }
    Ok(win.is_maximized().unwrap_or(!was_maximized))
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
            if !crate::is_in_voice_call(&state) {
                crate::set_webview_memory_low(&win, true);
            }
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
    match (win.cursor_position(), win.outer_position(), win.outer_size()) {
        (Ok(cursor), Ok(pos), Ok(size)) => {
            cursor.x >= pos.x as f64
                && cursor.x <= (pos.x as f64 + size.width as f64)
                && cursor.y >= pos.y as f64
                && cursor.y <= (pos.y as f64 + size.height as f64)
        }
        _ => win.is_focused().unwrap_or(false),
    }
}

#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    open_url_with_os(&url)
}

pub fn open_url_with_os(url: &str) -> Result<(), String> {
    let valid = validate_external_url(url)?;
    #[cfg(target_os = "windows")]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        #[link(name = "shell32")]
        extern "system" {
            fn ShellExecuteW(
                hwnd: *mut std::ffi::c_void,
                lp_operation: *const u16,
                lp_file: *const u16,
                lp_parameters: *const u16,
                lp_directory: *const u16,
                n_show_cmd: i32,
            ) -> isize;
        }
        fn to_wide(s: &str) -> Vec<u16> {
            OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
        }
        let op = to_wide("open");
        let target = to_wide(valid.as_str());
        let res = unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                op.as_ptr(),
                target.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                1,
            )
        };
        if res <= 32 {
            return Err(format!(
                "Failed to open external URL (ShellExecuteW code {res})"
            ));
        }
        return Ok(());
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(valid.as_str())
            .spawn()
            .map_err(|e| format!("Failed to open external URL: {e}"))?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(valid.as_str())
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
    let Ok(parsed) = shortcut.trim().parse::<Shortcut>() else {
        return Ok(false);
    };
    let gs = app.global_shortcut();
    let _ = gs.unregister(parsed);
    match gs.register(parsed) {
        Ok(()) => {
            let mut map = state.registered_shortcuts.lock().await;
            // Store canonical Shortcut::to_string() so the event handler in lib.rs matches.
            map.insert(parsed.to_string(), action);
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
    let res = ss_start(&app, state.screenshare_state.clone(), options).await;
    if res.success {
        state.media_bridge.sync_e2ee_key_to_screenshare().await;
    }
    Ok(res)
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
    if !factor.is_finite() || factor <= 0.0 {
        return Err("Invalid zoom factor".to_string());
    }
    if let Some(win) = app.get_webview_window("main") {
        win.set_zoom(factor).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn send_native_notification(
    app: AppHandle,
    title: String,
    body: String,
    tag: Option<String>,
    icon: Option<String>,
) -> Result<(), String> {
    let mut builder = app.notification().builder().title(title).body(body);
    if let Some(group) = tag.filter(|t| !t.trim().is_empty()) {
        builder = builder.group(group);
    }
    // Desktop notification daemons expect a local path or theme icon name, not an HTTP URL.
    if let Some(ic) = icon.filter(|i| {
        let t = i.trim();
        !t.is_empty() && !t.starts_with("http://") && !t.starts_with("https://") && !t.starts_with("data:")
    }) {
        builder = builder.icon(ic);
    }
    builder.show().map_err(|e| e.to_string())
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

#[tauri::command]
pub async fn set_audio_output_device(device_id: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        if !device_id.is_empty() && device_id != "default" {
            let _ = crate::audio::set_default_audio_sink(&device_id).await;
        }
    }
    #[cfg(not(target_os = "linux"))]
    let _ = device_id;
    Ok(())
}

#[tauri::command]
pub fn log_frontend_error(tag: String, message: String) {
    eprintln!("[Frontend:{tag}] {message}");
}

#[tauri::command]
pub async fn media_connect(
    app: AppHandle,
    state: State<'_, AppState>,
    url: String,
    token: String,
    auto_enable_mic: bool,
    is_e2ee: bool,
    audio_config: crate::media_audio_in::AudioInputConfig,
    input_device_id: Option<String>,
    output_device_id: Option<String>,
) -> Result<crate::media_bridge::BridgeConnectResult, String> {
    state
        .media_bridge
        .connect(
            app,
            url,
            token,
            auto_enable_mic,
            is_e2ee,
            audio_config,
            input_device_id,
            output_device_id,
        )
        .await
}

#[tauri::command]
pub async fn media_disconnect(state: State<'_, AppState>) -> Result<(), String> {
    state.media_bridge.disconnect().await;
    Ok(())
}

#[tauri::command]
pub async fn media_set_muted(
    app: AppHandle,
    state: State<'_, AppState>,
    muted: bool,
) -> Result<(), String> {
    state.media_bridge.set_muted(&app, muted).await
}

#[tauri::command]
pub async fn media_set_deafened(
    app: AppHandle,
    state: State<'_, AppState>,
    deafened: bool,
) -> Result<(), String> {
    state.media_bridge.set_deafened(&app, deafened).await
}

#[tauri::command]
pub async fn media_set_camera_enabled(
    app: AppHandle,
    state: State<'_, AppState>,
    enabled: bool,
    device_id: Option<String>,
) -> Result<(), String> {
    state
        .media_bridge
        .set_camera_enabled(&app, enabled, device_id)
        .await
}

#[tauri::command]
pub async fn media_set_user_volume(
    state: State<'_, AppState>,
    identity: String,
    volume: f32,
) -> Result<(), String> {
    state.media_bridge.set_user_volume(identity, volume).await;
    Ok(())
}

#[tauri::command]
pub async fn media_set_stream_volume(
    state: State<'_, AppState>,
    identity: String,
    volume: f32,
) -> Result<(), String> {
    state.media_bridge.set_stream_volume(identity, volume).await;
    Ok(())
}

#[tauri::command]
pub async fn media_set_output_volume(
    state: State<'_, AppState>,
    volume: f32,
) -> Result<(), String> {
    state.media_bridge.set_output_volume(volume).await;
    Ok(())
}

#[tauri::command]
pub async fn media_set_input_volume(
    state: State<'_, AppState>,
    volume: f32,
) -> Result<(), String> {
    state.media_bridge.set_input_volume(volume).await;
    Ok(())
}

#[tauri::command]
pub async fn media_set_stream_subscribed(
    state: State<'_, AppState>,
    identity: String,
    subscribed: bool,
) -> Result<(), String> {
    state
        .media_bridge
        .set_stream_subscribed(identity, subscribed)
        .await;
    Ok(())
}

#[tauri::command]
pub async fn media_update_mic_config(
    state: State<'_, AppState>,
    config: crate::media_audio_in::AudioInputConfig,
) -> Result<(), String> {
    state.media_bridge.update_mic_config(config).await;
    Ok(())
}

#[tauri::command]
pub async fn media_set_input_device(
    app: AppHandle,
    state: State<'_, AppState>,
    device_id: String,
) -> Result<(), String> {
    state.media_bridge.set_input_device(&app, device_id).await
}

#[tauri::command]
pub async fn media_set_output_device(
    state: State<'_, AppState>,
    device_id: String,
) -> Result<(), String> {
    state.media_bridge.set_output_device(device_id).await
}

#[tauri::command]
pub async fn media_set_video_device(
    app: AppHandle,
    state: State<'_, AppState>,
    device_id: String,
) -> Result<(), String> {
    state.media_bridge.set_video_device(&app, device_id).await
}

#[tauri::command]
pub fn media_list_devices() -> Vec<crate::media_audio_out::AudioDeviceInfo> {
    crate::media_bridge::MediaBridge::list_devices()
}

#[tauri::command]
pub async fn media_set_e2ee_key(
    state: State<'_, AppState>,
    key_base64: String,
) -> Result<(), String> {
    state.media_bridge.set_e2ee_key(key_base64).await
}

#[tauri::command]
pub async fn media_ratchet_e2ee_key(
    state: State<'_, AppState>,
    identity: Option<String>,
    key_index: Option<i32>,
) -> Result<(), String> {
    state
        .media_bridge
        .ratchet_e2ee_key(identity, key_index)
        .await
}

#[tauri::command]
pub async fn media_get_diagnostic_stats(
    state: State<'_, AppState>,
) -> Result<crate::media_bridge::BridgeDiagnosticStats, String> {
    Ok(state.media_bridge.get_diagnostic_stats().await)
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
        assert!(validate_external_url("https://example.com/?a=1&b=2%203|4^5").is_ok());
        assert!(validate_external_url("file:///C:/Windows/System32/calc.exe").is_err());
        assert!(validate_external_url("javascript:alert(1)").is_err());
        assert!(validate_external_url("zerovc://invite/abc").is_err());
        assert!(validate_external_url("https://example.com/\ncalc").is_err());
        assert!(validate_external_url("http://").is_err());
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

    #[test]
    fn test_tauri_conf_csp_allows_wasm_workers_and_google_fonts() {
        let cfg: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).expect("valid tauri.conf.json");
        let csp = cfg
            .pointer("/app/security/csp")
            .and_then(|v| v.as_str())
            .expect("app.security.csp string");
        assert!(csp.contains("script-src 'self' 'wasm-unsafe-eval'"));
        assert!(csp.contains("worker-src 'self' blob:"));
        assert!(csp.contains("https://fonts.googleapis.com"));
        assert!(csp.contains("object-src 'none'"));
    }

    #[test]
    fn test_default_capabilities_include_required_permissions() {
        let caps: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/default.json"))
                .expect("valid default.json");
        let perms: Vec<&str> = caps
            .pointer("/permissions")
            .and_then(|v| v.as_array())
            .expect("permissions array")
            .iter()
            .filter_map(|v| v.as_str())
            .collect();
        for required in [
            "core:window:allow-toggle-maximize",
            "core:webview:allow-set-webview-zoom",
            "global-shortcut:allow-register",
            "global-shortcut:allow-unregister",
            "global-shortcut:allow-unregister-all",
            "global-shortcut:allow-is-registered",
            "notification:default",
        ] {
            assert!(perms.contains(&required), "missing capability: {required}");
        }
    }
}
