param([string]$Path, [double]$Threshold = 0.02)
$bytes = [IO.File]::ReadAllBytes($Path)
$n = [Math]::Floor($bytes.Length / 4)
$frames = [Math]::Floor($n / 2)   # interleaved stereo -> frames
if ($frames -lt 1) { Write-Output "EMPTY"; exit 0 }
$samples = New-Object System.Collections.Generic.List[double]
# read left channel only (every 2nd float) to keep memory small
$bytesPerFrame = 8
$leftFloats = [Math]::Floor($n / 2)
# Use MemoryStream + BinaryReader for speed
$ms = New-Object IO.MemoryStream (,$bytes)
$br = New-Object IO.BinaryReader ($ms)
$vals = New-Object double[] $frames
for ($f = 0; $f -lt $frames; $f++) {
    $l = $br.ReadSingle()
    $r = $br.ReadSingle()
    $vals[$f] = [Math]::Max([Math]::Abs($l), [Math]::Abs($r))
}
$br.Close(); $ms.Close()

$winFrames = 2400  # 50ms at 48kHz
$hotWins = 0; $totalWins = 0
$maxAbs = 0.0
$timeline = ""
for ($f = 0; $f -lt $frames; $f += $winFrames) {
    $end = [Math]::Min($f + $winFrames, $frames)
    $sum = 0.0
    for ($i = $f; $i -lt $end; $i++) {
        $a = $vals[$i]
        if ($a -gt $maxAbs) { $maxAbs = $a }
        $sum += $a * $a
    }
    $cnt = $end - $f
    $rms = [Math]::Sqrt($sum / $cnt)
    $totalWins++
    $mark = if ($rms -ge $Threshold) { "#" } else { "." }
    if ($rms -ge $Threshold) { $hotWins++ }
    $timeline += $mark
}
Write-Output ("frames={0} durMs={1}" -f $frames, [int]($frames / 48))
Write-Output ("maxAbs={0:N4} hotWindows(>={1})={2}/{3}" -f $maxAbs, $Threshold, $hotWins, $totalWins)
Write-Output ("timeline(50ms/win): {0}" -f $timeline)
if ($maxAbs -ge $Threshold) { Write-Output "VERDICT: AUDIO DETECTED" } else { Write-Output "VERDICT: SILENCE" }
