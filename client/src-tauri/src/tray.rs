use crate::AppState;
use std::sync::atomic::Ordering;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex;

const TRAY_ID: &str = "zerovc-tray";
const EMBEDDED_TRAY_PNG: &[u8] = include_bytes!("../icons/tray-icon.png");

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrayVoiceState {
    Idle,
    InCall,
    Speaking,
    Muted,
    Deafened,
}

impl TrayVoiceState {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "idle" => Some(Self::Idle),
            "in-call" => Some(Self::InCall),
            "speaking" => Some(Self::Speaking),
            "muted" => Some(Self::Muted),
            "deafened" => Some(Self::Deafened),
            _ => None,
        }
    }
}

pub struct TrayState {
    pub tray: Mutex<Option<TrayIcon>>,
    pub current_voice_state: Mutex<TrayVoiceState>,
}

impl Default for TrayState {
    fn default() -> Self {
        Self {
            tray: Mutex::new(None),
            current_voice_state: Mutex::new(TrayVoiceState::Idle),
        }
    }
}

#[derive(Clone, Copy)]
enum CircleOverlay {
    None,
    Muted,
    Deafened,
}

fn dist_segment(px: f32, py: f32, x1: f32, y1: f32, x2: f32, y2: f32) -> f32 {
    let dx = x2 - x1;
    let dy = y2 - y1;
    let len2 = dx * dx + dy * dy;
    let t = if len2 == 0.0 {
        0.0
    } else {
        (((px - x1) * dx + (py - y1) * dy) / len2).clamp(0.0, 1.0)
    };
    (px - (x1 + t * dx)).hypot(py - (y1 + t * dy))
}

fn create_circle_tray_image(r: u8, g: u8, b: u8, overlay: CircleOverlay) -> Image<'static> {
    let size: u32 = 32;
    let cx = (size as f32 - 1.0) / 2.0;
    let bg_radius = match overlay {
        CircleOverlay::None => size as f32 * 0.36,
        _ => size as f32 * 0.44,
    };

    let mut rgba = vec![0u8; (size * size * 4) as usize];
    for y in 0..size {
        for x in 0..size {
            let fx = x as f32;
            let fy = y as f32;
            let bg_alpha = (bg_radius + 0.5 - (fx - cx).hypot(fy - cx)).clamp(0.0, 1.0);
            if bg_alpha <= 0.0 {
                continue;
            }

            let glyph = match overlay {
                CircleOverlay::None => 0.0,
                CircleOverlay::Muted => {
                    let d_mic = dist_segment(fx, fy, cx, 9.5, cx, 15.5) - 2.4;
                    let d_stem = dist_segment(fx, fy, cx, 19.5, cx, 23.0) - 1.1;
                    let d_base = dist_segment(fx, fy, cx - 3.2, 23.0, cx + 3.2, 23.0) - 1.1;
                    let d_arc = ((fx - cx).hypot(fy - 15.5) - 4.6).abs() - 1.1;
                    let d_u = if fy >= 15.5 { d_arc } else { 10.0 };
                    let d_slash = dist_segment(fx, fy, 8.5, 8.5, 23.5, 23.5) - 1.4;
                    let d = d_mic.min(d_stem).min(d_base).min(d_u).min(d_slash);
                    (0.5 - d).clamp(0.0, 1.0)
                }
                CircleOverlay::Deafened => {
                    let d_band = ((fx - cx).hypot(fy - 15.5) - 6.6).abs() - 1.3;
                    let d_band_arc = if fy <= 16.5 { d_band } else { 10.0 };
                    let d_left = dist_segment(fx, fy, 9.0, 15.5, 9.0, 21.0) - 2.1;
                    let d_right = dist_segment(fx, fy, 22.0, 15.5, 22.0, 21.0) - 2.1;
                    let d_slash = dist_segment(fx, fy, 8.5, 8.5, 23.5, 23.5) - 1.4;
                    let d = d_band_arc.min(d_left).min(d_right).min(d_slash);
                    (0.5 - d).clamp(0.0, 1.0)
                }
            };

            let pr = (r as f32 + (255.0 - r as f32) * glyph).round() as u8;
            let pg = (g as f32 + (255.0 - g as f32) * glyph).round() as u8;
            let pb = (b as f32 + (255.0 - b as f32) * glyph).round() as u8;
            let pa = (bg_alpha * 255.0).round() as u8;

            let idx = ((y * size + x) * 4) as usize;
            rgba[idx] = pr;
            rgba[idx + 1] = pg;
            rgba[idx + 2] = pb;
            rgba[idx + 3] = pa;
        }
    }

    Image::new_owned(rgba, size, size)
}

fn default_idle_icon() -> Result<Image<'static>, tauri::Error> {
    Image::from_bytes(EMBEDDED_TRAY_PNG)
}

pub fn restore_and_focus_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        crate::set_webview_memory_low(&win, false);
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

pub fn create_tray(app: &AppHandle) -> Result<(), tauri::Error> {
    let open_item = MenuItem::with_id(app, "open", "Abrir ZeroVC", true, None::<&str>)?;
    let update_item = MenuItem::with_id(
        app,
        "check-updates",
        "Verificar atualizações",
        true,
        None::<&str>,
    )?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", "Sair do ZeroVC", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_item, &update_item, &sep, &quit_item])?;

    let icon = default_idle_icon()?;

    let tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip("ZeroVC")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => restore_and_focus_main(app),
            "check-updates" => {
                restore_and_focus_main(app);
                let _ = app.emit("tray-check-updates", ());
            }
            "quit" => {
                if let Some(state) = app.try_state::<AppState>() {
                    state.is_quitting.store(true, Ordering::SeqCst);
                }
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            }
            | TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } => {
                restore_and_focus_main(tray.app_handle());
            }
            _ => {}
        })
        .build(app)?;

    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(mut guard) = state.tray_state.tray.try_lock() {
            *guard = Some(tray);
        }
    }

    Ok(())
}

pub async fn set_tray_voice_state(state: &TrayState, voice_state: TrayVoiceState) {
    {
        let mut current = state.current_voice_state.lock().await;
        if *current == voice_state {
            return;
        }
        *current = voice_state;
    }

    let tray_guard = state.tray.lock().await;
    let Some(tray) = tray_guard.as_ref() else {
        return;
    };

    let image = match voice_state {
        TrayVoiceState::Idle => default_idle_icon().ok(),
        TrayVoiceState::InCall => Some(create_circle_tray_image(128, 132, 142, CircleOverlay::None)),
        TrayVoiceState::Speaking => Some(create_circle_tray_image(35, 165, 90, CircleOverlay::None)),
        TrayVoiceState::Muted => Some(create_circle_tray_image(242, 63, 67, CircleOverlay::Muted)),
        TrayVoiceState::Deafened => {
            Some(create_circle_tray_image(242, 63, 67, CircleOverlay::Deafened))
        }
    };

    if let Some(img) = image {
        let _ = tray.set_icon(Some(img));
    }
}
