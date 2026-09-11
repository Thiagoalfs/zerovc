#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <wrl/implements.h>
#include <iostream>
#include <vector>
#include <string>
#include <io.h>
#include <fcntl.h>
#include <atomic>
#include <chrono>
#include <thread>
#include <cstdint>

using namespace Microsoft::WRL;

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

std::atomic<bool> g_bRunning(true);

BOOL WINAPI ConsoleCtrlHandler(DWORD ctrlType) {
    if (ctrlType == CTRL_C_EVENT || ctrlType == CTRL_BREAK_EVENT || ctrlType == CTRL_CLOSE_EVENT) {
        g_bRunning = false;
        return TRUE;
    }
    return FALSE;
}

int main(int argc, char* argv[]) {
    _setmode(_fileno(stdout), _O_BINARY);
    _setmode(_fileno(stdin), _O_BINARY);

    SetConsoleCtrlHandler(ConsoleCtrlHandler, TRUE);

    DWORD targetPID = 0;
    PROCESS_LOOPBACK_MODE loopbackMode = PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE;

    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        if (arg == "--pid" && i + 1 < argc) {
            targetPID = (DWORD)std::stoul(argv[++i]);
        } else if (arg == "--mode" && i + 1 < argc) {
            std::string modeStr = argv[++i];
            if (modeStr == "include") {
                loopbackMode = PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE;
            } else {
                loopbackMode = PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE;
            }
        }
    }

    if (targetPID == 0) {
        targetPID = GetCurrentProcessId();
    }

    HRESULT hr = CoInitializeEx(NULL, COINIT_MULTITHREADED);
    if (FAILED(hr)) {
        std::cerr << "[WASAPI Capture] CoInitializeEx failed: " << std::hex << hr << std::endl;
        return 1;
    }

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

    hr = ActivateAudioInterfaceAsync(
        VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
        __uuidof(IAudioClient),
        &activateParams,
        pActivator.Get(),
        &pAsyncOp
    );

    if (FAILED(hr)) {
        std::cerr << "[WASAPI Capture] ActivateAudioInterfaceAsync failed: " << std::hex << hr << std::endl;
        CoUninitialize();
        return 1;
    }

    WaitForSingleObject(pActivator->m_hCompletedEvent, 3000);

    if (FAILED(pActivator->m_hrResult) || !pActivator->m_pAudioClient) {
        std::cerr << "[WASAPI Capture] Activation result failed: " << std::hex << pActivator->m_hrResult << std::endl;
        CoUninitialize();
        return 1;
    }

    ComPtr<IAudioClient> pAudioClient = pActivator->m_pAudioClient;

    WAVEFORMATEX* pMixFormat = NULL;
    hr = pAudioClient->GetMixFormat(&pMixFormat);
    if (FAILED(hr) || !pMixFormat) {
        std::cerr << "[WASAPI Capture] GetMixFormat failed: " << std::hex << hr << std::endl;
        CoUninitialize();
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
            AUDCLNT_STREAMFLAGS_LOOPBACK,
            hnsBufferDuration,
            0,
            pMixFormat,
            NULL
        );
    }

    if (FAILED(hr)) {
        std::cerr << "[WASAPI Capture] IAudioClient Initialize failed: " << std::hex << hr << std::endl;
        CoTaskMemFree(pMixFormat);
        CoUninitialize();
        return 1;
    }

    HANDLE hAudioSamplesEvent = CreateEvent(NULL, FALSE, FALSE, NULL);
    pAudioClient->SetEventHandle(hAudioSamplesEvent);

    ComPtr<IAudioCaptureClient> pCaptureClient;
    hr = pAudioClient->GetService(__uuidof(IAudioCaptureClient), &pCaptureClient);
    if (FAILED(hr)) {
        std::cerr << "[WASAPI Capture] GetService IAudioCaptureClient failed: " << std::hex << hr << std::endl;
        CoTaskMemFree(pMixFormat);
        CoUninitialize();
        return 1;
    }

    hr = pAudioClient->Start();
    if (FAILED(hr)) {
        std::cerr << "[WASAPI Capture] AudioClient Start failed: " << std::hex << hr << std::endl;
        CoTaskMemFree(pMixFormat);
        CoUninitialize();
        return 1;
    }

    std::cerr << "[WASAPI Capture] Loopback Started. Rate: " << pMixFormat->nSamplesPerSec 
              << " Channels: " << pMixFormat->nChannels 
              << " Bits: " << pMixFormat->wBitsPerSample << std::endl;

    const int bytesPerFrame = pMixFormat->nBlockAlign;
    BYTE* pData = NULL;
    UINT32 numFramesAvailable = 0;
    DWORD flags = 0;
    std::vector<float> floatConvertBuffer;

    while (g_bRunning) {
        WaitForSingleObject(hAudioSamplesEvent, 20);

        hr = pCaptureClient->GetNextPacketSize(&numFramesAvailable);
        while (SUCCEEDED(hr) && numFramesAvailable > 0) {
            hr = pCaptureClient->GetBuffer(&pData, &numFramesAvailable, &flags, NULL, NULL);
            if (SUCCEEDED(hr)) {
                if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
                    floatConvertBuffer.assign(numFramesAvailable * pMixFormat->nChannels, 0.0f);
                    fwrite(floatConvertBuffer.data(), sizeof(float), floatConvertBuffer.size(), stdout);
                } else if (pData) {
                    if (pMixFormat->wBitsPerSample == 32) {
                        fwrite(pData, 1, numFramesAvailable * bytesPerFrame, stdout);
                    } else if (pMixFormat->wBitsPerSample == 16) {
                        int16_t* pSamples16 = (int16_t*)pData;
                        size_t sampleCount = numFramesAvailable * pMixFormat->nChannels;
                        floatConvertBuffer.resize(sampleCount);
                        for (size_t s = 0; s < sampleCount; s++) {
                            floatConvertBuffer[s] = (float)pSamples16[s] / 32768.0f;
                        }
                        fwrite(floatConvertBuffer.data(), sizeof(float), sampleCount, stdout);
                    } else {
                        fwrite(pData, 1, numFramesAvailable * bytesPerFrame, stdout);
                    }
                }
                fflush(stdout);
                pCaptureClient->ReleaseBuffer(numFramesAvailable);
            }
            hr = pCaptureClient->GetNextPacketSize(&numFramesAvailable);
        }
    }

    pAudioClient->Stop();
    CloseHandle(hAudioSamplesEvent);
    if (pMixFormat) CoTaskMemFree(pMixFormat);
    CoUninitialize();

    return 0;
}
