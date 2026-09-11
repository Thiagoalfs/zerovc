package xyz.safiroko.zerovc;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothHeadset;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "ZeroVC-AudioRoute";

    private AudioManager audioManager;
    private AudioDeviceCallback audioDeviceCallback;
    private BroadcastReceiver audioBroadcastReceiver;
    private Handler mainHandler;
    private boolean isReceiverRegistered = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        mainHandler = new Handler(Looper.getMainLooper());
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);

        setupWebViewMediaSettings();
        setupAudioRouting();
    }

    private void setupWebViewMediaSettings() {
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                WebView webView = getBridge().getWebView();
                WebSettings settings = webView.getSettings();
                settings.setMediaPlaybackRequiresUserGesture(false);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error configuring WebView settings", e);
        }
    }

    private void setupAudioRouting() {
        if (audioManager == null) return;

        try {
            audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
        } catch (Exception e) {
            Log.e(TAG, "Error setting audio mode", e);
        }

        // 1. AudioDeviceCallback (API 23+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            audioDeviceCallback = new AudioDeviceCallback() {
                @Override
                public void onAudioDevicesAdded(AudioDeviceInfo[] addedDevices) {
                    Log.d(TAG, "Audio devices added event detected");
                    mainHandler.postDelayed(() -> updateAudioRoute(), 250);
                }

                @Override
                public void onAudioDevicesRemoved(AudioDeviceInfo[] removedDevices) {
                    Log.d(TAG, "Audio devices removed event detected");
                    mainHandler.postDelayed(() -> updateAudioRoute(), 250);
                }
            };
            audioManager.registerAudioDeviceCallback(audioDeviceCallback, mainHandler);
        }

        // 2. BroadcastReceiver for system audio events (Headset plug, Bluetooth connection / SCO changes)
        audioBroadcastReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent != null ? intent.getAction() : null;
                Log.d(TAG, "Audio broadcast received: " + action);
                mainHandler.postDelayed(() -> updateAudioRoute(), 300);
            }
        };

        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_HEADSET_PLUG);
        filter.addAction(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        filter.addAction(AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED);
        filter.addAction(BluetoothHeadset.ACTION_CONNECTION_STATE_CHANGED);
        filter.addAction(BluetoothHeadset.ACTION_AUDIO_STATE_CHANGED);
        filter.addAction(BluetoothAdapter.ACTION_CONNECTION_STATE_CHANGED);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(audioBroadcastReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                registerReceiver(audioBroadcastReceiver, filter);
            }
            isReceiverRegistered = true;
        } catch (Exception e) {
            Log.e(TAG, "Error registering audio broadcast receiver", e);
        }

        // Initial audio route resolution
        mainHandler.postDelayed(() -> updateAudioRoute(), 500);
    }

    private synchronized void updateAudioRoute() {
        if (audioManager == null) return;

        try {
            audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // Android 12+ (API 31+): setCommunicationDevice
                List<AudioDeviceInfo> devices = audioManager.getAvailableCommunicationDevices();
                AudioDeviceInfo bluetoothDevice = null;
                AudioDeviceInfo wiredDevice = null;
                AudioDeviceInfo speakerDevice = null;

                for (AudioDeviceInfo device : devices) {
                    int type = device.getType();
                    if (type == AudioDeviceInfo.TYPE_BLE_HEADSET ||
                        type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
                        type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP) {
                        bluetoothDevice = device;
                    } else if (type == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
                               type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
                               type == AudioDeviceInfo.TYPE_USB_HEADSET ||
                               type == AudioDeviceInfo.TYPE_USB_DEVICE) {
                        wiredDevice = device;
                    } else if (type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) {
                        speakerDevice = device;
                    }
                }

                if (bluetoothDevice != null) {
                    Log.i(TAG, "Auto-routing audio to Bluetooth headset: " + bluetoothDevice.getProductName());
                    boolean ok = audioManager.setCommunicationDevice(bluetoothDevice);
                    Log.i(TAG, "setCommunicationDevice(bluetooth) -> " + ok);
                } else if (wiredDevice != null) {
                    Log.i(TAG, "Auto-routing audio to Wired headset: " + wiredDevice.getProductName());
                    boolean ok = audioManager.setCommunicationDevice(wiredDevice);
                    Log.i(TAG, "setCommunicationDevice(wired) -> " + ok);
                } else if (speakerDevice != null) {
                    Log.i(TAG, "Auto-routing audio to Built-in Speaker: " + speakerDevice.getProductName());
                    boolean ok = audioManager.setCommunicationDevice(speakerDevice);
                    Log.i(TAG, "setCommunicationDevice(speaker) -> " + ok);
                } else {
                    audioManager.clearCommunicationDevice();
                }
            } else {
                // Android < 12 fallback
                boolean hasBluetooth = false;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    AudioDeviceInfo[] devices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
                    for (AudioDeviceInfo dev : devices) {
                        int type = dev.getType();
                        if (type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
                            type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
                            type == AudioDeviceInfo.TYPE_BLE_HEADSET) {
                            hasBluetooth = true;
                            break;
                        }
                    }
                }

                boolean hasWired = audioManager.isWiredHeadsetOn();

                if (hasBluetooth) {
                    Log.i(TAG, "Starting Bluetooth SCO audio routing...");
                    audioManager.startBluetoothSco();
                    audioManager.setBluetoothScoOn(true);
                    audioManager.setSpeakerphoneOn(false);
                } else if (hasWired) {
                    Log.i(TAG, "Wired headset active, routing to headset");
                    audioManager.stopBluetoothSco();
                    audioManager.setBluetoothScoOn(false);
                    audioManager.setSpeakerphoneOn(false);
                } else {
                    Log.i(TAG, "No headset detected, routing to loudspeaker");
                    audioManager.stopBluetoothSco();
                    audioManager.setBluetoothScoOn(false);
                    audioManager.setSpeakerphoneOn(true);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error in updateAudioRoute", e);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        updateAudioRoute();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (audioManager != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && audioDeviceCallback != null) {
                audioManager.unregisterAudioDeviceCallback(audioDeviceCallback);
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                audioManager.clearCommunicationDevice();
            } else {
                audioManager.stopBluetoothSco();
                audioManager.setBluetoothScoOn(false);
            }
            audioManager.setMode(AudioManager.MODE_NORMAL);
        }
        if (isReceiverRegistered && audioBroadcastReceiver != null) {
            try {
                unregisterReceiver(audioBroadcastReceiver);
                isReceiverRegistered = false;
            } catch (Exception ignored) {}
        }
    }
}
