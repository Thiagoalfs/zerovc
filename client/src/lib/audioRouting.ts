import { useVoiceStore } from '../stores/voiceStore';
import { useCallStore } from '../stores/callStore';

let isMicTesting = false;
let currentCallMode = false;
let isInitialized = false;

function evaluateCallAudioMode() {
  const voiceState = useVoiceStore.getState();
  const callState = useCallStore.getState();

  const isVoiceConnected = Boolean(voiceState.isConnected || voiceState.isConnecting);
  const isCallConnected = Boolean(callState.callState === 'connected' || callState.callState === 'calling');

  const shouldBeInCallMode = isVoiceConnected || isCallConnected || isMicTesting;

  if (shouldBeInCallMode !== currentCallMode) {
    currentCallMode = shouldBeInCallMode;
    try {
      const bridge = (window as any).AndroidAudioBridge;
      if (bridge?.setCallAudioMode) {
        bridge.setCallAudioMode(shouldBeInCallMode);
      }
    } catch (err) {
      console.warn('[audioRouting] Error communicating with AndroidAudioBridge:', err);
    }
  }
}

export function setMobileMicTesting(testing: boolean) {
  isMicTesting = testing;
  evaluateCallAudioMode();
}

export function initAudioRouting() {
  if (isInitialized || typeof window === 'undefined') return;
  isInitialized = true;

  // Subscribe to voiceStore state changes
  useVoiceStore.subscribe(() => {
    evaluateCallAudioMode();
  });

  // Subscribe to callStore state changes
  useCallStore.subscribe(() => {
    evaluateCallAudioMode();
  });

  // Initial evaluation
  evaluateCallAudioMode();
}
