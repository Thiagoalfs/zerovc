mod audio;
mod preview;
#[cfg(target_os = "linux")]
mod video_linux;
#[cfg(target_os = "windows")]
mod video_windows;

use base64::Engine;
use clap::Parser;
use livekit::e2ee::key_provider::{KeyProvider, KeyProviderOptions};
use livekit::e2ee::E2eeOptions;
use livekit::options::{TrackPublishOptions, VideoCodec, VideoEncoding};
use livekit::prelude::*;
use livekit::webrtc::audio_source::native::NativeAudioSource;
use livekit::webrtc::audio_source::AudioSourceOptions;
use livekit::webrtc::prelude::RtcAudioSource;
use livekit::webrtc::video_source::native::NativeVideoSource;
use livekit::webrtc::video_source::{RtcVideoSource, VideoResolution};
use serde_json::json;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};

#[derive(Parser, Debug, Clone)]
#[command(name = "zerovc-screenshare")]
pub struct Args {
    /// LiveKit WebSocket URL (wss://...)
    #[arg(long)]
    pub url: String,

    /// Dedicated LiveKit screenshare JWT token (identity: screenshare:<userId>)
    #[arg(long)]
    pub token: String,

    /// Electron desktopCapturer sourceId (e.g. screen:0:0 or window:12345:0)
    #[arg(long, default_value = "screen:0:0")]
    pub source_id: String,

    /// Target width (even number)
    #[arg(long, default_value_t = 1280)]
    pub width: u32,

    /// Target height (even number)
    #[arg(long, default_value_t = 720)]
    pub height: u32,

    /// Target framerate (15, 30, 60)
    #[arg(long, default_value_t = 30)]
    pub fps: u32,

    /// Max video bitrate in bps
    #[arg(long, default_value_t = 3_500_000)]
    pub bitrate: u64,

    /// Include system/app audio (always excluding ZeroVC's own audio)
    #[arg(long, default_value_t = true, action = clap::ArgAction::Set)]
    pub include_audio: bool,

    /// Electron main process PID (used to exclude ZeroVC's own audio tree)
    #[arg(long, default_value_t = 0)]
    pub self_pid: u32,

    /// Path to zerovc-audio-capture.exe on Windows
    #[arg(long)]
    pub audio_helper: Option<String>,

    /// Optional base64-encoded E2EE shared key for encrypted rooms
    #[arg(long)]
    pub e2ee_key: Option<String>,
}

pub fn emit_event(event: &str, data: serde_json::Value) {
    let mut obj = match data {
        serde_json::Value::Object(m) => m,
        _ => serde_json::Map::new(),
    };
    obj.insert("event".to_string(), json!(event));
    println!("{}", serde_json::Value::Object(obj));
}

