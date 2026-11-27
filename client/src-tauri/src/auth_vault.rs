use rustls::pki_types::ServerName;
use rustls::ClientConfig;
use rustls_platform_verifier::BuilderVerifierExt;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{RwLock, Semaphore};
use tokio_rustls::TlsConnector;

const KEYRING_SERVICE: &str = "xyz.safiroko.zerovc";
const KEYRING_ACCOUNT: &str = "auth-token";
const MAX_HEADER_BYTES: usize = 64 * 1024;
const MAX_CONCURRENT_PROXY_CONNS: usize = 64;
const PROXY_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const PROXY_HEAD_TIMEOUT: Duration = Duration::from_secs(10);
const PROXY_UPSTREAM_HEAD_TIMEOUT: Duration = Duration::from_secs(30);
const PROXY_SECRET_HEADER: &str = "x-zerovc-proxy-secret";
const PROXY_TARGET_HEADER: &str = "x-zerovc-target";
const PROXY_PATH_PREFIX: &str = "/__zv_proxy/";

static TLS_CONFIG: OnceLock<Arc<ClientConfig>> = OnceLock::new();

fn get_tls_config() -> Result<Arc<ClientConfig>, String> {
    if let Some(cfg) = TLS_CONFIG.get() {
        return Ok(Arc::clone(cfg));
    }
    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let config = ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .map_err(|e| format!("TLS versions error: {e}"))?
        .with_platform_verifier()
        .map_err(|e| format!("TLS verifier error: {e}"))?
        .with_no_client_auth();
    let arc = Arc::new(config);
    let _ = TLS_CONFIG.set(Arc::clone(&arc));
    Ok(arc)
}

#[derive(Clone)]
pub struct AuthVault {
    token: Arc<RwLock<Option<String>>>,
    proxy_secret: Arc<String>,
    proxy_addr: Arc<RwLock<Option<SocketAddr>>>,
    fallback_path: Arc<RwLock<Option<PathBuf>>>,
}

impl AuthVault {
    pub fn new() -> Self {
        let initial_token = load_keyring_token();
        Self {
            token: Arc::new(RwLock::new(initial_token)),
            proxy_secret: Arc::new(generate_session_secret()),
            proxy_addr: Arc::new(RwLock::new(None)),
            fallback_path: Arc::new(RwLock::new(None)),
        }
    }

    /// Configures the fallback token file path in `app_data_dir` and loads it if keyring had no token.
    pub async fn init_storage(&self, app_data_dir: PathBuf) {
        let path = app_data_dir.join("auth_token");
        {
            let mut guard = self.fallback_path.write().await;
            *guard = Some(path.clone());
        }
        if self.token.read().await.is_some() {
            return;
        }
        if let Some(loaded) = read_fallback_token(&path) {
            let mut guard = self.token.write().await;
            if guard.is_none() {
                *guard = Some(loaded);
            }
        }
    }

    /// Updates the stored JWT in memory and OS keyring (or owner-only fallback file). Never returns the JWT to callers.
    pub async fn set_token(&self, token: Option<String>) -> Result<(), String> {
        self.set_token_inner(token, true).await
    }

    async fn set_token_inner(&self, token: Option<String>, use_keyring: bool) -> Result<(), String> {
        let normalized = token
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty() && t != "cookie_session");

        {
            let mut guard = self.token.write().await;
            *guard = normalized.clone();
        }

