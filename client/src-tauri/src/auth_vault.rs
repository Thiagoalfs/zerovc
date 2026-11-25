use std::net::SocketAddr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::RwLock;

const KEYRING_SERVICE: &str = "xyz.safiroko.zerovc";
const KEYRING_ACCOUNT: &str = "auth-token";
const MAX_HEADER_BYTES: usize = 64 * 1024;
const PROXY_SECRET_HEADER: &str = "x-zerovc-proxy-secret";
const PROXY_TARGET_HEADER: &str = "x-zerovc-target";

static SECRET_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Clone)]
pub struct AuthVault {
    token: Arc<RwLock<Option<String>>>,
    proxy_secret: Arc<String>,
    proxy_addr: Arc<RwLock<Option<SocketAddr>>>,
}

impl AuthVault {
    pub fn new() -> Self {
        let initial_token = load_keyring_token();
        Self {
            token: Arc::new(RwLock::new(initial_token)),
            proxy_secret: Arc::new(generate_session_secret()),
            proxy_addr: Arc::new(RwLock::new(None)),
        }
    }

    /// Updates the stored JWT in memory and OS keyring. Never returns the JWT to callers.
    pub async fn set_token(&self, token: Option<String>) -> Result<(), String> {
        let normalized = token
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty() && t != "cookie_session");

        {
            let mut guard = self.token.write().await;
            *guard = normalized.clone();
        }

        save_keyring_token(normalized.as_deref())
    }

    pub fn proxy_secret(&self) -> &str {
        &self.proxy_secret
    }

    pub async fn proxy_addr(&self) -> Option<SocketAddr> {
        *self.proxy_addr.read().await
    }

    /// Starts the loopback HTTP/WS auth proxy on `127.0.0.1:<ephemeral>`.
    pub async fn start_proxy(&self) -> Result<SocketAddr, String> {
        self.start_proxy_with_default(None).await
    }

    pub async fn start_proxy_with_default(
        &self,
        default_upstream: Option<String>,
    ) -> Result<SocketAddr, String> {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| format!("Failed to bind auth proxy: {e}"))?;
        let addr = listener
            .local_addr()
            .map_err(|e| format!("Failed to read proxy local_addr: {e}"))?;

        {
            let mut guard = self.proxy_addr.write().await;
            *guard = Some(addr);
        }

        let token = Arc::clone(&self.token);
        let secret = Arc::clone(&self.proxy_secret);

        tokio::spawn(async move {
            loop {
                match listener.accept().await {
                    Ok((stream, _peer)) => {
                        let token_ref = Arc::clone(&token);
                        let secret_ref = Arc::clone(&secret);
                        let default_up = default_upstream.clone();
                        tokio::spawn(async move {
                            let _ = handle_proxy_connection(
                                stream,
                                &secret_ref,
                                &token_ref,
                                default_up.as_deref(),
                            )
                            .await;
                        });
                    }
                    Err(e) => {
                        eprintln!("[AuthVault] Proxy accept error: {e}");
                        break;
                    }
                }
            }
        });

        Ok(addr)
    }
}

impl Default for AuthVault {
    fn default() -> Self {
        Self::new()
    }
}

fn generate_session_secret() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let pid = std::process::id() as u128;
    let seq = SECRET_COUNTER.fetch_add(1, Ordering::Relaxed) as u128;

    let mut state = nanos ^ (pid << 64) ^ (seq.wrapping_mul(0x9e37_79b9_7f4a_7c15));
    let mut out = String::with_capacity(64);
    for _ in 0..8 {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        out.push_str(&format!("{:08x}", (state & 0xffff_ffff) as u32));
        state = state.rotate_left(29).wrapping_add(0x517cc1b727220a95);
    }
    out
}

pub fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

fn load_keyring_token() -> Option<String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).ok()?;
    match entry.get_password() {
        Ok(pw) if !pw.is_empty() && pw != "cookie_session" => Some(pw),
        _ => None,
    }
}

fn save_keyring_token(token: Option<&str>) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|e| format!("Keyring entry error: {e}"))?;
    match token {
        Some(t) => entry
            .set_password(t)
            .map_err(|e| format!("Keyring store error: {e}")),
        None => match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("Keyring delete error: {e}")),
        },
    }
}

