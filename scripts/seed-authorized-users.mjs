import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const rawUsers = process.env.AUTHORIZED_DISCORD_USERS;

if (!rawUsers) {
  console.error("AUTHORIZED_DISCORD_USERS is required.");
  process.exit(1);
}

const users = rawUsers
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean)
  .map((item) => {
    const [discordUserId, displayLabel = discordUserId, role = "player"] = item.split(":");
    const normalizedRole = role === "owner" || role === "admin" ? role : "player";

    return {
      discordUserId,
      displayLabel,
      role: normalizedRole,
    };
  });

const sql = neon(databaseUrl);

for (const user of users) {
  await sql`
    insert into mibr_fantasy_world_cup.authorized_users (
      discord_user_id,
      display_label,
      role,
      active,
      updated_at
    )
    values (
      ${user.discordUserId},
      ${user.displayLabel},
      ${user.role},
      true,
      now()
    )
    on conflict (discord_user_id) do update
    set display_label = excluded.display_label,
        role = excluded.role,
        active = true,
        updated_at = now()
  `;
}

console.log(`Seeded ${users.length} MiBR fantasy authorized users.`);
