import "server-only";

import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { optionalEnv } from "@/lib/env";
import {
  buildMatchKey,
  getLockAt,
  type Match,
  type MatchStatus,
  type Stage,
  type Team,
  type WinnerPick,
} from "@/lib/fantasy-types";

type Sql = ReturnType<typeof neon<false, false>>;

type SourceName = "espn-scoreboard";

type ObservedMatch = Match & {
  source: SourceName;
  raw: Record<string, unknown>;
};

type RawObservation = {
  source: SourceName;
  scope: string;
  status: "ready" | "skipped" | "error";
  message?: string;
  payload?: unknown;
  normalizedMatches?: number;
};

type EspnTeam = {
  abbreviation?: string;
  displayName?: string;
  id?: string;
  logos?: Array<{ href?: string }>;
  shortDisplayName?: string;
};

type EspnCompetitor = {
  homeAway?: "home" | "away";
  score?: string;
  shootoutScore?: number | string;
  team?: EspnTeam;
  winner?: boolean;
};

type EspnEvent = {
  competitions?: Array<{
    competitors?: EspnCompetitor[];
    venue?: {
      fullName?: string;
    };
  }>;
  date?: string;
  id?: string | number;
  name?: string;
  shortName?: string;
  status?: {
    type?: {
      name?: string;
      state?: string;
    };
  };
  venue?: {
    fullName?: string;
  };
};

type EspnScoreboard = {
  events?: EspnEvent[];
};

const fetchHeaders = {
  "User-Agent": "MiBR-Fantasy-World-Cup/1.0 (daily fixture sync; contact: patodomau)",
  Accept: "application/json, text/html;q=0.9, */*;q=0.8",
};

const espnScoreboardUrl = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
const espnFullScheduleDates = "20260611-20260719";

const teamCatalog: Record<string, { name: string; shortName?: string; flagCode: string }> = {
  ALG: { name: "Algeria", flagCode: "dz" },
  ARG: { name: "Argentina", flagCode: "ar" },
  AUS: { name: "Australia", flagCode: "au" },
  AUT: { name: "Austria", flagCode: "at" },
  BEL: { name: "Belgium", flagCode: "be" },
  BIH: { name: "Bosnia and Herzegovina", shortName: "Bosnia", flagCode: "ba" },
  BRA: { name: "Brazil", flagCode: "br" },
  CAN: { name: "Canada", flagCode: "ca" },
  CIV: { name: "Cote d'Ivoire", shortName: "Cote d'Ivoire", flagCode: "ci" },
  COD: { name: "Congo DR", flagCode: "cd" },
  COL: { name: "Colombia", flagCode: "co" },
  CPV: { name: "Cabo Verde", flagCode: "cv" },
  CRC: { name: "Costa Rica", flagCode: "cr" },
  CRO: { name: "Croatia", flagCode: "hr" },
  CUW: { name: "Curacao", flagCode: "cw" },
  CZE: { name: "Czechia", flagCode: "cz" },
  ECU: { name: "Ecuador", flagCode: "ec" },
  EGY: { name: "Egypt", flagCode: "eg" },
  ENG: { name: "England", flagCode: "gb-eng" },
  ESP: { name: "Spain", flagCode: "es" },
  FRA: { name: "France", flagCode: "fr" },
  GER: { name: "Germany", flagCode: "de" },
  GHA: { name: "Ghana", flagCode: "gh" },
  HAI: { name: "Haiti", flagCode: "ht" },
  IRN: { name: "IR Iran", shortName: "Iran", flagCode: "ir" },
  IRQ: { name: "Iraq", flagCode: "iq" },
  JOR: { name: "Jordan", flagCode: "jo" },
  JPN: { name: "Japan", flagCode: "jp" },
  KOR: { name: "Korea Republic", shortName: "Korea", flagCode: "kr" },
  MAR: { name: "Morocco", flagCode: "ma" },
  MEX: { name: "Mexico", flagCode: "mx" },
  NED: { name: "Netherlands", flagCode: "nl" },
  NOR: { name: "Norway", flagCode: "no" },
  NZL: { name: "New Zealand", flagCode: "nz" },
  PAN: { name: "Panama", flagCode: "pa" },
  PAR: { name: "Paraguay", flagCode: "py" },
  POR: { name: "Portugal", flagCode: "pt" },
  QAT: { name: "Qatar", flagCode: "qa" },
  RSA: { name: "South Africa", flagCode: "za" },
  SCO: { name: "Scotland", flagCode: "gb-sct" },
  SEN: { name: "Senegal", flagCode: "sn" },
  KSA: { name: "Saudi Arabia", flagCode: "sa" },
  SUI: { name: "Switzerland", flagCode: "ch" },
  SWE: { name: "Sweden", flagCode: "se" },
  TUN: { name: "Tunisia", flagCode: "tn" },
  TUR: { name: "Turkiye", shortName: "Turkiye", flagCode: "tr" },
  UKR: { name: "Ukraine", flagCode: "ua" },
  URU: { name: "Uruguay", flagCode: "uy" },
  USA: { name: "United States", shortName: "USA", flagCode: "us" },
  UZB: { name: "Uzbekistan", flagCode: "uz" },
};

