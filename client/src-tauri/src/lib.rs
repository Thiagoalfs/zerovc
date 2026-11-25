pub mod audio;
pub mod auth_vault;
pub mod commands;
pub mod process_monitor;
pub mod screenshare;
pub mod tray;

use audio::AudioCaptureState;
use auth_vault::AuthVault;
use commands::{
    extract_valid_deep_link_path, is_allowed_origin, open_url_with_os, SplashColors,
    REMOTE_SERVER_URL,
};
use process_monitor::ProcessMonitorState;
use screenshare::ScreenShareState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::ShortcutState;
use tokio::sync::Mutex;
use tray::TrayState;
use url::Url;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopSettings {
    pub minimize_to_tray: bool,
    pub hardware_acceleration: bool,
    pub splash_colors: Option<SplashColors>,
}

impl Default for DesktopSettings {
    fn default() -> Self {
        Self {
            minimize_to_tray: true,
            hardware_acceleration: true,
            splash_colors: None,
        }
    }
}

pub struct AppState {
    pub auth_vault: AuthVault,
    pub audio_state: Arc<Mutex<AudioCaptureState>>,
    pub screenshare_state: Arc<Mutex<ScreenShareState>>,
    pub process_monitor: Arc<ProcessMonitorState>,
    pub tray_state: Arc<TrayState>,
    pub settings: Mutex<DesktopSettings>,
    pub registered_shortcuts: Mutex<HashMap<String, String>>,
    pub is_quitting: AtomicBool,
}

fn settings_file_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join("settings.json"))
}

pub fn load_settings(app: &AppHandle) -> DesktopSettings {
    let Some(path) = settings_file_path(app) else {
        return DesktopSettings::default();
    };
    if let Ok(raw) = std::fs::read_to_string(path) {
        if let Ok(parsed) = serde_json::from_str::<DesktopSettings>(&raw) {
            return parsed;
        }
    }
    DesktopSettings::default()
}

pub fn save_settings(app: &AppHandle, settings: &DesktopSettings) {
    let Some(path) = settings_file_path(app) else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(settings) {
        let _ = std::fs::write(path, json);
    }
}

