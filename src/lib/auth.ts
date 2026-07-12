import "server-only";

import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import DiscordProvider from "next-auth/providers/discord";
import { redirect } from "next/navigation";
import { resolveAuthorizedUser, upsertLoginProfile } from "@/lib/authorized-users";
import { getAuthorizedDiscordUsers, isEnvFlagEnabled, optionalEnv, requireEnv } from "@/lib/env";

function isMockAuthEnabled() {
  return isEnvFlagEnabled("MOCK_AUTH");
}

function resolveSecret() {
  return (
    optionalEnv("NEXTAUTH_SECRET") ??
    optionalEnv("AUTH_SECRET") ??
    (isMockAuthEnabled() ? "mock-dev-secret-do-not-use-in-production" : requireEnv("AUTH_SECRET"))
  );
}

function getDiscordAvatarUrl(discordId?: string, avatarHash?: string | null) {
  if (!discordId) {
    return undefined;
  }

  if (!avatarHash) {
    const defaultAvatarIndex = Number((BigInt(discordId) >> BigInt(22)) % BigInt(6));
    return `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png`;
  }

  const extension = avatarHash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.${extension}?size=128`;
}

function getDiscordProfileString(profile: unknown, field: "avatar" | "global_name" | "username") {
  if (!profile || typeof profile !== "object" || !(field in profile)) {
    return undefined;
  }

  const value = (profile as Record<typeof field, unknown>)[field];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function getDiscordDisplayLabel(profile: unknown, userName?: string | null, fallback?: string) {
  return (
    getDiscordProfileString(profile, "global_name") ??
    (typeof userName === "string" && userName.trim() !== "" ? userName.trim() : undefined) ??
    getDiscordProfileString(profile, "username") ??
    fallback
  );
}

function buildProviders() {
  if (isMockAuthEnabled()) {
    return [
      CredentialsProvider({
        name: "Mock Login",
        credentials: {
          userId: { label: "Discord ID", type: "text" },
          name: { label: "Name", type: "text" },
        },
        async authorize(credentials) {
          const fallback = getAuthorizedDiscordUsers()[0];
          const id = credentials?.userId?.trim() || fallback?.discordUserId || "mock-owner";
          const name = credentials?.name?.trim() || fallback?.displayLabel || "patodomau";

          return {
            id,
            name,
            email: `${id}@mock.local`,
            image: `https://cdn.discordapp.com/embed/avatars/${Number(id.slice(-1)) % 5}.png`,
          };
        },
      }),
    ];
  }

  return [
    DiscordProvider({
      clientId: requireEnv("DISCORD_CLIENT_ID"),
      clientSecret: requireEnv("DISCORD_CLIENT_SECRET"),
      authorization: {
        params: {
          scope: "identify",
        },
      },
      profile(profile) {
        const discordId = String(profile.id);
        const avatarHash = getDiscordProfileString(profile, "avatar");
        const displayLabel = getDiscordDisplayLabel(profile, undefined, discordId);

        return {
          id: discordId,
          name: displayLabel,
          email: null,
          image: getDiscordAvatarUrl(discordId, avatarHash),
        };
      },
    }),
  ];
}

export const authOptions: NextAuthOptions = {
  secret: resolveSecret(),
  providers: buildProviders(),
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/sign-in",
  },
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider === "credentials" && isMockAuthEnabled()) {
        return true;
      }

      const discordId =
        account?.providerAccountId ?? (profile && "id" in profile ? String(profile.id) : null);

      if (!discordId) {
        return "/unauthorized";
      }

      const avatarHash = getDiscordProfileString(profile, "avatar");
      const displayLabel = getDiscordDisplayLabel(profile, user.name, discordId);
      const discordAvatarUrl = getDiscordAvatarUrl(discordId, avatarHash);
      const authorizedUser = await resolveAuthorizedUser(discordId);
      await upsertLoginProfile({
        discordUserId: discordId,
        displayLabel: displayLabel ?? authorizedUser?.displayLabel ?? discordId,
        discordAvatarUrl,
        role: authorizedUser?.role ?? "player",
        paidEntry: authorizedUser?.paidEntry ?? false,
        active: authorizedUser?.active ?? true,
      });

      return true;
    },
    async jwt({ token, account, profile, user }) {
      if (account?.provider === "credentials") {
        token.discordId = typeof token.sub === "string" ? token.sub : user.id;
      } else if (account?.provider === "discord" && account.providerAccountId) {
        token.discordId = account.providerAccountId;
      } else if (!token.discordId && profile && "id" in profile) {
        token.discordId = String(profile.id);
      }

      const avatarHash = getDiscordProfileString(profile, "avatar");
      const displayLabel = getDiscordDisplayLabel(
        profile,
        typeof token.name === "string" ? token.name : undefined,
        token.discordId,
      );

      if (typeof token.discordId === "string" && token.discordId.trim() !== "") {
        const authorizedUser = await resolveAuthorizedUser(token.discordId);
        const discordAvatarUrl =
          authorizedUser?.discordAvatarUrl ??
          getDiscordAvatarUrl(token.discordId, avatarHash) ??
          (typeof token.picture === "string" ? token.picture : undefined);
        token.mibrRole = authorizedUser?.role;
        token.paidEntry = Boolean(authorizedUser?.paidEntry);
        token.displayLabel = displayLabel ?? authorizedUser?.displayLabel;
        token.discordAvatarUrl = discordAvatarUrl;

        if (token.displayLabel) {
          token.name = token.displayLabel;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.discordId = token.discordId;
        session.user.displayLabel = token.displayLabel;
        session.user.mibrRole = token.mibrRole;
        session.user.discordAvatarUrl = token.discordAvatarUrl;
        session.user.paidEntry = Boolean(token.paidEntry);

        if (token.displayLabel) {
          session.user.name = token.displayLabel;
        }

        if (token.discordAvatarUrl) {
          session.user.image = token.discordAvatarUrl;
        }
      }

      return session;
    },
  },
};

export async function getAuthSession() {
  return getServerSession(authOptions);
}

export async function requireFantasySession() {
  const session = await getAuthSession();
  if (!session?.user?.discordId) {
    redirect("/sign-in");
  }

  return session;
}

export { isMockAuthEnabled };
