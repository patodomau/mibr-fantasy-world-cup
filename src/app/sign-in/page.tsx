import { AuthButtons } from "@/components/auth-buttons";
import { getAuthSession, isMockAuthEnabled } from "@/lib/auth";

type SignInPageProps = {
  searchParams?: Promise<{
    callbackUrl?: string | string[];
    error?: string | string[];
  }>;
};

const authErrorMessages: Record<string, string> = {
  AccessDenied: "O Discord autenticou, mas o login nao foi concluido. Tente novamente.",
  Configuration: "A configuracao de login em producao esta incompleta.",
  OAuthCallback: "O Discord voltou para o app, mas a callback de login falhou.",
  OAuthSignin: "Nao consegui iniciar o login com Discord.",
  OAuthCreateAccount: "Nao consegui criar a sessao depois da autorizacao do Discord.",
  OAuthAccountNotLinked: "Esse Discord ja esta ligado a outra forma de login.",
  SessionRequired: "Entre com Discord para acessar o fantasy.",
  discord: "Nao consegui iniciar o login com Discord.",
};

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const session = await getAuthSession();
  const error = firstParam(params?.error);
  const callbackUrl = firstParam(params?.callbackUrl) ?? "/";
  const errorMessage = error
    ? (authErrorMessages[error] ?? "O login nao foi concluido. Tente novamente.")
    : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <section className="guild-frame w-full max-w-md bg-[var(--card)] p-6">
        <div className="relative z-10">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-emerald-300">MiBR</p>
          <h1 className="mt-2 text-3xl font-black text-amber-100">Fantasy World Cup</h1>
          <p className="mt-3 text-sm text-stone-300">
            Entre com Discord para acessar o fantasy.
          </p>
          {errorMessage ? (
            <p className="mt-4 border border-red-400/40 bg-red-950/50 px-3 py-2 text-sm font-semibold text-red-100">
              {errorMessage}
            </p>
          ) : null}
          <div className="mt-6">
            <AuthButtons
              authenticated={Boolean(session)}
              callbackUrl={callbackUrl}
              provider={isMockAuthEnabled() ? "mock" : "discord"}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
