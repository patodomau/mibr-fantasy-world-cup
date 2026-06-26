import "server-only";

import { createHash, createHmac } from "node:crypto";
import { optionalEnv } from "@/lib/env";
import type {
  AdminUser,
  LeaderboardEntry,
  Match,
  MatchSyncOverview,
  KnockoutSubmission,
  PredictionDraft,
  PredictionResult,
} from "@/lib/fantasy-types";

export type AwsFantasyState = {
  matches: Match[];
  leaderboard: LeaderboardEntry[];
  adminUsers: AdminUser[];
  syncOverview: MatchSyncOverview;
  userPredictions: Record<string, PredictionResult>;
  knockoutSubmission?: KnockoutSubmission;
};

type AwsApiConfig = {
  baseUrl: string;
  keyId: string;
  secret: string;
};

function getAwsApiConfig(): AwsApiConfig | null {
  const baseUrl = optionalEnv("MIBR_AWS_API_BASE_URL");
  const keyId = optionalEnv("MIBR_AWS_API_KEY_ID");
  const secret = optionalEnv("MIBR_AWS_API_SECRET");

  if (!baseUrl || !keyId || !secret) {
    return null;
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    keyId,
    secret,
  };
}

export function isMibrAwsApiConfigured() {
  return Boolean(getAwsApiConfig());
}

function signRequest(method: string, path: string, body: string, config: AwsApiConfig) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const canonical = `${method}\n${path}\n${timestamp}\n${bodyHash}`;
  const signature = createHmac("sha256", config.secret).update(canonical).digest("hex");

  return {
    "Content-Type": "application/json",
    "X-MiBR-Key-Id": config.keyId,
    "X-MiBR-Timestamp": timestamp,
    "X-MiBR-Signature": signature,
  };
}

async function requestAwsApi<T>(method: string, path: string, payload?: unknown): Promise<T> {
  const config = getAwsApiConfig();
  if (!config) {
    throw new Error("MIBR AWS API is not configured");
  }

  const body = payload === undefined ? "" : JSON.stringify(payload);
  const response = await fetch(`${config.baseUrl}${path}`, {
    method,
    headers: signRequest(method, path.split("?")[0], body, config),
    body: method === "GET" ? undefined : body,
    cache: "no-store",
  });
  const data = (await response.json()) as { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "MIBR AWS API request failed");
  }

  return data as T;
}

export async function getAwsFantasyState(discordUserId?: string, includeAdmin = false) {
  const params = new URLSearchParams();
  if (discordUserId) {
    params.set("discordUserId", discordUserId);
  }
  if (includeAdmin) {
    params.set("includeAdmin", "true");
  }

  const query = params.toString();
  return requestAwsApi<AwsFantasyState>("GET", `/mibr/state${query ? `?${query}` : ""}`);
}

export async function saveAwsPrediction(discordUserId: string, draft: PredictionDraft) {
  await requestAwsApi("POST", "/mibr/predictions", { discordUserId, draft });
}

export async function saveAwsKnockoutSubmission(
  discordUserId: string,
  submission: Pick<KnockoutSubmission, "picks" | "championTeamId">,
) {
  return requestAwsApi<{ ok: true; knockoutSubmission: KnockoutSubmission }>("POST", "/mibr/knockout", {
    discordUserId,
    ...submission,
  });
}

export async function updateAwsUserPayment(discordUserId: string, paidEntry: boolean) {
  await requestAwsApi("PATCH", "/mibr/admin/users", { discordUserId, paidEntry });
}

export async function deactivateAwsUser(discordUserId: string) {
  await requestAwsApi("DELETE", "/mibr/admin/users", { discordUserId });
}
