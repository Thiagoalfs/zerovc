#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <audiopolicy.h>
#include <tlhelp32.h>
#include <wrl/implements.h>
#include <iostream>
#include <vector>
#include <string>
#include <set>
#include <map>
#include <mutex>
#include <io.h>
#include <fcntl.h>
#include <atomic>
#include <chrono>
#include <thread>
#include <cstdint>
#include <cmath>
#include <algorithm>

using namespace Microsoft::WRL;

std::atomic<bool> g_bRunning(true);

BOOL WINAPI ConsoleCtrlHandler(DWORD ctrlType) {
    if (ctrlType == CTRL_C_EVENT || ctrlType == CTRL_BREAK_EVENT || ctrlType == CTRL_CLOSE_EVENT) {
        g_bRunning = false;
        return TRUE;
    }
    return FALSE;
}

// Resolves actual audio-producing process ID from HWND (including UWP / ApplicationFrameHost apps)
DWORD GetRealProcessIdFromWindow(HWND hwnd) {
    if (!hwnd || !IsWindow(hwnd)) return 0;
    DWORD pid = 0;
    GetWindowThreadProcessId(hwnd, &pid);
    if (pid == 0) return 0;

    HANDLE hProcess = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (hProcess) {
        WCHAR imagePath[MAX_PATH] = { 0 };
        DWORD size = MAX_PATH;
        if (QueryFullProcessImageNameW(hProcess, 0, imagePath, &size)) {
            std::wstring pathStr(imagePath);
            if (pathStr.find(L"ApplicationFrameHost.exe") != std::wstring::npos) {
                struct EnumData {
                    DWORD foundPid;
                } enumData = { 0 };

                EnumChildWindows(hwnd, [](HWND childHwnd, LPARAM lParam) -> BOOL {
                    EnumData* pData = (EnumData*)lParam;
                    DWORD childPid = 0;
                    GetWindowThreadProcessId(childHwnd, &childPid);
                    if (childPid != 0) {
                        HANDLE hChild = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, childPid);
                        if (hChild) {
                            WCHAR childPath[MAX_PATH] = { 0 };
                            DWORD cSize = MAX_PATH;
                            if (QueryFullProcessImageNameW(hChild, 0, childPath, &cSize)) {
                                std::wstring cPathStr(childPath);
                                if (cPathStr.find(L"ApplicationFrameHost.exe") == std::wstring::npos) {
                                    pData->foundPid = childPid;
                                    CloseHandle(hChild);
                                    return FALSE; // found real child process
                                }
                            }
                            CloseHandle(hChild);
                        }
                    }
                    return TRUE;
                }, (LPARAM)&enumData);

                if (enumData.foundPid != 0) {
                    pid = enumData.foundPid;
                }
            }
        }
        CloseHandle(hProcess);
    }
    return pid;
}

// Helper to get default render endpoint mix format
WAVEFORMATEX* GetDefaultDeviceMixFormat() {
    ComPtr<IMMDeviceEnumerator> pEnumerator;
    HRESULT hr = CoCreateInstance(
        __uuidof(MMDeviceEnumerator),
        NULL,
        CLSCTX_ALL,
        __uuidof(IMMDeviceEnumerator),
        (void**)&pEnumerator
    );
    if (FAILED(hr) || !pEnumerator) return nullptr;

    ComPtr<IMMDevice> pDevice;
    hr = pEnumerator->GetDefaultAudioEndpoint(eRender, eConsole, &pDevice);
    if (FAILED(hr) || !pDevice) return nullptr;

    ComPtr<IAudioClient> pAudioClient;
    hr = pDevice->Activate(__uuidof(IAudioClient), CLSCTX_ALL, NULL, (void**)&pAudioClient);
    if (FAILED(hr) || !pAudioClient) return nullptr;

    WAVEFORMATEX* pMixFormat = nullptr;
    hr = pAudioClient->GetMixFormat(&pMixFormat);
    if (FAILED(hr)) return nullptr;

    return pMixFormat;
}

