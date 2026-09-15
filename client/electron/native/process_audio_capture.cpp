#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <iostream>
#include <vector>
#include <string>
#include <atomic>
#include <chrono>
#include <thread>
#include <io.h>
#include <fcntl.h>
#include <cmath>
#include <algorithm>

#ifndef VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK
#define VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK L"VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK"
#endif

#ifndef AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM
#define AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM 0x80000000
#endif

typedef enum PROCESS_LOOPBACK_MODE {
    PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE = 0,
    PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE = 1
} PROCESS_LOOPBACK_MODE;

typedef struct AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS {
    DWORD TargetProcessId;
    PROCESS_LOOPBACK_MODE ProcessLoopbackMode;
} AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS;

typedef enum AUDIOCLIENT_ACTIVATION_TYPE {
    AUDIOCLIENT_ACTIVATION_TYPE_DEFAULT = 0,
    AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK = 1
} AUDIOCLIENT_ACTIVATION_TYPE;

typedef struct AUDIOCLIENT_ACTIVATION_PARAMS {
    AUDIOCLIENT_ACTIVATION_TYPE ActivationType;
    union {
        AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS ProcessLoopbackParams;
    };
} AUDIOCLIENT_ACTIVATION_PARAMS;

#ifndef __IActivateAudioInterfaceCompletionHandler_INTERFACE_DEFINED__
#define __IActivateAudioInterfaceCompletionHandler_INTERFACE_DEFINED__
MIDL_INTERFACE("41d949ab-9862-444a-80f6-c261334da5eb")
IActivateAudioInterfaceCompletionHandler : public IUnknown {
public:
    virtual HRESULT STDMETHODCALLTYPE ActivateCompleted(
        struct IActivateAudioInterfaceAsyncOperation *activateOperation) = 0;
};
#endif

#ifndef __IActivateAudioInterfaceAsyncOperation_INTERFACE_DEFINED__
#define __IActivateAudioInterfaceAsyncOperation_INTERFACE_DEFINED__
MIDL_INTERFACE("72a2e436-4f2a-4bb8-82c1-e5fa143121c1")
IActivateAudioInterfaceAsyncOperation : public IUnknown {
public:
    virtual HRESULT STDMETHODCALLTYPE GetActivateResult(
        HRESULT *activateResult,
        IUnknown **activatedInterface) = 0;
};
#endif

typedef HRESULT (WINAPI *pfn_ActivateAudioInterfaceAsync)(
    LPCWSTR deviceInterfacePath,
    REFIID riid,
    PROPVARIANT *activationParams,
    IActivateAudioInterfaceCompletionHandler *completionHandler,
    IActivateAudioInterfaceAsyncOperation **activationOperation
);

static std::atomic<bool> g_bRunning(true);

BOOL WINAPI ConsoleCtrlHandler(DWORD dwCtrlType) {
    if (dwCtrlType == CTRL_C_EVENT || dwCtrlType == CTRL_BREAK_EVENT || dwCtrlType == CTRL_CLOSE_EVENT) {
        g_bRunning = false;
        return TRUE;
    }
    return FALSE;
}

// Simple COM Helper Pointer
template <typename T>
class CComPtr {
private:
    T* p;
public:
    CComPtr() : p(nullptr) {}
    CComPtr(T* lp) : p(lp) { if (p) p->AddRef(); }
    ~CComPtr() { if (p) p->Release(); }
    T* operator->() const { return p; }
    T* Get() const { return p; }
    T** operator&() { if (p) { p->Release(); p = nullptr; } return &p; }
    operator T*() const { return p; }
    void Release() { if (p) { p->Release(); p = nullptr; } }
};

class AudioLoopbackActivator : public IActivateAudioInterfaceCompletionHandler {
private:
    std::atomic<ULONG> m_refCount;
public:
    HANDLE m_hCompletedEvent;
    HRESULT m_hrResult;
    CComPtr<IAudioClient> m_pAudioClient;