        let fallback = self.fallback_path.read().await.clone();
        match normalized.as_deref() {
            Some(t) => {
                let keyring_res = if use_keyring {
                    save_keyring_token(Some(t))
                } else {
                    Err("keyring disabled".to_string())
                };
                match keyring_res {
                    Ok(()) => {
                        if let Some(path) = fallback.as_deref() {
                            let _ = delete_fallback_token(path);
                        }
                        Ok(())
                    }
                    Err(keyring_err) => {
                        eprintln!("[AuthVault] Keyring unavailable ({keyring_err}); writing fallback token");
                        let Some(path) = fallback.as_deref() else {
                            return Err(keyring_err);
                        };
                        write_fallback_token(path, t)
                            .map_err(|fb_err| format!("{keyring_err}; fallback failed: {fb_err}"))
                    }
                }
            }
            None => {
                let keyring_res = if use_keyring {
                    save_keyring_token(None)
                } else {
                    Ok(())
                };
                if let Some(path) = fallback.as_deref() {
                    delete_fallback_token(path)?;
                }
                if let Err(e) = keyring_res {
                    if fallback.is_some() {
                        eprintln!("[AuthVault] Keyring delete warning ({e})");
                    } else {
                        return Err(e);
                    }
                }
                Ok(())
            }
        }
    }

    pub fn proxy_secret(&self) -> &str {
        &self.proxy_secret
    }

    pub async fn proxy_addr(&self) -> Option<SocketAddr> {
        *self.proxy_addr.read().await
    }

    pub async fn proxy_url(&self) -> Option<String> {
        self.proxy_addr()
            .await
            .map(|addr| format!("http://{addr}{PROXY_PATH_PREFIX}{}", self.proxy_secret))
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
        let conn_semaphore = Arc::new(Semaphore::new(MAX_CONCURRENT_PROXY_CONNS));

        tokio::spawn(async move {
            loop {
                match listener.accept().await {
                    Ok((mut stream, _peer)) => {
                        let Ok(permit) = conn_semaphore.clone().try_acquire_owned() else {
                            let _ = stream
                                .write_all(b"HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                                .await;
                            continue;
                        };
                        let token_ref = Arc::clone(&token);
                        let secret_ref = Arc::clone(&secret);
                        let default_up = default_upstream.clone();
                        tokio::spawn(async move {
                            let _permit = permit;
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
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).expect("OS CSPRNG unavailable");
    let mut out = String::with_capacity(64);
    for b in bytes {
        out.push_str(&format!("{b:02x}"));
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

fn read_fallback_token(path: &Path) -> Option<String> {
    let meta = std::fs::symlink_metadata(path).ok()?;
    if meta.file_type().is_symlink() || !meta.is_file() {
        return None;
    }
    let raw = std::fs::read_to_string(path).ok()?;
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed == "cookie_session" {
        return None;
    }
    Some(trimmed.to_string())
}

fn write_fallback_token(path: &Path, token: &str) -> Result<(), String> {
    if let Ok(meta) = std::fs::symlink_metadata(path) {
        if meta.file_type().is_symlink() || !meta.is_file() {
            return Err("Refusing to write token to symlink or non-regular file".to_string());
        }
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create fallback dir: {e}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o700))
                .map_err(|e| format!("Failed to set fallback dir permissions: {e}"))?;
        }
    }

    let mut opts = std::fs::OpenOptions::new();
    opts.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    let mut file = opts
        .open(path)
        .map_err(|e| format!("Failed to open fallback token file: {e}"))?;
    use std::io::Write;
    file.write_all(token.as_bytes())
        .map_err(|e| format!("Failed to write fallback token: {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("Failed to set fallback token permissions: {e}"))?;
    }
    Ok(())
}

fn delete_fallback_token(path: &Path) -> Result<(), String> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("Failed to delete fallback token: {e}")),
    }
}

#[derive(Debug, PartialEq, Eq)]
struct ParsedHead {
    request_line: String,
    headers: Vec<(String, String)>,
    provided_secret: Option<String>,
    target: Option<String>,
    origin: Option<String>,
    is_websocket: bool,
    has_authorization: bool,
}

fn is_allowed_desktop_origin(origin: &str) -> bool {
    matches!(
        origin,
        "http://tauri.localhost"
            | "https://tauri.localhost"
            | "tauri://localhost"
            | "http://localhost:5173"
            | "https://zerovc.safiroko.xyz"
    )
}

fn extract_path_secret(raw_request_line: &str) -> Result<(String, Option<String>), &'static str> {
    let mut parts = raw_request_line.split(' ');
    let method = parts.next().filter(|s| !s.is_empty()).ok_or("malformed request line")?;
    let path = parts.next().filter(|s| !s.is_empty()).ok_or("malformed request line")?;
    let version = parts.next().filter(|s| !s.is_empty()).ok_or("malformed request line")?;
    if parts.next().is_some() {
        return Err("malformed request line");
    }

    if let Some(after) = path.strip_prefix(PROXY_PATH_PREFIX) {
        let end = after.find(['/', '?']).unwrap_or(after.len());
        let (secret_part, rest) = after.split_at(end);
        if !secret_part.is_empty() {
            let clean_path = if rest.is_empty() {
                "/".to_string()
            } else if rest.starts_with('?') {
                format!("/{rest}")
            } else {
                rest.to_string()
            };
            return Ok((
                format!("{method} {clean_path} {version}"),
                Some(secret_part.to_string()),
            ));
        }
    }

    Ok((raw_request_line.to_string(), None))
}

fn parse_http_head(raw_head: &str) -> Result<ParsedHead, &'static str> {
    let mut lines = raw_head.split("\r\n");
    let raw_request_line = lines
        .next()
        .filter(|l| !l.is_empty())
        .ok_or("empty request line")?;
    let (request_line, path_secret) = extract_path_secret(raw_request_line)?;

    let mut headers = Vec::new();
    let mut provided_secret = path_secret;
    let mut target = None;
    let mut origin = None;
    let mut is_websocket = false;
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
        if lower == "origin" {
            origin = Some(trimmed_value.to_string());
        }
        if lower == "upgrade" && trimmed_value.eq_ignore_ascii_case("websocket") {
            is_websocket = true;
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
        origin,
        is_websocket,
        has_authorization,
    })
}

#[cfg(test)]
fn build_forwarded_head(parsed: &ParsedHead, token: Option<&str>) -> Vec<u8> {
    build_forwarded_head_with_upstream(parsed, token, None, false)
}

fn build_forwarded_head_with_upstream(
    parsed: &ParsedHead,
    token: Option<&str>,
    upstream_host_port: Option<&str>,
    is_tls: bool,
) -> Vec<u8> {
    let mut out = String::with_capacity(512);
    out.push_str(&parsed.request_line);
    out.push_str("\r\n");
    for (k, v) in &parsed.headers {
        let lower = k.to_ascii_lowercase();
        if upstream_host_port.is_some() && lower == "host" {
            continue;
        }
        if upstream_host_port.is_some() && lower == "origin" {
            continue;
        }
        if !parsed.is_websocket && lower == "connection" {
            continue;
        }
        out.push_str(k);
        out.push_str(": ");
        out.push_str(v);
        out.push_str("\r\n");
    }
    if let Some(host_port) = upstream_host_port {
        let host = host_port.split(':').next().unwrap_or(host_port);
        out.push_str("Host: ");
        out.push_str(host_port);
        out.push_str("\r\n");
        if parsed.origin.is_some() {
            let scheme = if is_tls { "https" } else { "http" };
            out.push_str("Origin: ");
            out.push_str(scheme);
            out.push_str("://");
            out.push_str(host);
            out.push_str("\r\n");
        }
    }
    if !parsed.is_websocket {
        out.push_str("Connection: close\r\n");
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

fn parse_upstream_target(raw: &str) -> Result<(String, u16, bool), String> {
    let (host, port, is_tls) = if let Some(rest) = raw.strip_prefix("https://") {
        let host_port = rest.split('/').next().unwrap_or(rest);
        if let Some((h, p)) = host_port.split_once(':') {
            (
                h.to_string(),
                p.parse::<u16>().map_err(|_| "invalid upstream port".to_string())?,
                true,
            )
        } else {
            (host_port.to_string(), 443, true)
        }
    } else if let Some(rest) = raw.strip_prefix("http://") {
        let host_port = rest.split('/').next().unwrap_or(rest);
        if let Some((h, p)) = host_port.split_once(':') {
            (
                h.to_string(),
                p.parse::<u16>().map_err(|_| "invalid upstream port".to_string())?,
                false,
            )
        } else {
            (host_port.to_string(), 80, false)
        }
    } else if let Some((h, p)) = raw.split_once(':') {
        let port = p.parse::<u16>().map_err(|_| "invalid upstream port".to_string())?;
        (h.to_string(), port, false)
    } else {
        return Err("missing port in upstream target".to_string());
    };

    if host.is_empty() || host.contains('@') || host.chars().any(|c| c.is_whitespace()) {
        return Err("invalid upstream host".to_string());
    }
    Ok((host, port, is_tls))
}

fn is_allowed_proxy_target(target: &str, configured_upstream: Option<&str>) -> bool {
    let Ok((t_host, t_port, t_tls)) = parse_upstream_target(target) else {
        return false;
    };
    if let Some(cfg) = configured_upstream {
        let Ok((c_host, c_port, c_tls)) = parse_upstream_target(cfg) else {
            return false;
        };
        return t_host.eq_ignore_ascii_case(&c_host) && t_port == c_port && t_tls == c_tls;
    }
    t_host.eq_ignore_ascii_case("zerovc.safiroko.xyz") && t_port == 443 && t_tls
}

async fn forward_with_cors_headers<S: AsyncRead + AsyncWrite + Unpin + Send + 'static>(
    mut client: TcpStream,
    mut upstream: S,
    forwarded_head: &[u8],
    body_tail: &[u8],
    client_origin: Option<&str>,
    is_websocket: bool,
) -> Result<(), String> {
    upstream
        .write_all(forwarded_head)
        .await
        .map_err(|e| format!("upstream write head failed: {e}"))?;

    if !body_tail.is_empty() {
        upstream
            .write_all(body_tail)
            .await
            .map_err(|e| format!("upstream write tail failed: {e}"))?;
    }
    upstream
        .flush()
        .await
        .map_err(|e| format!("upstream flush failed: {e}"))?;

    if is_websocket || client_origin.is_none() {
        let _ = tokio::io::copy_bidirectional(&mut client, &mut upstream).await;
        return Ok(());
    }

    let (mut cr, mut cw) = tokio::io::split(client);
    let (mut ur, mut uw) = tokio::io::split(upstream);

    // Forward any remaining request body chunks concurrently BEFORE waiting for
    // the upstream response headers (prevents deadlock when POST body arrives in a second TCP packet).
    let c2u = tokio::spawn(async move {
        let mut cbuf = [0u8; 8192];
        while let Ok(n) = cr.read(&mut cbuf).await {
            if n == 0 {
                break;
            }
            if uw.write_all(&cbuf[..n]).await.is_err() {
                break;
            }
            if uw.flush().await.is_err() {
                break;
            }
        }
        let _ = uw.shutdown().await;
    });

    // Rewrite response head to add Access-Control-Allow-Origin for the desktop WebView origin.
    let origin = client_origin.unwrap_or("");
    let mut resp_buf = Vec::with_capacity(4096);
    let mut tmp = [0u8; 2048];
    let resp_head_end;
    loop {
        let n = tokio::time::timeout(PROXY_UPSTREAM_HEAD_TIMEOUT, ur.read(&mut tmp))
            .await
            .map_err(|_| {
                c2u.abort();
                "upstream response header timeout".to_string()
            })?
            .map_err(|e| {
                c2u.abort();
                format!("upstream read error: {e}")
            })?;
        if n == 0 {
            if !resp_buf.is_empty() {
                let _ = cw.write_all(&resp_buf).await;
                let _ = cw.flush().await;
            }
            let _ = cw.shutdown().await;
            c2u.abort();
            return Ok(());
        }
        resp_buf.extend_from_slice(&tmp[..n]);
        if let Some(pos) = find_double_crlf(&resp_buf) {
            resp_head_end = pos;
            break;
        }
        if resp_buf.len() > MAX_HEADER_BYTES {
            let _ = cw.write_all(&resp_buf).await;
            let _ = tokio::io::copy(&mut ur, &mut cw).await;
            let _ = cw.flush().await;
            let _ = cw.shutdown().await;
            c2u.abort();
            return Ok(());
        }
    }

    let resp_head = String::from_utf8_lossy(&resp_buf[..resp_head_end]);
    let mut out_head = String::with_capacity(resp_head.len() + 256);
    let mut lines = resp_head.split("\r\n");
    if let Some(status_line) = lines.next() {
        out_head.push_str(status_line);
        out_head.push_str("\r\n");
    }
    for line in lines {
        if line.is_empty() {
            continue;
        }
        let lower = line.to_ascii_lowercase();
        if lower.starts_with("access-control-allow-origin:")
            || lower.starts_with("access-control-allow-credentials:")
            || lower.starts_with("access-control-expose-headers:")
            || lower.starts_with("connection:")
            || lower.starts_with("keep-alive:")
        {
            continue;
        }
        out_head.push_str(line);
        out_head.push_str("\r\n");
    }
    out_head.push_str("Access-Control-Allow-Origin: ");
    out_head.push_str(origin);
    out_head.push_str("\r\n");
    out_head.push_str("Access-Control-Allow-Credentials: true\r\n");
    out_head.push_str("Access-Control-Expose-Headers: Link, X-CSRF-Token, X-Bot-ID\r\n");
    out_head.push_str("Connection: close\r\n");
    out_head.push_str("\r\n");

    cw.write_all(out_head.as_bytes()).await.map_err(|e| {
        c2u.abort();
        format!("client write head failed: {e}")
    })?;

    let resp_tail = &resp_buf[resp_head_end + 4..];
    if !resp_tail.is_empty() {
        cw.write_all(resp_tail).await.map_err(|e| {
            c2u.abort();
            format!("client write tail failed: {e}")
        })?;
    }

    let _ = tokio::io::copy(&mut ur, &mut cw).await;
    let _ = cw.flush().await;
    let _ = cw.shutdown().await;
    c2u.abort();
    Ok(())
}

async fn handle_proxy_connection(
    mut client: TcpStream,
    expected_secret: &str,
    token_lock: &Arc<RwLock<Option<String>>>,
    default_upstream: Option<&str>,
) -> Result<(), String> {
    let mut buf = Vec::with_capacity(4096);
    let mut tmp = [0u8; 2048];
    let head_end = tokio::time::timeout(PROXY_HEAD_TIMEOUT, async {
        loop {
            let n = client
                .read(&mut tmp)
                .await
                .map_err(|e| format!("client read error: {e}"))?;
            if n == 0 {
                return Err("client closed before headers".to_string());
            }
            buf.extend_from_slice(&tmp[..n]);
            if let Some(pos) = find_double_crlf(&buf) {
                return Ok(pos);
            }
            if buf.len() > MAX_HEADER_BYTES {
                let _ = client
                    .write_all(b"HTTP/1.1 431 Request Header Fields Too Large\r\nConnection: close\r\n\r\n")
                    .await;
                return Err("headers too large".to_string());
            }
        }
    })
    .await
    .map_err(|_| "client header read timeout".to_string())??;

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
        return Err("invalid or missing proxy secret".into());
    }

    if parsed.request_line.starts_with("OPTIONS ") {
        let Some(allow_origin) = parsed
            .origin
            .as_deref()
            .filter(|o| is_allowed_desktop_origin(o))
        else {
            let _ = client
                .write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 9\r\nConnection: close\r\n\r\nForbidden")
                .await;
            return Err("disallowed origin for CORS preflight".into());
        };
        let resp = format!(
            "HTTP/1.1 204 No Content\r\n\
             Access-Control-Allow-Origin: {allow_origin}\r\n\
             Access-Control-Allow-Credentials: true\r\n\
             Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS\r\n\
             Access-Control-Allow-Headers: Accept, Authorization, Content-Type, X-CSRF-Token, X-Bot-ID, X-Client-E2EE-Version\r\n\
             Access-Control-Max-Age: 300\r\n\
             Content-Length: 0\r\n\
             Connection: close\r\n\r\n"
        );
        let _ = client.write_all(resp.as_bytes()).await;
        return Ok(());
    }

    let upstream_raw = parsed
        .target
        .as_deref()
        .or(default_upstream)
        .ok_or_else(|| "missing upstream target".to_string())?;

    if !is_allowed_proxy_target(upstream_raw, default_upstream) {
        let _ = client
            .write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 14\r\nConnection: close\r\n\r\nInvalid target")
            .await;
        return Err("disallowed proxy target".into());
    }

    let (host, port, is_tls) = parse_upstream_target(upstream_raw)?;
    let upstream_host_port = if (is_tls && port == 443) || (!is_tls && port == 80) {
        host.clone()
    } else {
        format!("{host}:{port}")
    };

    let token_snapshot = token_lock.read().await.clone();
    let forwarded_head = build_forwarded_head_with_upstream(
        &parsed,
        token_snapshot.as_deref(),
        if parsed.target.is_none() {
            Some(upstream_host_port.as_str())
        } else {
            None
        },
        is_tls,
    );
    let body_tail = &buf[head_end + 4..];

    let t_start = std::time::Instant::now();
    let req_line = parsed.request_line.clone();
    let is_ws = parsed.is_websocket;
    let tcp = tokio::time::timeout(PROXY_CONNECT_TIMEOUT, TcpStream::connect((host.as_str(), port)))
        .await
        .map_err(|_| "upstream connect timeout".to_string())?
        .map_err(|e| format!("upstream connect failed: {e}"))?;
    let t_tcp = t_start.elapsed().as_millis();

    let res = if is_tls {
        let tls_cfg = get_tls_config()?;
        let connector = TlsConnector::from(tls_cfg);
        let server_name = ServerName::try_from(host)
            .map_err(|_| "invalid TLS server name".to_string())?;
        let tls_stream = tokio::time::timeout(
            PROXY_CONNECT_TIMEOUT,
            connector.connect(server_name, tcp),
        )
        .await
        .map_err(|_| "TLS handshake timeout".to_string())?
        .map_err(|e| format!("TLS handshake failed: {e}"))?;
        let t_tls = t_start.elapsed().as_millis();
        let r = forward_with_cors_headers(
            client,
            tls_stream,
            &forwarded_head,
            body_tail,
            parsed.origin.as_deref(),
            parsed.is_websocket,
        )
        .await;
        if !is_ws && t_start.elapsed().as_millis() > 500 {
            eprintln!(
                "[AuthVaultSlow] {} | tcp={}ms tls={}ms total={}ms",
                req_line,
                t_tcp,
                t_tls,
                t_start.elapsed().as_millis()
            );
        }
        r
    } else {
        forward_with_cors_headers(
            client,
            tcp,
            &forwarded_head,
            body_tail,
            parsed.origin.as_deref(),
            parsed.is_websocket,
        )
        .await
    };
    res
}

fn find_double_crlf(buf: &[u8]) -> Option<usize> {
    buf.windows(4).position(|w| w == b"\r\n\r\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_vault(token: Option<&str>) -> AuthVault {
        AuthVault {
            token: Arc::new(RwLock::new(token.map(str::to_string))),
            proxy_secret: Arc::new("session-secret-test".to_string()),
            proxy_addr: Arc::new(RwLock::new(None)),
            fallback_path: Arc::new(RwLock::new(None)),
        }
    }

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

        let vault = test_vault(Some("secret-jwt-token"));
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

    #[tokio::test]
    async fn test_loopback_proxy_post_body_split_packets() {
        let mock_upstream = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let upstream_addr = mock_upstream.local_addr().unwrap();

        tokio::spawn(async move {
            if let Ok((mut sock, _)) = mock_upstream.accept().await {
                let mut acc = Vec::new();
                let mut tmp = [0u8; 1024];
                loop {
                    let n = sock.read(&mut tmp).await.unwrap_or(0);
                    if n == 0 {
                        break;
                    }
                    acc.extend_from_slice(&tmp[..n]);
                    if String::from_utf8_lossy(&acc).contains("{\"code\":\"abc\"}") {
                        break;
                    }
                }
                let resp = "HTTP/1.1 200 OK\r\nContent-Length: 7\r\nConnection: close\r\n\r\nPOST_OK";
                let _ = sock.write_all(resp.as_bytes()).await;
            }
        });

        let vault = AuthVault::new();
        let proxy_addr = vault
            .start_proxy_with_default(Some(upstream_addr.to_string()))
            .await
            .unwrap();

        let mut client = TcpStream::connect(proxy_addr).await.unwrap();
        let head = format!(
            "POST /api/auth/desktop-exchange HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: http://localhost:5173\r\nX-ZeroVC-Proxy-Secret: {}\r\nContent-Type: application/json\r\nContent-Length: 14\r\n\r\n",
            vault.proxy_secret()
        );
        client.write_all(head.as_bytes()).await.unwrap();
        client.flush().await.unwrap();

        // Simulate WebKitGTK sending POST body in a second TCP packet without closing write half
        tokio::time::sleep(std::time::Duration::from_millis(25)).await;
        client.write_all(b"{\"code\":\"abc\"}").await.unwrap();
        client.flush().await.unwrap();

        let mut resp = String::new();
        tokio::time::timeout(
            std::time::Duration::from_secs(2),
            client.read_to_string(&mut resp),
        )
        .await
        .expect("POST split-packet deadlocked")
        .unwrap();
        assert!(resp.contains("POST_OK"), "got: {resp}");
        assert!(resp.contains("Connection: close"), "got: {resp}");
    }

    #[tokio::test]
    async fn test_spoofed_origin_without_secret_is_rejected() {
        let mock_upstream = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let upstream_addr = mock_upstream.local_addr().unwrap();

        let vault = test_vault(Some("secret-jwt-token"));
        let proxy_addr = vault
            .start_proxy_with_default(Some(upstream_addr.to_string()))
            .await
            .unwrap();

        for spoofed_origin in ["http://tauri.localhost", "http://localhost:5173", "https://zerovc.safiroko.xyz"] {
            let mut client = TcpStream::connect(proxy_addr).await.unwrap();
            let req = format!(
                "GET /api/me HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {spoofed_origin}\r\n\r\n"
            );
            client.write_all(req.as_bytes()).await.unwrap();
            let mut resp = String::new();
            client.read_to_string(&mut resp).await.unwrap();
            assert!(
                resp.starts_with("HTTP/1.1 403 Forbidden"),
                "expected 403 for spoofed Origin {spoofed_origin}, got: {resp}"
            );
        }
    }

    #[tokio::test]
    async fn test_disallowed_loopback_target_is_rejected() {
        assert!(is_allowed_proxy_target(
            "https://zerovc.safiroko.xyz",
            Some("https://zerovc.safiroko.xyz")
        ));
        assert!(!is_allowed_proxy_target(
            "127.0.0.1:8080",
            Some("https://zerovc.safiroko.xyz")
        ));
        assert!(!is_allowed_proxy_target(
            "http://localhost:5173",
            Some("https://zerovc.safiroko.xyz")
        ));
        assert!(!is_allowed_proxy_target(
            "https://zerovc.safiroko.xyz@127.0.0.1:8080",
            Some("https://zerovc.safiroko.xyz")
        ));

        let vault = test_vault(Some("secret-jwt-token"));
        let proxy_addr = vault
            .start_proxy_with_default(Some("https://zerovc.safiroko.xyz".to_string()))
            .await
            .unwrap();

        let mut client = TcpStream::connect(proxy_addr).await.unwrap();
        let req = format!(
            "GET /api/me HTTP/1.1\r\nHost: 127.0.0.1\r\nX-ZeroVC-Proxy-Secret: {}\r\nX-ZeroVC-Target: 127.0.0.1:9999\r\n\r\n",
            vault.proxy_secret()
        );
        client.write_all(req.as_bytes()).await.unwrap();
        let mut resp = String::new();
        client.read_to_string(&mut resp).await.unwrap();
        assert!(
            resp.starts_with("HTTP/1.1 403 Forbidden"),
            "expected 403 for arbitrary loopback target, got: {resp}"
        );
    }

    #[tokio::test]
    async fn test_path_prefix_secret_strips_prefix_and_injects_jwt() {
        let mock_upstream = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let upstream_addr = mock_upstream.local_addr().unwrap();

        tokio::spawn(async move {
            if let Ok((mut sock, _)) = mock_upstream.accept().await {
                let mut req_buf = [0u8; 2048];
                let n = sock.read(&mut req_buf).await.unwrap_or(0);
                let req_text = String::from_utf8_lossy(&req_buf[..n]).to_string();
                let ok = req_text.starts_with("GET /api/me?foo=1 HTTP/1.1\r\n")
                    && req_text.contains("Authorization: Bearer jwt-via-path\r\n")
                    && !req_text.contains("__zv_proxy");
                let body = if ok { "PATH_OK" } else { "BAD_PATH" };
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = sock.write_all(resp.as_bytes()).await;
            }
        });

        let vault = test_vault(Some("jwt-via-path"));
        vault
            .start_proxy_with_default(Some(upstream_addr.to_string()))
            .await
            .unwrap();
        let proxy_url = vault.proxy_url().await.unwrap();
        let addr_port = proxy_url
            .strip_prefix("http://")
            .unwrap()
            .split('/')
            .next()
            .unwrap();

        let mut client = TcpStream::connect(addr_port).await.unwrap();
        let req = format!(
            "GET /__zv_proxy/{}/api/me?foo=1 HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n",
            vault.proxy_secret()
        );
        client.write_all(req.as_bytes()).await.unwrap();
        let mut resp = String::new();
        client.read_to_string(&mut resp).await.unwrap();
        assert!(resp.contains("PATH_OK"), "got: {resp}");
    }

    fn unique_temp_dir(label: &str) -> PathBuf {
        let mut rng = [0u8; 8];
        getrandom::getrandom(&mut rng).unwrap();
        let suffix: String = rng.iter().map(|b| format!("{b:02x}")).collect();
        std::env::temp_dir().join(format!("zerovc_{label}_{suffix}"))
    }

    #[test]
    fn test_fallback_file_permissions_and_symlink_rejection() {
        let dir = unique_temp_dir("fb_perms");
        let token_path = dir.join("auth_token");

        write_fallback_token(&token_path, "jwt-fallback-abc").unwrap();
        assert_eq!(
            read_fallback_token(&token_path).as_deref(),
            Some("jwt-fallback-abc")
        );

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let file_mode = std::fs::metadata(&token_path).unwrap().permissions().mode() & 0o777;
            let dir_mode = std::fs::metadata(&dir).unwrap().permissions().mode() & 0o777;
            assert_eq!(file_mode, 0o600);
            assert_eq!(dir_mode, 0o700);
        }

        delete_fallback_token(&token_path).unwrap();
        delete_fallback_token(&token_path).unwrap();
        assert!(read_fallback_token(&token_path).is_none());

        #[cfg(unix)]
        {
            let target = dir.join("real_target");
            std::fs::write(&target, "unrelated").unwrap();
            std::os::unix::fs::symlink(&target, &token_path).unwrap();
            assert!(write_fallback_token(&token_path, "evil").is_err());
            assert!(read_fallback_token(&token_path).is_none());
        }

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn test_init_storage_recovers_and_clears_fallback_token() {
        let dir = unique_temp_dir("fb_recover");
        let token_path = dir.join("auth_token");

        let vault1 = test_vault(None);
        vault1.init_storage(dir.clone()).await;
        vault1
            .set_token_inner(Some("  persisted-jwt-123  ".to_string()), false)
            .await
            .unwrap();
        assert!(token_path.exists());

        // Fresh AuthVault recovers the token during init_storage
        let vault2 = test_vault(None);
        vault2.init_storage(dir.clone()).await;
        assert_eq!(
            vault2.token.read().await.as_deref(),
            Some("persisted-jwt-123")
        );

        // set_token(None) removes both in-memory token and fallback file
        vault2.set_token_inner(None, false).await.unwrap();
        assert!(!token_path.exists());
        assert!(vault2.token.read().await.is_none());

        let vault3 = test_vault(None);
        vault3.init_storage(dir.clone()).await;
        assert!(vault3.token.read().await.is_none());

        let _ = std::fs::remove_dir_all(&dir);
    }
}