// Activator for Window/Process Loopback
class AudioLoopbackActivator : public RuntimeClass<RuntimeClassFlags<ClassicCom>, FtmBase, IActivateAudioInterfaceCompletionHandler> {
public:
    HANDLE m_hCompletedEvent;
    HRESULT m_hrResult;
    ComPtr<IAudioClient> m_pAudioClient;

    AudioLoopbackActivator() : m_hrResult(E_FAIL) {
        m_hCompletedEvent = CreateEvent(NULL, FALSE, FALSE, NULL);
    }

    ~AudioLoopbackActivator() {
        if (m_hCompletedEvent) {
            CloseHandle(m_hCompletedEvent);
        }
    }

    STDMETHODIMP ActivateCompleted(IActivateAudioInterfaceAsyncOperation* pAsyncOp) override {
        HRESULT hr = S_OK;
        ComPtr<IUnknown> pUnk;
        hr = pAsyncOp->GetActivateResult(&m_hrResult, &pUnk);
        if (SUCCEEDED(hr) && SUCCEEDED(m_hrResult) && pUnk) {
            pUnk.As(&m_pAudioClient);
        }
        SetEvent(m_hCompletedEvent);
        return S_OK;
    }
};

// Universal Audio Converter: Converts arbitrary WASAPI input format -> 48000Hz Stereo 32-bit Float
class AudioFormatConverter {
public:
    int inChannels = 2;
    int inSampleRate = 48000;
    int inBitsPerSample = 32;
    int inBytesPerFrame = 8;
    bool isFloat = true;

    // Resampler state (linear interpolation)
    double phase = 0.0;
    float prevSampleL = 0.0f;
    float prevSampleR = 0.0f;
    bool hasPrevSample = false;

    std::vector<float> inputStereoBuffer;
    std::vector<float> outputBuffer;

    void Configure(const WAVEFORMATEX* pwfx) {
        if (!pwfx) return;
        inChannels = pwfx->nChannels;
        inSampleRate = pwfx->nSamplesPerSec;
        inBitsPerSample = pwfx->wBitsPerSample;
        inBytesPerFrame = pwfx->nBlockAlign;

        if (pwfx->wFormatTag == WAVE_FORMAT_EXTENSIBLE && pwfx->cbSize >= 22) {
            const WAVEFORMATEXTENSIBLE* pExt = reinterpret_cast<const WAVEFORMATEXTENSIBLE*>(pwfx);
            if (IsEqualGUID(pExt->SubFormat, KSDATAFORMAT_SUBTYPE_IEEE_FLOAT)) {
                isFloat = true;
            } else if (IsEqualGUID(pExt->SubFormat, KSDATAFORMAT_SUBTYPE_PCM)) {
                isFloat = false;
            } else {
                isFloat = (inBitsPerSample == 32);
            }
        } else if (pwfx->wFormatTag == WAVE_FORMAT_IEEE_FLOAT) {
            isFloat = true;
        } else {
            isFloat = false;
        }

        std::cerr << "[WASAPI Capture] Audio format configured: " 
                  << inSampleRate << "Hz, " 
                  << inChannels << " channels, " 
                  << inBitsPerSample << " bits (" 
                  << (isFloat ? "Float" : "PCM") << ")" << std::endl;
    }