    AudioLoopbackActivator() : m_refCount(1), m_hrResult(E_FAIL) {
        m_hCompletedEvent = CreateEvent(NULL, FALSE, FALSE, NULL);
    }

    virtual ~AudioLoopbackActivator() {
        if (m_hCompletedEvent) {
            CloseHandle(m_hCompletedEvent);
        }
    }

    STDMETHODIMP QueryInterface(REFIID riid, void** ppvObject) override {
        if (!ppvObject) return E_POINTER;
        if (riid == IID_IUnknown || riid == __uuidof(IActivateAudioInterfaceCompletionHandler)) {
            *ppvObject = static_cast<IActivateAudioInterfaceCompletionHandler*>(this);
            AddRef();
            return S_OK;
        }
        *ppvObject = nullptr;
        return E_NOINTERFACE;
    }

    STDMETHODIMP_(ULONG) AddRef() override {
        return ++m_refCount;
    }

    STDMETHODIMP_(ULONG) Release() override {
        ULONG count = --m_refCount;
        if (count == 0) {
            delete this;
        }
        return count;
    }

    STDMETHODIMP ActivateCompleted(IActivateAudioInterfaceAsyncOperation *operation) override {
        IUnknown *punk = nullptr;
        m_hrResult = operation->GetActivateResult(&m_hrResult, &punk);
        if (SUCCEEDED(m_hrResult) && punk) {
            punk->QueryInterface(__uuidof(IAudioClient), (void**)&m_pAudioClient);
            punk->Release();
        }
        SetEvent(m_hCompletedEvent);
        return S_OK;
    }
};

class AudioFormatConverter {
public:
    int srcSampleRate = 48000;
    int srcChannels = 2;
    int srcBitsPerSample = 32;
    bool isFloat = true;
    int bytesPerSample = 4;
    int bytesPerFrame = 8;
    double step = 1.0;
    double phase = 0.0;

    std::vector<float> inputStereoBuffer;
    std::vector<float> outputAccumulator;

    // Fixed chunk: 480 stereo frames = 960 floats = 3840 bytes (10ms at 48kHz)
    static const size_t FRAMES_PER_CHUNK = 480;
    static const size_t FLOATS_PER_CHUNK = FRAMES_PER_CHUNK * 2;

    void Configure(const WAVEFORMATEX* pwfx) {
        srcSampleRate = pwfx->nSamplesPerSec;
        srcChannels = pwfx->nChannels;
        srcBitsPerSample = pwfx->wBitsPerSample;
        bytesPerSample = srcBitsPerSample / 8;
        bytesPerFrame = pwfx->nBlockAlign;

        if (pwfx->wFormatTag == WAVE_FORMAT_IEEE_FLOAT) {
            isFloat = true;
        } else if (pwfx->wFormatTag == WAVE_FORMAT_EXTENSIBLE) {
            const WAVEFORMATEXTENSIBLE* pExt = reinterpret_cast<const WAVEFORMATEXTENSIBLE*>(pwfx);
            if (pExt->SubFormat == KSDATAFORMAT_SUBTYPE_IEEE_FLOAT) {
                isFloat = true;
            } else {
                isFloat = false;
            }
        } else {
            isFloat = false;
        }

        step = (double)srcSampleRate / 48000.0;
        phase = 0.0;
        outputAccumulator.clear();
        outputAccumulator.reserve(FLOATS_PER_CHUNK * 4);
    }

