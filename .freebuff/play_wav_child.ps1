param([string]$PidFile = "", [int]$Plays = 6)
if ($PidFile -ne "") { [IO.File]::WriteAllText($PidFile, "$PID") }
Start-Sleep -Milliseconds 200
$child = Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$(Join-Path $PSScriptRoot 'play_wav.ps1')`"","-Plays","$Plays" -PassThru -WindowStyle Hidden
Wait-Process -Id $child.Id -ErrorAction SilentlyContinue
