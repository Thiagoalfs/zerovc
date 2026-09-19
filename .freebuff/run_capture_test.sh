#!/bin/bash
# Usage: run_capture_test.sh <exePath> <mode> <pid> <outPcm> <useBeepPidFile:0|1>
EXE="$1"; MODE="$2"; PIDARG="$3"; OUT="$4"; USE_PIDFILE="$5"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
rm -f /tmp/beep_pid.txt
if [ "$USE_PIDFILE" = "1" ]; then
  powershell -NoProfile -ExecutionPolicy Bypass -File "$(cygpath -w "$REPO/.freebuff/play_beep.ps1")" -Count 8 -GapMs 350 -PidFile "$(cygpath -w /tmp/beep_pid.txt)" > /dev/null 2>&1 &
else
  powershell -NoProfile -ExecutionPolicy Bypass -File "$(cygpath -w "$REPO/.freebuff/play_beep.ps1")" -Count 8 -GapMs 350 > /dev/null 2>&1 &
fi
BGPID=$!
if [ "$USE_PIDFILE" = "1" ]; then
  for i in $(seq 1 40); do [ -s /tmp/beep_pid.txt ] && break; sleep 0.1; done
  BPID=$(cat /tmp/beep_pid.txt 2>/dev/null | tr -d '\r\n ')
  [ "$PIDARG" = "BEEP" ] && PIDARG="$BPID"
fi
echo "beep PID=$BPID | testing: $EXE --mode $MODE --pid $PIDARG"
sleep 0.2
timeout 6 "$EXE" --mode "$MODE" --pid "$PIDARG" > "$OUT" 2>/tmp/test_run.log
echo "capture exit=$?"
cat /tmp/test_run.log
powershell -NoProfile -ExecutionPolicy Bypass -File "$REPO/.freebuff/analyze_pcm.ps1" -Path "$(cygpath -w "$OUT")"
wait $BGPID 2>/dev/null
