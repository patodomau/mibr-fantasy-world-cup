import { NextResponse, type NextRequest } from "next/server";
import { requireFantasySession } from "@/lib/auth";
import { deactivateUser, updateUserPayment } from "@/lib/fantasy-data";

export async function PATCH(request: NextRequest) {
  const session = await requireFantasySession();
  const role = session.user.mibrRole;

  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = (await request.json()) as {
    discordUserId?: unknown;
    paidEntry?: unknown;
  };

  if (typeof payload.discordUserId !== "string" || typeof payload.paidEntry !== "boolean") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  await updateUserPayment(payload.discordUserId, payload.paidEntry);

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const session = await requireFantasySession();
  const role = session.user.mibrRole;

  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = (await request.json()) as {
    discordUserId?: unknown;
  };

  if (typeof payload.discordUserId !== "string") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    await deactivateUser(payload.discordUserId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not remove user";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
