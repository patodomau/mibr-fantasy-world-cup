import { NextResponse, type NextRequest } from "next/server";
import { optionalEnv } from "@/lib/env";
import { syncWorldCupMatches } from "@/lib/match-sync";

function isAuthorized(request: NextRequest) {
  const secret = optionalEnv("CRON_SECRET");
  if (!secret) {
    return true;
  }

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncWorldCupMatches();

  return NextResponse.json({
    scope: "daily",
    result,
  });
}
