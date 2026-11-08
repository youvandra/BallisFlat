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
  VITE_SITE_URL=https://wif.ballisflat.fun VITE_DATA_MODE=chain VITE_NETWORK=mainnet VITE_API_URL=https://wif-api.ballisflat.fun npm run build
  grep -q 'og:image" content="https://' apps/web/dist/index.html || { echo "og:image is not absolute"; exit 1; }
  rsync -az --delete -e "ssh -i $KEY" apps/web/dist/ "$HOST:/srv/ballisflat/wif/web/"
fi

if [[ "$what" == api || "$what" == all ]]; then
  # Ship tracked files only: local notes, .env files and build output never leave this machine.
  git diff --quiet HEAD -- packages apps/indexer package.json package-lock.json \
    || { echo "commit packages/ and apps/indexer/ first: the server runs HEAD"; exit 1; }
  git ls-files -z | rsync -az --from0 --files-from=- -e "ssh -i $KEY" ./ "$HOST:/srv/ballisflat/repo/"
  "${SSH[@]}" 'cd /srv/ballisflat/repo && npm ci --omit=dev && sudo systemctl restart ballisflat-api'
  sleep 8
  curl -fsS https://wif-api.ballisflat.fun/api/board >/dev/null && echo "api ok"
fi
