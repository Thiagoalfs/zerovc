use crate::media_audio_out::AudioDeviceInfo;
use crate::media_video_hub::VideoFrameHub;
use livekit::webrtc::prelude::{I420Buffer, VideoFrame, VideoRotation};
use livekit::webrtc::video_source::native::NativeVideoSource;
use nokhwa::pixel_format::RgbFormat;
use nokhwa::utils::{
    ApiBackend, CameraFormat, CameraIndex, FrameFormat, RequestedFormat, RequestedFormatType,
    Resolution,
};
use nokhwa::Camera;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

/// Lists available camera devices using `nokhwa::query(ApiBackend::Auto)`.
pub fn list_video_devices() -> Vec<AudioDeviceInfo> {
    let Ok(cameras) = nokhwa::query(ApiBackend::Auto) else {
        return Vec::new();
    };
    cameras
        .into_iter()
        .map(|cam| {
            let device_id = match cam.index() {
                CameraIndex::Index(i) => i.to_string(),
                CameraIndex::String(s) => s.clone(),
            };
            let label = {
                let name = cam.human_name();
                if name.trim().is_empty() {
                    format!("Camera {device_id}")
                } else {
                    name
                }
            };
            AudioDeviceInfo {
                device_id,
                label,
                kind: "videoinput".to_string(),
            }
        })
        .collect()
}

/// Converts tightly packed RGB24 (`width * height * 3` bytes) to tightly packed I420
/// (`width * height * 3 / 2` bytes) using BT.709 limited-range coefficients.
pub fn rgb24_to_i420(rgb: &[u8], width: u32, height: u32) -> Vec<u8> {
    let w = (width & !1) as usize;
    let h = (height & !1) as usize;
    let src_w = width as usize;
    if w == 0 || h == 0 || rgb.len() < src_w * h * 3 {
        return Vec::new();
    }

    let y_size = w * h;
    let uv_w = w / 2;
    let uv_h = h / 2;
    let uv_size = uv_w * uv_h;
    let mut out = vec![0_u8; y_size + uv_size * 2];
    let (y_plane, uv_rest) = out.split_at_mut(y_size);
    let (u_plane, v_plane) = uv_rest.split_at_mut(uv_size);

    for py in 0..h {
        let src_row = py * src_w * 3;
        let dst_y_row = py * w;
        for px in 0..w {
            let idx = src_row + px * 3;
            let r = rgb[idx] as i32;
            let g = rgb[idx + 1] as i32;
            let b = rgb[idx + 2] as i32;
            let y = ((47 * r + 157 * g + 16 * b + 128) >> 8) + 16;
            y_plane[dst_y_row + px] = y.clamp(0, 255) as u8;
        }
    }

    for cy in 0..uv_h {
        let py = cy * 2;
        let row0 = py * src_w * 3;
        let row1 = (py + 1) * src_w * 3;
        let dst_uv_row = cy * uv_w;
        for cx in 0..uv_w {
            let px = cx * 2;
            let i00 = row0 + px * 3;
            let i01 = i00 + 3;
            let i10 = row1 + px * 3;
            let i11 = i10 + 3;

            let r = (rgb[i00] as i32 + rgb[i01] as i32 + rgb[i10] as i32 + rgb[i11] as i32 + 2) >> 2;
            let g = (rgb[i00 + 1] as i32
                + rgb[i01 + 1] as i32
                + rgb[i10 + 1] as i32
                + rgb[i11 + 1] as i32
                + 2)
                >> 2;
            let b = (rgb[i00 + 2] as i32
                + rgb[i01 + 2] as i32
                + rgb[i10 + 2] as i32
                + rgb[i11 + 2] as i32
                + 2)
                >> 2;

            let u = ((-26 * r - 86 * g + 112 * b + 128) >> 8) + 128;
            let v = ((112 * r - 102 * g - 10 * b + 128) >> 8) + 128;
            u_plane[dst_uv_row + cx] = u.clamp(0, 255) as u8;
            v_plane[dst_uv_row + cx] = v.clamp(0, 255) as u8;
        }
    }

    out
}

pub struct CameraController {
    stop_flag: Arc<AtomicBool>,
    worker_thread: Mutex<Option<JoinHandle<()>>>,
}

