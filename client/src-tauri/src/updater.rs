#[cfg(target_os = "linux")]
use crate::commands::open_url_with_os;
use crate::AppState;
#[cfg(any(target_os = "linux", test))]
use base64::Engine;
use serde::Serialize;
#[cfg(any(target_os = "linux", test))]
use std::io::Read;
#[cfg(any(target_os = "linux", test))]
use std::path::Path;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::UpdaterExt;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TitlebarUpdateAction {
    pub action: String,
}

#[cfg(target_os = "linux")]
fn is_linux_non_appimage() -> bool {
    std::env::var_os("APPIMAGE").is_none()
}

#[cfg(target_os = "linux")]
#[derive(Clone, Copy)]
enum LinuxPkgKind {
    Deb,
    Rpm,
    Pacman,
}

#[cfg(target_os = "linux")]
fn command_exists(bin: &str) -> bool {
    std::env::var_os("PATH")
        .map(|paths| std::env::split_paths(&paths).any(|dir| dir.join(bin).is_file()))
        .unwrap_or(false)
}

#[cfg(target_os = "linux")]
fn detect_linux_pkg_kind() -> Option<LinuxPkgKind> {
    let os_release = std::fs::read_to_string("/etc/os-release")
        .unwrap_or_default()
        .to_lowercase();

    if (os_release.contains("arch")
        || os_release.contains("manjaro")
        || os_release.contains("endeavouros")
        || os_release.contains("cachyos")
        || os_release.contains("garuda")
        || std::path::Path::new("/etc/arch-release").exists())
        && command_exists("pacman")
    {
        return Some(LinuxPkgKind::Pacman);
    }

    if (os_release.contains("fedora")
        || os_release.contains("rhel")
        || os_release.contains("centos")
        || os_release.contains("rocky")
        || os_release.contains("alma")
        || os_release.contains("suse"))
        && (command_exists("dnf") || command_exists("zypper") || command_exists("rpm"))
    {
        return Some(LinuxPkgKind::Rpm);
    }

    if (os_release.contains("ubuntu")
        || os_release.contains("debian")
        || os_release.contains("mint")
        || os_release.contains("pop"))
        && (command_exists("apt-get") || command_exists("dpkg"))
    {
        return Some(LinuxPkgKind::Deb);
    }

    if command_exists("apt-get") || command_exists("dpkg") {
        Some(LinuxPkgKind::Deb)
    } else if command_exists("dnf") || command_exists("zypper") || command_exists("rpm") {
        Some(LinuxPkgKind::Rpm)
    } else if command_exists("pacman") {
        Some(LinuxPkgKind::Pacman)
    } else {
        None
    }
}

#[cfg(any(target_os = "linux", test))]
fn tauri_updater_pubkey() -> Result<String, String> {
    let cfg: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))
        .map_err(|e| format!("Falha ao ler tauri.conf.json: {e}"))?;
    cfg.pointer("/plugins/updater/pubkey")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "Chave pública do updater ausente em tauri.conf.json".to_string())
}

#[cfg(any(target_os = "linux", test))]
fn decode_minisign_pubkey(pubkey_b64: &str) -> Result<minisign_verify::PublicKey, String> {
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(pubkey_b64.trim())
        .map_err(|e| format!("Falha ao decodificar chave pública: {e}"))?;
    let text = String::from_utf8(decoded)
        .map_err(|e| format!("Chave pública inválida (UTF-8): {e}"))?;
    minisign_verify::PublicKey::decode(&text)
        .map_err(|e| format!("Falha ao interpretar chave pública minisign: {e}"))
}

