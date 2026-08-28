import {
  Room,
  RoomEvent,
  VideoPresets,
  Track,
  RemoteParticipant,
  RemoteTrackPublication,
  LocalParticipant,
  Participant,
} from 'livekit-client';

class LiveKitManager {
  private room: Room | null = null;
  private onParticipantsChanged?: (participants: Participant[]) => void;
  private onSpeakingChanged?: (speakingUserIds: string[]) => void;
  private onTrackUpdated?: () => void;
  private attachedAudioElements: Map<string, HTMLMediaElement> = new Map();

  getRoom(): Room | null {
    return this.room;
  }

  async connect(
    url: string,
    token: string,
    callbacks: {
      onParticipantsChanged?: (participants: Participant[]) => void;
      onSpeakingChanged?: (speakingUserIds: string[]) => void;
      onTrackUpdated?: () => void;
    }
  ) {
    if (this.room) {
      await this.disconnect();
    }

    this.onParticipantsChanged = callbacks.onParticipantsChanged;
    this.onSpeakingChanged = callbacks.onSpeakingChanged;
    this.onTrackUpdated = callbacks.onTrackUpdated;

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
      },
      videoCaptureDefaults: {
        resolution: VideoPresets.h720.resolution,
      },
    });

    this.room = room;

    const updateParticipants = () => {
      if (!this.room) return;
      const all: Participant[] = [this.room.localParticipant, ...Array.from(this.room.remoteParticipants.values())];
      this.onParticipantsChanged?.(all);
    };

    room.on(RoomEvent.Connected, async () => {
      console.log('[LiveKit] Connected to room:', room.name);
      try {
        await room.startAudio();
      } catch (err) {
        console.warn('[LiveKit] startAudio error:', err);
      }
      updateParticipants();
    });

    room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      if (!room.canPlaybackAudio) {
        room.startAudio().catch(() => {});
      }
    });

    room.on(RoomEvent.ParticipantConnected, () => {
      updateParticipants();
    });

    room.on(RoomEvent.ParticipantDisconnected, () => {
      updateParticipants();
    });

    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      const ids = speakers.map((s) => s.identity);
      this.onSpeakingChanged?.(ids);
    });

    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === Track.Kind.Audio) {
        const audioEl = track.attach();
        audioEl.id = `audio-${participant.identity}-${track.sid || 'audio'}`;
        audioEl.style.display = 'none';
        document.body.appendChild(audioEl);
        audioEl.play().catch((err) => console.log('[LiveKit] Audio play blocked:', err));
        if (track.sid) {
          this.attachedAudioElements.set(track.sid, audioEl);
        }
      }
      this.onTrackUpdated?.();
      updateParticipants();
    });

    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      if (track.sid) {
        const audioEl = this.attachedAudioElements.get(track.sid);
        if (audioEl) {
          audioEl.remove();
          this.attachedAudioElements.delete(track.sid);
        }
      }
      track.detach().forEach((el) => el.remove());
      this.onTrackUpdated?.();
      updateParticipants();
    });

    room.on(RoomEvent.TrackMuted, () => {
      this.onTrackUpdated?.();
      updateParticipants();
    });

    room.on(RoomEvent.TrackUnmuted, () => {
      this.onTrackUpdated?.();
      updateParticipants();
    });

    await room.connect(url, token);

    // Auto-enable and publish microphone track on connect
    try {
      await room.localParticipant.setMicrophoneEnabled(true);
    } catch (err) {
      console.warn('[LiveKit] Could not auto-enable microphone:', err);
    }

    updateParticipants();
    return room;
  }

  async setMicrophoneEnabled(enabled: boolean) {
    if (this.room) {
      await this.room.localParticipant.setMicrophoneEnabled(enabled);
      if (enabled) {
        this.room.startAudio().catch(() => {});
      }
    }
  }

  async setScreenShareEnabled(enabled: boolean, sourceId?: string) {
    if (!this.room) return;

    if (enabled && sourceId) {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          // @ts-ignore
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            minWidth: 1280,
            maxWidth: 1920,
            maxHeight: 1080,
            maxFrameRate: 30,
          },
        },
      });

      const videoTrack = stream.getVideoTracks()[0];
      await this.room.localParticipant.publishTrack(videoTrack, {
        name: 'screen_share',
        source: Track.Source.ScreenShare,
      });
    } else {
      await this.room.localParticipant.setScreenShareEnabled(enabled);
    }

    this.onTrackUpdated?.();
  }

  async disconnect() {
    this.attachedAudioElements.forEach((el) => el.remove());
    this.attachedAudioElements.clear();

    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }
  }
}

export const livekit = new LiveKitManager();
