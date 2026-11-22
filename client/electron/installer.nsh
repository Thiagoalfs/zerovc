!macro customInit
  nsExec::ExecToLog 'taskkill /F /IM "ZeroVC.exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "zerovc-audio-capture.exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "zerovc-screenshare.exe" /T'
  Sleep 500
!macroend

!macro customInstall
  StrCpy $launchLink "$appExe"
  ${if} ${isUpdated}
  ${orIf} ${isForceRun}
    Exec '"$appExe" --updated'
  ${endIf}
!macroend