    void ProcessFrames(const BYTE* pData, UINT32 numFrames, DWORD flags) {
        if (numFrames == 0) return;

        if (flags & AUDCLNT_BUFFERFLAGS_SILENT || !pData) {
            // Generate silence
            UINT32 outFrames = (inSampleRate == 48000) ? numFrames : (UINT32)std::round(numFrames * (48000.0 / inSampleRate));
            if (outFrames == 0) outFrames = 1;
            outputBuffer.assign(outFrames * 2, 0.0f);
            fwrite(outputBuffer.data(), sizeof(float), outputBuffer.size(), stdout);
            fflush(stdout);
            prevSampleL = 0.0f;
            prevSampleR = 0.0f;
            return;
        }

        // Step 1: Decode input frames into normalized Stereo Float buffer (inputStereoBuffer)
        inputStereoBuffer.resize(numFrames * 2);

        for (UINT32 i = 0; i < numFrames; i++) {
            const BYTE* framePtr = pData + (i * inBytesPerFrame);
            float sL = 0.0f;
            float sR = 0.0f;

            if (isFloat) {
                if (inBitsPerSample == 32) {
                    const float* fData = reinterpret_cast<const float*>(framePtr);
                    if (inChannels == 1) {
                        sL = sR = fData[0];
                    } else if (inChannels == 2) {
                        sL = fData[0];
                        sR = fData[1];
                    } else { // Multi-channel (5.1 / 7.1)
                        sL = fData[0] + 0.7071f * fData[2]; // L + Center
                        sR = fData[1] + 0.7071f * fData[2]; // R + Center
                    }
                } else if (inBitsPerSample == 64) {
                    const double* dData = reinterpret_cast<const double*>(framePtr);
                    if (inChannels == 1) {
                        sL = sR = (float)dData[0];
                    } else if (inChannels == 2) {
                        sL = (float)dData[0];
                        sR = (float)dData[1];
                    } else {
                        sL = (float)(dData[0] + 0.7071 * dData[2]);
                        sR = (float)(dData[1] + 0.7071 * dData[2]);
                    }
                }
            } else {
                // PCM Integer
                if (inBitsPerSample == 16) {
                    const int16_t* iData = reinterpret_cast<const int16_t*>(framePtr);
                    if (inChannels == 1) {
                        sL = sR = iData[0] / 32768.0f;
                    } else if (inChannels == 2) {
                        sL = iData[0] / 32768.0f;
                        sR = iData[1] / 32768.0f;
                    } else {
                        sL = (iData[0] + 0.7071f * iData[2]) / 32768.0f;
                        sR = (iData[1] + 0.7071f * iData[2]) / 32768.0f;
                    }
                } else if (inBitsPerSample == 24) {
                    auto read24 = [](const BYTE* b) -> float {
                        int32_t val = (int32_t)((b[0]) | (b[1] << 8) | (b[2] << 16));
                        if (val & 0x800000) val |= 0xFF000000;
                        return val / 8388608.0f;
                    };
                    if (inChannels == 1) {
                        sL = sR = read24(framePtr);
                    } else if (inChannels == 2) {
                        sL = read24(framePtr);
                        sR = read24(framePtr + 3);
                    } else {
                        sL = read24(framePtr) + 0.7071f * read24(framePtr + 6);
                        sR = read24(framePtr + 3) + 0.7071f * read24(framePtr + 6);
                    }
                } else if (inBitsPerSample == 32) {
                    const int32_t* iData = reinterpret_cast<const int32_t*>(framePtr);
                    if (inChannels == 1) {
                        sL = sR = iData[0] / 2147483648.0f;
                    } else if (inChannels == 2) {
                        sL = iData[0] / 2147483648.0f;
                        sR = iData[1] / 2147483648.0f;
                    } else {
                        sL = (iData[0] + 0.7071f * iData[2]) / 2147483648.0f;
                        sR = (iData[1] + 0.7071f * iData[2]) / 2147483648.0f;
                    }
                }
            }

            inputStereoBuffer[i * 2] = sL;
            inputStereoBuffer[i * 2 + 1] = sR;
        }

        // Step 2: Resample to 48000Hz if needed
        if (inSampleRate == 48000) {
            fwrite(inputStereoBuffer.data(), sizeof(float), inputStereoBuffer.size(), stdout);
            fflush(stdout);
            return;
        }

        // Resampling with linear interpolation
        outputBuffer.clear();
        double step = (double)inSampleRate / 48000.0;

        if (!hasPrevSample) {
            prevSampleL = inputStereoBuffer[0];
            prevSampleR = inputStereoBuffer[1];
            hasPrevSample = true;
        }

        while (phase < numFrames) {
            size_t idx = (size_t)phase;
            double frac = phase - idx;

            float curL = inputStereoBuffer[idx * 2];
            float curR = inputStereoBuffer[idx * 2 + 1];

            float nextL = (idx + 1 < numFrames) ? inputStereoBuffer[(idx + 1) * 2] : curL;
            float nextR = (idx + 1 < numFrames) ? inputStereoBuffer[(idx + 1) * 2 + 1] : curR;

            float outL = (float)((1.0 - frac) * curL + frac * nextL);
            float outR = (float)((1.0 - frac) * curR + frac * nextR);

            outputBuffer.push_back(outL);
            outputBuffer.push_back(outR);

            phase += step;
        }

        phase -= numFrames;
        prevSampleL = inputStereoBuffer[(numFrames - 1) * 2];
        prevSampleR = inputStereoBuffer[(numFrames - 1) * 2 + 1];

        if (!outputBuffer.empty()) {
            fwrite(outputBuffer.data(), sizeof(float), outputBuffer.size(), stdout);
            fflush(stdout);
        }
    }
};

