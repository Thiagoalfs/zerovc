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

using namespace Microsoft::WRL;

// --- Signal Handling & Session Mute Management ---
std::atomic<bool> g_bRunning(true);
std::mutex g_muteMutex;

struct MutedSessionInfo {
    DWORD pid;
    ComPtr<ISimpleAudioVolume> pVolume;
};
std::vector<MutedSessionInfo> g_mutedSessions;

void RestoreMutedSessions() {
    std::lock_guard<std::mutex> lock(g_muteMutex);
    for (auto& info : g_mutedSessions) {
        if (info.pVolume) {
            info.pVolume->SetMute(FALSE, NULL);
        }
    }
    g_mutedSessions.clear();
}

BOOL WINAPI ConsoleCtrlHandler(DWORD ctrlType) {
    if (ctrlType == CTRL_C_EVENT || ctrlType == CTRL_BREAK_EVENT || ctrlType == CTRL_CLOSE_EVENT) {
        g_bRunning = false;
        RestoreMutedSessions();
        return TRUE;
    }
    return FALSE;
}

// Recursively find all processes in the tree rooted at rootPID
std::set<DWORD> GetProcessTreePIDs(DWORD rootPID) {
    std::set<DWORD> treePIDs;
    if (rootPID == 0) return treePIDs;

    treePIDs.insert(rootPID);

    HANDLE hSnapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (hSnapshot == INVALID_HANDLE_VALUE) {
        return treePIDs;
    }

    PROCESSENTRY32W pe;
    pe.dwSize = sizeof(PROCESSENTRY32W);

    std::map<DWORD, std::vector<DWORD>> parentToChildren;
    if (Process32FirstW(hSnapshot, &pe)) {
        do {
            parentToChildren[pe.th32ParentProcessID].push_back(pe.th32ProcessID);
        } while (Process32NextW(hSnapshot, &pe));
    }
    CloseHandle(hSnapshot);

    std::vector<DWORD> queue;
    queue.push_back(rootPID);
    size_t head = 0;
    while (head < queue.size()) {
        DWORD current = queue[head++];
        auto it = parentToChildren.find(current);
        if (it != parentToChildren.end()) {
            for (DWORD childPID : it->second) {
                if (treePIDs.find(childPID) == treePIDs.end()) {
                    treePIDs.insert(childPID);
                    queue.push_back(childPID);
                }
            }
        }
    }

    return treePIDs;
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

int RunCaptureLoop(IAudioClient* pAudioClient, HANDLE hAudioSamplesEvent) {
    WAVEFORMATEX* pMixFormat = NULL;
    HRESULT hr = pAudioClient->GetMixFormat(&pMixFormat);
    if (FAILED(hr) || !pMixFormat) {
        std::cerr << "[WASAPI Capture] GetMixFormat failed: 0x" << std::hex << hr << std::endl;
        return 1;
    }

    ComPtr<IAudioCaptureClient> pCaptureClient;
    hr = pAudioClient->GetService(__uuidof(IAudioCaptureClient), &pCaptureClient);
    if (FAILED(hr)) {
        std::cerr << "[WASAPI Capture] GetService IAudioCaptureClient failed: 0x" << std::hex << hr << std::endl;
        CoTaskMemFree(pMixFormat);
        return 1;
    }

    hr = pAudioClient->Start();
    if (FAILED(hr)) {
        std::cerr << "[WASAPI Capture] AudioClient Start failed: 0x" << std::hex << hr << std::endl;
        CoTaskMemFree(pMixFormat);
        return 1;
    }

    std::cerr << "[WASAPI Capture] Capture Started. Rate: " << pMixFormat->nSamplesPerSec
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
    if (pMixFormat) CoTaskMemFree(pMixFormat);
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

    WAVEFORMATEX* pMixFormat = NULL;
    hr = pAudioClient->GetMixFormat(&pMixFormat);
    if (FAILED(hr) || !pMixFormat) {
        std::cerr << "[WASAPI Capture] GetMixFormat failed: 0x" << std::hex << hr << std::endl;
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
            AUDCLNT_STREAMFLAGS_LOOPBACK,
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
    CoTaskMemFree(pMixFormat);

    int exitCode = RunCaptureLoop(pAudioClient.Get(), hAudioSamplesEvent);
    CloseHandle(hAudioSamplesEvent);
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

    WAVEFORMATEX* pMixFormat = NULL;
    hr = pAudioClient->GetMixFormat(&pMixFormat);
    if (FAILED(hr) || !pMixFormat) {
        std::cerr << "[WASAPI Capture] GetMixFormat failed: 0x" << std::hex << hr << std::endl;
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
        std::cerr << "[WASAPI Capture] Initialize classic loopback failed: 0x" << std::hex << hr << std::endl;
        CoTaskMemFree(pMixFormat);
        return 1;
    }

    HANDLE hAudioSamplesEvent = CreateEvent(NULL, FALSE, FALSE, NULL);
    pAudioClient->SetEventHandle(hAudioSamplesEvent);
    CoTaskMemFree(pMixFormat);

    int exitCode = RunCaptureLoop(pAudioClient.Get(), hAudioSamplesEvent);
    CloseHandle(hAudioSamplesEvent);
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
                HWND hwnd = (HWND)(uintptr_t)std::stoull(hwndStr);
                DWORD pid = GetRealProcessIdFromWindow(hwnd);
                if (pid != 0) {
                    targetPID = pid;
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

    RestoreMutedSessions();
    CoUninitialize();
    return exitCode;
}

