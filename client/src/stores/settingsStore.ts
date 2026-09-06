import { create } from 'zustand';

export type ThemeMode = 'dark' | 'oled' | 'light';
export type AccentColor = 'indigo' | 'purple' | 'emerald' | 'rose' | 'cyan' | 'amber';
export type ChatDensity = 'cozy' | 'compact';
export type ScreenshareQuality = '720p30' | '1080p30' | '1080p60' | 'source';
export type DmPrivacy = 'everyone' | 'friends_only';

interface SettingsState {
  // Theme & Appearance
  theme: ThemeMode;
  accentColor: AccentColor;
  chatDensity: ChatDensity;
  uiZoom: number;
  autoplayGifs: boolean;

  // System & Window
  minimizeToTray: boolean;
  autoStart: boolean;
  hardwareAcceleration: boolean;

  // Sounds & Notifications
  soundsEnabled: boolean;
  soundVolume: number;
  soundChannelEvents: boolean;
  soundMuteEvents: boolean;
  soundMessageEvents: boolean;
  notificationsDesktop: boolean;

  // Audio / WebRTC Filters
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  screenshareQuality: ScreenshareQuality;

  // Privacy
  dmPrivacy: DmPrivacy;

  // Actions
  setTheme: (theme: ThemeMode) => void;
  setAccentColor: (color: AccentColor) => void;
  setChatDensity: (density: ChatDensity) => void;
  setUiZoom: (zoom: number) => void;
  setAutoplayGifs: (enabled: boolean) => void;
  setMinimizeToTray: (enabled: boolean) => void;
  setAutoStart: (enabled: boolean) => void;
  setHardwareAcceleration: (enabled: boolean) => void;
  setSoundsEnabled: (enabled: boolean) => void;
  setSoundVolume: (vol: number) => void;
  setSoundChannelEvents: (enabled: boolean) => void;
  setSoundMuteEvents: (enabled: boolean) => void;
  setSoundMessageEvents: (enabled: boolean) => void;
  setNotificationsDesktop: (enabled: boolean) => void;
  setEchoCancellation: (enabled: boolean) => void;
  setNoiseSuppression: (enabled: boolean) => void;
  setAutoGainControl: (enabled: boolean) => void;
  setScreenshareQuality: (quality: ScreenshareQuality) => void;
  setDmPrivacy: (privacy: DmPrivacy) => void;
  applyThemeToDOM: () => void;
}

function getStoredBoolean(key: string, defaultVal: boolean): boolean {
  try {
    const saved = localStorage.getItem(key);
    return saved !== null ? saved === 'true' : defaultVal;
  } catch {
    return defaultVal;
  }
}

function getStoredString<T extends string>(key: string, defaultVal: T): T {
  try {
    const saved = localStorage.getItem(key);
    return (saved as T) || defaultVal;
  } catch {
    return defaultVal;
  }
}