#[cfg(any(target_os = "linux", test))]
fn verify_minisign_file(pkg_path: &Path, sig_path: &Path, pubkey_b64: &str) -> Result<(), String> {
    let pk = decode_minisign_pubkey(pubkey_b64)?;
    let sig_raw = std::fs::read_to_string(sig_path)
        .map_err(|e| format!("Falha ao ler assinatura: {e}"))?;
    let sig = minisign_verify::Signature::decode(&sig_raw)
        .or_else(|_| {
            let decoded = base64::engine::general_purpose::STANDARD
                .decode(sig_raw.trim())
                .map_err(|e| format!("Assinatura inválida: {e}"))?;
            let text = String::from_utf8(decoded)
                .map_err(|e| format!("Assinatura UTF-8 inválida: {e}"))?;
            minisign_verify::Signature::decode(&text)
                .map_err(|e| format!("Assinatura minisign inválida: {e}"))
        })?;

    match pk.verify_stream(&sig) {
        Ok(mut verifier) => {
            let mut file = std::fs::File::open(pkg_path)
                .map_err(|e| format!("Falha ao abrir pacote para verificação: {e}"))?;
            let mut buf = [0u8; 64 * 1024];
            loop {
                let n = file
                    .read(&mut buf)
                    .map_err(|e| format!("Falha ao ler pacote: {e}"))?;
                if n == 0 {
                    break;
                }
                verifier.update(&buf[..n]);
            }
            verifier
                .finalize()
                .map_err(|e| format!("Assinatura do pacote inválida: {e}"))
        }
        Err(minisign_verify::Error::UnsupportedLegacyMode) => {
            let bytes = std::fs::read(pkg_path)
                .map_err(|e| format!("Falha ao ler pacote: {e}"))?;
            pk.verify(&bytes, &sig, true)
                .map_err(|e| format!("Assinatura do pacote inválida: {e}"))
        }
        Err(e) => Err(format!("Falha ao inicializar verificação minisign: {e}")),
    }
}

#[cfg(target_os = "linux")]
async fn download_file_to(url: &str, dest_path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;

    let dest_str = dest_path.to_string_lossy().to_string();
    let status = if command_exists("curl") {
        tokio::process::Command::new("curl")
            .args(["-fSL", "--retry", "2", "-o", &dest_str, url])
            .status()
            .await
            .map_err(|e| format!("Falha ao executar curl: {e}"))?
    } else if command_exists("wget") {
        tokio::process::Command::new("wget")
            .args(["-q", "-O", &dest_str, url])
            .status()
            .await
            .map_err(|e| format!("Falha ao executar wget: {e}"))?
    } else {
        return Err("linux-package-manual-update".to_string());
    };

    if !status.success() {
        return Err(format!("Falha ao baixar {url}"));
    }
    std::fs::set_permissions(dest_path, std::fs::Permissions::from_mode(0o600))
        .map_err(|e| format!("Falha ao proteger arquivo baixado: {e}"))?;
    Ok(())
}

