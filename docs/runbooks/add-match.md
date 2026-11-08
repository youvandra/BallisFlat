# Add a match

For the owner, or an AI agent working for the owner. Four steps; only step 3 needs the owner's wallet.

## 1. Fill one JSON file
Copy `docs/runbooks/add-match.template.json` and fill it in:

| Field | What to put | Where it comes from |
| --- | --- | --- |
| `slug` | `home-v-away`, lowercase with dashes, e.g. `england-v-wales` | the team names |
| `competition` | e.g. `UEFA Nations League 2026-27`, `International Friendly` | the organiser |
| `matchday` | the matchday number; `1` for a friendly | the organiser |
| `kickoff` | UTC, ending in `Z`, e.g. `2027-03-26T19:45:00Z` | FotMob's match page, cross-checked with the organiser |
| `home` / `away` | `code` = FIFA three-letter code, `name` = **the team name exactly as FotMob writes it**, `colour` = main kit colour as hex | FotMob for the name, the kit for the colour |
| `squadSourceUrl` | the https page the squad list came from | the federation's squad announcement |
| `squadReadOn` | the day you read it, `YYYY-MM-DD` | today |
| `players` | every called-up player of both teams: `side` (`home`/`away`), shirt `number`, full `name`, `position` (`GK`, `DF`, `MF`, `FW`) | the squad announcement |

Rules that matter:
- Write each player's name the way FotMob writes it (accents are fine). The settler bot matches FotMob's top-rated
  player to this list by name, then by surname plus shirt number. A top-rated player who is not on this list
  cannot win: the bot stops and asks a human.
- A person who already played in an earlier fixture keeps their id automatically when the team code and the
  name are the same. Do not change the spelling of an existing player.
- Kickoff must be at least 15 minutes ahead; listing closes minting at kickoff.

## 2. Check and send it
```bash
node scripts/add-match.ts my-match.json --check
API_URL=https://wif-api.ballisflat.fun ADMIN_TOKEN=… node scripts/add-match.ts my-match.json
```
`--check` lists every problem in plain words and sends nothing. The admin token is on the server:
`sudo grep ADMIN_TOKEN /etc/ballisflat/api.env`. Sending again before step 3 replaces the fixture.

## 3. List it on chain (owner wallet)
Open `https://wif.ballisflat.fun/ops`, tab **Fixtures**, unlock with the admin token. Under "Not on chain yet",
pick the match its uncalled pot rolls into, press **List on Chain** and confirm in the owner wallet. The app
takes the squad and kickoff from the API and links the fixture to its new match id by itself.

## 4. Check
- The match shows on `/matches` with both squads, and `https://wif-api.ballisflat.fun/api/board` lists it.
- `node scripts/settler.ts --network mainnet --once --dry-run` on the server prints nothing for it before
  kickoff. After full time plus 30 minutes it posts the top FotMob rating by itself (see deploy/README.md,
  "Settler bot"), and finalizes after the 2-hour window.

## If something goes wrong
- Wrong squad before listing: fix the JSON and send it again (step 2).
- Wrong squad after listing, before kickoff: the contract's `setPlayers` changes it from the owner wallet; there
  is no /ops button for it yet, so ask Claude. The API refuses to replace a listed fixture.
- The settler logs `NEEDS A HUMAN` when a match is postponed. Cards of a voided match refund at their price.
- Match postponed or abandoned: **Void Match** in /ops > Matches.
- Top-rated player missing from the squad: the settler logs `NEEDS A HUMAN`; the settler wallet proposes by
  hand in /ops > Matches with the FotMob URL.