const teamAliases: Record<string, string> = {
  AFS: "RSA",
  AFRICADOSUL: "RSA",
  AGL: "ALG",
  ARGELIA: "ALG",
  SOUTHAFRICA: "RSA",
  CAB: "CPV",
  CABOVERDE: "CPV",
  BOS: "BIH",
  BOSNIA: "BIH",
  BOSNIAEHERZEGOVINA: "BIH",
  BOSNIAANDHERZEGOVINA: "BIH",
  CAT: "QAT",
  CATAR: "QAT",
  QATAR: "QAT",
  COR: "KOR",
  COREADOSUL: "KOR",
  SOUTHCOREA: "KOR",
  SOUTHKOREA: "KOR",
  KOREAREPUBLIC: "KOR",
  ESC: "SCO",
  ESCOCIA: "SCO",
  SCOTLAND: "SCO",
  MEXICO: "MEX",
  MEX: "MEX",
  REPUBLICATCHECA: "CZE",
  REPTCHECA: "CZE",
  CZECHREPUBLIC: "CZE",
  CZECHIA: "CZE",
  TCH: "CZE",
  TCHECA: "CZE",
  CDM: "CIV",
  COSTADOMARFIM: "CIV",
  CUR: "CUW",
  CURACAO: "CUW",
  CTA: "CUW",
  EQU: "ECU",
  EQUADOR: "ECU",
  EGI: "EGY",
  EGITO: "EGY",
  GAN: "GHA",
  GANA: "GHA",
  HOL: "NED",
  HOLANDA: "NED",
  IRA: "IRN",
  IRAO: "IRN",
  NZE: "NZL",
  NOVAZELANDIA: "NZL",
  RDC: "COD",
  RDCONGO: "COD",
  SAU: "KSA",
  ARABIASAUDITA: "KSA",
  SUE: "SWE",
  SUECIA: "SWE",
  SUICA: "SUI",
  SWITZERLAND: "SUI",
  ALEMANHA: "GER",
  ALE: "GER",
  GERMANY: "GER",
  BRASIL: "BRA",
  BRAZIL: "BRA",
  MARROCOS: "MAR",
  MOROCCO: "MAR",
  ESPANHA: "ESP",
  SPAIN: "ESP",
  INGLATERRA: "ENG",
  ING: "ENG",
  ENGLAND: "ENG",
  ESTADOSUNIDOS: "USA",
  UNITEDSTATES: "USA",
  UNITEDSTATESOFAMERICA: "USA",
  EUA: "USA",
  JAPAO: "JPN",
  JAP: "JPN",
  JAPAN: "JPN",
  URUGUAI: "URU",
  URY: "URU",
  URUGUAY: "URU",
  PORTUGAL: "POR",
  FRANCA: "FRA",
  FRANCE: "FRA",
  SENEGAL: "SEN",
  ARGENTINA: "ARG",
  CANADA: "CAN",
  PARAGUAI: "PAR",
  PARAGUAY: "PAR",
  HAITI: "HAI",
};

function flagUrl(code: string) {
  return `https://flagcdn.com/w160/${code.toLowerCase()}.png`;
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function identityPart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 32);
}

