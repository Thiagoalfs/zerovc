use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::watch;

/// Zero-overhead local OBS-style raw I420 preview hub over 127.0.0.1.
/// Does zero work when no local preview client is connected, and caps preview to ~30fps.
#[derive(Clone)]
pub struct PreviewHub {
    active: Arc<AtomicBool>,
    epoch: Instant,
    last_publish_ms: Arc<AtomicU64>,
    tx: watch::Sender<Option<Arc<Vec<u8>>>>,
}

struct ActiveGuard {
    clients: Arc<AtomicUsize>,
    active: Arc<AtomicBool>,
}

impl ActiveGuard {
    fn new(clients: Arc<AtomicUsize>, active: Arc<AtomicBool>) -> Self {
        clients.fetch_add(1, Ordering::Relaxed);
        active.store(true, Ordering::Relaxed);
        Self { clients, active }
    }
}

impl Drop for ActiveGuard {
    fn drop(&mut self) {
        if self.clients.fetch_sub(1, Ordering::AcqRel) == 1 {
            self.active.store(false, Ordering::Relaxed);
        }
    }
}

fn generate_token() -> String {
    let a = RandomState::new().build_hasher().finish();
    let b = RandomState::new().build_hasher().finish();
    format!("{:016x}{:016x}", a, b)
}

impl PreviewHub {
    pub async fn start(stop: Arc<AtomicBool>) -> Result<(Self, u16, String), String> {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| format!("Failed to bind local preview server: {}", e))?;
        let port = listener
            .local_addr()
            .map_err(|e| format!("Failed to read local preview port: {}", e))?
            .port();
        let token = generate_token();

        let active = Arc::new(AtomicBool::new(false));
        let clients = Arc::new(AtomicUsize::new(0));
        let (tx, _rx) = watch::channel::<Option<Arc<Vec<u8>>>>(None);

        let hub = Self {
            active: active.clone(),
            epoch: Instant::now(),
            last_publish_ms: Arc::new(AtomicU64::new(0)),
            tx: tx.clone(),
        };

        let expected_path = format!("GET /preview/{} ", token);
        tokio::spawn(async move {
            loop {
                if stop.load(Ordering::Relaxed) {
                    break;
                }
                tokio::select! {
                    accept_res = listener.accept() => {
                        let Ok((socket, _)) = accept_res else { break; };
                        let expected = expected_path.clone();
                        let tx_c = tx.clone();
                        let clients_c = clients.clone();
                        let active_c = active.clone();
                        let stop_c = stop.clone();
                        tokio::spawn(async move {
                            handle_client(socket, &expected, tx_c, clients_c, active_c, stop_c).await;
                        });
                    }
                    _ = tokio::time::sleep(Duration::from_millis(250)) => {}
                }
            }
        });

        Ok((hub, port, token))
    }

    #[inline]
    pub fn is_active(&self) -> bool {
        self.active.load(Ordering::Relaxed)
    }

    #[inline]
    pub fn should_publish(&self) -> bool {
        if !self.is_active() {
            return false;
        }
        // Cap local preview to ~30fps even when capturing/streaming at 60fps
        let now_ms = self.epoch.elapsed().as_millis() as u64;
        let prev = self.last_publish_ms.load(Ordering::Relaxed);
        if prev > 0 && now_ms.saturating_sub(prev) < 30 {
            return false;
        }
        self.last_publish_ms.store(now_ms, Ordering::Relaxed);
        true
    }

    #[inline]
    pub fn publish_raw(&self, raw: &[u8]) {
        if !self.should_publish() {
            return;
        }
        let _ = self.tx.send_replace(Some(Arc::new(raw.to_vec())));
    }

    #[inline]
    pub fn publish_vec(&self, raw: Vec<u8>) {
        if !self.is_active() {
            return;
        }
        let _ = self.tx.send_replace(Some(Arc::new(raw)));
    }
}

