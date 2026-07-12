import type { DefaultSession } from "next-auth";
import type { AuthorizedRole } from "@/lib/env";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      discordId?: string;
      displayLabel?: string;
      discordAvatarUrl?: string;
      mibrRole?: AuthorizedRole;
      paidEntry?: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    discordId?: string;
    displayLabel?: string;
    discordAvatarUrl?: string;
    mibrRole?: AuthorizedRole;
    paidEntry?: boolean;
  }
}
