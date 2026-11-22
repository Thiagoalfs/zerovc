use crate::preview::PreviewHub;
use crate::Args;
use livekit::webrtc::prelude::{I420Buffer, VideoFrame, VideoRotation};
use livekit::webrtc::video_source::native::NativeVideoSource;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, SyncSender};
use std::sync::Arc;
use std::time::{Duration, Instant};
use windows_capture::capture::{Context, GraphicsCaptureApiHandler};
use windows_capture::frame::Frame;
use windows_capture::graphics_capture_api::InternalCaptureControl;
use windows_capture::monitor::Monitor;
use windows_capture::settings::{
    ColorFormat, CursorCaptureSettings, DirtyRegionSettings, DrawBorderSettings,
    MinimumUpdateIntervalSettings, SecondaryWindowSettings, Settings,
};
use windows_capture::window::Window;

struct RawFrameMsg {
    bgra: Vec<u8>,
    src_w: usize,
    src_h: usize,
}

struct CaptureFlags {
    frame_tx: SyncSender<RawFrameMsg>,
    stop: Arc<AtomicBool>,
    frame_interval: Duration,
    ready: Option<tokio::sync::oneshot::Sender<Result<(), String>>>,
}

struct WgcHandler {
    flags: CaptureFlags,
    last_frame: Instant,
}

impl GraphicsCaptureApiHandler for WgcHandler {
    type Flags = CaptureFlags;
    type Error = Box<dyn std::error::Error + Send + Sync>;

    fn new(mut ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
        if let Some(tx) = ctx.flags.ready.take() {
            let _ = tx.send(Ok(()));
        }
        Ok(Self {
            flags: ctx.flags,
            last_frame: Instant::now() - Duration::from_secs(1),
        })
    }

    fn on_frame_arrived(
        &mut self,
        frame: &mut Frame,
        capture_control: InternalCaptureControl,
    ) -> Result<(), Self::Error> {
        if self.flags.stop.load(Ordering::Relaxed) {
            capture_control.stop();
            return Ok(());
        }

        let now = Instant::now();
        if now.duration_since(self.last_frame) < self.flags.frame_interval {
            return Ok(());
        }
        self.last_frame = now;

        let src_w = frame.width() as usize;
        let src_h = frame.height() as usize;
        let mut buf = frame.buffer()?;
        let bgra = buf.as_nopadding_buffer()?.to_vec();

        // Non-blocking handoff: if conversion worker is busy, drop this frame instead of stalling WGC
        let _ = self.flags.frame_tx.try_send(RawFrameMsg { bgra, src_w, src_h });

        Ok(())
    }

    fn on_closed(&mut self) -> Result<(), Self::Error> {
        self.flags.stop.store(true, Ordering::Relaxed);
        Ok(())
    }
}