#[derive(Debug, PartialEq, Eq)]
struct ParsedHead {
    request_line: String,
    headers: Vec<(String, String)>,
    provided_secret: Option<String>,
    target: Option<String>,
    has_authorization: bool,
}

fn parse_http_head(raw_head: &str) -> Result<ParsedHead, &'static str> {
    let mut lines = raw_head.split("\r\n");
    let request_line = lines
        .next()
        .filter(|l| !l.is_empty())
        .ok_or("empty request line")?
        .to_string();

    let mut headers = Vec::new();
    let mut provided_secret = None;
    let mut target = None;
    let mut has_authorization = false;

    for line in lines {
        if line.is_empty() {
            continue;
        }
        let Some((name, value)) = line.split_once(':') else {
            return Err("malformed header");
        };
        let trimmed_name = name.trim();
        let trimmed_value = value.trim();
        let lower = trimmed_name.to_ascii_lowercase();

        if lower == PROXY_SECRET_HEADER {
            provided_secret = Some(trimmed_value.to_string());
            continue;
        }
        if lower == PROXY_TARGET_HEADER {
            target = Some(trimmed_value.to_string());
            continue;
        }
        if lower == "authorization" {
            has_authorization = true;
        }
        headers.push((trimmed_name.to_string(), trimmed_value.to_string()));
    }

    Ok(ParsedHead {
        request_line,
        headers,
        provided_secret,
        target,
        has_authorization,
    })
}

fn build_forwarded_head(parsed: &ParsedHead, token: Option<&str>) -> Vec<u8> {
    let mut out = String::with_capacity(512);
    out.push_str(&parsed.request_line);
    out.push_str("\r\n");
    for (k, v) in &parsed.headers {
        out.push_str(k);
        out.push_str(": ");
        out.push_str(v);
        out.push_str("\r\n");
    }
    if !parsed.has_authorization {
        if let Some(jwt) = token {
            out.push_str("Authorization: Bearer ");
            out.push_str(jwt);
            out.push_str("\r\n");
        }
    }
    out.push_str("\r\n");
    out.into_bytes()
}

fn is_allowed_proxy_target(target: &str) -> bool {
    let host = target.split(':').next().unwrap_or("");
    matches!(host, "127.0.0.1" | "localhost" | "zerovc.safiroko.xyz")
}

async fn handle_proxy_connection(
    mut client: TcpStream,
    expected_secret: &str,
    token_lock: &Arc<RwLock<Option<String>>>,
    default_upstream: Option<&str>,
) -> Result<(), String> {
    let mut buf = Vec::with_capacity(4096);
    let mut tmp = [0u8; 2048];
    let head_end;

    loop {
        let n = client
            .read(&mut tmp)
            .await
            .map_err(|e| format!("client read error: {e}"))?;
        if n == 0 {
            return Err("client closed before headers".into());
        }
        buf.extend_from_slice(&tmp[..n]);
        if let Some(pos) = find_double_crlf(&buf) {
            head_end = pos;
            break;
        }
        if buf.len() > MAX_HEADER_BYTES {
            let _ = client
                .write_all(b"HTTP/1.1 431 Request Header Fields Too Large\r\nConnection: close\r\n\r\n")
                .await;
            return Err("headers too large".into());
        }
    }

    let head_str = std::str::from_utf8(&buf[..head_end]).map_err(|_| "invalid utf8 headers")?;
    let parsed = parse_http_head(head_str).map_err(|e| e.to_string())?;

    let valid_secret = parsed
        .provided_secret
        .as_deref()
        .map(|s| constant_time_eq(s.as_bytes(), expected_secret.as_bytes()))
        .unwrap_or(false);

    if !valid_secret {
        let _ = client
            .write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 9\r\nConnection: close\r\n\r\nForbidden")
            .await;
        return Err("invalid proxy secret".into());
    }

    let upstream_addr = parsed
        .target
        .as_deref()
        .or(default_upstream)
        .ok_or_else(|| "missing upstream target".to_string())?;

    if !is_allowed_proxy_target(upstream_addr) {
        let _ = client
            .write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 14\r\nConnection: close\r\n\r\nInvalid target")
            .await;
        return Err("disallowed proxy target".into());
    }

    let mut upstream = TcpStream::connect(upstream_addr)
        .await
        .map_err(|e| format!("upstream connect failed: {e}"))?;

    let token_snapshot = token_lock.read().await.clone();
    let forwarded_head = build_forwarded_head(&parsed, token_snapshot.as_deref());
    upstream
        .write_all(&forwarded_head)
        .await
        .map_err(|e| format!("upstream write head failed: {e}"))?;

    let body_tail = &buf[head_end + 4..];
    if !body_tail.is_empty() {
        upstream
            .write_all(body_tail)
            .await
            .map_err(|e| format!("upstream write tail failed: {e}"))?;
    }

    let _ = tokio::io::copy_bidirectional(&mut client, &mut upstream).await;
    Ok(())
}

