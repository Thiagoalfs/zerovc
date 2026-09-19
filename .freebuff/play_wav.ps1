param([int]$Plays = 6, [string]$PidFile = "")
Add-Type -AssemblyName System.Media
if ($PidFile -ne "") { [IO.File]::WriteAllText($PidFile, "$PID") }
Start-Sleep -Milliseconds 300
$wav = "$env:WINDIR\Media\Windows Ding.wav"
if (-not (Test-Path $wav)) { $wav = "$env:WINDIR\Media\Alarm01.wav" }
for ($i = 0; $i -lt $Plays; $i++) {
    try { (New-Object System.Media.SoundPlayer $wav).PlaySync() } catch {}
    Start-Sleep -Milliseconds 200
}
