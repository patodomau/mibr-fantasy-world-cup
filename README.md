# MiBR Fantasy World Cup

Private fantasy game for the `[MiBR] Made in Brazil` guild during the 2026 World Cup.

The app is built for:

- Discord login through `next-auth`
- access for any authenticated Discord user
- Discord avatar capture for ranking/admin identification
- Neon Postgres persistence under `mibr_fantasy_world_cup.*`
- Vercel deployment and cron routes
- fixture/status sync through ESPN Scoreboard

## Current MVP

- Mock fixture list for the first visible game cards
- Games panel grouped by tournament stage
- Ranking panel
- Bracket panel
- Admin placeholder panel for authorized admin users
- PT-BR / EN toggle
- Localized kickoff and lock times
- Client-side prediction validation:
  - winner correct = 3 points
  - exact score = 2 points
  - both = 5 points
  - lock time = kickoff minus 5 minutes
  - score values must be positive integers or zero
  - selected result must match the guessed score

## Data Source

Runtime fixture, status, and score updates use the public ESPN Scoreboard endpoint for `fifa.world`.

Vercel Hobby accounts only support daily cron jobs, so this app uses one daily sync. The cron route runs once per day in UTC and refreshes the surrounding date range.

## Setup

Install dependencies:

```bash
npm install
```

Create local env:

```bash
cp .env.example .env.local
```

For mock local development:

```env
MOCK_AUTH=true
NEXTAUTH_SECRET=local-development-secret
AUTHORIZED_DISCORD_USERS=193339239037927425:patodomau:owner,1248782223163916374:Ladock:admin
```

`AUTHORIZED_DISCORD_USERS` assigns bootstrap roles for local development; it does not restrict site access.

For production:

```env
MOCK_AUTH=false
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
NEXTAUTH_URL=https://mibr-fantasy-world-cup.vercel.app
NEXTAUTH_SECRET=replace-with-a-long-random-secret
DISCORD_CLIENT_ID=replace-with-discord-client-id
DISCORD_CLIENT_SECRET=replace-with-discord-client-secret
CRON_SECRET=replace-with-random-cron-secret
```

Apply DB schema:

```bash
npm run db:schema
```

Trigger the same production sync route manually, outside the Vercel cron:

```bash
npm run sync:manual
```

For a live/finished status refresh:

```bash
npm run sync:manual:live
```

The manual script reads `.env.local`, uses `NEXTAUTH_URL` or `MIBR_SYNC_URL` as
the target URL, and sends `CRON_SECRET` as the bearer token when it exists.
Vercel cron stays active independently.

Run locally:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Vercel

Project name:

- `mibr-fantasy-world-cup`

Suggested production URL:

- `https://mibr-fantasy-world-cup.vercel.app`

Discord OAuth redirect URL:

```text
https://mibr-fantasy-world-cup.vercel.app/api/auth/callback/discord
```
