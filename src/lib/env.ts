import "server-only";

export type AuthorizedRole = "owner" | "admin" | "player";

export type BootstrapAuthorizedUser = {
  discordUserId: string;
  displayLabel: string;
  role: AuthorizedRole;
};

export function optionalEnv(name: string) {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  return value.trim();
}

export function requireEnv(name: string) {
  const value = optionalEnv(name);
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

export function isEnvFlagEnabled(name: string) {
  const value = optionalEnv(name);
  return value === "1" || value?.toLowerCase() === "true";
}

export function getAuthorizedDiscordUsers(): BootstrapAuthorizedUser[] {
  const raw = optionalEnv("AUTHORIZED_DISCORD_USERS");
  if (!raw) {
    return [];
  }

  return raw
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
}

export function getBootstrapUser(discordUserId: string) {
  return getAuthorizedDiscordUsers().find((user) => user.discordUserId === discordUserId);
}