async fn handle_client(
    mut socket: TcpStream,
    expected_prefix: &str,
    tx: watch::Sender<Option<Arc<Vec<u8>>>>,
    clients: Arc<AtomicUsize>,
    active: Arc<AtomicBool>,
    stop: Arc<AtomicBool>,
) {
    let _ = socket.set_nodelay(true);

    // Read HTTP request headers with a short timeout
    let mut req_buf = [0u8; 2048];
    let mut read_len = 0usize;
    let header_ok = tokio::time::timeout(Duration::from_secs(2), async {
        while read_len < req_buf.len() {
            match socket.read(&mut req_buf[read_len..]).await {
                Ok(0) => return false,
                Ok(n) => {
                    read_len += n;
                    if req_buf[..read_len].windows(4).any(|w| w == b"\r\n\r\n") {
                        return true;
                    }
                }
                Err(_) => return false,
            }
        }
        false
    })
    .await
    .unwrap_or(false);

    if !header_ok || !req_buf[..read_len].starts_with(expected_prefix.as_bytes()) {
        let _ = socket
            .write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
            .await;
        return;
    }

    let headers = concat!(
        "HTTP/1.1 200 OK\r\n",
        "Content-Type: application/octet-stream\r\n",
        "Access-Control-Allow-Origin: *\r\n",
        "Cache-Control: no-store\r\n",
        "Connection: close\r\n",
        "\r\n"
    );
    if socket.write_all(headers.as_bytes()).await.is_err() {
        return;
    }

    let _guard = ActiveGuard::new(clients, active);
    let mut rx = tx.subscribe();

    let initial = rx.borrow_and_update().clone();
    if let Some(frame) = initial {
        if socket.write_all(&frame).await.is_err() {
            return;
        }
    }

    let mut eof_buf = [0u8; 16];
    loop {
        if stop.load(Ordering::Relaxed) {
            break;
        }
        tokio::select! {
            changed = rx.changed() => {
                if changed.is_err() {
                    break;
                }
                let frame = rx.borrow_and_update().clone();
                if let Some(frame) = frame {
                    if socket.write_all(&frame).await.is_err() {
                        break;
                    }
                }
            }
            read_res = socket.read(&mut eof_buf) => {
                if matches!(read_res, Ok(0) | Err(_)) {
                    break;
                }
            }
            _ = tokio::time::sleep(Duration::from_millis(200)) => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn preview_hub_enforces_token_and_streams_frames() {
        let stop = Arc::new(AtomicBool::new(false));
        let (hub, port, token) = PreviewHub::start(stop.clone()).await.unwrap();
        assert!(!hub.is_active());

        // Wrong token must get 403 Forbidden
        let mut bad = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        bad.write_all(b"GET /preview/wrong HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")
            .await
            .unwrap();
        let mut bad_resp = vec![0u8; 64];
        let n = bad.read(&mut bad_resp).await.unwrap();
        assert!(std::str::from_utf8(&bad_resp[..n]).unwrap().starts_with("HTTP/1.1 403"));

        // Valid token receives raw frame bytes
        let mut good = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        good.write_all(format!("GET /preview/{} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n", token).as_bytes())
            .await
            .unwrap();

        // Wait until hub marks client active, then publish a frame
        for _ in 0..50 {
            if hub.is_active() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        assert!(hub.is_active());
        hub.publish_raw(&[1u8, 2, 3, 4, 5, 6]);

        let mut buf = vec![0u8; 512];
        let mut total = 0usize;
        let payload = loop {
            let n = good.read(&mut buf[total..]).await.unwrap();
            assert!(n > 0);
            total += n;
            if let Some(pos) = buf[..total].windows(4).position(|w| w == b"\r\n\r\n") {
                let body = &buf[pos + 4..total];
                if body.len() >= 6 {
                    break body[..6].to_vec();
                }
            }
        };
        assert_eq!(payload, vec![1u8, 2, 3, 4, 5, 6]);

        drop(good);
        stop.store(true, Ordering::Relaxed);
    }
}
