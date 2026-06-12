import { NextResponse, type NextRequest } from "next/server";
import { requireFantasySession } from "@/lib/auth";
import { savePrediction } from "@/lib/fantasy-data";
import type { PredictionDraft } from "@/lib/fantasy-types";

export async function POST(request: NextRequest) {
  const session = await requireFantasySession();

  if (!session.user.discordId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json()) as PredictionDraft;

  try {
    await savePrediction(session.user.discordId, payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save pick";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