pub async fn run_video_capture(
    args: Args,
    source: NativeVideoSource,
    preview: PreviewHub,
    stop: Arc<AtomicBool>,
    ready: tokio::sync::oneshot::Sender<Result<(), String>>,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let (frame_tx, frame_rx) = mpsc::sync_channel::<RawFrameMsg>(1);
        let target_w = args.width as usize;
        let target_h = args.height as usize;
        let w_stop = stop.clone();

        let worker = std::thread::spawn(move || {
            let start_ts = Instant::now();
            let mut cached_src_w = 0usize;
            let mut sx_map: Vec<usize> = Vec::new();
            while let Ok(msg) = frame_rx.recv() {
                if w_stop.load(Ordering::Relaxed) {
                    break;
                }
                if msg.src_w != cached_src_w {
                    cached_src_w = msg.src_w;
                    sx_map = (0..target_w).map(|dx| (dx * msg.src_w) / target_w).collect();
                }

                let mut i420 = I420Buffer::new(target_w as u32, target_h as u32);
                bgra_scale_to_i420(
                    &msg.bgra,
                    msg.src_w,
                    msg.src_h,
                    &mut i420,
                    target_w,
                    target_h,
                    &sx_map,
                );

                if preview.should_publish() {
                    let (y_plane, u_plane, v_plane) = i420.data();
                    let y_size = target_w * target_h;
                    let uv_size = (target_w / 2) * (target_h / 2);
                    let mut raw = Vec::with_capacity(y_size + uv_size * 2);
                    raw.extend_from_slice(&y_plane[..y_size]);
                    raw.extend_from_slice(&u_plane[..uv_size]);
                    raw.extend_from_slice(&v_plane[..uv_size]);
                    preview.publish_vec(raw);
                }

                source.capture_frame(&VideoFrame {
                    rotation: VideoRotation::VideoRotation0,
                    timestamp_us: start_ts.elapsed().as_micros() as i64,
                    buffer: i420,
                    frame_metadata: None,
                });
            }
        });

        let flags = CaptureFlags {
            frame_tx,
            stop: stop.clone(),
            // Allow 1.5ms DWM jitter tolerance so 60Hz WGC callbacks don't drop to 30fps
            frame_interval: Duration::from_micros(1_000_000 / args.fps.max(1) as u64)
                .saturating_sub(Duration::from_micros(1500)),
            ready: Some(ready),
        };

        let res = if args.source_id.starts_with("window:") {
            let parts: Vec<&str> = args.source_id.split(':').collect();
            let hwnd_val: isize = parts
                .get(1)
                .and_then(|s| s.parse().ok())
                .ok_or_else(|| format!("Invalid window HWND in source_id: {}", args.source_id))?;
            let window = Window::from_raw_hwnd(hwnd_val as *mut std::ffi::c_void);
            let settings = Settings::new(
                window,
                CursorCaptureSettings::Default,
                DrawBorderSettings::WithoutBorder,
                SecondaryWindowSettings::Default,
                MinimumUpdateIntervalSettings::Default,
                DirtyRegionSettings::Default,
                ColorFormat::Bgra8,
                flags,
            );
            WgcHandler::start(settings).map_err(|e| format!("WGC window capture error: {}", e))
        } else {
            let monitor = Monitor::primary()
                .map_err(|e| format!("Failed to get primary monitor: {}", e))?;
            let settings = Settings::new(
                monitor,
                CursorCaptureSettings::Default,
                DrawBorderSettings::WithoutBorder,
                SecondaryWindowSettings::Default,
                MinimumUpdateIntervalSettings::Default,
                DirtyRegionSettings::Default,
                ColorFormat::Bgra8,
                flags,
            );
            WgcHandler::start(settings).map_err(|e| format!("WGC monitor capture error: {}", e))
        };

        stop.store(true, Ordering::Relaxed);
        let _ = worker.join();
        res
    })
    .await
    .map_err(|e| format!("WGC task panicked: {}", e))?
}

/// Fast nearest-neighbor BGRA -> I420 (BT.709 limited range) conversion into `dst`.
fn bgra_scale_to_i420(
    src: &[u8],
    src_w: usize,
    src_h: usize,
    dst: &mut I420Buffer,
    dst_w: usize,
    dst_h: usize,
    sx_map: &[usize],
) {
    if src_w == 0 || src_h == 0 || dst_w == 0 || dst_h == 0 || sx_map.len() < dst_w {
        return;
    }
    let (y_plane, u_plane, v_plane) = dst.data_mut();
    let uv_w = dst_w / 2;

    for dy in 0..dst_h {
        let sy = (dy * src_h) / dst_h;
        let row_src = sy * src_w * 4;
        let row_y = dy * dst_w;
        let write_uv = (dy & 1) == 0;
        let row_uv = (dy / 2) * uv_w;

        for (dx, &sx) in sx_map.iter().enumerate().take(dst_w) {
            let idx = row_src + sx * 4;
            if idx + 2 >= src.len() {
                continue;
            }
            let b = src[idx] as i32;
            let g = src[idx + 1] as i32;
            let r = src[idx + 2] as i32;

            let y = ((47 * r + 157 * g + 16 * b + 128) >> 8) + 16;
            y_plane[row_y + dx] = y.clamp(0, 255) as u8;

            if write_uv && (dx & 1) == 0 {
                let u = ((-26 * r - 86 * g + 112 * b + 128) >> 8) + 128;
                let v = ((112 * r - 102 * g - 10 * b + 128) >> 8) + 128;
                let uv_idx = row_uv + (dx / 2);
                u_plane[uv_idx] = u.clamp(0, 255) as u8;
                v_plane[uv_idx] = v.clamp(0, 255) as u8;
            }
        }
    }
}
