!macro killZeroVCProcesses
  nsExec::ExecToLog 'taskkill /F /IM "ZeroVC.exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "zerovc-audio-capture.exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "zerovc-screenshare.exe" /T'
  Sleep 1500
!macroend

!macro customInit
  !insertmacro killZeroVCProcesses
!macroend

!macro customUnInit
  !insertmacro killZeroVCProcesses
!macroend

!macro customInstall
  StrCpy $launchLink "$appExe"
!macroend
