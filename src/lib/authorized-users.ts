import "server-only";

import { neon } from "@neondatabase/serverless";
import { getBootstrapUser, optionalEnv, type AuthorizedRole } from "@/lib/env";
import { getAwsFantasyState, isMibrAwsApiConfigured } from "@/lib/mibr-aws-api";

export type AuthorizedUser = {
  discordUserId: string;
  displayLabel: string;
  discordAvatarUrl?: string;
  role: AuthorizedRole;
  paidEntry: boolean;
  active: boolean;
};

type AuthorizedUserRow = {
  discord_user_id: string;
  display_label: string;
  discord_avatar_url: string | null;
  role: AuthorizedRole;
  paid_entry: boolean;
  active: boolean;
};

export async function getDatabaseAuthorizedUser(discordUserId: string) {
  if (isMibrAwsApiConfigured()) {
    try {
      const state = await getAwsFantasyState(discordUserId, true);
      const user = state.adminUsers.find((candidate) => candidate.discordUserId === discordUserId);

      if (!user) {
        return { status: "ready" as const, user: null };
      }

      return {
        status: "ready" as const,
        user: {
          discordUserId: user.discordUserId,
          displayLabel: user.displayLabel,
          discordAvatarUrl: user.discordAvatarUrl,
          role: user.role,
          paidEntry: user.paidEntry,
          active: true,
        },
      };
    } catch (error) {
      console.error("Failed to load MiBR fantasy authorized user from AWS API", error);
      return { status: "error" as const, user: null };
    }
  }

  const databaseUrl = optionalEnv("DATABASE_URL");
  if (!databaseUrl) {
    return { status: "unavailable" as const, user: null };
  }

  try {
    const sql = neon(databaseUrl);
    const rows = (await sql`
      select discord_user_id, display_label, discord_avatar_url, role, paid_entry, active
      from mibr_fantasy_world_cup.authorized_users
      where discord_user_id = ${discordUserId}
      limit 1
    `) as AuthorizedUserRow[];
    const row = rows[0];

    if (!row) {
      return { status: "ready" as const, user: null };
    }

    return {
      status: "ready" as const,
      user: {
        discordUserId: row.discord_user_id,
        displayLabel: row.display_label,
        discordAvatarUrl: row.discord_avatar_url ?? undefined,
        role: row.role,
        paidEntry: row.paid_entry,
        active: row.active,
      },
    };
  } catch (error) {
    console.error("Failed to load MiBR fantasy authorized user", error);
    return { status: "error" as const, user: null };
  }
}

export async function upsertLoginProfile(user: AuthorizedUser) {
  if (isMibrAwsApiConfigured()) {
    return;
  }

  const databaseUrl = optionalEnv("DATABASE_URL");
  if (!databaseUrl) {
    return;
  }

  try {
    const sql = neon(databaseUrl);
    await sql`
      insert into mibr_fantasy_world_cup.authorized_users (
        discord_user_id,
        display_label,
        discord_avatar_url,
        role,
        paid_entry,
        active,
        last_login_at,
        updated_at
      )
      values (
        ${user.discordUserId},
        ${user.displayLabel},
        ${user.discordAvatarUrl ?? null},
        ${user.role},
        ${user.paidEntry},
        ${user.active},
        now(),
        now()
      )
      on conflict (discord_user_id) do update
      set display_label = excluded.display_label,
          discord_avatar_url = coalesce(
            nullif(excluded.discord_avatar_url, ''),
            mibr_fantasy_world_cup.authorized_users.discord_avatar_url
          ),
          role = case
            when excluded.role in ('owner', 'admin') then excluded.role
            else mibr_fantasy_world_cup.authorized_users.role
          end,
          last_login_at = now(),
          updated_at = now()
    `;
  } catch (error) {
    console.error("Failed to upsert MiBR fantasy login profile", error);
  }
}

export async function resolveAuthorizedUser(discordUserId: string): Promise<AuthorizedUser | null> {
  const bootstrap = getBootstrapUser(discordUserId);
  const databaseResult = await getDatabaseAuthorizedUser(discordUserId);

  if (databaseResult.status === "ready") {
    if (databaseResult.user?.active) {
      if (bootstrap && (bootstrap.role === "owner" || bootstrap.role === "admin")) {
        return {
          ...databaseResult.user,
          role: bootstrap.role,
        };
      }

      return databaseResult.user;
    }

    if (databaseResult.user) {
      return null;
    }

    if (!bootstrap) {
      return null;
    }

    return {
      discordUserId,
      displayLabel: bootstrap.displayLabel,
      role: bootstrap.role,
      paidEntry: false,
      active: true,
    };
  }

  if (!bootstrap) {
    return null;
  }

  return {
    discordUserId,
    displayLabel: bootstrap.displayLabel,
    role: bootstrap.role,
    paidEntry: false,
    active: true,
  };
}
