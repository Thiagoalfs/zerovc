!macro customInstall
  StrCpy $launchLink "$appExe"
  ${if} ${isUpdated}
  ${orIf} ${isForceRun}
    Exec '"$appExe" --updated'
  ${endIf}
!macroend