#[cfg(target_os = "linux")]
async fn download_and_install_linux_package(app: &AppHandle, version: &str) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;

    let Some(pkg_kind) = detect_linux_pkg_kind() else {
        let _ = open_url_with_os("https://zerovc.safiroko.xyz/download");
        return Err("linux-package-manual-update".to_string());
    };

    if !command_exists("pkexec") || (!command_exists("curl") && !command_exists("wget")) {
        let _ = open_url_with_os("https://zerovc.safiroko.xyz/download");
        return Err("linux-package-manual-update".to_string());
    }

    let file_name = match pkg_kind {
        LinuxPkgKind::Deb => "ZeroVC.deb",
        LinuxPkgKind::Rpm => "ZeroVC.rpm",
        LinuxPkgKind::Pacman => "ZeroVC.pacman",
    };

    let tag = if version.starts_with('v') {
        version.to_string()
    } else {
        format!("v{version}")
    };
    let download_url =
        format!("https://github.com/Thiagoalfs/zerovc/releases/download/{tag}/{file_name}");
    let sig_url = format!("{download_url}.sig");

    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Diretório de cache indisponível: {e}"))?;
    let updates_dir = cache_dir.join("updates");
    tokio::fs::create_dir_all(&updates_dir)
        .await
        .map_err(|e| format!("Falha ao preparar pasta de atualização: {e}"))?;
    let meta = tokio::fs::symlink_metadata(&updates_dir)
        .await
        .map_err(|e| format!("Falha ao inspecionar pasta de atualização: {e}"))?;
    if meta.file_type().is_symlink() || !meta.is_dir() {
        return Err("Pasta de atualização inválida".to_string());
    }
    std::fs::set_permissions(&updates_dir, std::fs::Permissions::from_mode(0o700))
        .map_err(|e| format!("Falha ao restringir permissões da pasta de atualização: {e}"))?;

    let dest_path = updates_dir.join(file_name);
    let sig_path = updates_dir.join(format!("{file_name}.sig"));
    let _ = tokio::fs::remove_file(&dest_path).await;
    let _ = tokio::fs::remove_file(&sig_path).await;

    let _ = app.emit(
        "update-progress",
        serde_json::json!({
            "percent": 15.0,
            "bytesPerSecond": 0,
            "transferred": 0,
            "total": 0,
        }),
    );

    if let Err(err) = download_file_to(&download_url, &dest_path).await {
        let _ = tokio::fs::remove_file(&dest_path).await;
        return Err(if err == "linux-package-manual-update" {
            let _ = open_url_with_os("https://zerovc.safiroko.xyz/download");
            err
        } else {
            format!("Falha ao baixar {file_name} ({tag})")
        });
    }

    if let Err(err) = download_file_to(&sig_url, &sig_path).await {
        let _ = tokio::fs::remove_file(&dest_path).await;
        let _ = tokio::fs::remove_file(&sig_path).await;
        return Err(format!("Falha ao baixar assinatura {file_name}.sig ({tag}): {err}"));
    }

    let pubkey_b64 = tauri_updater_pubkey()?;
    if let Err(err) = verify_minisign_file(&dest_path, &sig_path, &pubkey_b64) {
        let _ = tokio::fs::remove_file(&dest_path).await;
        let _ = tokio::fs::remove_file(&sig_path).await;
        return Err(err);
    }

    let _ = app.emit(
        "update-progress",
        serde_json::json!({
            "percent": 100.0,
            "bytesPerSecond": 0,
            "transferred": 1,
            "total": 1,
            "installing": true,
        }),
    );

    let dest_str = dest_path.to_string_lossy().to_string();
    let mut cmd = tokio::process::Command::new("pkexec");
    match pkg_kind {
        LinuxPkgKind::Deb => {
            if command_exists("apt-get") {
                cmd.args(["apt-get", "install", "-y", &dest_str]);
            } else {
                cmd.args(["dpkg", "-i", &dest_str]);
            }
        }
        LinuxPkgKind::Rpm => {
            if command_exists("dnf") {
                cmd.args(["dnf", "install", "-y", &dest_str]);
            } else if command_exists("zypper") {
                cmd.args(["zypper", "--non-interactive", "install", &dest_str]);
            } else {
                cmd.args(["rpm", "-Uvh", "--replacepkgs", &dest_str]);
            }
        }
        LinuxPkgKind::Pacman => {
            cmd.args(["pacman", "-U", "--noconfirm", &dest_str]);
        }
    }

    let install_out = cmd
        .output()
        .await
        .map_err(|e| format!("Falha ao iniciar instalador do sistema: {e}"))?;
    let _ = tokio::fs::remove_file(&dest_path).await;
    let _ = tokio::fs::remove_file(&sig_path).await;

    if !install_out.status.success() {
        let code = install_out.status.code().unwrap_or(-1);
        if code == 126 || code == 127 {
            return Err("update-auth-cancelled".to_string());
        }
        let stderr = String::from_utf8_lossy(&install_out.stderr);
        return Err(format!(
            "Falha ao instalar {file_name}: {}",
            stderr.trim()
        ));
    }

    Ok(())
}

