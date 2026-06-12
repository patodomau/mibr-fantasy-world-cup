"use client";

import { signIn, signOut } from "next-auth/react";

type Props = {
  authenticated: boolean;
  provider?: "discord" | "mock";
  callbackUrl?: string;
};

export function AuthButtons({ authenticated, provider = "discord", callbackUrl = "/" }: Props) {
  if (authenticated) {
    return (
      <button
        className="border border-amber-500/30 bg-stone-950/60 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-400 hover:bg-amber-500/10"
        onClick={() => signOut({ callbackUrl: "/" })}
        type="button"
      >
        Sair
      </button>
    );
  }

  return (
    <button
      className="bg-amber-500 px-4 py-2 text-sm font-bold text-stone-950 shadow-[0_0_24px_rgba(234,179,8,0.24)] transition hover:bg-amber-300"
      onClick={() => {
        if (provider === "mock") {
          void signIn("credentials", { callbackUrl });
          return;
        }

        void signIn("discord", { callbackUrl });
      }}
      type="button"
    >
      {provider === "mock" ? "Login mock" : "Entrar com Discord"}
    </button>
  );
}
