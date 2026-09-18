export {};

declare global {
  interface HTMLMediaElement {
    setSinkId?(sinkId: string): Promise<void>;
    sinkId?: string;
  }

  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
      Plugins?: Record<string, any>;
    };
    AndroidAudioBridge?: {
      setSpeakerphoneOn?(enabled: boolean): void;
      setMicrophoneMute?(muted: boolean): void;
      isSpeakerphoneOn?(): boolean;
    };
  }
}