#[tokio::main]
async fn main() {
    let mut args = Args::parse();
    // I420 requires even dimensions, and GStreamer pads row strides unless width is a multiple of 4
    args.width = (args.width.max(320)) & !3;
    args.height = (args.height.max(180)) & !1;
    args.fps = args.fps.clamp(5, 60);

    let stop_flag = Arc::new(AtomicBool::new(false));

    // Configure LiveKit RoomOptions (auto_subscribe = false: publish-only sidecar)
    let mut room_opts = RoomOptions::default();
    room_opts.auto_subscribe = false;
    room_opts.dynacast = true;

    if let Some(ref b64_key) = args.e2ee_key {
        if !b64_key.trim().is_empty() {
            match base64::engine::general_purpose::STANDARD.decode(b64_key.trim()) {
                Ok(key_bytes) if !key_bytes.is_empty() => {
                    let kp = KeyProvider::with_shared_key(KeyProviderOptions::default(), key_bytes);
                    room_opts.encryption = Some(E2eeOptions {
                        encryption_type: livekit::e2ee::EncryptionType::Gcm,
                        key_provider: kp,
                    });
                }
                Ok(_) => {}
                Err(err) => {
                    emit_event("error", json!({ "message": format!("Invalid E2EE key: {}", err) }));
                    std::process::exit(1);
                }
            }
        }
    }

    // 1. Start platform-specific video capture FIRST so OS pickers (e.g. KDE Wayland portal)
    // complete BEFORE we connect/publish to LiveKit (no black screen while choosing a window).
    let video_source = NativeVideoSource::new(
        VideoResolution {
            width: args.width,
            height: args.height,
        },
        true,
    );

    let (preview_hub, preview_port, preview_token) = match preview::PreviewHub::start(stop_flag.clone()).await {
        Ok(res) => res,
        Err(err) => {
            emit_event("error", json!({ "message": err }));
            std::process::exit(1);
        }
    };

    let (ready_tx, ready_rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let v_args = args.clone();
    let v_stop = stop_flag.clone();
    let v_source = video_source.clone();
    let v_preview = preview_hub.clone();
    let video_handle = tokio::spawn(async move {
        #[cfg(target_os = "linux")]
        let res = video_linux::run_video_capture(v_args, v_source, v_preview, v_stop.clone(), ready_tx).await;

        #[cfg(target_os = "windows")]
        let res = video_windows::run_video_capture(v_args, v_source, v_preview, v_stop.clone(), ready_tx).await;

        if let Err(err) = res {
            if !v_stop.load(Ordering::Relaxed) {
                emit_event("error", json!({ "message": err }));
                v_stop.store(true, Ordering::Relaxed);
            }
        }
    });

    match ready_rx.await {
        Ok(Ok(())) => {}
        Ok(Err(err)) => {
            emit_event("error", json!({ "message": err }));
            std::process::exit(1);
        }
        Err(_) => {
            emit_event("error", json!({ "message": "Video capture aborted before starting" }));
            std::process::exit(1);
        }
    }

    // 2. Connect to LiveKit only after capture source is confirmed ready
    let (room, mut room_events) = match Room::connect(&args.url, &args.token, room_opts).await {
        Ok(res) => res,
        Err(err) => {
            stop_flag.store(true, Ordering::Relaxed);
            let _ = tokio::time::timeout(std::time::Duration::from_secs(1), video_handle).await;
            emit_event("error", json!({ "message": format!("LiveKit connect failed: {}", err) }));
            std::process::exit(1);
        }
    };

    emit_event("connected", json!({ "room": room.name() }));

    // 3. Publish native video track
    let video_track = LocalVideoTrack::create_video_track(
        "screen_share",
        RtcVideoSource::Native(video_source),
    );

    let video_pub_opts = TrackPublishOptions {
        source: TrackSource::Screenshare,
        simulcast: false,
        video_codec: VideoCodec::H264,
        video_encoding: Some(VideoEncoding {
            max_bitrate: args.bitrate,
            max_framerate: args.fps as f64,
        }),
        ..Default::default()
    };

    if let Err(err) = room
        .local_participant()
        .publish_track(LocalTrack::Video(video_track), video_pub_opts)
        .await
    {
        stop_flag.store(true, Ordering::Relaxed);
        emit_event("error", json!({ "message": format!("Failed to publish video: {}", err) }));
        let _ = room.close().await;
        std::process::exit(1);
    }

    // 4. Optionally publish zero-echo native audio track
    let mut audio_published = false;
    let audio_handle = if args.include_audio {
        let audio_source = NativeAudioSource::new(
            AudioSourceOptions {
                echo_cancellation: false,
                noise_suppression: false,
                auto_gain_control: false,
            },
            48_000,
            2,
            100,
        );
        let audio_track = LocalAudioTrack::create_audio_track(
            "screen_share_audio",
            RtcAudioSource::Native(audio_source.clone()),
        );
        let audio_pub_opts = TrackPublishOptions {
            source: TrackSource::ScreenshareAudio,
            dtx: false,
            red: false,
            ..Default::default()
        };
        match room
            .local_participant()
            .publish_track(LocalTrack::Audio(audio_track), audio_pub_opts)
            .await
        {
            Ok(_) => {
                audio_published = true;
                let a_args = args.clone();
                let a_stop = stop_flag.clone();
                Some(tokio::spawn(async move {
                    if let Err(err) = audio::run_audio_capture(a_args, audio_source, a_stop).await {
                        emit_event("audio_warning", json!({ "message": err }));
                    }
                }))
            }
            Err(err) => {
                emit_event(
                    "audio_warning",
                    json!({ "message": format!("Failed to publish audio: {}", err) }),
                );
                None
            }
        }
    } else {
        None
    };

    emit_event(
        "publishing",
        json!({
            "video": true,
            "audio": audio_published,
            "width": args.width,
            "height": args.height,
            "fps": args.fps,
            "preview_port": preview_port,
            "preview_token": preview_token,
        }),
    );

    // 5. Listen for "stop" on stdin, EOF (parent died), Ctrl+C, or RoomDisconnected
    let stdin_stop = stop_flag.clone();
    let stdin_task = tokio::spawn(async move {
        let mut lines = BufReader::new(tokio::io::stdin()).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim().eq_ignore_ascii_case("stop") {
                break;
            }
        }
        stdin_stop.store(true, Ordering::Relaxed);
    });

    loop {
        if stop_flag.load(Ordering::Relaxed) {
            break;
        }
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {
                stop_flag.store(true, Ordering::Relaxed);
                break;
            }
            ev = room_events.recv() => {
                match ev {
                    Some(RoomEvent::Disconnected { .. }) | None => {
                        stop_flag.store(true, Ordering::Relaxed);
                        break;
                    }
                    _ => {}
                }
            }
            _ = tokio::time::sleep(std::time::Duration::from_millis(100)) => {}
        }
    }

    stop_flag.store(true, Ordering::Relaxed);
    stdin_task.abort();
    let _ = tokio::time::timeout(std::time::Duration::from_secs(2), video_handle).await;
    if let Some(ah) = audio_handle {
        let _ = tokio::time::timeout(std::time::Duration::from_secs(2), ah).await;
    }
    let _ = room.close().await;
    emit_event("stopped", json!({}));
}
