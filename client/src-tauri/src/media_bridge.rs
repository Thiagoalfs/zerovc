use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use base64::Engine;
use livekit::e2ee::key_provider::{KeyProvider, KeyProviderOptions};
use livekit::e2ee::{E2eeOptions, EncryptionType};
use livekit::options::TrackPublishOptions;
use livekit::prelude::*;
use livekit::webrtc::audio_source::native::NativeAudioSource;
use livekit::webrtc::audio_source::AudioSourceOptions;
use livekit::webrtc::prelude::{RtcAudioSource, RtcVideoSource};
use livekit::webrtc::video_source::native::NativeVideoSource;
use livekit::webrtc::video_source::VideoResolution;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use zeroize::Zeroize;

use crate::media_audio_in::{
    list_input_devices, AudioInputConfig, AudioInputController, TARGET_SAMPLE_RATE,
};
use crate::media_audio_out::{list_output_devices, AudioDeviceInfo, AudioOutputMixer};
use crate::media_camera::{list_video_devices, CameraController};
use crate::media_video_hub::VideoFrameHub;
use crate::screenshare::{send_e2ee_key as ss_send_e2ee_key, send_ratchet_e2ee_key as ss_send_ratchet, ScreenShareState};

pub const E2EE_RATCHET_SALT: &[u8] = b"LK_RATCHET_SALT_V1";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeConnectResult {
    pub room_name: String,
    pub local_identity: String,
    pub video_hub_port: u16,
    pub video_hub_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeParticipant {
    pub identity: String,
    pub name: String,
    pub metadata: String,
    pub is_local: bool,
    pub is_speaking: bool,
    pub is_microphone_enabled: bool,
    pub is_camera_enabled: bool,
    pub is_screen_share_enabled: bool,
    pub has_screen_share_audio: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeDiagnosticStats {
    pub is_connected: bool,
    pub room_name: String,
    pub server_url: String,
    pub ping_ms: u32,
    pub ice_state: String,
    pub protocol: String,
    pub packet_loss_percent: f64,
    pub audio_bitrate_kbps: f64,
    pub video_bitrate_kbps: f64,
    pub codec: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VoiceStateMessage {
    #[serde(rename = "type")]
    msg_type: String,
    is_deafened: bool,
}

struct ActiveSession {
    room: Arc<Room>,
    server_url: String,
    local_identity: String,
    is_e2ee: bool,
    key_provider: Option<KeyProvider>,
    last_e2ee_key: Option<Vec<u8>>,
    audio_in: Option<AudioInputController>,
    audio_out: Option<AudioOutputMixer>,
    audio_source: Option<NativeAudioSource>,
    mic_pub_sid: Option<TrackSid>,
    camera: Option<CameraController>,
    camera_pub_sid: Option<TrackSid>,
    video_hub: Arc<VideoFrameHub>,
    event_task: Option<tokio::task::JoinHandle<()>>,
    audio_config: AudioInputConfig,
    input_device_id: Option<String>,
    output_device_id: Option<String>,
    video_device_id: Option<String>,
    is_muted: bool,
    is_deafened: bool,
    master_volume: f32,
    input_volume: f32,
    user_volumes: HashMap<String, f32>,
    stream_volumes: HashMap<String, f32>,
    watched_identities: HashSet<String>,
    deafened_identities: HashSet<String>,
    speaking_identities: HashSet<String>,
}

pub struct MediaBridge {
    inner: Arc<Mutex<Option<ActiveSession>>>,
    screenshare_state: Arc<Mutex<ScreenShareState>>,
}

impl MediaBridge {
    pub fn new(screenshare_state: Arc<Mutex<ScreenShareState>>) -> Self {
        Self {
            inner: Arc::new(Mutex::new(None)),
            screenshare_state,
        }
    }

    pub async fn connect(
        &self,
        app: AppHandle,
        url: String,
        token: String,
        auto_enable_mic: bool,
        is_e2ee: bool,
        audio_config: AudioInputConfig,
        input_device_id: Option<String>,
        output_device_id: Option<String>,
    ) -> Result<BridgeConnectResult, String> {
        self.disconnect().await;

        let mut room_options = RoomOptions::default();
        room_options.auto_subscribe = true;

        let key_provider = if is_e2ee {
            let kp = KeyProvider::new(build_key_provider_options());
            room_options.encryption = Some(E2eeOptions {
                encryption_type: EncryptionType::Gcm,
                key_provider: kp.clone(),
            });
            Some(kp)
        } else {
            None
        };

        let (room, mut events) = Room::connect(&url, &token, room_options)
            .await
            .map_err(|e| format!("LiveKit connect failed: {e}"))?;

        let room = Arc::new(room);
        let room_name = room.name();
        let local_identity = room.local_participant().identity().to_string();

        let video_hub = Arc::new(VideoFrameHub::start().await?);
        let video_hub_port = video_hub.port();
        let video_hub_token = video_hub.token().to_string();

        let audio_out = match AudioOutputMixer::start(output_device_id.clone()) {
            Ok(mixer) => Some(mixer),
            Err(e) => {
                eprintln!("[MediaBridge] AudioOutputMixer failed to start: {e}");
                None
            }
        };

        let mut audio_in: Option<AudioInputController> = None;
        let mut audio_source: Option<NativeAudioSource> = None;
        let mut mic_pub_sid: Option<TrackSid> = None;

        if auto_enable_mic {
            let src = NativeAudioSource::new(
                AudioSourceOptions {
                    echo_cancellation: audio_config.echo_cancellation,
                    noise_suppression: audio_config.mode == "webrtc" && audio_config.noise_suppression,
                    auto_gain_control: audio_config.auto_gain_control,
                },
                TARGET_SAMPLE_RATE,
                1,
                200,
            );
            let vad_app = app.clone();
            match AudioInputController::start(
                src.clone(),
                input_device_id.clone(),
                audio_config.clone(),
                move |vad| {
                    let _ = vad_app.emit("media-bridge:vad-state", vad);
                },
            ) {
                Ok(ctrl) => {
                    let track = LocalAudioTrack::create_audio_track(
                        "microphone",
                        RtcAudioSource::Native(src.clone()),
                    );
                    let mut pub_opts = TrackPublishOptions::default();
                    pub_opts.source = TrackSource::Microphone;
                    match room
                        .local_participant()
                        .publish_track(LocalTrack::Audio(track), pub_opts)
                        .await
                    {
                        Ok(publication) => {
                            mic_pub_sid = Some(publication.sid());
                            audio_in = Some(ctrl);
                            audio_source = Some(src);
                        }
                        Err(e) => {
                            ctrl.stop();
                            eprintln!("[MediaBridge] Failed to publish microphone track: {e}");
                        }
                    }
                }
                Err(e) => eprintln!("[MediaBridge] AudioInputController start failed: {e}"),
            }
        }

        let session = ActiveSession {
            room: Arc::clone(&room),
            server_url: url,
            local_identity: local_identity.clone(),
            is_e2ee,
            key_provider,
            last_e2ee_key: None,
            audio_in,
            audio_out,
            audio_source,
            mic_pub_sid,
            camera: None,
            camera_pub_sid: None,
            video_hub: Arc::clone(&video_hub),
            event_task: None,
            audio_config,
            input_device_id,
            output_device_id,
            video_device_id: None,
            is_muted: !auto_enable_mic,
            is_deafened: false,
            master_volume: 1.0,
            input_volume: 1.0,
            user_volumes: HashMap::new(),
            stream_volumes: HashMap::new(),
            watched_identities: HashSet::new(),
            deafened_identities: HashSet::new(),
            speaking_identities: HashSet::new(),
        };

        let inner_arc = Arc::clone(&self.inner);
        let app_clone = app.clone();
        let room_clone = Arc::clone(&room);
        let local_id_clone = local_identity.clone();

        {
            let mut guard = self.inner.lock().await;
            *guard = Some(session);

            // Spawn event_task only AFTER *guard = Some(session) so early RoomEvents never drop
            let event_task = tokio::spawn(async move {
                while let Some(event) = events.recv().await {
                    match event {
                        RoomEvent::ParticipantConnected(participant) => {
                            let pid = participant.identity().to_string();
                            let should_send_deafen = {
                                let guard = inner_arc.lock().await;
                                guard
                                    .as_ref()
                                    .map(|s| s.is_deafened && !pid.starts_with("screenshare:"))
                                    .unwrap_or(false)
                            };
                            if should_send_deafen {
                                let _ = broadcast_voice_state(&room_clone, true, Some(&pid)).await;
                            }
                            emit_participants_snapshot(&app_clone, &inner_arc).await;
                        }
                        RoomEvent::ParticipantDisconnected(participant) => {
                            let pid = participant.identity().to_string();
                            let deafened_changed = {
                                let mut guard = inner_arc.lock().await;
                                if let Some(s) = guard.as_mut() {
                                    if let Some(ref out) = s.audio_out {
                                        out.remove_participant(&pid);
                                    }
                                    let owner = strip_screenshare_prefix(&pid);
                                    s.video_hub.remove_stream(&format!("{owner}:camera"));
                                    s.video_hub.remove_stream(&format!("{owner}:screen_share"));
                                    s.speaking_identities.remove(&pid);
                                    s.deafened_identities.remove(&pid)
                                } else {
                                    false
                                }
                            };
                            if deafened_changed {
                                emit_deafened_snapshot(&app_clone, &inner_arc).await;
                            }
                            emit_participants_snapshot(&app_clone, &inner_arc).await;
                        }
                        RoomEvent::DataReceived {
                            payload,
                            participant: Some(participant),
                            ..
                        } => {
                            if let Some(is_deaf) = parse_voice_state_payload(&payload) {
                                let pid = participant.identity().to_string();
                                {
                                    let mut guard = inner_arc.lock().await;
                                    if let Some(s) = guard.as_mut() {
                                        if is_deaf {
                                            s.deafened_identities.insert(pid);
                                        } else {
                                            s.deafened_identities.remove(&pid);
                                        }
                                    }
                                }
                                emit_deafened_snapshot(&app_clone, &inner_arc).await;
                            }
                        }
                        RoomEvent::ActiveSpeakersChanged { speakers } => {
                            let ids: Vec<String> = speakers
                                .into_iter()
                                .filter(|p| is_participant_mic_active(p))
                                .map(|p| p.identity().to_string())
                                .collect();
                            {
                                let mut guard = inner_arc.lock().await;
                                if let Some(s) = guard.as_mut() {
                                    s.speaking_identities = ids.iter().cloned().collect();
                                }
                            }
                            let _ = app_clone.emit("media-bridge:speaking-changed", ids);
                        }
                        RoomEvent::TrackPublished {
                            publication,
                            participant,
                        } => {
                            if is_self_screenshare(participant.identity().as_str(), &local_id_clone) {
                                publication.set_subscribed(false);
                            }
                            let _ = app_clone.emit("media-bridge:track-updated", serde_json::json!({}));
                            emit_participants_snapshot(&app_clone, &inner_arc).await;
                        }
                        RoomEvent::TrackSubscribed {
                            track,
                            publication,
                            participant,
                        } => {
                            let raw_id = participant.identity().to_string();
                            if is_self_screenshare(&raw_id, &local_id_clone) {
                                publication.set_subscribed(false);
                                let _ =
                                    app_clone.emit("media-bridge:track-updated", serde_json::json!({}));
                                emit_participants_snapshot(&app_clone, &inner_arc).await;
                                continue;
                            }
                            let owner = strip_screenshare_prefix(&raw_id).to_string();
                            let source = publication.source();

                            match track {
                                RemoteTrack::Audio(audio_track) => {
                                    let is_screen_audio = source == TrackSource::ScreenshareAudio;
                                    if is_screen_audio && owner == local_id_clone {
                                        continue;
                                    }
                                    let sid = publication.sid().to_string();
                                    let guard = inner_arc.lock().await;
                                    if let Some(s) = guard.as_ref() {
                                        if let Some(ref out) = s.audio_out {
                                            out.add_track(
                                                sid,
                                                owner,
                                                is_screen_audio,
                                                audio_track.rtc_track(),
                                            );
                                        }
                                    }
                                }
                                RemoteTrack::Video(video_track) => {
                                    let (source_key, max_fps) = match source {
                                        TrackSource::Screenshare => ("screen_share", 60),
                                        _ => ("camera", 30),
                                    };
                                    let stream_key = format!("{owner}:{source_key}");
                                    let guard = inner_arc.lock().await;
                                    if let Some(s) = guard.as_ref() {
                                        s.video_hub.attach_remote_video_track(
                                            stream_key,
                                            video_track.rtc_track(),
                                            max_fps,
                                        );
                                    }
                                }
                            }
                            let _ = app_clone.emit("media-bridge:track-updated", serde_json::json!({}));
                            emit_participants_snapshot(&app_clone, &inner_arc).await;
                        }
                        RoomEvent::TrackUnsubscribed {
                            track,
                            publication,
                            participant,
                        } => {
                            let sid = publication.sid().to_string();
                            let owner = strip_screenshare_prefix(participant.identity().as_str()).to_string();
                            let source = publication.source();
                            let guard = inner_arc.lock().await;
                            if let Some(s) = guard.as_ref() {
                                match track {
                                    RemoteTrack::Audio(_) => {
                                        if let Some(ref out) = s.audio_out {
                                            out.remove_track(&sid);
                                        }
                                    }
                                    RemoteTrack::Video(_) => {
                                        let source_key = if source == TrackSource::Screenshare {
                                            "screen_share"
                                        } else {
                                            "camera"
                                        };
                                        s.video_hub.remove_stream(&format!("{owner}:{source_key}"));
                                    }
                                }
                            }
                            drop(guard);
                            let _ = app_clone.emit("media-bridge:track-updated", serde_json::json!({}));
                            emit_participants_snapshot(&app_clone, &inner_arc).await;
                        }
                        RoomEvent::TrackMuted { .. }
                        | RoomEvent::TrackUnmuted { .. }
                        | RoomEvent::TrackUnpublished { .. }
                        | RoomEvent::LocalTrackPublished { .. }
                        | RoomEvent::LocalTrackUnpublished { .. } => {
                            let _ = app_clone.emit("media-bridge:track-updated", serde_json::json!({}));
                            emit_participants_snapshot(&app_clone, &inner_arc).await;
                        }
                        RoomEvent::Disconnected { reason } => {
                            let _ = app_clone.emit(
                                "media-bridge:disconnected",
                                serde_json::json!({ "reason": format!("{reason:?}") }),
                            );
                            break;
                        }
                        _ => {}
                    }
                }
            });

            if let Some(s) = guard.as_mut() {
                s.event_task = Some(event_task);
            }
        }

        // Attach any remote tracks already subscribed during Room::connect
        {
            let guard = self.inner.lock().await;
            if let Some(s) = guard.as_ref() {
                for (_, remote) in room.remote_participants() {
                    let raw_id = remote.identity().to_string();
                    if is_self_screenshare(&raw_id, &local_identity) {
                        for (_, pub_track) in remote.track_publications() {
                            pub_track.set_subscribed(false);
                        }
                        continue;
                    }
                    let owner = strip_screenshare_prefix(&raw_id).to_string();
                    for (sid, pub_track) in remote.track_publications() {
                        match pub_track.track() {
                            Some(RemoteTrack::Audio(audio_track)) => {
                                let is_screen_audio =
                                    pub_track.source() == TrackSource::ScreenshareAudio;
                                if is_screen_audio && owner == local_identity {
                                    continue;
                                }
                                if let Some(ref out) = s.audio_out {
                                    out.add_track(
                                        sid.to_string(),
                                        owner.clone(),
                                        is_screen_audio,
                                        audio_track.rtc_track(),
                                    );
                                }
                            }
                            Some(RemoteTrack::Video(video_track)) => {
                                let (source_key, max_fps) = match pub_track.source() {
                                    TrackSource::Screenshare => ("screen_share", 60),
                                    _ => ("camera", 30),
                                };
                                s.video_hub.attach_remote_video_track(
                                    format!("{owner}:{source_key}"),
                                    video_track.rtc_track(),
                                    max_fps,
                                );
                            }
                            None => {}
                        }
                    }
                }
            }
        }

        emit_participants_snapshot(&app, &self.inner).await;

        Ok(BridgeConnectResult {
            room_name,
            local_identity,
            video_hub_port,
            video_hub_token,
        })
    }

    pub async fn disconnect(&self) {
        let prev = {
            let mut guard = self.inner.lock().await;
            guard.take()
        };
        if let Some(mut session) = prev {
            if let Some(task) = session.event_task.take() {
                task.abort();
            }
            if let Some(cam) = session.camera.take() {
                cam.stop();
            }
            if let Some(ain) = session.audio_in.take() {
                ain.stop();
            }
            if let Some(aout) = session.audio_out.take() {
                aout.stop();
            }
            session.video_hub.stop();
            if let Some(mut key) = session.last_e2ee_key.take() {
                key.zeroize();
            }
            let _ = session.room.close().await;
        }
    }

    pub async fn set_muted(&self, app: &AppHandle, muted: bool) -> Result<(), String> {
        let mut guard = self.inner.lock().await;
        let Some(session) = guard.as_mut() else {
            return Ok(());
        };
        session.is_muted = muted;

        if let Some(ref ain) = session.audio_in {
            ain.set_muted(muted);
        }

        if let Some(ref sid) = session.mic_pub_sid {
            if let Some(pub_track) = session.room.local_participant().track_publications().get(sid) {
                if muted {
                    pub_track.mute();
                } else {
                    pub_track.unmute();
                }
            }
        } else if !muted {
            // Publish microphone lazily on first unmute (start capture before publish_track)
            let src = NativeAudioSource::new(
                AudioSourceOptions {
                    echo_cancellation: session.audio_config.echo_cancellation,
                    noise_suppression: session.audio_config.mode == "webrtc"
                        && session.audio_config.noise_suppression,
                    auto_gain_control: session.audio_config.auto_gain_control,
                },
                TARGET_SAMPLE_RATE,
                1,
                200,
            );
            let vad_app = app.clone();
            let ctrl = AudioInputController::start(
                src.clone(),
                session.input_device_id.clone(),
                session.audio_config.clone(),
                move |vad| {
                    let _ = vad_app.emit("media-bridge:vad-state", vad);
                },
            )?;
            let track = LocalAudioTrack::create_audio_track(
                "microphone",
                RtcAudioSource::Native(src.clone()),
            );
            let mut pub_opts = TrackPublishOptions::default();
            pub_opts.source = TrackSource::Microphone;
            let publication = match session
                .room
                .local_participant()
                .publish_track(LocalTrack::Audio(track), pub_opts)
                .await
            {
                Ok(pub_track) => pub_track,
                Err(e) => {
                    ctrl.stop();
                    return Err(format!("Failed to publish microphone: {e}"));
                }
            };
            session.mic_pub_sid = Some(publication.sid());
            ctrl.set_input_volume(session.input_volume);
            session.audio_in = Some(ctrl);
            session.audio_source = Some(src);
        }
        drop(guard);
        emit_participants_snapshot(app, &self.inner).await;
        Ok(())
    }

    pub async fn set_deafened(&self, app: &AppHandle, deafened: bool) -> Result<(), String> {
        let room_to_broadcast = {
            let mut guard = self.inner.lock().await;
            let Some(session) = guard.as_mut() else {
                return Ok(());
            };
            let changed = session.is_deafened != deafened;
            session.is_deafened = deafened;
            if let Some(ref out) = session.audio_out {
                out.set_deafened(deafened);
            }
            if changed {
                Some(Arc::clone(&session.room))
            } else {
                None
            }
        };

        if deafened {
            let _ = self.set_muted(app, true).await;
        }
        if let Some(room) = room_to_broadcast {
            let _ = broadcast_voice_state(&room, deafened, None).await;
        }
        Ok(())
    }

    pub async fn set_camera_enabled(
        &self,
        app: &AppHandle,
        enabled: bool,
        device_id: Option<String>,
    ) -> Result<(), String> {
        let mut guard = self.inner.lock().await;
        let Some(session) = guard.as_mut() else {
            return Ok(());
        };
        if let Some(dev) = device_id {
            session.video_device_id = Some(dev);
        }

        if !enabled {
            if let Some(cam) = session.camera.take() {
                cam.stop();
            }
            let local_key = format!("{}:camera", session.local_identity);
            session.video_hub.remove_stream(&local_key);
            if let Some(sid) = session.camera_pub_sid.take() {
                let _ = session.room.local_participant().unpublish_track(&sid).await;
            }
        } else {
            if let Some(cam) = session.camera.take() {
                cam.stop();
            }
            if let Some(sid) = session.camera_pub_sid.take() {
                let _ = session.room.local_participant().unpublish_track(&sid).await;
            }
            let video_source = NativeVideoSource::new(
                VideoResolution {
                    width: 1280,
                    height: 720,
                },
                false,
            );
            let local_key = format!("{}:camera", session.local_identity);
            let cam = CameraController::start(
                session.video_device_id.clone(),
                video_source.clone(),
                Arc::clone(&session.video_hub),
                local_key.clone(),
            )?;
            let track = LocalVideoTrack::create_video_track(
                "camera",
                RtcVideoSource::Native(video_source),
            );
            let mut pub_opts = TrackPublishOptions::default();
            pub_opts.source = TrackSource::Camera;
            let publication = match session
                .room
                .local_participant()
                .publish_track(LocalTrack::Video(track), pub_opts)
                .await
            {
                Ok(pub_track) => pub_track,
                Err(e) => {
                    cam.stop();
                    session.video_hub.remove_stream(&local_key);
                    return Err(format!("Failed to publish camera: {e}"));
                }
            };
            session.camera = Some(cam);
            session.camera_pub_sid = Some(publication.sid());
        }
        drop(guard);
        emit_participants_snapshot(app, &self.inner).await;
        Ok(())
    }

    pub async fn set_user_volume(&self, identity: String, volume: f32) {
        let mut guard = self.inner.lock().await;
        if let Some(session) = guard.as_mut() {
            session.user_volumes.insert(identity.clone(), volume);
            if let Some(ref out) = session.audio_out {
                out.set_user_volume(identity, volume);
            }
        }
    }

    pub async fn set_stream_volume(&self, identity: String, volume: f32) {
        let mut guard = self.inner.lock().await;
        if let Some(session) = guard.as_mut() {
            session.stream_volumes.insert(identity.clone(), volume);
            if let Some(ref out) = session.audio_out {
                out.set_stream_volume(identity, volume);
            }
        }
    }

    pub async fn set_output_volume(&self, volume: f32) {
        let mut guard = self.inner.lock().await;
        if let Some(session) = guard.as_mut() {
            session.master_volume = volume;
            if let Some(ref out) = session.audio_out {
                out.set_master_volume(volume);
            }
        }
    }

    pub async fn set_input_volume(&self, volume: f32) {
        let mut guard = self.inner.lock().await;
        if let Some(session) = guard.as_mut() {
            session.input_volume = volume;
            if let Some(ref ain) = session.audio_in {
                ain.set_input_volume(volume);
            }
        }
    }

    pub async fn set_stream_subscribed(&self, identity: String, subscribed: bool) {
        let mut guard = self.inner.lock().await;
        if let Some(session) = guard.as_mut() {
            if subscribed {
                session.watched_identities.insert(identity);
            } else {
                session.watched_identities.remove(&identity);
            }
            if let Some(ref out) = session.audio_out {
                out.set_watched_identities(session.watched_identities.clone());
            }
        }
    }

    pub async fn update_mic_config(&self, config: AudioInputConfig) {
        let mut guard = self.inner.lock().await;
        if let Some(session) = guard.as_mut() {
            session.audio_config = config.clone();
            if let Some(ref ain) = session.audio_in {
                ain.update_config(config);
            }
        }
    }

    pub async fn set_input_device(&self, app: &AppHandle, device_id: String) -> Result<(), String> {
        let mut guard = self.inner.lock().await;
        let Some(session) = guard.as_mut() else {
            return Ok(());
        };
        let dev_opt = if device_id.is_empty() || device_id == "default" {
            None
        } else {
            Some(device_id)
        };
        session.input_device_id = dev_opt.clone();
        if let Some(src) = session.audio_source.clone() {
            if let Some(old) = session.audio_in.take() {
                old.stop();
            }
            let vad_app = app.clone();
            let ctrl = AudioInputController::start(
                src,
                dev_opt,
                session.audio_config.clone(),
                move |vad| {
                    let _ = vad_app.emit("media-bridge:vad-state", vad);
                },
            )?;
            ctrl.set_muted(session.is_muted);
            ctrl.set_input_volume(session.input_volume);
            session.audio_in = Some(ctrl);
        }
        Ok(())
    }

    pub async fn set_output_device(&self, device_id: String) -> Result<(), String> {
        let mut guard = self.inner.lock().await;
        let Some(session) = guard.as_mut() else {
            return Ok(());
        };
        let dev_opt = if device_id.is_empty() || device_id == "default" {
            None
        } else {
            Some(device_id)
        };
        session.output_device_id = dev_opt.clone();
        if let Some(old) = session.audio_out.take() {
            old.stop();
        }
        let mixer = AudioOutputMixer::start(dev_opt)?;
        mixer.set_deafened(session.is_deafened);
        mixer.set_master_volume(session.master_volume);
        mixer.set_watched_identities(session.watched_identities.clone());
        for (id, vol) in &session.user_volumes {
            mixer.set_user_volume(id.clone(), *vol);
        }
        for (id, vol) in &session.stream_volumes {
            mixer.set_stream_volume(id.clone(), *vol);
        }
        // Re-attach currently subscribed remote audio tracks
        for (_, remote) in session.room.remote_participants() {
            let raw_id = remote.identity().to_string();
            if is_self_screenshare(&raw_id, &session.local_identity) {
                continue;
            }
            let owner = strip_screenshare_prefix(&raw_id).to_string();
            for (sid, pub_track) in remote.track_publications() {
                if let Some(RemoteTrack::Audio(audio_track)) = pub_track.track() {
                    let is_screen_audio = pub_track.source() == TrackSource::ScreenshareAudio;
                    if is_screen_audio && owner == session.local_identity {
                        continue;
                    }
                    mixer.add_track(
                        sid.to_string(),
                        owner.clone(),
                        is_screen_audio,
                        audio_track.rtc_track(),
                    );
                }
            }
        }
        session.audio_out = Some(mixer);
        Ok(())
    }

    pub async fn set_video_device(&self, app: &AppHandle, device_id: String) -> Result<(), String> {
        let is_cam_on = {
            let mut guard = self.inner.lock().await;
            let Some(session) = guard.as_mut() else {
                return Ok(());
            };
            session.video_device_id = if device_id.is_empty() || device_id == "default" {
                None
            } else {
                Some(device_id.clone())
            };
            session.camera.is_some()
        };
        if is_cam_on {
            self.set_camera_enabled(app, true, Some(device_id)).await?;
        }
        Ok(())
    }

    pub fn list_devices() -> Vec<AudioDeviceInfo> {
        let mut all = list_input_devices();
        all.extend(list_output_devices());
        all.extend(list_video_devices());
        all
    }

    pub async fn set_e2ee_key(&self, key_base64: String) -> Result<(), String> {
        let key_bytes = base64::engine::general_purpose::STANDARD
            .decode(key_base64.trim())
            .map_err(|e| format!("Invalid base64 E2EE key: {e}"))?;
        if key_bytes.len() != 32 {
            return Err(format!("Expected 32-byte E2EE key, got {} bytes", key_bytes.len()));
        }

        {
            let mut guard = self.inner.lock().await;
            if let Some(session) = guard.as_mut() {
                if let Some(ref kp) = session.key_provider {
                    kp.set_shared_key(key_bytes.clone(), 0);
                    session.room.e2ee_manager().set_enabled(true);
                }
                if let Some(mut old) = session.last_e2ee_key.replace(key_bytes) {
                    old.zeroize();
                }
            }
        }

        // Also forward key to native screenshare sidecar if running
        let _ = ss_send_e2ee_key(&self.screenshare_state, key_base64.trim()).await;
        Ok(())
    }

    pub async fn sync_e2ee_key_to_screenshare(&self) {
        let b64_opt = {
            let guard = self.inner.lock().await;
            guard.as_ref().and_then(|s| {
                s.last_e2ee_key
                    .as_ref()
                    .map(|k| base64::engine::general_purpose::STANDARD.encode(k))
            })
        };
        if let Some(mut b64) = b64_opt {
            let _ = ss_send_e2ee_key(&self.screenshare_state, &b64).await;
            b64.zeroize();
        }
    }

    pub async fn ratchet_e2ee_key(
        &self,
        _identity: Option<String>,
        key_index: Option<i32>,
    ) -> Result<(), String> {
        let idx = key_index.unwrap_or(0);
        let mut new_b64: Option<String> = None;
        {
            let mut guard = self.inner.lock().await;
            if let Some(session) = guard.as_mut() {
                if let Some(ref kp) = session.key_provider {
                    if let Some(new_key) = kp.ratchet_shared_key(idx) {
                        new_b64 = Some(base64::engine::general_purpose::STANDARD.encode(&new_key));
                        if let Some(mut old) = session.last_e2ee_key.replace(new_key) {
                            old.zeroize();
                        }
                    }
                }
            }
        }
        if let Some(mut b64) = new_b64 {
            let _ = ss_send_e2ee_key(&self.screenshare_state, &b64).await;
            b64.zeroize();
        } else {
            let _ = ss_send_ratchet(&self.screenshare_state).await;
        }
        Ok(())
    }

    pub async fn get_diagnostic_stats(&self) -> BridgeDiagnosticStats {
        let guard = self.inner.lock().await;
        let Some(session) = guard.as_ref() else {
            return BridgeDiagnosticStats {
                is_connected: false,
                room_name: String::new(),
                server_url: String::new(),
                ping_ms: 0,
                ice_state: "disconnected".to_string(),
                protocol: "unknown".to_string(),
                packet_loss_percent: 0.0,
                audio_bitrate_kbps: 0.0,
                video_bitrate_kbps: 0.0,
                codec: "Opus 48kHz (Rust Native)".to_string(),
            };
        };

        let is_connected = session.room.connection_state() == ConnectionState::Connected;
        let ice_state = if is_connected {
            "connected"
        } else {
            "connecting"
        };
        let codec = if session.is_e2ee {
            "Opus 48kHz (Rust Native E2EE)"
        } else {
            "Opus 48kHz (Rust Native)"
        };

        BridgeDiagnosticStats {
            is_connected,
            room_name: session.room.name(),
            server_url: session.server_url.clone(),
            ping_ms: 0,
            ice_state: ice_state.to_string(),
            protocol: "udp".to_string(),
            packet_loss_percent: 0.0,
            audio_bitrate_kbps: 0.0,
            video_bitrate_kbps: 0.0,
            codec: codec.to_string(),
        }
    }
}

pub fn build_key_provider_options() -> KeyProviderOptions {
    KeyProviderOptions {
        ratchet_salt: E2EE_RATCHET_SALT.to_vec(),
        ratchet_window_size: 16,
        failure_tolerance: -1,
        key_ring_size: 16,
        ..Default::default()
    }
}

pub fn is_self_screenshare(participant_identity: &str, local_identity: &str) -> bool {
    participant_identity
        .strip_prefix("screenshare:")
        .map(|owner| owner == local_identity)
        .unwrap_or(false)
}

fn strip_screenshare_prefix(identity: &str) -> &str {
    identity.strip_prefix("screenshare:").unwrap_or(identity)
}

pub fn serialize_voice_state_payload(is_deafened: bool) -> Vec<u8> {
    let msg = VoiceStateMessage {
        msg_type: "voice_state".to_string(),
        is_deafened,
    };
    serde_json::to_vec(&msg).unwrap_or_default()
}

pub fn parse_voice_state_payload(payload: &[u8]) -> Option<bool> {
    let msg: VoiceStateMessage = serde_json::from_slice(payload).ok()?;
    if msg.msg_type == "voice_state" {
        Some(msg.is_deafened)
    } else {
        None
    }
}

async fn broadcast_voice_state(
    room: &Room,
    is_deafened: bool,
    target_identity: Option<&str>,
) -> Result<(), String> {
    let payload = serialize_voice_state_payload(is_deafened);
    let destination_identities = target_identity
        .map(|id| vec![ParticipantIdentity(id.to_string())])
        .unwrap_or_default();
    room.local_participant()
        .publish_data(DataPacket {
            payload,
            reliable: true,
            topic: None,
            destination_identities,
        })
        .await
        .map_err(|e| format!("publish_data failed: {e}"))
}

fn is_participant_mic_active(p: &Participant) -> bool {
    match p {
        Participant::Local(lp) => lp
            .track_publications()
            .values()
            .any(|pub_t| pub_t.source() == TrackSource::Microphone && !pub_t.is_muted()),
        Participant::Remote(rp) => rp
            .track_publications()
            .values()
            .any(|pub_t| pub_t.source() == TrackSource::Microphone && !pub_t.is_muted()),
    }
}

async fn emit_deafened_snapshot(app: &AppHandle, inner: &Arc<Mutex<Option<ActiveSession>>>) {
    let ids: Vec<String> = {
        let guard = inner.lock().await;
        guard
            .as_ref()
            .map(|s| s.deafened_identities.iter().cloned().collect())
            .unwrap_or_default()
    };
    let _ = app.emit("media-bridge:deafened-changed", ids);
}

async fn emit_participants_snapshot(app: &AppHandle, inner: &Arc<Mutex<Option<ActiveSession>>>) {
    let list: Vec<BridgeParticipant> = {
        let guard = inner.lock().await;
        let Some(session) = guard.as_ref() else {
            return;
        };

        let mut out = Vec::new();
        let lp = session.room.local_participant();
        let local_id = lp.identity().to_string();
        let local_mic = lp
            .track_publications()
            .values()
            .any(|p| p.source() == TrackSource::Microphone && !p.is_muted());
        let local_cam = session.camera.is_some()
            || lp
                .track_publications()
                .values()
                .any(|p| p.source() == TrackSource::Camera && !p.is_muted());

        out.push(BridgeParticipant {
            identity: local_id.clone(),
            name: lp.name(),
            metadata: lp.metadata(),
            is_local: true,
            is_speaking: session.speaking_identities.contains(&local_id),
            is_microphone_enabled: local_mic,
            is_camera_enabled: local_cam,
            is_screen_share_enabled: false,
            has_screen_share_audio: false,
        });

        for (_, rp) in session.room.remote_participants() {
            let rid = rp.identity().to_string();
            let mic = rp
                .track_publications()
                .values()
                .any(|p| p.source() == TrackSource::Microphone && !p.is_muted());
            let cam = rp
                .track_publications()
                .values()
                .any(|p| p.source() == TrackSource::Camera && !p.is_muted());
            let screen = rp
                .track_publications()
                .values()
                .any(|p| p.source() == TrackSource::Screenshare && !p.is_muted());
            let screen_audio = rp
                .track_publications()
                .values()
                .any(|p| p.source() == TrackSource::ScreenshareAudio && !p.is_muted());

            out.push(BridgeParticipant {
                identity: rid.clone(),
                name: rp.name(),
                metadata: rp.metadata(),
                is_local: false,
                is_speaking: session.speaking_identities.contains(&rid),
                is_microphone_enabled: mic,
                is_camera_enabled: cam,
                is_screen_share_enabled: screen,
                has_screen_share_audio: screen_audio,
            });
        }
        out
    };
    let _ = app.emit("media-bridge:participants-changed", list);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_self_screenshare() {
        assert!(is_self_screenshare("screenshare:user-1", "user-1"));
        assert!(!is_self_screenshare("screenshare:user-2", "user-1"));
        assert!(!is_self_screenshare("user-1", "user-1"));
    }

    #[test]
    fn test_voice_state_roundtrip() {
        let bytes = serialize_voice_state_payload(true);
        assert_eq!(parse_voice_state_payload(&bytes), Some(true));
        let bytes_false = serialize_voice_state_payload(false);
        assert_eq!(parse_voice_state_payload(&bytes_false), Some(false));
        assert_eq!(parse_voice_state_payload(b"{}"), None);
    }

    #[test]
    fn test_e2ee_key_provider_options() {
        let opts = build_key_provider_options();
        assert_eq!(opts.ratchet_salt, b"LK_RATCHET_SALT_V1");
        assert_eq!(opts.ratchet_window_size, 16);
        assert_eq!(opts.failure_tolerance, -1);
        assert_eq!(opts.key_ring_size, 16);
    }
}
