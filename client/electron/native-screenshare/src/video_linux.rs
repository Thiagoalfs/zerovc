use crate::Args;
use livekit::webrtc::prelude::{I420Buffer, VideoFrame, VideoRotation};
use livekit::webrtc::video_source::native::NativeVideoSource;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::io::AsyncReadExt;
use tokio::process::Command;

pub async fn run_video_capture(
    args: Args,
    source: NativeVideoSource,
    stop: Arc<AtomicBool>,
) -> Result<(), String> {
    let is_wayland = std::env::var("WAYLAND_DISPLAY")
        .map(|v| !v.is_empty())
        .unwrap_or(false);

    if is_wayland {
        match run_wayland_portal_capture(&args, &source, stop.clone()).await {
            Ok(()) => return Ok(()),
            Err(err) => {
                // If user cancelled the portal, do not fall back to X11
                if err.contains("cancelled") || err.contains("Cancelled") {
                    return Err(err);
                }
                // Fall back to X11grab if DISPLAY is available
                if std::env::var("DISPLAY").is_err() {
                    return Err(err);
                }
            }
        }
    }

    run_x11_ffmpeg_capture(&args, &source, stop).await
}

async fn run_wayland_portal_capture(
    args: &Args,
    source: &NativeVideoSource,
    stop: Arc<AtomicBool>,
) -> Result<(), String> {
    use ashpd::desktop::screencast::{CursorMode, Screencast, SourceType};
    use ashpd::desktop::PersistMode;
    use std::os::fd::AsRawFd;

    let proxy = Screencast::new()
        .await
        .map_err(|e| format!("XDG ScreenCast portal unavailable: {}", e))?;
    let session = proxy
        .create_session()
        .await
        .map_err(|e| format!("Failed to create portal session: {}", e))?;

    let source_types = if args.source_id.starts_with("window:") {
        SourceType::Window.into()
    } else {
        SourceType::Monitor | SourceType::Window
    };

    proxy
        .select_sources(
            &session,
            CursorMode::Embedded,
            source_types,
            false,
            None,
            PersistMode::Application,
        )
        .await
        .map_err(|e| format!("Failed to select portal sources: {}", e))?;

    let response = proxy
        .start(&session, None)
        .await
        .map_err(|e| format!("Portal start failed: {}", e))?
        .response()
        .map_err(|e| format!("Portal cancelled or rejected: {}", e))?;

    let stream = response
        .streams()
        .first()
        .ok_or_else(|| "Portal returned no PipeWire video streams".to_string())?;
    let node_id = stream.pipe_wire_node_id();
    let pw_fd = proxy
        .open_pipe_wire_remote(&session)
        .await
        .map_err(|e| format!("Failed to open PipeWire remote fd: {}", e))?;

    // Clear FD_CLOEXEC so gst-launch-1.0 inherits the PipeWire remote fd
    let raw_fd = pw_fd.as_raw_fd();
    unsafe {
        let flags = libc_fcntl(raw_fd, F_GETFD, 0);
        if flags >= 0 {
            libc_fcntl(raw_fd, F_SETFD, flags & !FD_CLOEXEC);
        }
    }

    let caps = format!(
        "video/x-raw,format=I420,width={},height={},framerate={}/1",
        args.width, args.height, args.fps
    );
    let mut child = Command::new("gst-launch-1.0")
        .args([
            "-q",
            "pipewiresrc",
            &format!("fd={}", raw_fd),
            &format!("path={}", node_id),
            "do-timestamp=true",
            "!",
            "videorate",
            "drop-only=true",
            "!",
            "videoscale",
            "!",
            "videoconvert",
            "!",
            &caps,
            "!",
            "fdsink",
            "fd=1",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to spawn gst-launch-1.0: {}", e))?;

    let res = pump_i420_stdout(&mut child, args.width, args.height, source, stop).await;
    let _ = child.kill().await;
    let _ = session.close().await;
    res
}

async fn run_x11_ffmpeg_capture(
    args: &Args,
    source: &NativeVideoSource,
    stop: Arc<AtomicBool>,
) -> Result<(), String> {
    let display = std::env::var("DISPLAY").unwrap_or_else(|_| ":0.0".to_string());
    let scale_filter = format!(
        "scale={}:{}:force_original_aspect_ratio=decrease,pad={}:{}:(ow-iw)/2:(oh-ih)/2",
        args.width, args.height, args.width, args.height
    );

    let mut child = Command::new("ffmpeg")
        .args([
            "-loglevel",
            "error",
            "-f",
            "x11grab",
            "-framerate",
            &args.fps.to_string(),
            "-i",
            &display,
            "-vf",
            &scale_filter,
            "-pix_fmt",
            "yuv420p",
            "-f",
            "rawvideo",
            "pipe:1",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to spawn ffmpeg x11grab: {}", e))?;

    let res = pump_i420_stdout(&mut child, args.width, args.height, source, stop).await;
    let _ = child.kill().await;
    res
}

async fn pump_i420_stdout(
    child: &mut tokio::process::Child,
    width: u32,
    height: u32,
    source: &NativeVideoSource,
    stop: Arc<AtomicBool>,
) -> Result<(), String> {
    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to open video capture stdout".to_string())?;

    let y_size = (width * height) as usize;
    let uv_size = ((width / 2) * (height / 2)) as usize;
    let frame_size = y_size + uv_size * 2;
    let mut raw = vec![0u8; frame_size];
    let start_ts = std::time::Instant::now();

    while !stop.load(Ordering::Relaxed) {
        if stdout.read_exact(&mut raw).await.is_err() {
            break;
        }
        let mut i420 = I420Buffer::new(width, height);
        let (y_plane, u_plane, v_plane) = i420.data_mut();
        y_plane[..y_size].copy_from_slice(&raw[..y_size]);
        u_plane[..uv_size].copy_from_slice(&raw[y_size..y_size + uv_size]);
        v_plane[..uv_size].copy_from_slice(&raw[y_size + uv_size..]);

        source.capture_frame(&VideoFrame {
            rotation: VideoRotation::VideoRotation0,
            timestamp_us: start_ts.elapsed().as_micros() as i64,
            buffer: i420,
            frame_metadata: None,
        });
    }

    Ok(())
}

// Minimal libc fcntl bindings to avoid adding an extra crate dependency
const F_GETFD: i32 = 1;
const F_SETFD: i32 = 2;
const FD_CLOEXEC: i32 = 1;

extern "C" {
    #[link_name = "fcntl"]
    fn libc_fcntl(fd: i32, cmd: i32, ...) -> i32;
}