    void ProcessFrames(const BYTE* pData, UINT32 numFrames, DWORD flags) {
        if (numFrames == 0) return;

        inputStereoBuffer.resize(numFrames * 2);

        if (flags & AUDCLNT_BUFFERFLAGS_SILENT || !pData) {
            std::fill(inputStereoBuffer.begin(), inputStereoBuffer.end(), 0.0f);
        } else {
            for (UINT32 i = 0; i < numFrames; i++) {
                const BYTE* pFrame = pData + (i * bytesPerFrame);
                float left = 0.0f;
                float right = 0.0f;

                if (isFloat && bytesPerSample == 4) {
                    const float* fData = reinterpret_cast<const float*>(pFrame);
                    if (srcChannels == 1) {
                        left = right = fData[0];
                    } else if (srcChannels == 2) {
                        left = fData[0];
                        right = fData[1];
                    } else if (srcChannels >= 4) {
                        left = fData[0] + 0.707f * fData[2] + 0.707f * fData[4];
                        right = fData[1] + 0.707f * fData[2] + 0.707f * fData[5];
                    }
                } else if (!isFloat && bytesPerSample == 2) { // 16-bit PCM
                    const int16_t* sData = reinterpret_cast<const int16_t*>(pFrame);
                    if (srcChannels == 1) {
                        left = right = sData[0] / 32768.0f;
                    } else if (srcChannels >= 2) {
                        left = sData[0] / 32768.0f;
                        right = sData[1] / 32768.0f;
                    }
                } else if (!isFloat && bytesPerSample == 3) { // 24-bit PCM
                    auto read24 = [](const BYTE* b) -> float {
                        int32_t val = (int32_t)((b[0]) | (b[1] << 8) | (b[2] << 16));
                        if (val & 0x800000) val |= 0xFF000000;
                        return val / 8388608.0f;
                    };
                    if (srcChannels == 1) {
                        left = right = read24(pFrame);
                    } else if (srcChannels >= 2) {
                        left = read24(pFrame);
                        right = read24(pFrame + 3);
                    }
                } else if (!isFloat && bytesPerSample == 4) { // 32-bit PCM
                    const int32_t* iData = reinterpret_cast<const int32_t*>(pFrame);
                    if (srcChannels == 1) {
                        left = right = iData[0] / 2147483648.0f;
                    } else if (srcChannels >= 2) {
                        left = iData[0] / 2147483648.0f;
                        right = iData[1] / 2147483648.0f;
                    }
                }

                inputStereoBuffer[i * 2] = std::clamp(left, -1.0f, 1.0f);
                inputStereoBuffer[i * 2 + 1] = std::clamp(right, -1.0f, 1.0f);
            }
        }

        // Resample inputStereoBuffer to 48000Hz stereo
        while (phase < numFrames) {
            size_t idx = (size_t)phase;
            double frac = phase - idx;

            float curL = inputStereoBuffer[idx * 2];
            float curR = inputStereoBuffer[idx * 2 + 1];

            float nextL = (idx + 1 < numFrames) ? inputStereoBuffer[(idx + 1) * 2] : curL;
            float nextR = (idx + 1 < numFrames) ? inputStereoBuffer[(idx + 1) * 2 + 1] : curR;

            float outL = (float)((1.0 - frac) * curL + frac * nextL);
            float outR = (float)((1.0 - frac) * curR + frac * nextR);

            outputAccumulator.push_back(outL);
            outputAccumulator.push_back(outR);

            phase += step;
        }

        phase -= numFrames;

        // Flush full 480-frame (960 float = 3840 byte) chunks directly to stdout
        while (outputAccumulator.size() >= FLOATS_PER_CHUNK) {
            fwrite(outputAccumulator.data(), sizeof(float), FLOATS_PER_CHUNK, stdout);
            fflush(stdout);
            outputAccumulator.erase(outputAccumulator.begin(), outputAccumulator.begin() + FLOATS_PER_CHUNK);
        }
    }

    void EmitSilenceChunk() {
        std::vector<float> silence(FLOATS_PER_CHUNK, 0.0f);
        fwrite(silence.data(), sizeof(float), FLOATS_PER_CHUNK, stdout);
        fflush(stdout);
    }
};