int RunCaptureLoop(IAudioClient* pAudioClient, HANDLE hAudioSamplesEvent, const WAVEFORMATEX* pwfx) {
    ComPtr<IAudioCaptureClient> pCaptureClient;
    HRESULT hr = pAudioClient->GetService(__uuidof(IAudioCaptureClient), &pCaptureClient);
    if (FAILED(hr)) {
        std::cerr << "[WASAPI Capture] GetService IAudioCaptureClient failed: 0x" << std::hex << hr << std::endl;
        return 1;
    }

    AudioFormatConverter converter;
    converter.Configure(pwfx);

    hr = pAudioClient->Start();
    if (FAILED(hr)) {
        std::cerr << "[WASAPI Capture] AudioClient Start failed: 0x" << std::hex << hr << std::endl;
        return 1;
    }

    std::cerr << "[WASAPI Capture] Capture Started. Output format -> 48000Hz Stereo Float32" << std::endl;

    BYTE* pData = NULL;
    UINT32 numFramesAvailable = 0;
    DWORD flags = 0;

    while (g_bRunning) {
        WaitForSingleObject(hAudioSamplesEvent, 20);

        hr = pCaptureClient->GetNextPacketSize(&numFramesAvailable);
        while (SUCCEEDED(hr) && numFramesAvailable > 0) {
            hr = pCaptureClient->GetBuffer(&pData, &numFramesAvailable, &flags, NULL, NULL);
            if (SUCCEEDED(hr)) {
                converter.ProcessFrames(pData, numFramesAvailable, flags);
                pCaptureClient->ReleaseBuffer(numFramesAvailable);
            }
            hr = pCaptureClient->GetNextPacketSize(&numFramesAvailable);
        }
    }

    pAudioClient->Stop();
    return 0;
}

