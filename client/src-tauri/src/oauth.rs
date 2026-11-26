use crate::auth_vault::constant_time_eq;
use crate::commands::{open_url_with_os, REMOTE_SERVER_URL};
use crate::AppState;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use url::Url;

const CALLBACK_READ_TIMEOUT: Duration = Duration::from_secs(5);

fn generate_oauth_state() -> String {
    let mut bytes = [0u8; 16];
    getrandom::getrandom(&mut bytes).expect("OS CSPRNG unavailable");
    let mut out = String::with_capacity(32);
    for b in bytes {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

async fn read_callback_request(socket: &mut tokio::net::TcpStream) -> Option<String> {
    let mut buf = [0u8; 8192];
    let n = tokio::time::timeout(CALLBACK_READ_TIMEOUT, socket.read(&mut buf))
        .await
        .ok()?
        .ok()?;
    if n == 0 {
        return None;
    }
    Some(String::from_utf8_lossy(&buf[..n]).into_owned())
}

fn parse_oauth_callback_code(path: &str, expected_state: &str) -> Result<Option<String>, &'static str> {
    let parsed = Url::parse(&format!("http://127.0.0.1{path}")).map_err(|_| "invalid-url")?;
    let mut code: Option<String> = None;
    let mut state: Option<String> = None;
    for (k, v) in parsed.query_pairs() {
        match k.as_ref() {
            "code" => {
                let owned = v.into_owned();
                if !owned.trim().is_empty() {
                    code = Some(owned);
                }
            }
            "state" => {
                state = Some(v.into_owned());
            }
            _ => {}
        }
    }
    let Some(returned_state) = state else {
        return Err("missing-state");
    };
    if !constant_time_eq(returned_state.as_bytes(), expected_state.as_bytes()) {
        return Err("invalid-state");
    }
    Ok(code)
}

#[tauri::command]
pub async fn start_turnstile_verification(
    app: AppHandle,
    action: Option<String>,
) -> Result<(), String> {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Failed to bind local callback listener: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Failed to read callback port: {e}"))?
        .port();

    let callback_url = format!("http://127.0.0.1:{port}/turnstile-callback");
    let mut target = Url::parse(&format!("{REMOTE_SERVER_URL}/api/auth/turnstile-widget"))
        .map_err(|e| format!("Invalid server URL: {e}"))?;
    {
        let mut pairs = target.query_pairs_mut();
        pairs.append_pair("desktop", "1");
        pairs.append_pair("callback", &callback_url);
        if let Some(act) = action {
            let clean: String = act
                .chars()
                .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
                .take(32)
                .collect();
            if !clean.is_empty() {
                pairs.append_pair("action", &clean);
            }
        }
    }

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let deadline = tokio::time::Instant::now() + Duration::from_secs(300);
        loop {
            let accept_res = tokio::time::timeout_at(deadline, listener.accept()).await;
            let Ok(Ok((mut socket, _))) = accept_res else {
                break;
            };
            let Some(req_text) = read_callback_request(&mut socket).await else {
                continue;
            };
            let first_line = req_text.lines().next().unwrap_or("");
            let path = first_line.split_whitespace().nth(1).unwrap_or("/");
            if path.starts_with("/favicon.ico") {
                let _ = socket
                    .write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                    .await;
                continue;
            }

            let parsed_token = Url::parse(&format!("http://127.0.0.1{path}"))
                .ok()
                .and_then(|u| {
                    u.query_pairs()
                        .find(|(k, _)| k == "token")
                        .map(|(_, v)| v.into_owned())
                })
                .filter(|t| !t.trim().is_empty());

            let body = "<!DOCTYPE html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\" /><title>ZeroVC</title><style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#1e1f22;color:#f2f3f5;font-family:sans-serif;text-align:center}.card{background:#2b2d31;padding:28px 32px;border-radius:12px;border:1px solid rgba(255,255,255,.08)}h2{margin:0 0 8px;font-size:18px}p{margin:0;color:#b5bac1;font-size:14px}</style></head><body><div class=\"card\"><h2>Verificação concluída!</h2><p>Você já pode fechar esta aba e voltar para o ZeroVC.</p></div><script>setTimeout(function(){window.close();},400);</script></body></html>";
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            let _ = socket.write_all(resp.as_bytes()).await;
            let _ = socket.shutdown().await;

            if let Some(tok) = parsed_token {
                if let Some(state) = app_handle.try_state::<AppState>() {
                    if let Ok(mut guard) = state.pending_turnstile_token.lock() {
                        *guard = Some(tok.clone());
                    }
                }
                let _ = app_handle.emit("turnstile-token-received", tok);
                crate::tray::restore_and_focus_main(&app_handle);
                break;
            }
        }
    });

    open_url_with_os(target.as_str())
}

