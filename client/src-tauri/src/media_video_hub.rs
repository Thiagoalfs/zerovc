use futures_util::StreamExt;
use livekit::webrtc::video_frame::VideoBuffer;
use livekit::webrtc::video_stream::native::NativeVideoStream;
use livekit::webrtc::video_track::RtcVideoTrack;
use std::collections::hash_map::RandomState;
use std::collections::HashMap;
use std::hash::{BuildHasher, Hasher};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::watch;

struct StreamChannel {
    viewers: Arc<AtomicUsize>,
    tx: watch::Sender<Option<Arc<Vec<u8>>>>,
    last_publish_ms: AtomicU64,
}

impl StreamChannel {
    fn new() -> Self {
        let (tx, _rx) = watch::channel(None);
        Self {
            viewers: Arc::new(AtomicUsize::new(0)),
            tx,
            last_publish_ms: AtomicU64::new(0),
        }
    }
}

struct ViewerGuard {
    viewers: Arc<AtomicUsize>,
}

impl ViewerGuard {
    fn new(viewers: Arc<AtomicUsize>) -> Self {
        viewers.fetch_add(1, Ordering::AcqRel);
        Self { viewers }
    }
}

impl Drop for ViewerGuard {
    fn drop(&mut self) {
        self.viewers.fetch_sub(1, Ordering::AcqRel);
    }
}

fn generate_token() -> String {
    let a = RandomState::new().build_hasher().finish();
    let b = RandomState::new().build_hasher().finish();
    format!("{a:016x}{b:016x}")
}

/// Zero-overhead local loopback HTTP binary frame streaming server on `127.0.0.1:0`.
/// Route: `GET /video/<token>/<stream_key>`
/// Frame binary protocol: `[u32_le width][u32_le height][I420 bytes (width * height * 3 / 2)]`.
#[derive(Clone)]
pub struct VideoFrameHub {
    port: u16,
    token: String,
    epoch: Instant,
    stop_flag: Arc<AtomicBool>,
    channels: Arc<RwLock<HashMap<String, Arc<StreamChannel>>>>,
    remote_tasks: Arc<RwLock<HashMap<String, Arc<AtomicBool>>>>,
}

impl VideoFrameHub {
    pub async fn start() -> Result<Self, String> {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| format!("Failed to bind VideoFrameHub on 127.0.0.1:0: {e}"))?;
        let port = listener
            .local_addr()
            .map_err(|e| format!("Failed to read VideoFrameHub local_addr: {e}"))?
            .port();
        let token = generate_token();
        let stop_flag = Arc::new(AtomicBool::new(false));
        let channels = Arc::new(RwLock::new(HashMap::new()));
        let remote_tasks = Arc::new(RwLock::new(HashMap::new()));

        let hub = Self {
            port,
            token: token.clone(),
            epoch: Instant::now(),
            stop_flag: Arc::clone(&stop_flag),
            channels: Arc::clone(&channels),
            remote_tasks,
        };

        tokio::spawn(async move {
            loop {
                if stop_flag.load(Ordering::Relaxed) {
                    break;
                }
                tokio::select! {
                    accept_res = listener.accept() => {
                        let Ok((socket, _)) = accept_res else { break; };
                        let tok = token.clone();
                        let ch_map = Arc::clone(&channels);
                        let stop_c = Arc::clone(&stop_flag);
                        tokio::spawn(async move {
                            handle_client(socket, &tok, ch_map, stop_c).await;
                        });
                    }
                    _ = tokio::time::sleep(Duration::from_millis(200)) => {}
                }
            }
        });

        Ok(hub)
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn token(&self) -> &str {
        &self.token
    }

    pub fn stop(&self) {
        self.stop_flag.store(true, Ordering::Relaxed);
        if let Ok(mut tasks) = self.remote_tasks.write() {
            for (_, flag) in tasks.drain() {
                flag.store(true, Ordering::Relaxed);
            }
        }
    }

    #[inline]
    pub fn has_viewers(&self, stream_key: &str) -> bool {
        self.channels
            .read()
            .ok()
            .and_then(|map| {
                map.get(stream_key)
                    .map(|ch| ch.viewers.load(Ordering::Acquire) > 0)
            })
            .unwrap_or(false)
    }

    /// Publish a tightly packed I420 frame (`width * height * 3 / 2` bytes) for `stream_key`.
    /// No-ops immediately when no viewer is connected. Caps at ~60fps for screen shares and ~30fps otherwise.
    pub fn publish_i420(&self, stream_key: &str, width: u32, height: u32, i420_bytes: Vec<u8>) {
        let max_fps = if stream_key.contains("screen") { 60 } else { 30 };
        self.publish_i420_with_max_fps(stream_key, width, height, i420_bytes, max_fps);
    }

