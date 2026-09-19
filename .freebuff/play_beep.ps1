param([int]$Count = 8, [int]$GapMs = 350, [string]$PidFile = "")
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class BeepWin {
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern bool Beep(uint dwFreq, uint dwDuration);
}
'@
if ($PidFile -ne "") { [IO.File]::WriteAllText($PidFile, "$PID") }
Start-Sleep -Milliseconds 300
for ($i = 0; $i -lt $Count; $i++) {
    [BeepWin]::Beep(880, 180) | Out-Null
    Start-Sleep -Milliseconds $GapMs
}
