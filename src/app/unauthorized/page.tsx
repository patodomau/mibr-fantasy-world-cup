import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <section className="guild-frame w-full max-w-md bg-[var(--card)] p-6">
        <div className="relative z-10">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-red-300">Sessao invalida</p>
          <h1 className="mt-2 text-3xl font-black text-amber-100">Discord nao identificado</h1>
          <p className="mt-3 text-sm text-stone-300">
            Nao foi possivel identificar sua conta do Discord. Volte e tente entrar novamente.
          </p>
          <Link
            className="mt-6 inline-block border border-amber-500/40 bg-amber-500 px-4 py-2 text-sm font-bold text-stone-950"
            href="/"
          >
            Entrar novamente
          </Link>
        </div>
      </section>
    </main>
  );
}
