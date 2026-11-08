# Hosting runbook (cordon-server)

Profile page at https://ballisflat.fun (static, /srv/ballisflat/site). The $WIF edition is its own app: web at
https://wif.ballisflat.fun (static, /srv/ballisflat/wif/web), API at https://wif-api.ballisflat.fun (Ponder indexer + Hono,
systemd), Postgres in docker bound to 127.0.0.1. Box: cordon-server, 13.223.253.103, Ubuntu 24.04.

## Owner steps (block the rest)
1. Buy `ballisflat.fun`. DNS A records, TTL 300: `@`, `www`, `*` → 13.223.253.103 (the wildcard covers wif, wif-api, near, near-api).
   The public IP changes if the instance is stopped; an Elastic IP keeps it (same hourly IPv4 price while attached).
2. OK to open TCP 80 and 443 to 0.0.0.0/0 in security group cordon-server-sg (Caddy needs 80 for the certificate).
3. Mainnet deploy with `METADATA_BASE_URI=https://wif-api.ballisflat.fun/cards/`, then `deployments.json` `mainnet` is filled.

## One-time box setup (Claude, after the steps above)
```bash
sudo mkdir -p /srv/ballisflat/{site,wif/web,repo} /etc/ballisflat && sudo chown -R ubuntu /srv/ballisflat
# Node 24 LTS from NodeSource, Caddy from its apt repo
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy
cd /srv/ballisflat/repo/deploy && POSTGRES_PASSWORD=… docker compose up -d   # check which dockerd answers first
sudo cp deploy/api.env.example /etc/ballisflat/api.env && sudo chmod 600 /etc/ballisflat/api.env   # fill it
sudo cp deploy/ballisflat-api.service /etc/systemd/system/ && sudo systemctl enable --now ballisflat-api
```

## Every release
`deploy/publish.sh web`, `deploy/publish.sh api`, or `deploy/publish.sh` for both. It builds the web app in chain
mode against the API, refuses a build whose og:image is not absolute, and checks `/api/board` after a restart.

## Checks
- `curl -fsS https://wif-api.ballisflat.fun/ready` (Ponder is synced) and `/api/board`.
- `journalctl -u ballisflat-api -n 100`; memory is capped at 1.5 GB by the unit.
- One supervisor only: systemd. Never also pm2 or a container for the API.
