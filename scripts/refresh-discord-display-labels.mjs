import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
const botToken = process.env.DISCORD_BOT_TOKEN;
const apply = process.argv.includes("--apply");

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

if (!botToken) {
  console.error("DISCORD_BOT_TOKEN is required to fetch users by Discord ID.");
  process.exit(1);
}

function displayLabelFromDiscordUser(user) {
  if (typeof user.global_name === "string" && user.global_name.trim() !== "") {
    return user.global_name.trim();
  }

  if (typeof user.username === "string" && user.username.trim() !== "") {
    return user.username.trim();
  }

  return user.id;
}

async function fetchDiscordUser(discordUserId) {
  const response = await fetch(`https://discord.com/api/v10/users/${discordUserId}`, {
    headers: {
      Authorization: `Bot ${botToken}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord ${response.status}: ${body.slice(0, 160)}`);
  }

  return response.json();
}

const sql = neon(databaseUrl);
const users = await sql`
  select discord_user_id, display_label
  from mibr_fantasy_world_cup.authorized_users
  where active = true
  order by display_label asc
`;

const summary = {
  checked: 0,
  updated: 0,
  unchanged: 0,
  failed: 0,
  apply,
  changes: [],
  failures: [],
};

for (const user of users) {
  summary.checked += 1;

  try {
    const discordUser = await fetchDiscordUser(user.discord_user_id);
    const nextDisplayLabel = displayLabelFromDiscordUser(discordUser);

    if (nextDisplayLabel === user.display_label) {
      summary.unchanged += 1;
      continue;
    }

    summary.changes.push({
      discordUserId: user.discord_user_id,
      before: user.display_label,
      after: nextDisplayLabel,
    });

    if (apply) {
      await sql`
        update mibr_fantasy_world_cup.authorized_users
        set display_label = ${nextDisplayLabel},
            updated_at = now()
        where discord_user_id = ${user.discord_user_id}
      `;
    }

    summary.updated += 1;
  } catch (error) {
    summary.failed += 1;
    summary.failures.push({
      discordUserId: user.discord_user_id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

console.log(JSON.stringify(summary, null, 2));