WAVEFORMATEX* GetDefaultDeviceMixFormat() {
    CComPtr<IMMDeviceEnumerator> pEnumerator;
    HRESULT hr = CoCreateInstance(
        __uuidof(MMDeviceEnumerator),
        NULL,
        CLSCTX_ALL,
        __uuidof(IMMDeviceEnumerator),
        (void**)&pEnumerator
    );
    if (FAILED(hr) || !pEnumerator) return nullptr;

    CComPtr<IMMDevice> pDevice;
    hr = pEnumerator->GetDefaultAudioEndpoint(eRender, eConsole, &pDevice);
    if (FAILED(hr) || !pDevice) return nullptr;

    CComPtr<IAudioClient> pAudioClient;
    hr = pDevice->Activate(__uuidof(IAudioClient), CLSCTX_ALL, NULL, (void**)&pAudioClient);
    if (FAILED(hr) || !pAudioClient) return nullptr;

    WAVEFORMATEX* pMixFormat = nullptr;
    pAudioClient->GetMixFormat(&pMixFormat);
    return pMixFormat;
}

int RunCaptureLoop(IAudioClient* pAudioClient, HANDLE hAudioSamplesEvent, const WAVEFORMATEX* pwfx) {
    CComPtr<IAudioCaptureClient> pCaptureClient;
    HRESULT hr = pAudioClient->GetService(__uuidof(IAudioCaptureClient), (void**)&pCaptureClient);
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

    std::cerr << "[WASAPI Capture] Started capture loop -> 48000Hz Stereo Float32" << std::endl;

    BYTE* pData = NULL;
    UINT32 numFramesAvailable = 0;
    DWORD flags = 0;
    auto lastActiveTime = std::chrono::steady_clock::now();

    while (g_bRunning) {
        WaitForSingleObject(hAudioSamplesEvent, 15);

        hr = pCaptureClient->GetNextPacketSize(&numFramesAvailable);
        bool hadPackets = false;

        while (SUCCEEDED(hr) && numFramesAvailable > 0) {
            hr = pCaptureClient->GetBuffer(&pData, &numFramesAvailable, &flags, NULL, NULL);
            if (SUCCEEDED(hr)) {
                converter.ProcessFrames(pData, numFramesAvailable, flags);
                pCaptureClient->ReleaseBuffer(numFramesAvailable);
                hadPackets = true;
                lastActiveTime = std::chrono::steady_clock::now();
            }
            hr = pCaptureClient->GetNextPacketSize(&numFramesAvailable);
        }

        // If no audio packet has arrived in 25ms, emit a silence chunk to keep Web Audio clock running
        auto now = std::chrono::steady_clock::now();
        if (!hadPackets && std::chrono::duration_cast<std::chrono::milliseconds>(now - lastActiveTime).count() >= 20) {
            converter.EmitSilenceChunk();
            lastActiveTime = now;
        }
    }

    pAudioClient->Stop();
    return 0;
}

