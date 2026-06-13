import { NextResponse } from "next/server";
import { requireFantasySession } from "@/lib/auth";
import { syncWorldCupMatches } from "@/lib/match-sync";

export async function POST() {
  const session = await requireFantasySession();
  const role = session.user.mibrRole;

  if (role !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await syncWorldCupMatches();

  return NextResponse.json({
    ok: true,
    scope: "daily",
    result,
  });
}