int StartProcessLoopback(DWORD targetPID, PROCESS_LOOPBACK_MODE loopbackMode) {
    AUDIOCLIENT_ACTIVATION_PARAMS params = {};
    params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
    params.ProcessLoopbackParams.TargetProcessId = targetPID;
    params.ProcessLoopbackParams.ProcessLoopbackMode = loopbackMode;

    PROPVARIANT activateParams = {};
    activateParams.vt = VT_BLOB;
    activateParams.blob.cbSize = sizeof(params);
    activateParams.blob.pBlobData = (BYTE*)&params;

    auto pActivator = Make<AudioLoopbackActivator>();
    ComPtr<IActivateAudioInterfaceAsyncOperation> pAsyncOp;

    HRESULT hr = ActivateAudioInterfaceAsync(
        VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
        __uuidof(IAudioClient),
        &activateParams,
        pActivator.Get(),
        &pAsyncOp
    );

    if (FAILED(hr)) {
        std::cerr << "[WASAPI Capture] ActivateAudioInterfaceAsync failed: 0x" << std::hex << hr << std::endl;
        return -1;
    }

    WaitForSingleObject(pActivator->m_hCompletedEvent, 3000);

    if (FAILED(pActivator->m_hrResult) || !pActivator->m_pAudioClient) {
        std::cerr << "[WASAPI Capture] Activation result failed: 0x" << std::hex << pActivator->m_hrResult << std::endl;
        return -1;
    }

    ComPtr<IAudioClient> pAudioClient = pActivator->m_pAudioClient;

    WAVEFORMATEX* pMixFormat = nullptr;
    hr = pAudioClient->GetMixFormat(&pMixFormat);
    if (FAILED(hr) || !pMixFormat) {
        pMixFormat = GetDefaultDeviceMixFormat();
    }

    if (!pMixFormat) {
        std::cerr << "[WASAPI Capture] Failed to retrieve native mix format." << std::endl;
        return -1;
    }

    REFERENCE_TIME hnsBufferDuration = 200000; // 20ms
    hr = pAudioClient->Initialize(
        AUDCLNT_SHAREMODE_SHARED,
        AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
        hnsBufferDuration,
        0,
        pMixFormat,
        NULL
    );

    if (FAILED(hr)) {
        hr = pAudioClient->Initialize(
            AUDCLNT_SHAREMODE_SHARED,
            AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
            hnsBufferDuration,
            0,
            pMixFormat,
            NULL
        );
    }

    if (FAILED(hr)) {
        std::cerr << "[WASAPI Capture] IAudioClient Initialize failed: 0x" << std::hex << hr << std::endl;
        CoTaskMemFree(pMixFormat);
        return -1;
    }

    HANDLE hAudioSamplesEvent = CreateEvent(NULL, FALSE, FALSE, NULL);
    pAudioClient->SetEventHandle(hAudioSamplesEvent);

    int exitCode = RunCaptureLoop(pAudioClient.Get(), hAudioSamplesEvent, pMixFormat);

    CloseHandle(hAudioSamplesEvent);
    CoTaskMemFree(pMixFormat);
    return exitCode;
}

int StartClassicDefaultEndpointLoopback(DWORD zeroVCRootPID) {
    std::cerr << "[WASAPI Capture] Mode: FULL SCREEN DEFAULT ENDPOINT LOOPBACK (Fallback)" << std::endl;

    ComPtr<IMMDeviceEnumerator> pEnumerator;
    HRESULT hr = CoCreateInstance(
        __uuidof(MMDeviceEnumerator),
        NULL,
        CLSCTX_ALL,
        __uuidof(IMMDeviceEnumerator),
        (void**)&pEnumerator
    );

    if (FAILED(hr) || !pEnumerator) {
        std::cerr << "[WASAPI Capture] CoCreateInstance MMDeviceEnumerator failed: 0x" << std::hex << hr << std::endl;
        return 1;
    }

    ComPtr<IMMDevice> pDevice;
    hr = pEnumerator->GetDefaultAudioEndpoint(eRender, eConsole, &pDevice);
    if (FAILED(hr) || !pDevice) {
        std::cerr << "[WASAPI Capture] GetDefaultAudioEndpoint failed: 0x" << std::hex << hr << std::endl;
        return 1;
    }

    ComPtr<IAudioClient> pAudioClient;
    hr = pDevice->Activate(__uuidof(IAudioClient), CLSCTX_ALL, NULL, (void**)&pAudioClient);
    if (FAILED(hr) || !pAudioClient) {
        std::cerr << "[WASAPI Capture] Device Activate IAudioClient failed: 0x" << std::hex << hr << std::endl;
        return 1;
    }

    WAVEFORMATEX* pMixFormat = nullptr;
    hr = pAudioClient->GetMixFormat(&pMixFormat);
    if (FAILED(hr) || !pMixFormat) {
        pMixFormat = GetDefaultDeviceMixFormat();
    }

    if (!pMixFormat) {
        std::cerr << "[WASAPI Capture] Failed to retrieve native mix format." << std::endl;
        return 1;
    }

    REFERENCE_TIME hnsBufferDuration = 200000; // 20ms
    hr = pAudioClient->Initialize(
        AUDCLNT_SHAREMODE_SHARED,
        AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
        hnsBufferDuration,
        0,
        pMixFormat,
        NULL
    );

    if (FAILED(hr)) {
        hr = pAudioClient->Initialize(
            AUDCLNT_SHAREMODE_SHARED,
            AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
            hnsBufferDuration,
            0,
            pMixFormat,
            NULL
        );
    }

    if (FAILED(hr)) {
        std::cerr << "[WASAPI Capture] Initialize classic loopback failed: 0x" << std::hex << hr << std::endl;
        CoTaskMemFree(pMixFormat);
        return 1;
    }

    HANDLE hAudioSamplesEvent = CreateEvent(NULL, FALSE, FALSE, NULL);
    pAudioClient->SetEventHandle(hAudioSamplesEvent);

    int exitCode = RunCaptureLoop(pAudioClient.Get(), hAudioSamplesEvent, pMixFormat);

    CloseHandle(hAudioSamplesEvent);
    CoTaskMemFree(pMixFormat);
    return exitCode;
}