    pub fn publish_i420_with_max_fps(
        &self,
        stream_key: &str,
        width: u32,
        height: u32,
        i420_bytes: Vec<u8>,
        max_fps: u32,
    ) {
        if !self.has_viewers(stream_key) {
            return;
        }
        let expected_len = (width as usize) * (height as usize) * 3 / 2;
        if width == 0 || height == 0 || i420_bytes.len() < expected_len {
            return;
        }

        let Some(channel) = self
            .channels
            .read()
            .ok()
            .and_then(|m| m.get(stream_key).cloned())
        else {
            return;
        };

        let min_interval_ms = if max_fps >= 60 {
            16
        } else {
            (1000 / max_fps.max(1)) as u64
        };
        let now_ms = self.epoch.elapsed().as_millis() as u64 + 1;
        let prev = channel.last_publish_ms.load(Ordering::Relaxed);
        if prev > 0 && now_ms.saturating_sub(prev) < min_interval_ms {
            return;
        }
        channel.last_publish_ms.store(now_ms, Ordering::Relaxed);

        let mut packet = Vec::with_capacity(8 + expected_len);
        packet.extend_from_slice(&width.to_le_bytes());
        packet.extend_from_slice(&height.to_le_bytes());
        packet.extend_from_slice(&i420_bytes[..expected_len]);

        let _ = channel.tx.send_replace(Some(Arc::new(packet)));
    }

    /// Spawns a tokio task consuming `NativeVideoStream` and converting/publishing I420 only when viewers are connected.
    pub fn attach_remote_video_track(
        &self,
        stream_key: String,
        rtc_track: RtcVideoTrack,
        max_fps: u32,
    ) {
        let task_stop = Arc::new(AtomicBool::new(false));
        if let Ok(mut tasks) = self.remote_tasks.write() {
            if let Some(prev) = tasks.insert(stream_key.clone(), Arc::clone(&task_stop)) {
                prev.store(true, Ordering::Relaxed);
            }
        }

        let hub = self.clone();
        tokio::spawn(async move {
            let mut stream = NativeVideoStream::new(rtc_track);
            while let Some(frame) = stream.next().await {
                if hub.stop_flag.load(Ordering::Relaxed) || task_stop.load(Ordering::Relaxed) {
                    break;
                }
                if !hub.has_viewers(&stream_key) {
                    continue;
                }

                let i420 = frame.buffer.to_i420();
                let w = i420.width() as usize;
                let h = i420.height() as usize;
                if w == 0 || h == 0 {
                    continue;
                }

                let (sy, su, sv) = i420.strides();
                let (y_data, u_data, v_data) = i420.data();
                let packed = pack_i420_planes(w, h, sy as usize, su as usize, sv as usize, y_data, u_data, v_data);
                hub.publish_i420_with_max_fps(&stream_key, w as u32, h as u32, packed, max_fps);
            }
            stream.close();
        });
    }

    pub fn remove_stream(&self, stream_key: &str) {
        if let Ok(mut tasks) = self.remote_tasks.write() {
            if let Some(flag) = tasks.remove(stream_key) {
                flag.store(true, Ordering::Relaxed);
            }
        }
        if let Ok(mut channels) = self.channels.write() {
            channels.remove(stream_key);
        }
    }
}

fn get_or_create_channel(
    channels: &Arc<RwLock<HashMap<String, Arc<StreamChannel>>>>,
    stream_key: &str,
) -> Option<Arc<StreamChannel>> {
    if let Ok(map) = channels.read() {
        if let Some(ch) = map.get(stream_key) {
            return Some(Arc::clone(ch));
        }
    }
    if let Ok(mut map) = channels.write() {
        let ch = map
            .entry(stream_key.to_string())
            .or_insert_with(|| Arc::new(StreamChannel::new()));
        return Some(Arc::clone(ch));
    }
    None
}

