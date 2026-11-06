#!/usr/bin/env bash
# Powers the art box off after IDLE_MINUTES with the GPU idle and no setup/server work running.
# GPU boxes look idle on CPU while they download or draw, so this watches the GPU instead.
#   nohup bash ~/art-server/idle-stop.sh > ~/idle-stop.log 2>&1 &
set -u
IDLE_MINUTES="${IDLE_MINUTES:-30}"
idle=0
while true; do
  util=$(nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits | head -1 | tr -d ' ')
  busy=0
  [ "${util:-0}" -gt 5 ] && busy=1
  pgrep -f "setup.sh|snapshot_download|uv pip" >/dev/null && busy=1
  if [ "$busy" = 1 ]; then idle=0; else idle=$((idle + 1)); fi
  echo "$(date -u +%H:%M) gpu=${util}% idle=${idle}m"
  if [ "$idle" -ge "$IDLE_MINUTES" ]; then
    echo "idle for ${IDLE_MINUTES}m, powering off"
    sudo shutdown -h now
  fi
  sleep 60
done
