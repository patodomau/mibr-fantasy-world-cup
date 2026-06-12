import "server-only";

import { neon } from "@neondatabase/serverless";
import { mockLeaderboard, mockMatches } from "@/data/mock-world-cup";
import { optionalEnv } from "@/lib/env";
import { fetchEspnMatchForMatch } from "@/lib/match-sync";
import {
  buildMatchKey,
  isMatchPickable,
  isMatchLocked,
  validatePrediction,
  type AdminUser,
  type LeaderboardEntry,
  type Match,
  type MatchSyncOverview,
  type MatchSyncSourceStatus,
  type PredictionDraft,
  type PredictionResult,
} from "@/lib/fantasy-types";

type LeaderboardRow = {
  discord_user_id: string;
  display_label: string;
  discord_avatar_url: string | null;
  paid_entry: boolean;
  total_points: number | null;
  winner_points: number | null;
  winner_scores: number | null;
  score_points: number | null;
  exact_scores: number | null;
  predictions: number | null;
};

type AdminUserRow = {
  discord_user_id: string;
  display_label: string;
  discord_avatar_url: string | null;
  role: "owner" | "admin" | "player";
  paid_entry: boolean;
  predictions: number | null;
  total_points: number | null;
  last_login_at: string | null;
  created_at: string;
};

type PredictionRow = {
  match_id: string;
  predicted_winner: "home" | "away" | "draw";
  predicted_home_score: number | null;
  predicted_away_score: number | null;
  winner_points: number | null;
  score_points: number | null;
  total_points: number | null;
  stage: Match["stage"] | null;
  group_name: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
};

type MatchRow = {
  id: string;
  provider_match_id: string | null;
  stage: Match["stage"];
  group_name: string | null;
  kickoff_at: string;
  lock_at: string;
  venue: string | null;
  status: Match["status"];
  home_score: number | null;
  away_score: number | null;
  winner: Match["winner"] | null;
  home_team_id: string;
  home_team_name: string;
  home_team_short_name: string;
  home_team_abbreviation: string;
  home_team_flag_url: string | null;
  away_team_id: string;
  away_team_name: string;
  away_team_short_name: string;
  away_team_abbreviation: string;
  away_team_flag_url: string | null;
};

type SyncSourceRow = {
  source: string;
  status: string;
  message: string | null;
  normalized_matches: number | null;
  observed_at: string;
};

function canonicalizeMatch(match: Match): Match {
  return {
    ...match,
    id: buildMatchKey(match.homeTeam, match.awayTeam, match.stage, match.providerMatchId ?? match.id),
  };
}

function matchSignature(stage: string | null, groupName: string | null, homeTeamId: string | null, awayTeamId: string | null) {
  if (!stage || !homeTeamId || !awayTeamId) {
    return null;
  }

  return [stage, groupName ?? "", homeTeamId, awayTeamId].join(":");
}

function signatureForMatch(match: Match) {
  return matchSignature(match.stage, match.groupName ?? null, match.homeTeam.id, match.awayTeam.id);
}

function shouldRefreshMatchBeforePick(match: Match, now = new Date()) {
  const kickoff = new Date(match.kickoffAt);
  const startsAt = kickoff.getTime() - 24 * 60 * 60 * 1000;
  const endsAt = kickoff.getTime() + 6 * 60 * 60 * 1000;
  return now.getTime() >= startsAt && now.getTime() <= endsAt;
}

function mapMatchRow(row: MatchRow): Match {
  return {
    id: row.id,
    providerMatchId: row.provider_match_id ?? undefined,
    stage: row.stage,
    groupName: row.group_name ?? undefined,
    kickoffAt: new Date(row.kickoff_at).toISOString(),
    lockAt: new Date(row.lock_at).toISOString(),
    venue: row.venue ?? "",
    homeTeam: {
      id: row.home_team_id,
      name: row.home_team_name,
      shortName: row.home_team_short_name,
      abbreviation: row.home_team_abbreviation,
      flagUrl: row.home_team_flag_url ?? "",
    },
    awayTeam: {
      id: row.away_team_id,
      name: row.away_team_name,
      shortName: row.away_team_short_name,
      abbreviation: row.away_team_abbreviation,
      flagUrl: row.away_team_flag_url ?? "",
    },
    status: row.status,
    homeScore: row.home_score ?? undefined,
    awayScore: row.away_score ?? undefined,
    winner: row.winner ?? undefined,
  };
}