int StartProcessLoopback(DWORD zeroVCPID) {
    HMODULE hMmdevapi = LoadLibraryW(L"mmdevapi.dll");
    if (!hMmdevapi) {
        std::cerr << "[WASAPI Capture] mmdevapi.dll not available." << std::endl;
        return -1;
    }

    auto pfnActivate = (pfn_ActivateAudioInterfaceAsync)GetProcAddress(hMmdevapi, "ActivateAudioInterfaceAsync");
    if (!pfnActivate) {
        std::cerr << "[WASAPI Capture] ActivateAudioInterfaceAsync not found in mmdevapi.dll." << std::endl;
        FreeLibrary(hMmdevapi);
        return -1;
    }

    AUDIOCLIENT_ACTIVATION_PARAMS params = {};
    params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
    params.ProcessLoopbackParams.TargetProcessId = zeroVCPID;
    params.ProcessLoopbackParams.ProcessLoopbackMode = PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE;

    PROPVARIANT activateParams = {};
    activateParams.vt = VT_BLOB;
    activateParams.blob.cbSize = sizeof(params);
    activateParams.blob.pBlobData = (BYTE*)&params;

    AudioLoopbackActivator* pActivator = new AudioLoopbackActivator();
    CComPtr<IActivateAudioInterfaceAsyncOperation> pAsyncOp;

    HRESULT hr = pfnActivate(
        VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
        __uuidof(IAudioClient),
        &activateParams,
        pActivator,
        &pAsyncOp
    );

    if (FAILED(hr)) {
        std::cerr << "[WASAPI Capture] ActivateAudioInterfaceAsync failed: 0x" << std::hex << hr << std::endl;
        pActivator->Release();
        FreeLibrary(hMmdevapi);
        return -1;
    }

    WaitForSingleObject(pActivator->m_hCompletedEvent, 3000);

    if (FAILED(pActivator->m_hrResult) || !pActivator->m_pAudioClient) {
        std::cerr << "[WASAPI Capture] Activation result failed: 0x" << std::hex << pActivator->m_hrResult << std::endl;
        pActivator->Release();
        FreeLibrary(hMmdevapi);
        return -1;
    }

    CComPtr<IAudioClient> pAudioClient = pActivator->m_pAudioClient;

    WAVEFORMATEX* pMixFormat = nullptr;
    hr = pAudioClient->GetMixFormat(&pMixFormat);
    if (FAILED(hr) || !pMixFormat) {
        pMixFormat = GetDefaultDeviceMixFormat();
    }

    if (!pMixFormat) {
        std::cerr << "[WASAPI Capture] Failed to retrieve native mix format." << std::endl;
        pActivator->Release();
        FreeLibrary(hMmdevapi);
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
        pActivator->Release();
        FreeLibrary(hMmdevapi);
        return -1;
    }

    HANDLE hAudioSamplesEvent = CreateEvent(NULL, FALSE, FALSE, NULL);
    pAudioClient->SetEventHandle(hAudioSamplesEvent);

    int exitCode = RunCaptureLoop(pAudioClient.Get(), hAudioSamplesEvent, pMixFormat);

    CloseHandle(hAudioSamplesEvent);
    CoTaskMemFree(pMixFormat);
    pActivator->Release();
    FreeLibrary(hMmdevapi);
    return exitCode;
}

int StartClassicDefaultEndpointLoopback() {
    std::cerr << "[WASAPI Capture] Mode: FULL SCREEN DEFAULT ENDPOINT LOOPBACK (Fallback)" << std::endl;

    CComPtr<IMMDeviceEnumerator> pEnumerator;
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

    CComPtr<IMMDevice> pDevice;
    hr = pEnumerator->GetDefaultAudioEndpoint(eRender, eConsole, &pDevice);
    if (FAILED(hr) || !pDevice) {
        std::cerr << "[WASAPI Capture] GetDefaultAudioEndpoint failed: 0x" << std::hex << hr << std::endl;
        return 1;
    }

    CComPtr<IAudioClient> pAudioClient;
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

    DWORD zeroVCPID = 0;

    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        if ((arg == "--zerovc-pid" || arg == "--pid") && i + 1 < argc) {
            try {
                zeroVCPID = (DWORD)std::stoul(argv[++i]);
            } catch (...) {}
        }
    }

    if (zeroVCPID == 0) {
        zeroVCPID = GetCurrentProcessId();
    }

    HRESULT hr = CoInitializeEx(NULL, COINIT_MULTITHREADED);
    if (FAILED(hr)) {
        std::cerr << "[WASAPI Capture] CoInitializeEx failed: 0x" << std::hex << hr << std::endl;
        return 1;
    }

    std::cerr << "[WASAPI Capture] Initializing EXCLUDE mode for ZeroVC PID: " << zeroVCPID << std::endl;
    int exitCode = StartProcessLoopback(zeroVCPID);
    if (exitCode == -1) {
        std::cerr << "[WASAPI Capture] Process loopback EXCLUDE failed, falling back to classic loopback." << std::endl;
        exitCode = StartClassicDefaultEndpointLoopback();
    }

    CoUninitialize();
    return exitCode;
}
