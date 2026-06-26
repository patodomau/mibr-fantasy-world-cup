import { NextResponse, type NextRequest } from "next/server";
import { requireFantasySession } from "@/lib/auth";
import { isMibrAwsApiConfigured, saveAwsKnockoutSubmission } from "@/lib/mibr-aws-api";

export async function POST(request: NextRequest) {
  const session = await requireFantasySession();

  if (!session.user.discordId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isMibrAwsApiConfigured()) {
    return NextResponse.json({ error: "Knockout bracket backend is not configured" }, { status: 400 });
  }

  const payload = (await request.json()) as {
    championTeamId?: unknown;
    picks?: unknown;
  };

  if (!payload.picks || typeof payload.picks !== "object" || typeof payload.championTeamId !== "string") {
    return NextResponse.json({ error: "Invalid knockout submission" }, { status: 400 });
  }

  try {
    const result = await saveAwsKnockoutSubmission(session.user.discordId, {
      picks: payload.picks as Record<string, string>,
      championTeamId: payload.championTeamId,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save knockout bracket";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