async function loadMatchById(sql: ReturnType<typeof neon<false, false>>, matchId: string) {
  const rows = (await sql`
    select
      m.id,
      m.provider_match_id,
      m.stage,
      m.group_name,
      m.kickoff_at,
      m.lock_at,
      m.venue,
      m.status,
      m.home_score,
      m.away_score,
      m.winner,
      ht.id as home_team_id,
      ht.name as home_team_name,
      ht.short_name as home_team_short_name,
      ht.abbreviation as home_team_abbreviation,
      ht.flag_url as home_team_flag_url,
      at.id as away_team_id,
      at.name as away_team_name,
      at.short_name as away_team_short_name,
      at.abbreviation as away_team_abbreviation,
      at.flag_url as away_team_flag_url
    from mibr_fantasy_world_cup.matches m
    join mibr_fantasy_world_cup.teams ht on ht.id = m.home_team_id
    join mibr_fantasy_world_cup.teams at on at.id = m.away_team_id
    where m.id = ${matchId}
    limit 1
  `) as MatchRow[];

  return rows[0] ? mapMatchRow(rows[0]) : null;
}

async function ensureMatchSeeded(sql: ReturnType<typeof neon<false, false>>, match: Match) {
  for (const team of [match.homeTeam, match.awayTeam]) {
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
      updated_at
    )
    values (
      ${match.id},
      ${match.providerMatchId ?? null},
      ${match.stage},
      ${match.groupName ?? null},
      ${match.kickoffAt},
      ${match.lockAt},
      ${match.venue},
      ${match.homeTeam.id},
      ${match.awayTeam.id},
      ${match.status},
      ${match.homeScore ?? null},
      ${match.awayScore ?? null},
      ${match.winner ?? null},
      now()
    )
    on conflict (id) do update
    set provider_match_id = excluded.provider_match_id,
        stage = excluded.stage,
        group_name = excluded.group_name,
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
        updated_at = now()
  `;
}

async function refreshMatchStatusBeforePick(sql: ReturnType<typeof neon<false, false>>, match: Match) {
  if (!shouldRefreshMatchBeforePick(match)) {
    return match;
  }

  let candidate: Match | null = null;
  try {
    candidate = await fetchEspnMatchForMatch(match);
  } catch {
    throw new Error("Could not verify live match status. Try again in a minute.");
  }

  if (!candidate) {
    return match;
  }

  await sql`
    update mibr_fantasy_world_cup.matches
    set provider_match_id = coalesce(provider_match_id, ${candidate.providerMatchId ?? null}),
        kickoff_at = ${candidate.kickoffAt},
        lock_at = least(lock_at, ${candidate.lockAt}),
        status = case
          when ${candidate.status} = 'SCHEDULED'
           and status in ('LIVE', 'IN_PLAY', 'PAUSED', 'FINISHED') then status
          else ${candidate.status}
        end,
        home_score = ${candidate.homeScore ?? null},
        away_score = ${candidate.awayScore ?? null},
        winner = ${candidate.winner ?? null},
        synced_at = now(),
        updated_at = now()
    where id = ${match.id}
  `;

  const preservedLiveStatus =
    ["LIVE", "IN_PLAY", "PAUSED", "FINISHED"].includes(match.status) && candidate.status === "SCHEDULED";
  const effectiveStatus = preservedLiveStatus ? match.status : candidate.status;
  const effectiveLockAt =
    new Date(match.lockAt).getTime() <= new Date(candidate.lockAt).getTime() ? match.lockAt : candidate.lockAt;

  return {
    ...match,
    providerMatchId: match.providerMatchId ?? candidate.providerMatchId,
    kickoffAt: candidate.kickoffAt,
    lockAt: effectiveLockAt,
    status: effectiveStatus,
    homeScore: candidate.homeScore,
    awayScore: candidate.awayScore,
    winner: candidate.winner,
  };
}

async function assertActiveAuthorizedUser(sql: ReturnType<typeof neon<false, false>>, discordUserId: string) {
  const rows = (await sql`
    select 1
    from mibr_fantasy_world_cup.authorized_users
    where discord_user_id = ${discordUserId}
      and active = true
    limit 1
  `) as { "?column?": number }[];

  if (rows.length === 0) {
    throw new Error("User is not authorized for picks");
  }
}

async function findExistingPredictionMatchId(
  sql: ReturnType<typeof neon<false, false>>,
  discordUserId: string,
  match: Match,
) {
  const rows = (await sql`
    select p.match_id
    from mibr_fantasy_world_cup.predictions p
    join mibr_fantasy_world_cup.matches m on m.id = p.match_id
    where p.discord_user_id = ${discordUserId}
      and m.stage = ${match.stage}
      and m.group_name is not distinct from ${match.groupName ?? null}
      and m.home_team_id = ${match.homeTeam.id}
      and m.away_team_id = ${match.awayTeam.id}
    order by (p.match_id = ${match.id}) desc, p.updated_at desc
    limit 1
  `) as { match_id: string }[];

  return rows[0]?.match_id;
}

export async function getMatches(): Promise<Match[]> {
  const databaseUrl = optionalEnv("DATABASE_URL");
  if (!databaseUrl) {
    return mockMatches.map(canonicalizeMatch);
  }

  try {
    const sql = neon(databaseUrl);
    const rows = (await sql`
      with canonical_state as (
        select exists (
          select 1
          from mibr_fantasy_world_cup.matches
          where id like '%\\_%' escape '\\'
        ) as has_canonical
      )
      select
        m.id,
        m.provider_match_id,
        m.stage,
        m.group_name,
        m.kickoff_at,
        m.lock_at,
        m.venue,
        m.status,
        m.home_score,
        m.away_score,
        m.winner,
        ht.id as home_team_id,
        ht.name as home_team_name,
        ht.short_name as home_team_short_name,
        ht.abbreviation as home_team_abbreviation,
        ht.flag_url as home_team_flag_url,
        at.id as away_team_id,
        at.name as away_team_name,
        at.short_name as away_team_short_name,
        at.abbreviation as away_team_abbreviation,
        at.flag_url as away_team_flag_url
      from mibr_fantasy_world_cup.matches m
      cross join canonical_state cs
      join mibr_fantasy_world_cup.teams ht on ht.id = m.home_team_id
      join mibr_fantasy_world_cup.teams at on at.id = m.away_team_id
      where cs.has_canonical = false
         or m.id like '%\\_%' escape '\\'
      order by m.kickoff_at asc, m.provider_match_id asc nulls last
    `) as MatchRow[];

    if (rows.length === 0) {
      return mockMatches.map(canonicalizeMatch);
    }

    return rows.map(mapMatchRow);
  } catch (error) {
    console.error("Failed to load MiBR fantasy matches", error);
    return mockMatches.map(canonicalizeMatch);
  }
}

export async function getMatchSyncOverview(): Promise<MatchSyncOverview> {
  const databaseUrl = optionalEnv("DATABASE_URL");
  if (!databaseUrl) {
    return { consolidatedMatches: mockMatches.length, openConflicts: 0, sources: [], conflicts: [] };
  }

  try {
    const sql = neon(databaseUrl);
    const countRows = (await sql`
      select count(*)::int as count
      from mibr_fantasy_world_cup.matches
    `) as { count: number }[];
    const sourceRows = (await sql`
      select distinct on (source)
        source,
        status,
        message,
        normalized_matches,
        observed_at
      from mibr_fantasy_world_cup.match_source_observations
      order by source, observed_at desc
    `) as SyncSourceRow[];
    const sources: MatchSyncSourceStatus[] = sourceRows.map((row) => ({
      source: row.source,
      status: row.status,
      message: row.message ?? undefined,
      normalizedMatches: row.normalized_matches ?? 0,
      observedAt: row.observed_at,
    }));

    return {
      consolidatedMatches: countRows[0]?.count ?? 0,
      openConflicts: 0,
      sources,
      conflicts: [],
    };
  } catch (error) {
    console.error("Failed to load MiBR fantasy sync overview", error);
    return { consolidatedMatches: mockMatches.length, openConflicts: 0, sources: [], conflicts: [] };
  }
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const databaseUrl = optionalEnv("DATABASE_URL");
  if (!databaseUrl) {
    return mockLeaderboard;
  }

  try {
    const sql = neon(databaseUrl);
    const rows = (await sql`
      select
        u.discord_user_id,
        u.display_label,
        u.discord_avatar_url,
        u.paid_entry,
        coalesce(sum(p.total_points), 0)::int as total_points,
        coalesce(sum(p.winner_points), 0)::int as winner_points,
        coalesce(count(*) filter (where p.winner_points > 0), 0)::int as winner_scores,
        coalesce(sum(p.score_points), 0)::int as score_points,
        coalesce(count(*) filter (where p.score_points > 0), 0)::int as exact_scores,
        coalesce(count(p.id), 0)::int as predictions
      from mibr_fantasy_world_cup.authorized_users u
      left join mibr_fantasy_world_cup.predictions p on p.discord_user_id = u.discord_user_id
      where u.active = true
      group by u.discord_user_id, u.display_label, u.discord_avatar_url, u.paid_entry
      order by total_points desc, exact_scores desc, predictions desc, u.display_label asc
    `) as LeaderboardRow[];

    return rows.map((row, index) => ({
      rank: index + 1,
      discordUserId: row.discord_user_id,
      displayLabel: row.display_label,
      discordAvatarUrl: row.discord_avatar_url ?? undefined,
      paidEntry: row.paid_entry,
      totalPoints: row.total_points ?? 0,
      winnerPoints: row.winner_points ?? 0,
      winnerScores: row.winner_scores ?? 0,
      scorePoints: row.score_points ?? 0,
      exactScores: row.exact_scores ?? 0,
      predictions: row.predictions ?? 0,
    }));
  } catch (error) {
    console.error("Failed to load MiBR fantasy leaderboard", error);
    return mockLeaderboard;
  }
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  const databaseUrl = optionalEnv("DATABASE_URL");
  if (!databaseUrl) {
    return [];
  }

  try {
    const sql = neon(databaseUrl);
    const rows = (await sql`
      select
        u.discord_user_id,
        u.display_label,
        u.discord_avatar_url,
        u.role,
        u.paid_entry,
        u.last_login_at,
        u.created_at,
        coalesce(count(p.id), 0)::int as predictions,
        coalesce(sum(p.total_points), 0)::int as total_points
      from mibr_fantasy_world_cup.authorized_users u
      left join mibr_fantasy_world_cup.predictions p on p.discord_user_id = u.discord_user_id
      where u.active = true
      group by
        u.discord_user_id,
        u.display_label,
        u.discord_avatar_url,
        u.role,
        u.paid_entry,
        u.last_login_at,
        u.created_at
      order by u.created_at desc, u.display_label asc
    `) as AdminUserRow[];

    return rows.map((row) => ({
      discordUserId: row.discord_user_id,
      displayLabel: row.display_label,
      discordAvatarUrl: row.discord_avatar_url ?? undefined,
      role: row.role,
      paidEntry: row.paid_entry,
      predictions: row.predictions ?? 0,
      totalPoints: row.total_points ?? 0,
      lastLoginAt: row.last_login_at ?? undefined,
      createdAt: row.created_at,
    }));
  } catch (error) {
    console.error("Failed to load MiBR fantasy admin users", error);
    return [];
  }
}

export async function updateUserPayment(discordUserId: string, paidEntry: boolean) {
  const databaseUrl = optionalEnv("DATABASE_URL");
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const sql = neon(databaseUrl);
  await sql`
    update mibr_fantasy_world_cup.authorized_users
    set paid_entry = ${paidEntry},
        paid_at = case when ${paidEntry} then now() else null end,
        updated_at = now()
    where discord_user_id = ${discordUserId}
  `;
}

export async function deactivateUser(discordUserId: string) {
  const databaseUrl = optionalEnv("DATABASE_URL");
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const sql = neon(databaseUrl);
  const rows = (await sql`
    update mibr_fantasy_world_cup.authorized_users
    set active = false,
        updated_at = now()
    where discord_user_id = ${discordUserId}
      and role <> 'owner'
    returning discord_user_id
  `) as { discord_user_id: string }[];

  if (rows.length === 0) {
    throw new Error("User was not removed. Owners cannot be removed.");
  }
}

export async function getUserPredictions(
  discordUserId?: string,
  displayedMatches: Match[] = [],
): Promise<Record<string, PredictionResult>> {
  const databaseUrl = optionalEnv("DATABASE_URL");
  if (!databaseUrl || !discordUserId) {
    return {};
  }

  try {
    const sql = neon(databaseUrl);
    const displayedMatchIds = new Set(displayedMatches.map((match) => match.id));
    const displayedMatchesBySignature = new Map(
      displayedMatches
        .map((match) => [signatureForMatch(match), match] as const)
        .filter((entry): entry is [string, Match] => Boolean(entry[0])),
    );
    const rows = (await sql`
      select
        p.match_id,
        p.predicted_winner,
        p.predicted_home_score,
        p.predicted_away_score,
        p.winner_points,
        p.score_points,
        p.total_points,
        m.stage,
        m.group_name,
        m.home_team_id,
        m.away_team_id
      from mibr_fantasy_world_cup.predictions p
      left join mibr_fantasy_world_cup.matches m on m.id = p.match_id
      where p.discord_user_id = ${discordUserId}
    `) as PredictionRow[];

    const predictions: Record<string, PredictionResult> = {};
    for (const row of rows) {
      const prediction = {
        matchId: row.match_id,
        predictedWinner: row.predicted_winner,
        predictedHomeScore: row.predicted_home_score ?? undefined,
        predictedAwayScore: row.predicted_away_score ?? undefined,
        winnerPoints: row.winner_points ?? 0,
        scorePoints: row.score_points ?? 0,
        totalPoints: row.total_points ?? 0,
      };
      predictions[row.match_id] = prediction;

      if (displayedMatchIds.has(row.match_id)) {
        continue;
      }

      const signature = matchSignature(row.stage, row.group_name, row.home_team_id, row.away_team_id);
      const displayedMatch = signature ? displayedMatchesBySignature.get(signature) : undefined;
      if (displayedMatch && !predictions[displayedMatch.id]) {
        predictions[displayedMatch.id] = { ...prediction, matchId: displayedMatch.id };
      }
    }

    return predictions;
  } catch (error) {
    console.error("Failed to load MiBR fantasy predictions", error);
    return {};
  }
}

export async function savePrediction(discordUserId: string, draft: PredictionDraft) {
  const databaseUrl = optionalEnv("DATABASE_URL");
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const sql = neon(databaseUrl);
  await assertActiveAuthorizedUser(sql, discordUserId);
  const loadedMatch =
    (await loadMatchById(sql, draft.matchId)) ??
    mockMatches.map(canonicalizeMatch).find((candidate) => candidate.id === draft.matchId);
  if (!loadedMatch) {
    throw new Error("Match not found");
  }

  const match = await refreshMatchStatusBeforePick(sql, loadedMatch);

  if (isMatchLocked(match)) {
    throw new Error("Match is closed for picks");
  }

  if (!isMatchPickable(match)) {
    throw new Error("Match is not open for picks yet");
  }

  const validation = validatePrediction(draft);
  if (!validation.valid || !draft.predictedWinner) {
    throw new Error(validation.message ?? "Invalid pick");
  }

  const existingPredictionMatchId = await findExistingPredictionMatchId(sql, discordUserId, match);
  const targetMatch = existingPredictionMatchId ? { ...match, id: existingPredictionMatchId } : match;

  await ensureMatchSeeded(sql, targetMatch);
  await sql`
    insert into mibr_fantasy_world_cup.predictions (
      discord_user_id,
      match_id,
      predicted_winner,
      predicted_home_score,
      predicted_away_score,
      updated_at
    )
    values (
      ${discordUserId},
      ${targetMatch.id},
      ${draft.predictedWinner},
      ${draft.predictedHomeScore ?? null},
      ${draft.predictedAwayScore ?? null},
      now()
    )
    on conflict (discord_user_id, match_id) do update
    set predicted_winner = excluded.predicted_winner,
        predicted_home_score = excluded.predicted_home_score,
        predicted_away_score = excluded.predicted_away_score,
        updated_at = now()
  `;
}