function canonicalTeamCode(team: Team) {
  const candidates = [team.abbreviation, team.name, team.shortName].map(identityPart);
  for (const candidate of candidates) {
    if (teamAliases[candidate]) {
      return teamAliases[candidate];
    }
    if (teamCatalog[candidate]) {
      return candidate;
    }
  }

  return candidates[0] || "TBD";
}

function stableHash(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function normalizeGroupName(value: string | null | undefined) {
  const normalized = value?.trim().match(/^GROUP[_\s-]?([A-L])$/i);
  if (normalized) {
    return `Group ${normalized[1].toUpperCase()}`;
  }

  return value?.trim() || undefined;
}

function teamFromCode(code: string): Team {
  const normalized = teamAliases[identityPart(code)] ?? code.toUpperCase();
  const catalogEntry = teamCatalog[normalized] ?? {
    name: normalized,
    flagCode: "un",
  };

  return {
    id: normalized.toLowerCase(),
    name: catalogEntry.name,
    shortName: catalogEntry.shortName ?? catalogEntry.name,
    abbreviation: normalized,
    flagUrl: flagUrl(catalogEntry.flagCode),
  };
}

function placeholderTeam(label: string): Team {
  const cleanLabel = label.trim() || "TBD";
  const abbreviation = cleanLabel
    .replace(/^Winner Group /i, "1")
    .replace(/^Runner-up Group /i, "2")
    .replace(/^Winner Match /i, "W")
    .replace(/^Loser Match /i, "L")
    .replace(/^Best third-place team$/i, "3RD")
    .replace(/\s+/g, "")
    .slice(0, 8)
    .toUpperCase();

  return {
    id: `slot-${slugify(cleanLabel)}`,
    name: cleanLabel,
    shortName: cleanLabel,
    abbreviation: abbreviation || "TBD",
    flagUrl: flagUrl("un"),
  };
}

function winnerFromScores(homeScore?: number | null, awayScore?: number | null): WinnerPick | undefined {
  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) {
    return undefined;
  }
  if ((homeScore as number) > (awayScore as number)) {
    return "home";
  }
  if ((awayScore as number) > (homeScore as number)) {
    return "away";
  }

  return "draw";
}

function winnerFromEspnCompetitors(
  home: EspnCompetitor,
  away: EspnCompetitor,
  homeScore?: number | null,
  awayScore?: number | null,
): WinnerPick | undefined {
  if (home.winner === true) {
    return "home";
  }
  if (away.winner === true) {
    return "away";
  }

  return winnerFromScores(homeScore, awayScore);
}