fn handle_deep_link_url(app: &AppHandle, raw_url: &str) {
    let Some(target_path) = extract_valid_deep_link_path(raw_url) else {
        return;
    };
    let base = if cfg!(debug_assertions) {
        "http://localhost:5173"
    } else {
        REMOTE_SERVER_URL
    };
    let dest = format!("{base}{target_path}");
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
        if let Ok(parsed) = Url::parse(&dest) {
            let _ = win.navigate(parsed);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let nav_guard = tauri::plugin::Builder::<tauri::Wry, ()>::new("nav-guard")
        .on_navigation(|_webview, url| {
            let s = url.as_str();
            if s == "about:blank" || s.starts_with("data:") || is_allowed_origin(s) {
                return true;
            }
            if matches!(url.scheme(), "http" | "https") {
                let _ = open_url_with_os(s);
            }
            false
        })
        .build();

    let app_state = AppState {
        auth_vault: AuthVault::new(),
        audio_state: Arc::new(Mutex::new(AudioCaptureState::default())),
        screenshare_state: Arc::new(Mutex::new(ScreenShareState::default())),
        process_monitor: Arc::new(ProcessMonitorState::default()),
        tray_state: Arc::new(TrayState::default()),
        settings: Mutex::new(DesktopSettings::default()),
        registered_shortcuts: Mutex::new(HashMap::new()),
        is_quitting: AtomicBool::new(false),
    };

    tauri::Builder::default()
        .manage(app_state)
        .plugin(nav_guard)
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.show();
                let _ = win.set_focus();
            }
            if let Some(url_arg) = args
                .iter()
                .find(|a| a.starts_with("zerovc://") || a.starts_with(REMOTE_SERVER_URL))
            {
                handle_deep_link_url(app, url_arg);
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let shortcut_str = shortcut.to_string();
                        if let Some(state) = app.try_state::<AppState>() {
                            if let Ok(map) = state.registered_shortcuts.try_lock() {
                                if let Some(action) = map.get(&shortcut_str) {
                                    let _ = app.emit("global-shortcut-triggered", action.clone());
                                }
                            }
                        }
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();

            // Load persisted settings
            let loaded_settings = load_settings(&handle);
            if let Some(state) = handle.try_state::<AppState>() {
                if let Ok(mut guard) = state.settings.try_lock() {
                    *guard = loaded_settings;
                }
                let vault = state.auth_vault.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = vault.start_proxy().await {
                        eprintln!("[AuthVault] Failed to start loopback auth proxy: {e}");
                    }
                });

                process_monitor::start_background_monitor(
                    handle.clone(),
                    Arc::clone(&state.process_monitor),
                );
            }

            if let Err(e) = tray::create_tray(&handle) {
                eprintln!("[Tray] Failed to create system tray: {e}");
            }

            let dl_handle = handle.clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    handle_deep_link_url(&dl_handle, url.as_str());
                }
            });

            #[cfg(target_os = "linux")]
            if let Some(win) = handle.get_webview_window("main") {
                let _ = win.with_webview(|platform_webview| {
                    use webkit2gtk::glib::ObjectExt;
                    use webkit2gtk::{
                        DeviceInfoPermissionRequest, PermissionRequestExt, SettingsExt,
                        UserMediaPermissionRequest, WebViewExt,
                    };
                    let wv = platform_webview.inner();
                    if let Some(settings) = wv.settings() {
                        settings.set_enable_webrtc(true);
                        settings.set_enable_media_stream(true);
                        settings.set_enable_webaudio(true);
                    }
                    wv.connect_permission_request(|webview, request| {
                        let allowed = webview
                            .uri()
                            .map(|u| is_allowed_origin(u.as_str()))
                            .unwrap_or(false);
                        if allowed
                            && (request.is::<UserMediaPermissionRequest>()
                                || request.is::<DeviceInfoPermissionRequest>())
                        {
                            request.allow();
                        } else {
                            request.deny();
                        }
                        true
                    });
                });
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    if let Some(state) = window.app_handle().try_state::<AppState>() {
                        let is_quitting = state.is_quitting.load(Ordering::SeqCst);
                        let minimize_to_tray = state
                            .settings
                            .try_lock()
                            .map(|s| s.minimize_to_tray)
                            .unwrap_or(true);
                        if !is_quitting && minimize_to_tray {
                            api.prevent_close();
                            let _ = window.hide();
                        }
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::set_auth_token,
            commands::get_screen_sources,
            commands::is_process_running,
            commands::window_minimize,
            commands::window_maximize,
            commands::window_close,
            commands::window_is_maximized,
            commands::window_set_fullscreen,
            commands::window_is_fullscreen,
            commands::is_cursor_in_window,
            commands::check_for_updates,
            commands::start_download_update,
            commands::quit_and_install,
            commands::restart_to_update,
            commands::apply_titlebar_update,
            commands::open_external,
            commands::reload_app,
            commands::relaunch_app,
            commands::register_global_shortcut,
            commands::unregister_all_shortcuts,
            commands::start_process_audio_capture,
            commands::stop_process_audio_capture,
            commands::list_audio_sinks_cmd,
            commands::set_default_audio_sink_cmd,
            commands::start_native_screenshare,
            commands::stop_native_screenshare,
            commands::set_minimize_to_tray,
            commands::get_minimize_to_tray,
            commands::set_tray_voice_state,
            commands::set_auto_start,
            commands::get_auto_start,
            commands::set_zoom_factor,
            commands::get_gpu_info,
            commands::set_hardware_acceleration,
            commands::get_hardware_acceleration,
            commands::get_current_activity,
            commands::set_custom_streamer_processes,
            commands::get_streamer_software_status,
            commands::set_splash_colors,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ZeroVC Tauri application");
}
