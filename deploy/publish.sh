#!/usr/bin/env bash
# Builds the web app and ships web + repo to cordon-server, then restarts the API.
# Usage: deploy/publish.sh [web|api|all]   (default all)
set -euo pipefail
cd "$(dirname "$0")/.."
HOST="${BIF_HOST:-ubuntu@13.223.253.103}"
KEY="${BIF_KEY:-$HOME/.ssh/cordon-server-key.pem}"
SSH=(ssh -i "$KEY" "$HOST")
what="${1:-all}"

if [[ "$what" == web || "$what" == all ]]; then
  VITE_SITE_URL=https://ballisflat.fun VITE_DATA_MODE=chain VITE_NETWORK=mainnet VITE_API_URL=https://api.ballisflat.fun npm run build
  grep -q 'og:image" content="https://' apps/web/dist/index.html || { echo "og:image is not absolute"; exit 1; }
  rsync -az --delete -e "ssh -i $KEY" apps/web/dist/ "$HOST:/srv/ballisflat/web/"
fi

if [[ "$what" == api || "$what" == all ]]; then
  rsync -az --delete -e "ssh -i $KEY" \
    --exclude node_modules --exclude .git --exclude 'apps/web/dist' --exclude '.ponder' \
    --exclude 'packages/contracts/out' --exclude 'packages/contracts/cache' --exclude 'test-results' \
    --exclude NEXT.md --exclude 'scripts/.art-preview' \
    ./ "$HOST:/srv/ballisflat/repo/"
  "${SSH[@]}" 'cd /srv/ballisflat/repo && npm ci --omit=dev && sudo systemctl restart ballisflat-api'
  sleep 8
  curl -fsS https://api.ballisflat.fun/api/board >/dev/null && echo "api ok"
fi