int main(int argc, char* argv[]) {
    _setmode(_fileno(stdout), _O_BINARY);
    _setmode(_fileno(stdin), _O_BINARY);

    SetConsoleCtrlHandler(ConsoleCtrlHandler, TRUE);

    DWORD targetPID = 0;
    DWORD zeroVCPID = 0;
    bool isIncludeMode = false;

    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        if (arg == "--pid" && i + 1 < argc) {
            try {
                targetPID = (DWORD)std::stoul(argv[++i]);
            } catch (...) {}
        } else if (arg == "--zerovc-pid" && i + 1 < argc) {
            try {
                zeroVCPID = (DWORD)std::stoul(argv[++i]);
            } catch (...) {}
        } else if (arg == "--hwnd" && i + 1 < argc) {
            try {
                std::string hwndStr = argv[++i];
                HWND hwnd = (HWND)(uintptr_t)std::stoull(hwndStr, nullptr, 0);
                DWORD pid = GetRealProcessIdFromWindow(hwnd);
                if (pid == 0) {
                    GetWindowThreadProcessId(hwnd, &pid);
                }
                if (pid != 0) {
                    targetPID = pid;
                    std::cerr << "[WASAPI Capture] Resolved HWND " << hwndStr << " to PID: " << targetPID << std::endl;
                }
            } catch (...) {}
        } else if (arg == "--mode" && i + 1 < argc) {
            std::string modeStr = argv[++i];
            if (modeStr == "include") {
                isIncludeMode = true;
            } else {
                isIncludeMode = false;
            }
        }
    }

    HRESULT hr = CoInitializeEx(NULL, COINIT_MULTITHREADED);
    if (FAILED(hr)) {
        std::cerr << "[WASAPI Capture] CoInitializeEx failed: 0x" << std::hex << hr << std::endl;
        return 1;
    }

    int exitCode = 0;

    if (isIncludeMode && targetPID != 0) {
        // --- 1. WINDOW / APP SPECIFIC CAPTURE (AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK + INCLUDE) ---
        std::cerr << "[WASAPI Capture] Mode: INCLUDE for Target PID: " << targetPID << std::endl;
        exitCode = StartProcessLoopback(targetPID, PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE);
        if (exitCode == -1) {
            std::cerr << "[WASAPI Capture] Process loopback INCLUDE failed, falling back to classic loopback." << std::endl;
            exitCode = StartClassicDefaultEndpointLoopback(zeroVCPID);
        }
    } else {
        // --- 2. FULL SCREEN CAPTURE (PROCESS LOOPBACK EXCLUDE ZEROVC TREE) ---
        DWORD excludePID = zeroVCPID != 0 ? zeroVCPID : (targetPID != 0 ? targetPID : GetCurrentProcessId());
        std::cerr << "[WASAPI Capture] Mode: EXCLUDE for ZeroVC PID: " << excludePID << std::endl;
        exitCode = StartProcessLoopback(excludePID, PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE);
        if (exitCode == -1) {
            std::cerr << "[WASAPI Capture] Process loopback EXCLUDE failed, falling back to classic loopback." << std::endl;
            exitCode = StartClassicDefaultEndpointLoopback(excludePID);
        }
    }

    CoUninitialize();
    return exitCode;
}

