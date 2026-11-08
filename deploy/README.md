# Hosting runbook (cordon-server)

One app. Web at https://ballisflat.fun (static, /srv/ballisflat/web), API at https://api.ballisflat.fun (Ponder indexer + Hono,
systemd), Postgres in docker bound to 127.0.0.1. Box: cordon-server, 13.223.253.103, Ubuntu 24.04.

## Owner steps (block the rest)
1. Buy `ballisflat.fun` (done 8 Nov). DNS A records, TTL 300: `@`, `www`, `*` → 13.223.253.103. `*` covers `api`; the old
   `wif` and `wif-api` names redirect to `ballisflat.fun` and `api.ballisflat.fun`.
   The public IP changes if the instance is stopped; an Elastic IP keeps it (same hourly IPv4 price while attached).
2. OK to open TCP 80 and 443 to 0.0.0.0/0 in security group cordon-server-sg (Caddy needs 80 for the certificate).
3. Mainnet deploy with `METADATA_BASE_URI=https://api.ballisflat.fun/cards/`, then `deployments.json` `mainnet` is filled.

## One-time box setup (Claude, after the steps above)
```bash
sudo mkdir -p /srv/ballisflat/{web,repo} /etc/ballisflat && sudo chown -R ubuntu /srv/ballisflat
# Node 24 LTS from NodeSource, Caddy from its apt repo
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy
cd /srv/ballisflat/repo/deploy && POSTGRES_PASSWORD=… docker compose up -d   # check which dockerd answers first
sudo cp deploy/api.env.example /etc/ballisflat/api.env && sudo chmod 600 /etc/ballisflat/api.env   # fill it
sudo cp deploy/ballisflat-api.service /etc/systemd/system/ && sudo systemctl enable --now ballisflat-api
```

## Settler bot
Posts each result from FotMob's ratings, follows FotMob during the 2h window (correct), then finalizes.
```bash
sudo install -m 600 -o root -g root deploy/settler.env.example /etc/ballisflat/settler.env   # SETTLER_KEY = owner key (owner is the settler)
sudo cp deploy/ballisflat-settler.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now ballisflat-settler.timer
node scripts/settler.ts --network mainnet --once --dry-run    # read-only check, sends nothing
journalctl -u ballisflat-settler -n 50 | grep -E "propose|correct|finalize|NEEDS A HUMAN"
```
It never guesses. "NEEDS A HUMAN" = settle or void that match from /ops (manual override always works).

## Every release
`deploy/publish.sh web`, `deploy/publish.sh api`, or `deploy/publish.sh` for both. It builds the web app in chain
mode against the API, refuses a build whose og:image is not absolute, and checks `/api/board` after a restart.

## Checks
- `curl -fsS https://api.ballisflat.fun/ready` (Ponder is synced) and `/api/board`.
- `journalctl -u ballisflat-api -n 100`; memory is capped at 1.5 GB by the unit.
- One supervisor only: systemd. Never also pm2 or a container for the API.