#[tauri::command]
pub async fn check_for_updates(app: AppHandle) {
    match app.updater() {
        Ok(updater) => match updater.check().await {
            Ok(Some(update)) => {
                let _ = app.emit(
                    "update-available",
                    serde_json::json!({
                        "version": update.version,
                        "releaseNotes": update.body,
                    }),
                );
                let _ = app.emit(
                    "update-check-result",
                    serde_json::json!({
                        "status": "available",
                        "version": update.version,
                    }),
                );
            }
            Ok(None) => {
                let _ = app.emit(
                    "update-check-result",
                    serde_json::json!({ "status": "up-to-date" }),
                );
            }
            Err(err) => {
                eprintln!("[Updater] check_for_updates failed: {err}");
                let _ = app.emit(
                    "update-check-result",
                    serde_json::json!({ "status": "error", "message": err.to_string() }),
                );
            }
        },
        Err(err) => {
            eprintln!("[Updater] updater unavailable: {err}");
            let _ = app.emit(
                "update-check-result",
                serde_json::json!({ "status": "error", "message": err.to_string() }),
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
    let updater = app
        .updater()
        .map_err(|e| format!("Updater indisponível: {e}"))?;
    let update = updater
        .check()
        .await
        .map_err(|e| format!("Falha ao verificar atualização: {e}"))?
        .ok_or_else(|| "Nenhuma atualização pendente encontrada".to_string())?;

    let version = update.version.clone();

    #[cfg(target_os = "linux")]
    if is_linux_non_appimage() {
        download_and_install_linux_package(&app, &version).await?;
        let _ = app.emit(
            "update-downloaded",
            serde_json::json!({ "version": version }),
        );
        state.is_quitting.store(true, Ordering::SeqCst);
        app.restart();
    }

    let app_clone = app.clone();
    let mut downloaded: usize = 0;
    update
        .download_and_install(
            move |chunk_len, content_len| {
                downloaded += chunk_len;
                let total = content_len.unwrap_or(0);
                let percent = if total > 0 {
                    ((downloaded as f64 / total as f64) * 100.0).min(100.0)
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
        .await
        .map_err(|e| format!("Falha ao baixar/instalar atualização: {e}"))?;

    let _ = app.emit(
        "update-downloaded",
        serde_json::json!({ "version": version }),
    );
    state.is_quitting.store(true, Ordering::SeqCst);
    app.restart();
}

#[tauri::command]
pub async fn apply_titlebar_update(app: AppHandle) -> TitlebarUpdateAction {
    if let Ok(updater) = app.updater() {
        if let Ok(Some(update)) = updater.check().await {
            let version = update.version.clone();
            let app_clone = app.clone();
            tauri::async_runtime::spawn(async move {
                #[cfg(target_os = "linux")]
                if is_linux_non_appimage() {
                    match download_and_install_linux_package(&app_clone, &version).await {
                        Ok(()) => {
                            if let Some(state) = app_clone.try_state::<AppState>() {
                                state.is_quitting.store(true, Ordering::SeqCst);
                            }
                            app_clone.restart();
                        }
                        Err(err) => {
                            eprintln!("[Updater] linux package update failed: {err}");
                            let _ = app_clone.emit(
                                "update-check-result",
                                serde_json::json!({ "status": "error", "message": err }),
                            );
                        }
                    }
                    return;
                }

                let progress_app = app_clone.clone();
                let mut downloaded: usize = 0;
                match update
                    .download_and_install(
                        move |chunk_len, content_len| {
                            downloaded += chunk_len;
                            let total = content_len.unwrap_or(0);
                            let percent = if total > 0 {
                                ((downloaded as f64 / total as f64) * 100.0).min(100.0)
                            } else {
                                0.0
                            };
                            let _ = progress_app.emit(
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
                    .await
                {
                    Ok(()) => {
                        if let Some(state) = app_clone.try_state::<AppState>() {
                            state.is_quitting.store(true, Ordering::SeqCst);
                        }
                        app_clone.restart();
                    }
                    Err(err) => {
                        eprintln!("[Updater] apply_titlebar_update failed: {err}");
                        let _ = app_clone.emit(
                            "update-check-result",
                            serde_json::json!({ "status": "error", "message": err.to_string() }),
                        );
                    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tauri_conf_updater_pubkey_is_valid_minisign() {
        let pubkey_b64 = tauri_updater_pubkey().expect("pubkey in tauri.conf.json");
        assert!(decode_minisign_pubkey(&pubkey_b64).is_ok());
    }

    #[test]
    fn test_verify_minisign_file_accepts_valid_and_rejects_tampered() {
        let pubkey_text = "untrusted comment: minisign public key E7620F1842B4E81F\nRWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3";
        let pubkey_b64 = base64::engine::general_purpose::STANDARD.encode(pubkey_text);
        let sig_text = "untrusted comment: signature from minisign secret key\nRWQf6LRCGA9i59SLOFxz6NxvASXDJeRtuZykwQepbDEGt87ig1BNpWaVWuNrm73YiIiJbq71Wi+dP9eKL8OC351vwIasSSbXxwA=\ntrusted comment: timestamp:1555779966\tfile:test\nQtKMXWyYcwdpZAlPF7tE2ENJkRd1ujvKjlj1m9RtHTBnZPa5WKU5uWRs5GoP5M/VqE81QFuMKI5k/SfNQUaOAA==";

        let dir = std::env::temp_dir().join(format!("zerovc-updater-test-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let pkg = dir.join("pkg.deb");
        let sig = dir.join("pkg.deb.sig");

        std::fs::write(&pkg, b"test").unwrap();
        std::fs::write(&sig, sig_text).unwrap();
        assert!(verify_minisign_file(&pkg, &sig, &pubkey_b64).is_ok());

        // Tampered payload must fail
        std::fs::write(&pkg, b"tampered").unwrap();
        assert!(verify_minisign_file(&pkg, &sig, &pubkey_b64).is_err());

        // Wrong pubkey from tauri.conf.json must also fail
        std::fs::write(&pkg, b"test").unwrap();
        let prod_key = tauri_updater_pubkey().unwrap();
        assert!(verify_minisign_file(&pkg, &sig, &prod_key).is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }
}
