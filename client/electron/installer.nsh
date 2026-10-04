!macro customInstall
  DetailPrint "Configurando dependencias de midia (yt-dlp e ffmpeg)..."
  InitPluginsDir
  File /oname=$PLUGINSDIR\setup-dependencies.ps1 "${PROJECT_DIR}\electron\bin\setup-dependencies.ps1"
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$PLUGINSDIR\setup-dependencies.ps1"'
!macroend
