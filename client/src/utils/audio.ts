// Web Audio API Synthetic Sound Generator for ZeroVC
let audioCtx: AudioContext | null = null;

const getAudioContext = () => {
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
};

const isSoundsEnabled = () => {
  try {
    return localStorage.getItem('zerovc_sounds_enabled') !== 'false';
  } catch {
    return true;
  }
};

const getSoundVolume = () => {
  try {
    const val = localStorage.getItem('zerovc_sound_volume');
    return val !== null ? Number(val) / 100 : 0.8;
  } catch {
    return 0.8;
  }
};

// Play a pleasant chime for incoming messages or mentions
export const playMessageSound = (isMention = false) => {
  if (!isSoundsEnabled()) return;
  if (localStorage.getItem('zerovc_sound_message_events') === 'false') return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const vol = getSoundVolume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    if (isMention) {
      // Two-tone bell for mentions
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880, now + 0.08); // A5
      gain.gain.setValueAtTime(0.18 * vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } else {
      // Soft pop for regular messages
      osc.frequency.setValueAtTime(440, now); // A4
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
      gain.gain.setValueAtTime(0.12 * vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    }
  } catch {}
};

// Play join voice chime (Ascending chord)
export const playJoinVoiceSound = () => {
  if (!isSoundsEnabled()) return;
  if (localStorage.getItem('zerovc_sound_channel_events') === 'false') return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const vol = getSoundVolume();
    const now = ctx.currentTime;

    const notes = [440, 554.37, 659.25]; // A4, C#5, E5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.045);

      gain.gain.setValueAtTime(0, now + i * 0.045);
      gain.gain.linearRampToValueAtTime(0.16 * vol, now + i * 0.045 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.045 + 0.26);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + i * 0.045);
      osc.stop(now + i * 0.045 + 0.28);
    });
  } catch {}
};

// Play leave voice chime (Descending chord)
export const playLeaveVoiceSound = () => {
  if (!isSoundsEnabled()) return;
  if (localStorage.getItem('zerovc_sound_channel_events') === 'false') return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const vol = getSoundVolume();
    const now = ctx.currentTime;

    const notes = [659.25, 554.37, 392]; // E5, C#5, G4
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.04);

      gain.gain.setValueAtTime(0, now + i * 0.04);
      gain.gain.linearRampToValueAtTime(0.15 * vol, now + i * 0.04 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + i * 0.04);
      osc.stop(now + i * 0.04 + 0.24);
    });
  } catch {}
};

// Play mute mic sound
export const playMuteSound = () => {
  if (!isSoundsEnabled()) return;
  if (localStorage.getItem('zerovc_sound_mute_events') === 'false') return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const vol = getSoundVolume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(450, now);
    osc.frequency.exponentialRampToValueAtTime(260, now + 0.08);

    gain.gain.setValueAtTime(0.16 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.09);
  } catch {}
};

// Play unmute mic sound
export const playUnmuteSound = () => {
  if (!isSoundsEnabled()) return;
  if (localStorage.getItem('zerovc_sound_mute_events') === 'false') return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const vol = getSoundVolume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.08);

    gain.gain.setValueAtTime(0.16 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.09);
  } catch {}
};

// Play deafen sound
export const playDeafenSound = () => {
  if (!isSoundsEnabled()) return;
  if (localStorage.getItem('zerovc_sound_mute_events') === 'false') return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const vol = getSoundVolume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(350, now);
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.11);

    gain.gain.setValueAtTime(0.18 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.12);
  } catch {}
};

// Play undeafen sound
export const playUndeafenSound = () => {
  if (!isSoundsEnabled()) return;
  if (localStorage.getItem('zerovc_sound_mute_events') === 'false') return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const vol = getSoundVolume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(480, now + 0.11);

    gain.gain.setValueAtTime(0.18 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.12);
  } catch {}
};
