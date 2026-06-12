import "server-only";

import { optionalEnv } from "@/lib/env";

type FootballDataMatch = {
  id: number;
  utcDate: string;
  status: string;
  stage: string;
  group: string | null;
  homeTeam: {
    id: number | null;
    name: string | null;
    shortName: string | null;
    tla: string | null;
    crest: string | null;
  };
  awayTeam: {
    id: number | null;
    name: string | null;
    shortName: string | null;
    tla: string | null;
    crest: string | null;
  };
  score: {
    winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
    fullTime: {
      home: number | null;
      away: number | null;
    };
  };
};

type FootballDataMatchesResponse = {
  matches: FootballDataMatch[];
};

function getThrottleHeaders(headers: Headers) {
  const throttleHeaders: Record<string, string> = {};

  headers.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey === "retry-after" ||
      normalizedKey.includes("ratelimit") ||
      normalizedKey.includes("rate-limit") ||
      normalizedKey.includes("requests")
    ) {
      throttleHeaders[key] = value;
    }
  });

  return throttleHeaders;
}

export async function fetchFootballDataMatches(params: {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
}) {
  const token = optionalEnv("FOOTBALL_DATA_API_TOKEN");
  if (!token) {
    return { status: "skipped" as const, reason: "FOOTBALL_DATA_API_TOKEN is not configured" };
  }

  const competition = optionalEnv("FOOTBALL_DATA_COMPETITION") ?? "WC";
  const season = optionalEnv("FOOTBALL_DATA_SEASON") ?? "2026";
  const url = new URL(`https://api.football-data.org/v4/competitions/${competition}/matches`);

  url.searchParams.set("season", season);
  if (params.dateFrom) {
    url.searchParams.set("dateFrom", params.dateFrom);
  }
  if (params.dateTo) {
    url.searchParams.set("dateTo", params.dateTo);
  }
  if (params.status) {
    url.searchParams.set("status", params.status);
  }

  const response = await fetch(url, {
    headers: {
      "X-Auth-Token": token,
    },
    cache: "no-store",
  });
  const throttle = getThrottleHeaders(response.headers);

  if (!response.ok) {
    return {
      status: "error" as const,
      reason: `football-data.org returned ${response.status}`,
      throttle,
    };
  }

  const payload = (await response.json()) as FootballDataMatchesResponse;
  return { status: "ready" as const, matches: payload.matches, throttle };
}
