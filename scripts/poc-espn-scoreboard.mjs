import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const ESPN_SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
const DEFAULT_DATES = "20260611-20260719";

function readOption(name) {
  const prefix = `--${name}=`;
  const option = process.argv.find((arg) => arg.startsWith(prefix));
  return option ? option.slice(prefix.length) : undefined;
}

function optionalEnv(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function databaseUrlFromPrivateFile() {
  const text = readFileSync("private/neon-fantasy-dbeaver-fields.txt", "utf8");
  const fields = Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*([^:=]+)\s*[:=]\s*(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1].trim().toLowerCase(), match[2].trim()]),
  );

  return `postgresql://${encodeURIComponent(fields.username)}:${encodeURIComponent(fields.password)}@${fields.host}:${fields.port}/${fields.database}?sslmode=require`;
}

function getDatabaseUrl() {
  return optionalEnv("DATABASE_URL") ?? databaseUrlFromPrivateFile();
}

function identityPart(value) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

const teamAliases = {
  BIH: "BIH",
  BOSNIAHERZEGOVINA: "BIH",
  BOSNIAHERZ: "BIH",
  BOSNIAANDHERZEGOVINA: "BIH",
  BOSNIAEHERZEGOVINA: "BIH",
  CZECHREPUBLIC: "CZE",
  CZECHIA: "CZE",
  KOREAREPUBLIC: "KOR",
  SOUTHKOREA: "KOR",
  SOUTHAFRICA: "RSA",
  TURKIYE: "TUR",
  TURKEY: "TUR",
  UNITEDSTATES: "USA",
  UNITEDSTATESOFAMERICA: "USA",
};

function canonicalTeamCode(...values) {
  for (const value of values) {
    const normalized = identityPart(value);
    if (!normalized) {
      continue;
    }
    if (teamAliases[normalized]) {
      return teamAliases[normalized];
    }
    if (/^[A-Z]{3}$/.test(normalized)) {
      return normalized;
    }
  }

  return identityPart(values.find(Boolean) ?? "");
}

function stageFromKickoff(kickoffAt) {
  const time = new Date(kickoffAt).getTime();
  const before = (iso) => time < new Date(iso).getTime();

  if (before("2026-06-28T00:00:00.000Z")) {
    return "GROUP_STAGE";
  }
  if (before("2026-07-04T00:00:00.000Z")) {
    return "ROUND_OF_32";
  }
  if (before("2026-07-08T00:00:00.000Z")) {
    return "ROUND_OF_16";
  }
  if (before("2026-07-13T00:00:00.000Z")) {
    return "QUARTER_FINALS";
  }
  if (before("2026-07-16T00:00:00.000Z")) {
    return "SEMI_FINALS";
  }
  if (before("2026-07-19T00:00:00.000Z")) {
    return "THIRD_PLACE";
  }

  return "FINAL";
}

function normalizeEspnStatus(status) {
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

function winnerFromScores(homeScore, awayScore) {
  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) {
    return undefined;
  }
  if (homeScore > awayScore) {
    return "home";
  }
  if (awayScore > homeScore) {
    return "away";
  }
  return "draw";
}

function byHomeAway(competitors, homeAway) {
  return competitors.find((competitor) => competitor.homeAway === homeAway);
}

function mapEspnEvent(event) {
  const competition = event.competitions?.[0];
  const competitors = competition?.competitors ?? [];
  const home = byHomeAway(competitors, "home");
  const away = byHomeAway(competitors, "away");
  const status = normalizeEspnStatus(event.status);
  const hasMeaningfulScore = status !== "SCHEDULED";
  const homeScore = hasMeaningfulScore ? Number(home?.score) : NaN;
  const awayScore = hasMeaningfulScore ? Number(away?.score) : NaN;

  return {
    espnId: String(event.id),
    name: event.name,
    shortName: event.shortName,
    kickoffAt: new Date(event.date).toISOString(),
    stage: stageFromKickoff(event.date),
    status,
    homeScore: Number.isFinite(homeScore) ? homeScore : undefined,
    awayScore: Number.isFinite(awayScore) ? awayScore : undefined,
    winner: winnerFromScores(homeScore, awayScore),
    homeCode: canonicalTeamCode(home?.team?.abbreviation, home?.team?.shortDisplayName, home?.team?.displayName),
    awayCode: canonicalTeamCode(away?.team?.abbreviation, away?.team?.shortDisplayName, away?.team?.displayName),
    homeTeam: home?.team?.displayName,
    awayTeam: away?.team?.displayName,
  };
}

function rowTeamCodes(row) {
  return {
    homeCode: canonicalTeamCode(row.home_team_abbreviation, row.home_team_short_name, row.home_team_name),
    awayCode: canonicalTeamCode(row.away_team_abbreviation, row.away_team_short_name, row.away_team_name),
  };
}

function sameKickoff(left, right) {
  return new Date(left).getTime() === new Date(right).getTime();
}

function sameTeams(left, right) {
  return left.homeCode === right.homeCode && left.awayCode === right.awayCode;
}