function parseOptionalScore(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function normalizeEspnStatus(status: EspnEvent["status"]): MatchStatus {
  const state = status?.type?.state;
  const name = status?.type?.name;

  if (state === "post" || name === "STATUS_FULL_TIME") {
    return "FINISHED";
  }
  if (state === "in") {
    return name === "STATUS_HALFTIME" ? "PAUSED" : "IN_PLAY";
  }
  if (name === "STATUS_POSTPONED") {
    return "POSTPONED";
  }
  if (name === "STATUS_CANCELED") {
    return "CANCELLED";
  }

  return "SCHEDULED";
}

function stageFromEspnKickoff(kickoffAt: string): Stage {
  const time = new Date(kickoffAt).getTime();
  const before = (iso: string) => time < new Date(iso).getTime();

  if (before("2026-06-28T19:00:00.000Z")) {
    return "GROUP_STAGE";
  }
  if (before("2026-07-04T17:00:00.000Z")) {
    return "ROUND_OF_32";
  }
  if (before("2026-07-09T20:00:00.000Z")) {
    return "ROUND_OF_16";
  }
  if (before("2026-07-14T19:00:00.000Z")) {
    return "QUARTER_FINALS";
  }
  if (before("2026-07-18T21:00:00.000Z")) {
    return "SEMI_FINALS";
  }
  if (before("2026-07-19T19:00:00.000Z")) {
    return "THIRD_PLACE";
  }

  return "FINAL";
}

function teamFromEspn(team?: EspnTeam): Team {
  const abbreviation = identityPart(team?.abbreviation ?? "");
  const knownCode =
    teamAliases[abbreviation] ??
    teamAliases[identityPart(team?.shortDisplayName ?? "")] ??
    teamAliases[identityPart(team?.displayName ?? "")] ??
    (teamCatalog[abbreviation] ? abbreviation : null);

  if (knownCode) {
    return teamFromCode(knownCode);
  }

  const label = team?.displayName ?? team?.shortDisplayName ?? team?.abbreviation ?? "TBD";
  return {
    ...placeholderTeam(label),
    flagUrl: team?.logos?.find((logo) => logo.href)?.href ?? flagUrl("un"),
  };
}

function getEspnCompetitor(event: EspnEvent, homeAway: "home" | "away") {
  return event.competitions?.[0]?.competitors?.find((competitor) => competitor.homeAway === homeAway);
}

function compactUtcDate(date: Date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function espnLiveDates(now = new Date()) {
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(now);
  to.setUTCDate(to.getUTCDate() + 1);

  return `${compactUtcDate(from)}-${compactUtcDate(to)}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string) {
  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      cache: "no-store",
      headers: fetchHeaders,
    });
    if (response.ok) {
      return response;
    }

    lastResponse = response;
    if (response.status !== 429 && response.status < 500) {
      break;
    }

    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : 1200 * (attempt + 1));
  }

  throw new Error(`${url} returned ${lastResponse?.status ?? "unknown status"}`);
}

async function fetchJson(url: string) {
  const response = await fetchWithRetry(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  return response.json() as Promise<unknown>;
}

async function fetchEspnObservedMatches(
  dates = espnFullScheduleDates,
): Promise<{ observation: RawObservation; matches: ObservedMatch[] }> {
  const url = new URL(espnScoreboardUrl);
  url.searchParams.set("dates", dates);
  url.searchParams.set("limit", "200");

  const payload = (await fetchJson(url.toString())) as EspnScoreboard;
  const events = payload.events ?? [];
  const matches: ObservedMatch[] = [];

  for (const event of events) {
    if (!event.id || !event.date) {
      continue;
    }

    const home = getEspnCompetitor(event, "home");
    const away = getEspnCompetitor(event, "away");
    if (!home?.team || !away?.team) {
      continue;
    }

    const kickoffAt = new Date(event.date).toISOString();
    const stage = stageFromEspnKickoff(kickoffAt);
    const status = normalizeEspnStatus(event.status);
    const hasMeaningfulScore = status !== "SCHEDULED";
    const homeScore = hasMeaningfulScore ? parseOptionalScore(home.score) : undefined;
    const awayScore = hasMeaningfulScore ? parseOptionalScore(away.score) : undefined;
    const homePenaltyScore = hasMeaningfulScore ? parseOptionalScore(home.shootoutScore) : undefined;
    const awayPenaltyScore = hasMeaningfulScore ? parseOptionalScore(away.shootoutScore) : undefined;
    const homeTeam = teamFromEspn(home.team);
    const awayTeam = teamFromEspn(away.team);

    matches.push({
      id: buildMatchKey(homeTeam, awayTeam, stage, String(event.id)),
      providerMatchId: String(event.id),
      stage,
      kickoffAt,
      lockAt: getLockAt(kickoffAt),
      venue: event.competitions?.[0]?.venue?.fullName ?? event.venue?.fullName ?? "",
      homeTeam,
      awayTeam,
      status,
      homeScore,
      awayScore,
      homePenaltyScore,
      awayPenaltyScore,
      winner: winnerFromEspnCompetitors(home, away, homeScore, awayScore),
      source: "espn-scoreboard",
      raw: event as unknown as Record<string, unknown>,
    });
  }

  return {
    observation: {
      source: "espn-scoreboard",
      scope: dates === espnFullScheduleDates ? "full-schedule" : `scoreboard:${dates}`,
      status: "ready",
      payload: { url: url.toString(), events },
      normalizedMatches: matches.length,
    },
    matches,
  };
}

function espnDateWindowAround(date: Date) {
  const from = new Date(date);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(date);
  to.setUTCDate(to.getUTCDate() + 1);

  return `${compactUtcDate(from)}-${compactUtcDate(to)}`;
}

function isSameMatch(left: Match, right: Match) {
  if (left.providerMatchId && right.providerMatchId && left.providerMatchId === right.providerMatchId) {
    return true;
  }

  return (
    left.stage === right.stage &&
    canonicalTeamCode(left.homeTeam) === canonicalTeamCode(right.homeTeam) &&
    canonicalTeamCode(left.awayTeam) === canonicalTeamCode(right.awayTeam)
  );
}

export async function fetchEspnMatchForMatch(match: Match): Promise<Match | null> {
  const espn = await fetchEspnObservedMatches(espnDateWindowAround(new Date(match.kickoffAt)));
  const candidate = espn.matches.find((entry) => isSameMatch(match, entry));

  return candidate
    ? {
        ...candidate,
        id: match.id,
        groupName: normalizeGroupName(match.groupName ?? candidate.groupName),
      }
    : null;
}

export async function ensureMatchSyncSchema(sql: Sql) {
  await sql`create schema if not exists mibr_fantasy_world_cup`;
  await sql`
    alter table if exists mibr_fantasy_world_cup.matches
    drop constraint if exists matches_provider_match_id_key
  `;
  await sql`
    create table if not exists mibr_fantasy_world_cup.match_source_observations (
      id bigserial primary key,
      source text not null,
      scope text not null,
      status text not null,
      message text,
      payload_hash text,
      payload jsonb,
      normalized_matches integer not null default 0,
      observed_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists mibr_fantasy_world_cup.match_observations (
      id bigserial primary key,
      source text not null,
      match_id text not null,
      provider_match_id text,
      stage text not null,
      group_name text,
      kickoff_at timestamptz not null,
      lock_at timestamptz not null,
      venue text,
      home_team_name text not null,
      away_team_name text not null,
      status text not null,
      home_score integer,
      away_score integer,
      winner text,
      raw jsonb,
      observed_at timestamptz not null default now(),
      unique (source, match_id)
    )
  `;
  await sql`
    create table if not exists mibr_fantasy_world_cup.match_conflicts (
      id bigserial primary key,
      match_id text not null,
      field_name text not null,
      selected_value text not null,
      observed_values jsonb not null,
      status text not null default 'open',
      observed_at timestamptz not null default now(),
      resolved_at timestamptz,
      unique (match_id, field_name, status)
    )
  `;
  await sql`
    create index if not exists match_source_observations_source_idx
      on mibr_fantasy_world_cup.match_source_observations (source, observed_at desc)
  `;
  await sql`
    create index if not exists match_observations_match_id_idx
      on mibr_fantasy_world_cup.match_observations (match_id)
  `;
  await sql`
    create index if not exists match_conflicts_status_idx
      on mibr_fantasy_world_cup.match_conflicts (status, observed_at desc)
  `;
}

async function saveRawObservation(sql: Sql, observation: RawObservation) {
  const payload = observation.payload ?? {};
  await sql`
    insert into mibr_fantasy_world_cup.match_source_observations (
      source,
      scope,
      status,
      message,
      payload_hash,
      payload,
      normalized_matches
    )
    values (
      ${observation.source},
      ${observation.scope},
      ${observation.status},
      ${observation.message ?? null},
      ${stableHash(payload)},
      ${JSON.stringify(payload)}::jsonb,
      ${observation.normalizedMatches ?? 0}
    )
  `;
}

async function saveMatchObservation(sql: Sql, match: ObservedMatch) {
  await sql`
    insert into mibr_fantasy_world_cup.match_observations (
      source,
      match_id,
      provider_match_id,
      stage,
      group_name,
      kickoff_at,
      lock_at,
      venue,
      home_team_name,
      away_team_name,
      status,
      home_score,
      away_score,
      winner,
      raw,
      observed_at
    )
    values (
      ${match.source},
      ${match.id},
      ${match.providerMatchId ?? null},
      ${match.stage},
      ${normalizeGroupName(match.groupName) ?? null},
      ${match.kickoffAt},
      ${match.lockAt},
      ${match.venue},
      ${match.homeTeam.name},
      ${match.awayTeam.name},
      ${match.status},
      ${match.homeScore ?? null},
      ${match.awayScore ?? null},
      ${match.winner ?? null},
      ${JSON.stringify(match.raw)}::jsonb,
      now()
    )
    on conflict (source, match_id) do update
    set provider_match_id = excluded.provider_match_id,
        stage = excluded.stage,
        group_name = excluded.group_name,
        kickoff_at = excluded.kickoff_at,
        lock_at = excluded.lock_at,
        venue = excluded.venue,
        home_team_name = excluded.home_team_name,
        away_team_name = excluded.away_team_name,
        status = excluded.status,
        home_score = excluded.home_score,
        away_score = excluded.away_score,
        winner = excluded.winner,
        raw = excluded.raw,
        observed_at = now()
  `;
}

async function saveTeam(sql: Sql, team: Team) {
  await sql`
    insert into mibr_fantasy_world_cup.teams (
      id,
      name,
      short_name,
      abbreviation,
      flag_url,
      updated_at
    )
    values (
      ${team.id},
      ${team.name},
      ${team.shortName},
      ${team.abbreviation},
      ${team.flagUrl},
      now()
    )
    on conflict (id) do update
    set name = excluded.name,
        short_name = excluded.short_name,
        abbreviation = excluded.abbreviation,
        flag_url = excluded.flag_url,
        updated_at = now()
  `;
}

async function resolveExistingConsolidatedMatchId(sql: Sql, match: ObservedMatch) {
  const rows = (await sql`
    select
      m.id,
      (m.id = ${match.id}) as exact_id,
      exists (
        select 1
        from mibr_fantasy_world_cup.predictions p
        where p.match_id = m.id
      ) as has_predictions
    from mibr_fantasy_world_cup.matches m
    where m.id = ${match.id}
       or (
        m.stage = ${match.stage}
        and case
          when m.group_name ~* '^GROUP[_ -]?[A-L]$' then 'Group ' || upper(right(m.group_name, 1))
          else m.group_name
        end is not distinct from ${normalizeGroupName(match.groupName) ?? null}
        and m.home_team_id = ${match.homeTeam.id}
        and m.away_team_id = ${match.awayTeam.id}
      )
    order by has_predictions desc, exact_id desc, m.synced_at desc nulls last, m.updated_at desc
    limit 1
  `) as { id: string }[];

  return rows[0]?.id ?? null;
}

async function resolveUniqueKickoffMatchId(sql: Sql, match: ObservedMatch) {
  const rows = (await sql`
    select id
    from mibr_fantasy_world_cup.matches
    where kickoff_at = ${match.kickoffAt}
    order by synced_at desc nulls last, updated_at desc
    limit 2
  `) as { id: string }[];

  return rows.length === 1 ? rows[0].id : null;
}

async function saveConsolidatedMatch(sql: Sql, match: ObservedMatch) {
  await saveTeam(sql, match.homeTeam);
  await saveTeam(sql, match.awayTeam);
  const groupName = normalizeGroupName(match.groupName);

  await sql`
    insert into mibr_fantasy_world_cup.matches (
      id,
      provider_match_id,
      stage,
      group_name,
      kickoff_at,
      lock_at,
      venue,
      home_team_id,
      away_team_id,
      status,
      home_score,
      away_score,
      winner,
      synced_at,
      updated_at
    )
    values (
      ${match.id},
      ${match.providerMatchId ?? null},
      ${match.stage},
      ${groupName ?? null},
      ${match.kickoffAt},
      ${match.lockAt},
      ${match.venue},
      ${match.homeTeam.id},
      ${match.awayTeam.id},
      ${match.status},
      ${match.homeScore ?? null},
      ${match.awayScore ?? null},
      ${match.winner ?? null},
      now(),
      now()
    )
    on conflict (id) do update
    set provider_match_id = excluded.provider_match_id,
        stage = excluded.stage,
        group_name = coalesce(
          excluded.group_name,
          case
            when mibr_fantasy_world_cup.matches.group_name ~* '^GROUP[_ -]?[A-L]$'
              then 'Group ' || upper(right(mibr_fantasy_world_cup.matches.group_name, 1))
            else mibr_fantasy_world_cup.matches.group_name
          end
        ),
        kickoff_at = excluded.kickoff_at,
        lock_at = least(mibr_fantasy_world_cup.matches.lock_at, excluded.lock_at),
        venue = excluded.venue,
        home_team_id = excluded.home_team_id,
        away_team_id = excluded.away_team_id,
        status = case
          when mibr_fantasy_world_cup.matches.status in ('LIVE', 'IN_PLAY', 'PAUSED', 'FINISHED')
           and excluded.status = 'SCHEDULED' then mibr_fantasy_world_cup.matches.status
          else excluded.status
        end,
        home_score = excluded.home_score,
        away_score = excluded.away_score,
        winner = excluded.winner,
        synced_at = now(),
        updated_at = now()
  `;
}

async function saveLiveMatchStatus(sql: Sql, match: ObservedMatch) {
  await saveTeam(sql, match.homeTeam);
  await saveTeam(sql, match.awayTeam);

  const updateRows = (await sql`
    update mibr_fantasy_world_cup.matches
      set provider_match_id = ${match.providerMatchId ?? null},
        kickoff_at = ${match.kickoffAt},
        lock_at = least(lock_at, ${match.lockAt}),
        status = ${match.status},
        home_score = ${match.homeScore ?? null},
        away_score = ${match.awayScore ?? null},
        winner = ${match.winner ?? null},
        synced_at = now(),
        updated_at = now()
    where provider_match_id = ${match.providerMatchId ?? ""}
       or (
        stage = ${match.stage}
        and case
          when group_name ~* '^GROUP[_ -]?[A-L]$' then 'Group ' || upper(right(group_name, 1))
          else group_name
        end is not distinct from ${normalizeGroupName(match.groupName) ?? null}
        and home_team_id = ${match.homeTeam.id}
        and away_team_id = ${match.awayTeam.id}
      )
    returning id
  `) as { id: string }[];

  if (updateRows.length === 0) {
    await saveConsolidatedMatch(sql, match);
  }
}

async function removeStaleCanonicalMatches(sql: Sql, activeMatchIds: string[]) {
  await sql`
    delete from mibr_fantasy_world_cup.matches m
    where m.id like '%\\_%' escape '\\'
      and m.id not in (
        select jsonb_array_elements_text(${JSON.stringify(activeMatchIds)}::jsonb)
      )
      and not exists (
        select 1
        from mibr_fantasy_world_cup.predictions p
        where p.match_id = m.id
      )
  `;
}

async function clearOpenConflicts(sql: Sql) {
  await sql`
    delete from mibr_fantasy_world_cup.match_conflicts
    where status = 'open'
  `;
}

async function recalculatePredictionPoints(sql: Sql) {
  await sql`
    update mibr_fantasy_world_cup.predictions p
    set winner_points = case
          when m.winner is not null and p.predicted_winner = m.winner then 3
          else 0
        end,
        score_points = case
          when m.home_score is not null
           and m.away_score is not null
           and p.predicted_home_score = m.home_score
           and p.predicted_away_score = m.away_score then 2
          else 0
        end,
        total_points = case
          when m.winner is not null and p.predicted_winner = m.winner then 3
          else 0
        end + case
          when m.home_score is not null
           and m.away_score is not null
           and p.predicted_home_score = m.home_score
           and p.predicted_away_score = m.away_score then 2
          else 0
        end,
        updated_at = now()
    from mibr_fantasy_world_cup.matches m
    where p.match_id = m.id
  `;
}

export async function syncWorldCupMatches() {
  const databaseUrl = optionalEnv("DATABASE_URL");
  if (!databaseUrl) {
    return {
      status: "skipped" as const,
      reason: "DATABASE_URL is not configured",
      consolidatedMatches: 0,
      conflicts: 0,
      sources: [],
    };
  }

  const sql = neon(databaseUrl);
  await ensureMatchSyncSchema(sql);

  const espn = await fetchEspnObservedMatches().catch((error) => ({
    observation: {
      source: "espn-scoreboard" as const,
      scope: "full-schedule",
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unknown ESPN scoreboard error",
      normalizedMatches: 0,
    },
    matches: [],
  }));

  const rawObservations = [espn.observation];
  if (espn.matches.length < 104) {
    for (const observation of rawObservations) {
      await saveRawObservation(sql, observation);
    }
    await sql`
      insert into mibr_fantasy_world_cup.match_sync_runs (source, scope, status, message)
      values (
        'espn-scoreboard',
        'daily',
        'error',
        ${`ESPN returned ${espn.matches.length} normalized matches; expected 104. Existing schedule was left unchanged.`}
      )
    `;

    return {
      status: "error" as const,
      message: `ESPN returned ${espn.matches.length} normalized matches; expected 104. Existing schedule was left unchanged.`,
      consolidatedMatches: 0,
      conflicts: 0,
      sources: rawObservations.map((observation) => ({
        source: observation.source,
        status: observation.status,
        normalizedMatches: observation.normalizedMatches ?? 0,
        message: observation.message,
      })),
    };
  }

  const observedMatches = espn.matches;
  const consolidated = [...espn.matches].sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt));

  for (const observation of rawObservations) {
    await saveRawObservation(sql, observation);
  }
  for (const match of observedMatches) {
    await saveMatchObservation(sql, match);
  }
  const activeMatchIds: string[] = [];
  for (const match of consolidated) {
    const existingMatchId =
      (await resolveExistingConsolidatedMatchId(sql, match)) ??
      (await resolveUniqueKickoffMatchId(sql, match)) ??
      match.id;
    const stableMatch = existingMatchId === match.id ? match : { ...match, id: existingMatchId };
    activeMatchIds.push(stableMatch.id);
    await saveConsolidatedMatch(sql, stableMatch);
  }
  await removeStaleCanonicalMatches(sql, activeMatchIds);
  await clearOpenConflicts(sql);
  await recalculatePredictionPoints(sql);

  await sql`
    insert into mibr_fantasy_world_cup.match_sync_runs (source, scope, status, message)
    values (
      'espn-scoreboard',
      'daily',
      'ready',
      ${`Consolidated ${consolidated.length} matches from ESPN scoreboard; preserved existing match IDs where possible`}
    )
  `;

  return {
    status: "ready" as const,
    consolidatedMatches: consolidated.length,
    normalizedObservations: observedMatches.length,
    conflicts: 0,
    autoResolvedDisagreements: 0,
    sources: rawObservations.map((observation) => ({
      source: observation.source,
      status: observation.status,
      normalizedMatches: observation.normalizedMatches ?? 0,
      message: observation.message,
    })),
  };
}

export async function syncLiveWorldCupMatches() {
  const databaseUrl = optionalEnv("DATABASE_URL");
  if (!databaseUrl) {
    return {
      status: "skipped" as const,
      reason: "DATABASE_URL is not configured",
      updatedMatches: 0,
    };
  }

  const sql = neon(databaseUrl);
  await ensureMatchSyncSchema(sql);

  const espn = await fetchEspnObservedMatches(espnLiveDates());
  await saveRawObservation(sql, espn.observation);

  if (espn.observation.status !== "ready") {
    await sql`
      insert into mibr_fantasy_world_cup.match_sync_runs (source, scope, status, message)
      values (
        'espn-scoreboard',
        'live',
        ${espn.observation.status},
        ${espn.observation.message ?? "Live sync did not return ready status"}
      )
    `;

    return {
      status: espn.observation.status,
      message: espn.observation.message,
      updatedMatches: 0,
    };
  }

  for (const match of espn.matches) {
    await saveMatchObservation(sql, match);
    await saveLiveMatchStatus(sql, match);
  }
  await recalculatePredictionPoints(sql);

  await sql`
    insert into mibr_fantasy_world_cup.match_sync_runs (source, scope, status, message)
    values (
      'espn-scoreboard',
      'live',
      'ready',
      ${`Updated ${espn.matches.length} live or finished matches from ESPN scoreboard`}
    )
  `;

  return {
    status: "ready" as const,
    updatedMatches: espn.matches.length,
    source: {
      source: espn.observation.source,
      status: espn.observation.status,
      normalizedMatches: espn.observation.normalizedMatches ?? 0,
      message: espn.observation.message,
    },
  };
}