impl CameraController {
    pub fn start(
        device_id: Option<String>,
        video_source: NativeVideoSource,
        video_hub: Arc<VideoFrameHub>,
        local_stream_key: String,
    ) -> Result<Self, String> {
        let stop_flag = Arc::new(AtomicBool::new(false));
        let (ready_tx, ready_rx) = mpsc::sync_channel::<Result<(), String>>(1);

        let t_stop = Arc::clone(&stop_flag);
        let worker_thread = std::thread::Builder::new()
            .name("zerovc-camera".to_string())
            .spawn(move || {
                let index = resolve_camera_index(device_id.as_deref());
                let mut camera = match open_camera_with_fallback(index) {
                    Ok(cam) => cam,
                    Err(err) => {
                        let _ = ready_tx.send(Err(err));
                        return;
                    }
                };

                if let Err(err) = camera.open_stream() {
                    let _ = ready_tx.send(Err(format!("Failed to open camera stream: {err}")));
                    return;
                }

                let _ = ready_tx.send(Ok(()));

                let start_ts = Instant::now();
                let frame_interval = Duration::from_millis(33); // ~30fps cap

                while !t_stop.load(Ordering::Relaxed) {
                    let loop_start = Instant::now();
                    let frame = match camera.frame() {
                        Ok(f) => f,
                        Err(_) => {
                            std::thread::sleep(Duration::from_millis(10));
                            continue;
                        }
                    };

                    let Ok(decoded) = frame.decode_image::<RgbFormat>() else {
                        continue;
                    };

                    let raw_w = decoded.width();
                    let raw_h = decoded.height();
                    let w = raw_w & !1;
                    let h = raw_h & !1;
                    if w < 2 || h < 2 {
                        continue;
                    }

                    let rgb_bytes = decoded.into_raw();
                    let i420_bytes = rgb24_to_i420(&rgb_bytes, raw_w, raw_h);
                    if i420_bytes.is_empty() {
                        continue;
                    }

                    let i420_buf = pack_into_i420_buffer(w, h, &i420_bytes);
                    video_source.capture_frame(&VideoFrame {
                        rotation: VideoRotation::VideoRotation0,
                        timestamp_us: start_ts.elapsed().as_micros() as i64,
                        frame_metadata: None,
                        buffer: i420_buf,
                    });

                    if video_hub.has_viewers(&local_stream_key) {
                        video_hub.publish_i420(&local_stream_key, w, h, i420_bytes);
                    }

                    let elapsed = loop_start.elapsed();
                    if elapsed < frame_interval {
                        std::thread::sleep(frame_interval - elapsed);
                    }
                }

                let _ = camera.stop_stream();
            })
            .map_err(|e| format!("Failed to spawn camera capture thread: {e}"))?;

        match ready_rx.recv() {
            Ok(Ok(())) => Ok(Self {
                stop_flag,
                worker_thread: Mutex::new(Some(worker_thread)),
            }),
            Ok(Err(e)) => {
                stop_flag.store(true, Ordering::Relaxed);
                let _ = worker_thread.join();
                Err(e)
            }
            Err(_) => {
                stop_flag.store(true, Ordering::Relaxed);
                let _ = worker_thread.join();
                Err("Camera thread exited before initialization".to_string())
            }
        }
    }

    pub fn stop(&self) {
        self.stop_flag.store(true, Ordering::Relaxed);
        if let Ok(mut guard) = self.worker_thread.lock() {
            if let Some(handle) = guard.take() {
                let _ = handle.join();
            }
        }
    }
}

impl Drop for CameraController {
    fn drop(&mut self) {
        self.stop();
    }
}

fn resolve_camera_index(device_id: Option<&str>) -> CameraIndex {
    let Some(id) = device_id.map(str::trim).filter(|s| !s.is_empty() && *s != "default") else {
        if let Ok(cams) = nokhwa::query(ApiBackend::Auto) {
            if let Some(first) = cams.first() {
                return first.index().clone();
            }
        }
        return CameraIndex::Index(0);
    };

    if let Ok(cams) = nokhwa::query(ApiBackend::Auto) {
        for cam in &cams {
            let idx_str = match cam.index() {
                CameraIndex::Index(i) => i.to_string(),
                CameraIndex::String(s) => s.clone(),
            };
            if idx_str == id || cam.human_name() == id {
                return cam.index().clone();
            }
        }
    }

    if let Ok(num) = id.parse::<u32>() {
        CameraIndex::Index(num)
    } else {
        CameraIndex::String(id.to_string())
    }
}