fn find_double_crlf(buf: &[u8]) -> Option<usize> {
    buf.windows(4).position(|w| w == b"\r\n\r\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_secret_validation_constant_time() {
        assert!(constant_time_eq(b"abc123", b"abc123"));
        assert!(!constant_time_eq(b"abc123", b"abc124"));
        assert!(!constant_time_eq(b"abc", b"abcd"));
    }

    #[test]
    fn test_header_injection_and_secret_stripping() {
        let raw = "GET /api/me HTTP/1.1\r\nHost: localhost\r\nX-ZeroVC-Proxy-Secret: mysecret\r\nX-ZeroVC-Target: 127.0.0.1:5173";
        let parsed = parse_http_head(raw).expect("valid head");
        assert_eq!(parsed.provided_secret.as_deref(), Some("mysecret"));
        assert_eq!(parsed.target.as_deref(), Some("127.0.0.1:5173"));
        assert!(!parsed.has_authorization);

        let rebuilt = String::from_utf8(build_forwarded_head(&parsed, Some("jwt-xyz"))).unwrap();
        assert!(!rebuilt.contains("X-ZeroVC-Proxy-Secret"));
        assert!(!rebuilt.contains("X-ZeroVC-Target"));
        assert!(rebuilt.contains("Authorization: Bearer jwt-xyz\r\n"));
    }

    #[tokio::test]
    async fn test_loopback_proxy_rejects_unauthorized_and_injects_jwt() {
        let mock_upstream = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let upstream_addr = mock_upstream.local_addr().unwrap();

        tokio::spawn(async move {
            if let Ok((mut sock, _)) = mock_upstream.accept().await {
                let mut req_buf = [0u8; 2048];
                let n = sock.read(&mut req_buf).await.unwrap_or(0);
                let req_text = String::from_utf8_lossy(&req_buf[..n]).to_string();
                let resp_body = if req_text.contains("Authorization: Bearer secret-jwt-token")
                    && !req_text.contains("x-zerovc-proxy-secret")
                {
                    "OK_AUTH"
                } else {
                    "MISSING_AUTH"
                };
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    resp_body.len(),
                    resp_body
                );
                let _ = sock.write_all(resp.as_bytes()).await;
            }
        });

        let vault = AuthVault {
            token: Arc::new(RwLock::new(Some("secret-jwt-token".to_string()))),
            proxy_secret: Arc::new("session-secret-test".to_string()),
            proxy_addr: Arc::new(RwLock::new(None)),
        };
        let proxy_addr = vault
            .start_proxy_with_default(Some(upstream_addr.to_string()))
            .await
            .unwrap();

        // 1. Unauthorized request without secret must get 403 Forbidden
        let mut unauth = TcpStream::connect(proxy_addr).await.unwrap();
        unauth
            .write_all(b"GET /test HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")
            .await
            .unwrap();
        let mut unauth_resp = String::new();
        unauth.read_to_string(&mut unauth_resp).await.unwrap();
        assert!(unauth_resp.starts_with("HTTP/1.1 403 Forbidden"));

        // 2. Authorized request with secret gets JWT injected and secret stripped
        let mut auth = TcpStream::connect(proxy_addr).await.unwrap();
        let req = format!(
            "GET /test HTTP/1.1\r\nHost: 127.0.0.1\r\nX-ZeroVC-Proxy-Secret: {}\r\n\r\n",
            vault.proxy_secret()
        );
        auth.write_all(req.as_bytes()).await.unwrap();
        let mut auth_resp = String::new();
        auth.read_to_string(&mut auth_resp).await.unwrap();
        assert!(auth_resp.contains("OK_AUTH"), "got: {auth_resp}");
    }
}