function findCurrentMatch(espnMatch, currentMatches) {
  const sameKickoffMatches = currentMatches.filter((row) => sameKickoff(espnMatch.kickoffAt, row.kickoff_at));

  return (
    currentMatches.find((row) => {
      const codes = rowTeamCodes(row);
      return sameKickoff(espnMatch.kickoffAt, row.kickoff_at) && sameTeams(espnMatch, codes);
    }) ??
    currentMatches.find((row) => {
      const codes = rowTeamCodes(row);
      return row.stage === espnMatch.stage && sameTeams(espnMatch, codes);
    }) ??
    currentMatches.find((row) => sameKickoff(espnMatch.kickoffAt, row.kickoff_at) && row.stage === espnMatch.stage) ??
    (sameKickoffMatches.length === 1 ? sameKickoffMatches[0] : undefined)
  );
}

async function fetchEspnMatches(dates) {
  const url = new URL(ESPN_SCOREBOARD_URL);
  url.searchParams.set("dates", dates);
  url.searchParams.set("limit", "200");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "MiBR-Fantasy-World-Cup/1.0 ESPN POC",
    },
  });

  if (!response.ok) {
    throw new Error(`ESPN scoreboard returned HTTP ${response.status}`);
  }

  const payload = await response.json();
  return (payload.events ?? []).map(mapEspnEvent);
}

async function loadCurrentMatches(sql) {
  return sql.query(`
    select
      m.id,
      m.provider_match_id,
      m.stage,
      m.group_name,
      m.kickoff_at,
      m.status,
      m.home_score,
      m.away_score,
      m.winner,
      ht.name as home_team_name,
      ht.short_name as home_team_short_name,
      ht.abbreviation as home_team_abbreviation,
      at.name as away_team_name,
      at.short_name as away_team_short_name,
      at.abbreviation as away_team_abbreviation
    from mibr_fantasy_world_cup.matches m
    join mibr_fantasy_world_cup.teams ht on ht.id = m.home_team_id
    join mibr_fantasy_world_cup.teams at on at.id = m.away_team_id
    order by m.kickoff_at asc, m.id asc
  `);
}

function compactMatch(match) {
  return {
    id: match.id,
    espnId: match.espnId,
    kickoffAt: match.kickoffAt,
    stage: match.stage,
    teams: `${match.homeTeam} vs ${match.awayTeam}`,
    score:
      Number.isInteger(match.homeScore) && Number.isInteger(match.awayScore)
        ? `${match.homeScore}-${match.awayScore}`
        : undefined,
    status: match.status,
  };
}

async function main() {
  const dates = readOption("dates") ?? DEFAULT_DATES;
  const sql = neon(getDatabaseUrl());
  const [espnMatches, currentMatches] = await Promise.all([
    fetchEspnMatches(dates),
    loadCurrentMatches(sql),
  ]);

  const matches = espnMatches.map((espnMatch) => {
    const current = findCurrentMatch(espnMatch, currentMatches);
    return {
      ...espnMatch,
      currentId: current?.id,
      currentProviderMatchId: current?.provider_match_id,
      currentStatus: current?.status,
      currentScore:
        current && current.home_score !== null && current.away_score !== null
          ? `${current.home_score}-${current.away_score}`
          : undefined,
    };
  });

  const matched = matches.filter((match) => match.currentId);
  const unmatched = matches.filter((match) => !match.currentId);
  const currentMatchedIds = new Set(matched.map((match) => match.currentId));
  const currentUnmatched = currentMatches.filter((match) => !currentMatchedIds.has(match.id));
  const providerMismatches = matched.filter(
    (match) => match.currentProviderMatchId && match.currentProviderMatchId !== match.espnId,
  );
  const statusOrScoreChanges = matched.filter((match) => {
    const espnScore =
      Number.isInteger(match.homeScore) && Number.isInteger(match.awayScore)
        ? `${match.homeScore}-${match.awayScore}`
        : undefined;
    return match.currentStatus !== match.status || match.currentScore !== espnScore;
  });

  console.log(
    JSON.stringify(
      {
        dates,
        espnEvents: espnMatches.length,
        currentMatches: currentMatches.length,
        matched: matched.length,
        unmatchedEspn: unmatched.length,
        unmatchedCurrent: currentUnmatched.length,
        providerMismatches: providerMismatches.length,
        statusOrScoreChanges: statusOrScoreChanges.length,
        unmatchedEspnSamples: unmatched.slice(0, 10).map(compactMatch),
        unmatchedCurrentSamples: currentUnmatched.slice(0, 10).map((match) => ({
          id: match.id,
          providerMatchId: match.provider_match_id,
          kickoffAt: new Date(match.kickoff_at).toISOString(),
          stage: match.stage,
          teams: `${match.home_team_name} vs ${match.away_team_name}`,
          status: match.status,
        })),
        providerMismatchSamples: providerMismatches.slice(0, 10).map((match) => ({
          currentId: match.currentId,
          currentProviderMatchId: match.currentProviderMatchId,
          espnId: match.espnId,
          teams: `${match.homeTeam} vs ${match.awayTeam}`,
        })),
        statusOrScoreChangeSamples: statusOrScoreChanges.slice(0, 10).map((match) => ({
          currentId: match.currentId,
          teams: `${match.homeTeam} vs ${match.awayTeam}`,
          currentStatus: match.currentStatus,
          espnStatus: match.status,
          currentScore: match.currentScore,
          espnScore:
            Number.isInteger(match.homeScore) && Number.isInteger(match.awayScore)
              ? `${match.homeScore}-${match.awayScore}`
              : undefined,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
