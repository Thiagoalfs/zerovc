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

let lastJoinVoiceSoundTime = 0;
// Play join voice chime (Ascending chord)
export const playJoinVoiceSound = () => {
  if (!isSoundsEnabled()) return;
  if (localStorage.getItem('zerovc_sound_channel_events') === 'false') return;

  const nowMs = Date.now();
  if (nowMs - lastJoinVoiceSoundTime < 500) return;
  lastJoinVoiceSoundTime = nowMs;

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

let lastLeaveVoiceSoundTime = 0;
// Play leave voice chime (Descending chord)
export const playLeaveVoiceSound = () => {
  if (!isSoundsEnabled()) return;
  if (localStorage.getItem('zerovc_sound_channel_events') === 'false') return;

  const nowMs = Date.now();
  if (nowMs - lastLeaveVoiceSoundTime < 500) return;
  lastLeaveVoiceSoundTime = nowMs;

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

const lastSoundDebounceTimes: Record<string, number> = {};
const isSoundDebounced = (key: string, ms = 600) => {
  const now = Date.now();
  if (lastSoundDebounceTimes[key] && now - lastSoundDebounceTimes[key] < ms) {
    return true;
  }
  lastSoundDebounceTimes[key] = now;
  return false;
};

// Play notification when someone enters the call
export const playUserJoinCallSound = () => {
  if (!isSoundsEnabled()) return;
  if (localStorage.getItem('zerovc_sound_user_join_leave') === 'false') return;
  if (isSoundDebounced('user_join', 600)) return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const vol = getSoundVolume();
    const now = ctx.currentTime;

    // Pleasant high melodic pop/chime (B4 -> E5)
    const notes = [493.88, 659.25];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.05);

      gain.gain.setValueAtTime(0, now + i * 0.05);
      gain.gain.linearRampToValueAtTime(0.14 * vol, now + i * 0.05 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + i * 0.05);
      osc.stop(now + i * 0.05 + 0.2);
    });
  } catch {}
};

// Play notification when someone leaves the call
export const playUserLeaveCallSound = () => {
  if (!isSoundsEnabled()) return;
  if (localStorage.getItem('zerovc_sound_user_join_leave') === 'false') return;
  if (isSoundDebounced('user_leave', 600)) return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const vol = getSoundVolume();
    const now = ctx.currentTime;

    // Pleasant descending pop (E5 -> B4)
    const notes = [659.25, 493.88];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.045);

      gain.gain.setValueAtTime(0, now + i * 0.045);
      gain.gain.linearRampToValueAtTime(0.13 * vol, now + i * 0.045 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.045 + 0.16);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + i * 0.045);
      osc.stop(now + i * 0.045 + 0.18);
    });
  } catch {}
};

// Play notification when someone starts screenshare / live stream
export const playStartStreamSound = () => {
  if (!isSoundsEnabled()) return;
  if (localStorage.getItem('zerovc_sound_stream_events') === 'false') return;
  if (isSoundDebounced('stream_start', 600)) return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const vol = getSoundVolume();
    const now = ctx.currentTime;

    // Crisp ascending tech harmonic (D5 -> G5 -> B5)
    const notes = [587.33, 783.99, 987.77];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.04);

      gain.gain.setValueAtTime(0, now + i * 0.04);
      gain.gain.linearRampToValueAtTime(0.13 * vol, now + i * 0.04 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + i * 0.04);
      osc.stop(now + i * 0.04 + 0.22);
    });
  } catch {}
};

// Play notification when someone stops screenshare / leaves live stream
export const playStopStreamSound = () => {
  if (!isSoundsEnabled()) return;
  if (localStorage.getItem('zerovc_sound_stream_events') === 'false') return;
  if (isSoundDebounced('stream_stop', 600)) return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const vol = getSoundVolume();
    const now = ctx.currentTime;

    // Crisp descending tech tone (B5 -> G5 -> D5)
    const notes = [987.77, 783.99, 587.33];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.035);

      gain.gain.setValueAtTime(0, now + i * 0.035);
      gain.gain.linearRampToValueAtTime(0.12 * vol, now + i * 0.035 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.035 + 0.16);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + i * 0.035);
      osc.stop(now + i * 0.035 + 0.18);
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

// Text-to-Speech synthesizer helper
let activeUtterance: SpeechSynthesisUtterance | null = null;

export const speakText = (text: string, authorName?: string) => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    console.warn('[TTS] Web Speech API not supported in this environment');
    return;
  }

  try {
    // Strip raw URLs, code blocks, or formatting for natural speech
    const cleanText = text
      .replace(/https?:\/\/[^\s]+/g, 'link')
      .replace(/```[\s\S]*?```/g, 'bloco de código')
      .replace(/`([^`]+)`/g, '$1')
      .slice(0, 300);

    const fullMessage = authorName ? `${authorName} disse: ${cleanText}` : cleanText;
    console.log('[TTS] Speaking message:', fullMessage);

    // Cancel any active speech and unpause engine
    window.speechSynthesis.cancel();
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    // A brief delay prevents Chromium from instantly aborting the new utterance with the prior cancel call
    setTimeout(() => {
      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }

        const utterance = new SpeechSynthesisUtterance(fullMessage);
        activeUtterance = utterance;
        (window as any).__zerovc_tts_utterance = utterance;

        utterance.lang = 'pt-BR';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        const vol = getSoundVolume();
        utterance.volume = Math.max(0.2, Math.min(1.0, isNaN(vol) ? 0.8 : vol));

        // Locate best Portuguese voice if available
        const voices = window.speechSynthesis.getVoices();
        if (voices && voices.length > 0) {
          const ptVoice = voices.find(
            (v) => v.lang === 'pt-BR' || v.lang === 'pt_BR' || v.lang.toLowerCase().startsWith('pt')
          );
          if (ptVoice) {
            utterance.voice = ptVoice;
          }
        }

        utterance.onend = () => {
          if (activeUtterance === utterance) {
            activeUtterance = null;
            (window as any).__zerovc_tts_utterance = null;
          }
        };

        utterance.onerror = (e) => {
          console.warn('[TTS] SpeechSynthesis error:', e);
          if (activeUtterance === utterance) {
            activeUtterance = null;
            (window as any).__zerovc_tts_utterance = null;
          }
        };

        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.error('[TTS] Failed to speak utterance:', err);
      }
    }, 40);
  } catch (err) {
    console.error('[TTS] Error preparing speech:', err);
  }
};

