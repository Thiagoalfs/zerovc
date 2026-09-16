@echo off
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat" >nul 2>&1
cd /d "%~dp0..\client\electron"
cl /nologo /std:c++17 /EHsc /O2 /MT /W3 /DUNICODE /D_UNICODE native\process_audio_capture.cpp /Fe:bin\zerovc-audio-capture.exe /Fo:native\ /link ole32.lib user32.lib