#[tauri::command]
pub fn consume_turnstile_token(state: State<'_, AppState>) -> Option<String> {
    state
        .pending_turnstile_token
        .lock()
        .ok()
        .and_then(|mut guard| guard.take())
}

#[tauri::command]
pub fn consume_desktop_auth_code(state: State<'_, AppState>) -> Option<String> {
    state
        .pending_desktop_auth_code
        .lock()
        .ok()
        .and_then(|mut guard| guard.take())
}

#[tauri::command]
pub async fn start_desktop_browser_login(
    app: AppHandle,
    mode: Option<String>,
) -> Result<(), String> {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Failed to bind desktop auth listener: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Failed to read desktop auth port: {e}"))?
        .port();

    let oauth_state = generate_oauth_state();
    let callback_url = format!("http://127.0.0.1:{port}/auth-callback?state={oauth_state}");
    let mut target = Url::parse(&format!("{REMOTE_SERVER_URL}/desktop-auth"))
        .map_err(|e| format!("Invalid server URL: {e}"))?;
    {
        let mut pairs = target.query_pairs_mut();
        pairs.append_pair("callback", &callback_url);
        if mode.as_deref() == Some("register") {
            pairs.append_pair("mode", "register");
        }
    }

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let deadline = tokio::time::Instant::now() + Duration::from_secs(300);
        loop {
            let accept_res = tokio::time::timeout_at(deadline, listener.accept()).await;
            let Ok(Ok((mut socket, _))) = accept_res else {
                break;
            };
            let Some(req_text) = read_callback_request(&mut socket).await else {
                continue;
            };
            let first_line = req_text.lines().next().unwrap_or("");
            let path = first_line.split_whitespace().nth(1).unwrap_or("/");
            if path.starts_with("/favicon.ico") {
                let _ = socket
                    .write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                    .await;
                continue;
            }

            let parsed_code = match parse_oauth_callback_code(path, &oauth_state) {
                Ok(code) => code,
                Err(_) => {
                    let resp = format!(
                        "HTTP/1.1 403 Forbidden\r\nAccess-Control-Allow-Origin: {REMOTE_SERVER_URL}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: 13\r\nConnection: close\r\n\r\nInvalid state"
                    );
                    let _ = socket.write_all(resp.as_bytes()).await;
                    let _ = socket.shutdown().await;
                    continue;
                }
            };

            let resp = format!(
                "HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: {REMOTE_SERVER_URL}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok"
            );
            let _ = socket.write_all(resp.as_bytes()).await;
            let _ = socket.shutdown().await;

            if let Some(code) = parsed_code {
                if let Some(state) = app_handle.try_state::<AppState>() {
                    if let Ok(mut guard) = state.pending_desktop_auth_code.lock() {
                        *guard = Some(code.clone());
                    }
                }
                let _ = app_handle.emit("desktop-auth-code", code);
                crate::tray::restore_and_focus_main(&app_handle);
                break;
            }
        }
    });

    open_url_with_os(target.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_oauth_callback_state_validation() {
        let state = generate_oauth_state();
        assert_eq!(state.len(), 32);

        let ok_path = format!("/auth-callback?state={state}&code=auth123");
        assert_eq!(
            parse_oauth_callback_code(&ok_path, &state),
            Ok(Some("auth123".to_string()))
        );

        assert_eq!(
            parse_oauth_callback_code("/auth-callback?code=auth123", &state),
            Err("missing-state")
        );
        assert_eq!(
            parse_oauth_callback_code("/auth-callback?state=wrong&code=auth123", &state),
            Err("invalid-state")
        );
    }

    #[tokio::test]
    async fn test_idle_callback_socket_times_out() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let _client = tokio::net::TcpStream::connect(addr).await.unwrap();
        let (mut server_sock, _) = listener.accept().await.unwrap();

        // Keep client open without sending bytes; read_callback_request must return None after 5s
        let start = std::time::Instant::now();
        let res = read_callback_request(&mut server_sock).await;
        assert!(res.is_none());
        assert!(start.elapsed() >= Duration::from_secs(4));
    }
}
