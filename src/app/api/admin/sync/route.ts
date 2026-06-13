import { NextResponse } from "next/server";
import { requireFantasySession } from "@/lib/auth";
import { syncLiveWorldCupMatches } from "@/lib/match-sync";

export async function POST() {
  const session = await requireFantasySession();
  const role = session.user.mibrRole;

  if (role !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await syncLiveWorldCupMatches();

  return NextResponse.json({
    ok: true,
    scope: "live",
    result,
  });
}