function getStoredNumber(key: string, defaultVal: number): number {
  try {
    const saved = localStorage.getItem(key);
    return saved !== null ? Number(saved) : defaultVal;
  } catch {
    return defaultVal;
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: getStoredString<ThemeMode>('zerovc_theme', 'dark'),
  accentColor: getStoredString<AccentColor>('zerovc_accent_color', 'indigo'),
  chatDensity: getStoredString<ChatDensity>('zerovc_chat_density', 'cozy'),
  uiZoom: getStoredNumber('zerovc_ui_zoom', 100),
  autoplayGifs: getStoredBoolean('zerovc_autoplay_gifs', true),

  minimizeToTray: getStoredBoolean('zerovc_minimize_to_tray', true),
  autoStart: getStoredBoolean('zerovc_auto_start', false),
  hardwareAcceleration: getStoredBoolean('zerovc_hardware_acceleration', true),

  soundsEnabled: getStoredBoolean('zerovc_sounds_enabled', true),
  soundVolume: getStoredNumber('zerovc_sound_volume', 80),
  soundChannelEvents: getStoredBoolean('zerovc_sound_channel_events', true),
  soundMuteEvents: getStoredBoolean('zerovc_sound_mute_events', true),
  soundMessageEvents: getStoredBoolean('zerovc_sound_message_events', true),
  notificationsDesktop: getStoredBoolean('zerovc_notifications_desktop', true),

  echoCancellation: getStoredBoolean('zerovc_echo_cancellation', true),
  noiseSuppression: getStoredBoolean('zerovc_noise_suppression', true),
  autoGainControl: getStoredBoolean('zerovc_auto_gain_control', true),
  screenshareQuality: getStoredString<ScreenshareQuality>('zerovc_screenshare_quality', '1080p30'),

  dmPrivacy: getStoredString<DmPrivacy>('zerovc_dm_privacy', 'everyone'),

  setTheme: (theme) => {
    localStorage.setItem('zerovc_theme', theme);
    set({ theme });
    get().applyThemeToDOM();
  },

  setAccentColor: (accentColor) => {
    localStorage.setItem('zerovc_accent_color', accentColor);
    set({ accentColor });
    get().applyThemeToDOM();
  },

  setChatDensity: (chatDensity) => {
    localStorage.setItem('zerovc_chat_density', chatDensity);
    set({ chatDensity });
  },

  setUiZoom: (uiZoom) => {
    localStorage.setItem('zerovc_ui_zoom', String(uiZoom));
    set({ uiZoom });
    get().applyThemeToDOM();
  },

  setAutoplayGifs: (autoplayGifs) => {
    localStorage.setItem('zerovc_autoplay_gifs', String(autoplayGifs));
    set({ autoplayGifs });
  },

  setMinimizeToTray: (minimizeToTray) => {
    localStorage.setItem('zerovc_minimize_to_tray', String(minimizeToTray));
    set({ minimizeToTray });
    window.electronAPI?.setMinimizeToTray?.(minimizeToTray);
  },

  setAutoStart: (autoStart) => {
    localStorage.setItem('zerovc_auto_start', String(autoStart));
    set({ autoStart });
    window.electronAPI?.setAutoStart?.(autoStart);
  },

  setHardwareAcceleration: (hardwareAcceleration) => {
    localStorage.setItem('zerovc_hardware_acceleration', String(hardwareAcceleration));
    set({ hardwareAcceleration });
  },

  setSoundsEnabled: (soundsEnabled) => {
    localStorage.setItem('zerovc_sounds_enabled', String(soundsEnabled));
    set({ soundsEnabled });
  },

  setSoundVolume: (soundVolume) => {
    localStorage.setItem('zerovc_sound_volume', String(soundVolume));
    set({ soundVolume });
  },

  setSoundChannelEvents: (soundChannelEvents) => {
    localStorage.setItem('zerovc_sound_channel_events', String(soundChannelEvents));
    set({ soundChannelEvents });
  },

  setSoundMuteEvents: (soundMuteEvents) => {
    localStorage.setItem('zerovc_sound_mute_events', String(soundMuteEvents));
    set({ soundMuteEvents });
  },

  setSoundMessageEvents: (soundMessageEvents) => {
    localStorage.setItem('zerovc_sound_message_events', String(soundMessageEvents));
    set({ soundMessageEvents });
  },

  setNotificationsDesktop: (notificationsDesktop) => {
    localStorage.setItem('zerovc_notifications_desktop', String(notificationsDesktop));
    set({ notificationsDesktop });
  },

  setEchoCancellation: (echoCancellation) => {
    localStorage.setItem('zerovc_echo_cancellation', String(echoCancellation));
    set({ echoCancellation });
  },

  setNoiseSuppression: (noiseSuppression) => {
    localStorage.setItem('zerovc_noise_suppression', String(noiseSuppression));
    set({ noiseSuppression });
  },

  setAutoGainControl: (autoGainControl) => {
    localStorage.setItem('zerovc_auto_gain_control', String(autoGainControl));
    set({ autoGainControl });
  },

  setScreenshareQuality: (screenshareQuality) => {
    localStorage.setItem('zerovc_screenshare_quality', screenshareQuality);
    set({ screenshareQuality });
  },

  setDmPrivacy: (dmPrivacy) => {
    localStorage.setItem('zerovc_dm_privacy', dmPrivacy);
    set({ dmPrivacy });
  },

  applyThemeToDOM: () => {
    if (typeof document === 'undefined') return;
    const { theme, uiZoom } = get();

    const root = document.documentElement;

    // Apply Theme dataset attribute
    root.setAttribute('data-theme', theme);
    if (theme === 'oled') {
      root.classList.add('theme-oled');
    } else {
      root.classList.remove('theme-oled');
    }

    // Apply Zoom style
    if (uiZoom && uiZoom !== 100) {
      root.style.zoom = `${uiZoom}%`;
    } else {
      root.style.zoom = '100%';
    }
  },
}));
