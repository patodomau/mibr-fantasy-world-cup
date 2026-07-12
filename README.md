# MiBR Fantasy World Cup

Private fantasy game for the `[MiBR] Made in Brazil` guild during the 2026 World Cup.

The app is built for:

- Discord login through `next-auth`
- access for any authenticated Discord user
- Discord avatar capture for ranking/admin identification
- AWS API/DynamoDB persistence for production
- Vercel deployment
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

Production live score updates are handled by the AWS EventBridge/Lambda sync path and written to DynamoDB through the signed AWS API. Vercel cron is intentionally disabled.

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
NEXTAUTH_URL=https://mibr-fantasy-world-cup.vercel.app
NEXTAUTH_SECRET=replace-with-a-long-random-secret
DISCORD_CLIENT_ID=replace-with-discord-client-id
DISCORD_CLIENT_SECRET=replace-with-discord-client-secret
MIBR_AWS_API_BASE_URL=https://replace-with-api-id.execute-api.us-east-1.amazonaws.com
MIBR_AWS_API_KEY_ID=replace-with-key-id
MIBR_AWS_API_SECRET=replace-with-hmac-secret
```

Apply DB schema:

```bash
npm run db:schema
```

Legacy Neon schema and manual Vercel sync scripts remain for local recovery/debug workflows only:

```bash
npm run sync:manual
```

For a live/finished status refresh:

```bash
npm run sync:manual:live
```

Do not use these legacy sync scripts for production score updates. Production uses the AWS sync Lambda.

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