fn pack_i420_planes(
    w: usize,
    h: usize,
    sy: usize,
    su: usize,
    sv: usize,
    y: &[u8],
    u: &[u8],
    v: &[u8],
) -> Vec<u8> {
    let cw = (w + 1) / 2;
    let ch = (h + 1) / 2;
    let mut out = Vec::with_capacity(w * h + cw * ch * 2);

    if sy == w && y.len() >= w * h {
        out.extend_from_slice(&y[..w * h]);
    } else {
        for row in 0..h {
            let start = row * sy;
            if start + w <= y.len() {
                out.extend_from_slice(&y[start..start + w]);
            }
        }
    }

    if su == cw && u.len() >= cw * ch {
        out.extend_from_slice(&u[..cw * ch]);
    } else {
        for row in 0..ch {
            let start = row * su;
            if start + cw <= u.len() {
                out.extend_from_slice(&u[start..start + cw]);
            }
        }
    }

    if sv == cw && v.len() >= cw * ch {
        out.extend_from_slice(&v[..cw * ch]);
    } else {
        for row in 0..ch {
            let start = row * sv;
            if start + cw <= v.len() {
                out.extend_from_slice(&v[start..start + cw]);
            }
        }
    }

    out
}

fn parse_video_route(request: &str) -> Option<(&str, &str)> {
    let first_line = request.lines().next()?;
    let mut parts = first_line.split_whitespace();
    let method = parts.next()?;
    let raw_path = parts.next()?;
    if method != "GET" {
        return None;
    }
    let path = raw_path.split('?').next().unwrap_or(raw_path);
    let rest = path.strip_prefix("/video/")?;
    let (tok, key) = rest.split_once('/')?;
    if tok.is_empty() || key.is_empty() {
        return None;
    }
    Some((tok, key))
}

async fn handle_client(
    mut socket: TcpStream,
    expected_token: &str,
    channels: Arc<RwLock<HashMap<String, Arc<StreamChannel>>>>,
    stop: Arc<AtomicBool>,
) {
    let _ = socket.set_nodelay(true);

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

    if !header_ok {
        let _ = socket
            .write_all(b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
            .await;
        return;
    }

    let req_str = std::str::from_utf8(&req_buf[..read_len]).unwrap_or("");
    let Some((req_token, stream_key)) = parse_video_route(req_str) else {
        let _ = socket
            .write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
            .await;
        return;
    };

    if req_token != expected_token {
        let _ = socket
            .write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
            .await;
        return;
    }

    let Some(channel) = get_or_create_channel(&channels, stream_key) else {
        return;
    };

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

    let _guard = ViewerGuard::new(Arc::clone(&channel.viewers));
    let mut rx = channel.tx.subscribe();

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
    async fn video_hub_enforces_token_streams_header_and_tracks_viewers() {
        let hub = VideoFrameHub::start().await.unwrap();
        let port = hub.port();
        let token = hub.token().to_string();
        let stream_key = "alice:camera";

        assert!(!hub.has_viewers(stream_key));

        // 1. Wrong token returns 403 Forbidden
        let mut bad = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        bad.write_all(b"GET /video/bad_token/alice:camera HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")
            .await
            .unwrap();
        let mut bad_resp = vec![0u8; 128];
        let n = bad.read(&mut bad_resp).await.unwrap();
        assert!(std::str::from_utf8(&bad_resp[..n])
            .unwrap()
            .starts_with("HTTP/1.1 403"));

        // 2. Valid token marks has_viewers == true and receives [width_le, height_le, i420]
        let mut good = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        good.write_all(
            format!("GET /video/{token}/{stream_key} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")
                .as_bytes(),
        )
        .await
        .unwrap();

        for _ in 0..50 {
            if hub.has_viewers(stream_key) {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        assert!(hub.has_viewers(stream_key));

        let w = 4_u32;
        let h = 2_u32;
        let i420 = vec![42_u8; (w * h * 3 / 2) as usize]; // 12 bytes
        hub.publish_i420(stream_key, w, h, i420.clone());

        let expected_packet_len = 8 + i420.len();
        let mut buf = vec![0u8; 512];
        let mut total = 0usize;
        let payload = loop {
            let n = good.read(&mut buf[total..]).await.unwrap();
            assert!(n > 0);
            total += n;
            if let Some(pos) = buf[..total].windows(4).position(|win| win == b"\r\n\r\n") {
                let body = &buf[pos + 4..total];
                if body.len() >= expected_packet_len {
                    break body[..expected_packet_len].to_vec();
                }
            }
        };

        assert_eq!(u32::from_le_bytes(payload[0..4].try_into().unwrap()), w);
        assert_eq!(u32::from_le_bytes(payload[4..8].try_into().unwrap()), h);
        assert_eq!(&payload[8..], &i420[..]);

        // 3. Disconnecting viewer drops has_viewers back to false
        drop(good);
        for _ in 0..50 {
            if !hub.has_viewers(stream_key) {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        assert!(!hub.has_viewers(stream_key));

        hub.stop();
    }
}