fn open_camera_with_fallback(index: CameraIndex) -> Result<Camera, String> {
    let target_fmt = CameraFormat::new(Resolution::new(1280, 720), FrameFormat::MJPEG, 30);
    let attempts = [
        RequestedFormat::new::<RgbFormat>(RequestedFormatType::Closest(target_fmt)),
        RequestedFormat::new::<RgbFormat>(RequestedFormatType::AbsoluteHighestFrameRate),
        RequestedFormat::new::<RgbFormat>(RequestedFormatType::None),
    ];

    let mut last_err = String::new();
    for req in attempts {
        match Camera::new(index.clone(), req) {
            Ok(cam) => return Ok(cam),
            Err(e) => last_err = format!("{e}"),
        }
    }
    Err(format!("Failed to initialize camera ({index:?}): {last_err}"))
}

fn pack_into_i420_buffer(w: u32, h: u32, packed: &[u8]) -> I420Buffer {
    let mut buf = I420Buffer::new(w, h);
    let wu = w as usize;
    let hu = h as usize;
    let cw = wu / 2;
    let ch = hu / 2;
    let y_size = wu * hu;
    let uv_size = cw * ch;
    let (sy, su, sv) = buf.strides();
    let (y_dst, u_dst, v_dst) = buf.data_mut();

    let y_src = &packed[..y_size];
    let u_src = &packed[y_size..y_size + uv_size];
    let v_src = &packed[y_size + uv_size..y_size + uv_size * 2];

    if sy as usize == wu && y_dst.len() >= y_size {
        y_dst[..y_size].copy_from_slice(y_src);
    } else {
        for row in 0..hu {
            let d = row * sy as usize;
            let s = row * wu;
            y_dst[d..d + wu].copy_from_slice(&y_src[s..s + wu]);
        }
    }

    if su as usize == cw && u_dst.len() >= uv_size {
        u_dst[..uv_size].copy_from_slice(u_src);
    } else {
        for row in 0..ch {
            let d = row * su as usize;
            let s = row * cw;
            u_dst[d..d + cw].copy_from_slice(&u_src[s..s + cw]);
        }
    }

    if sv as usize == cw && v_dst.len() >= uv_size {
        v_dst[..uv_size].copy_from_slice(v_src);
    } else {
        for row in 0..ch {
            let d = row * sv as usize;
            let s = row * cw;
            v_dst[d..d + cw].copy_from_slice(&v_src[s..s + cw]);
        }
    }

    buf
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rgb24_to_i420_produces_exact_dimensions_and_bt709_values() {
        // 4x2 solid white frame
        let white_rgb = vec![255_u8; 4 * 2 * 3];
        let white_i420 = rgb24_to_i420(&white_rgb, 4, 2);
        assert_eq!(white_i420.len(), 4 * 2 * 3 / 2); // 12 bytes
        assert!(white_i420[..8].iter().all(|&y| (234..=236).contains(&y)));
        assert!(white_i420[8..10].iter().all(|&u| u == 128));
        assert!(white_i420[10..12].iter().all(|&v| v == 128));

        // 4x2 solid black frame
        let black_rgb = vec![0_u8; 4 * 2 * 3];
        let black_i420 = rgb24_to_i420(&black_rgb, 4, 2);
        assert_eq!(black_i420.len(), 12);
        assert!(black_i420[..8].iter().all(|&y| y == 16));
        assert!(black_i420[8..10].iter().all(|&u| u == 128));
        assert!(black_i420[10..12].iter().all(|&v| v == 128));

        // 4x2 solid red frame -> high V, low U
        let mut red_rgb = Vec::with_capacity(4 * 2 * 3);
        for _ in 0..(4 * 2) {
            red_rgb.extend_from_slice(&[255, 0, 0]);
        }
        let red_i420 = rgb24_to_i420(&red_rgb, 4, 2);
        assert_eq!(red_i420.len(), 12);
        assert!(red_i420[8] < 110, "Expected low U for red, got {}", red_i420[8]);
        assert!(red_i420[10] > 230, "Expected high V for red, got {}", red_i420[10]);
    }
}
