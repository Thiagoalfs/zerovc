#!/bin/bash
# Test C: INCLUDE mode targeting the actual beep process PID
REPO="$(cd "$(dirname "$0")/.." && pwd)"
EXE="$REPO/client/electron/bin/zerovc-audio-capture.exe"
rm -f /tmp/beep_pid.txt
powershell -NoProfile -ExecutionPolicy Bypass -File "$(cygpath -w "$REPO/.freebuff/play_beep.ps1")" -Count 8 -GapMs 350 -PidFile "$(cygpath -w /tmp/beep_pid.txt)" > /dev/null 2>&1 &
for i in $(seq 1 40); do
  [ -s /tmp/beep_pid.txt ] && break
  sleep 0.1
done
BPID=$(cat /tmp/beep_pid.txt 2>/dev/null | tr -d '\r\n ')
echo "beep PID=$BPID"
timeout 6 "$EXE" --mode include --pid "$BPID" > /tmp/testC.pcm 2>/tmp/testC.log
echo "capture exit=$?"
