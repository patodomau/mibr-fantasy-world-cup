import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
const apply = process.argv.includes("--apply");

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const sql = neon(databaseUrl);

const stagePriority = new Map([
  ["SCHEDULED", 1],
  ["POSTPONED", 2],
  ["SUSPENDED", 2],
  ["CANCELLED", 2],
  ["LIVE", 3],
  ["IN_PLAY", 3],
  ["PAUSED", 3],
  ["FINISHED", 4],
]);

// Keep this migration logic aligned with src/lib/fantasy-types.ts.
function matchKeyPart(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 24);
}

const teamCodeAliases = {
  AFS: "RSA",
  AFRICADOSUL: "RSA",
  AGL: "ALG",
  ARGELIA: "ALG",
  SOUTHAFRICA: "RSA",
  BOS: "BIH",
  BOSNIA: "BIH",
  BOSNIAEHERZEGOVINA: "BIH",
  BOSNIAANDHERZEGOVINA: "BIH",
  BRA: "BRA",
  BRASIL: "BRA",
  BRAZIL: "BRA",
  CAB: "CPV",
  CABOVERDE: "CPV",
  CAT: "QAT",
  CATAR: "QAT",
  QATAR: "QAT",
  CDM: "CIV",
  COSTADOMARFIM: "CIV",
  COR: "KOR",
  COREADOSUL: "KOR",
  SOUTHCOREA: "KOR",
  SOUTHKOREA: "KOR",
  KOREAREPUBLIC: "KOR",
  CUR: "CUW",
  CURACAO: "CUW",
  CTA: "CUW",
  TCH: "CZE",
  EQU: "ECU",
  EQUADOR: "ECU",
  EGI: "EGY",
  EGITO: "EGY",
  ESC: "SCO",
  ESCOCIA: "SCO",
  SCOTLAND: "SCO",
  ESTADOSUNIDOS: "USA",
  EUA: "USA",
  UNITEDSTATES: "USA",
  UNITEDSTATESOFAMERICA: "USA",
  GAN: "GHA",
  GANA: "GHA",
  ALE: "GER",
  HOL: "NED",
  HOLANDA: "NED",
  IRA: "IRN",
  IRAO: "IRN",
  ING: "ENG",
  JAP: "JPN",
  NZE: "NZL",
  NOVAZELANDIA: "NZL",
  RDC: "COD",
  RDCONGO: "COD",
  SAU: "KSA",
  ARABIASAUDITA: "KSA",
  SUE: "SWE",
  SUECIA: "SWE",
  URY: "URU",
  USA: "USA",
};

function isTeamPending(team) {
  const marker = `${team.id} ${team.name} ${team.shortName} ${team.abbreviation}`.toLowerCase();
  return (
    marker.includes("tbd") ||
    marker.includes("winner") ||
    marker.includes("runner") ||
    marker.includes("third-place") ||
    marker.includes("3rd") ||
    marker.includes("finalist") ||
    marker.includes("slot-")
  );
}

function canonicalTeamKeyPart(team) {
  const candidates = [team.abbreviation, team.shortName, team.name, team.id].map(matchKeyPart);
  for (const candidate of candidates) {
    if (teamCodeAliases[candidate]) {
      return teamCodeAliases[candidate];
    }
  }

  return candidates[0];
}

function matchTeamKeyPart(team) {
  if (isTeamPending(team)) {
    return matchKeyPart(team.id || team.shortName || team.name || team.abbreviation);
  }

  return canonicalTeamKeyPart(team);
}

function buildMatchKey(homeTeam, awayTeam, stage, slotKey) {
  const home = matchTeamKeyPart(homeTeam);
  const away = matchTeamKeyPart(awayTeam);
  const stagePart = matchKeyPart(stage);

  if (slotKey && (isTeamPending(homeTeam) || isTeamPending(awayTeam))) {
    return `${home}_${away}_${stagePart}_${matchKeyPart(slotKey)}`;
  }

  return `${home}_${away}_${stagePart}`;
}

function toTeam(row, side) {
  return {
    id: row[`${side}_team_id`],
    name: row[`${side}_team_name`],
    shortName: row[`${side}_team_short_name`],
    abbreviation: row[`${side}_team_abbreviation`],
  };
}

function compareTimestampsDesc(a, b, field) {
  const aTime = a[field] ? new Date(a[field]).getTime() : 0;
  const bTime = b[field] ? new Date(b[field]).getTime() : 0;
  return bTime - aTime;
}

function selectCanonicalMatch(rows, newId) {
  return [...rows].sort((a, b) => {
    if (a.id === newId && b.id !== newId) return -1;
    if (b.id === newId && a.id !== newId) return 1;
    if ((b.prediction_count ?? 0) !== (a.prediction_count ?? 0)) {
      return (b.prediction_count ?? 0) - (a.prediction_count ?? 0);
    }
    const statusDelta = (stagePriority.get(b.status) ?? 0) - (stagePriority.get(a.status) ?? 0);
    if (statusDelta !== 0) return statusDelta;
    if (Boolean(b.provider_match_id) !== Boolean(a.provider_match_id)) {
      return Number(Boolean(b.provider_match_id)) - Number(Boolean(a.provider_match_id));
    }
    return compareTimestampsDesc(a, b, "updated_at") || a.id.localeCompare(b.id);
  })[0];
}

function newestRow(rows) {
  return [...rows].sort(
    (a, b) =>
      compareTimestampsDesc(a, b, "updated_at") ||
      compareTimestampsDesc(a, b, "submitted_at") ||
      compareTimestampsDesc(a, b, "observed_at") ||
      Number(b.id ?? 0) - Number(a.id ?? 0),
  )[0];
}

function groupBy(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return groups;
}

function jsonArray(values) {
  return JSON.stringify(values);
}

async function loadState() {
  const matches = await sql`
    select
      m.*,
      ht.name as home_team_name,
      ht.short_name as home_team_short_name,
      ht.abbreviation as home_team_abbreviation,
      at.name as away_team_name,
      at.short_name as away_team_short_name,
      at.abbreviation as away_team_abbreviation,
      coalesce(pc.prediction_count, 0)::int as prediction_count
    from mibr_fantasy_world_cup.matches m
    join mibr_fantasy_world_cup.teams ht on ht.id = m.home_team_id
    join mibr_fantasy_world_cup.teams at on at.id = m.away_team_id
    left join (
      select match_id, count(*)::int as prediction_count
      from mibr_fantasy_world_cup.predictions
      group by match_id
    ) pc on pc.match_id = m.id
    order by m.kickoff_at, m.id
  `;

  const predictions = await sql`
    select *
    from mibr_fantasy_world_cup.predictions
    order by match_id, discord_user_id, updated_at, id
  `;

  const observations = await sql`
    select *
    from mibr_fantasy_world_cup.match_observations
    order by match_id, source, observed_at, id
  `;

  const conflicts = await sql`
    select *
    from mibr_fantasy_world_cup.match_conflicts
    order by match_id, field_name, status, observed_at, id
  `;

  return { matches, predictions, observations, conflicts };
}

function buildPlan(state) {
  const matchMappings = state.matches.map((match) => {
    const homeTeam = toTeam(match, "home");
    const awayTeam = toTeam(match, "away");
    const newId = buildMatchKey(
      homeTeam,
      awayTeam,
      match.stage,
      match.provider_match_id ?? match.id,
    );

    return { ...match, homeTeam, awayTeam, newId };
  });

  const changedMappings = matchMappings.filter((match) => match.id !== match.newId);
  const matchGroups = groupBy(matchMappings, (match) => match.newId);
  const affectedGroups = [...matchGroups.entries()]
    .filter(([, rows]) => rows.length > 1 || rows.some((row) => row.id !== row.newId))
    .map(([newId, rows]) => ({
      newId,
      rows,
      canonical: selectCanonicalMatch(rows, newId),
    }));

  const oldToNew = new Map(matchMappings.map((match) => [match.id, match.newId]));
  const affectedOldIds = new Set(affectedGroups.flatMap((group) => group.rows.map((row) => row.id)));
  const affectedNewIds = new Set(affectedGroups.map((group) => group.newId));

  const predictionRows = state.predictions
    .filter((row) => affectedOldIds.has(row.match_id) || affectedNewIds.has(row.match_id))
    .map((row) => ({ ...row, new_match_id: oldToNew.get(row.match_id) ?? row.match_id }));
  const predictionGroups = groupBy(
    predictionRows,
    (row) => `${row.discord_user_id}:${row.new_match_id}`,
  );
  const predictionDeletes = [];
  const predictionUpdates = [];
  for (const rows of predictionGroups.values()) {
    const keeper = newestRow(rows);
    for (const row of rows) {
      if (row.id !== keeper.id) {
        predictionDeletes.push(row);
      }
    }
    if (keeper.match_id !== keeper.new_match_id) {
      predictionUpdates.push(keeper);
    }
  }

  const observationRows = state.observations
    .filter((row) => affectedOldIds.has(row.match_id) || affectedNewIds.has(row.match_id))
    .map((row) => ({ ...row, new_match_id: oldToNew.get(row.match_id) ?? row.match_id }));
  const observationGroups = groupBy(observationRows, (row) => `${row.source}:${row.new_match_id}`);
  const observationDeletes = [];
  const observationUpdates = [];
  for (const rows of observationGroups.values()) {
    const keeper = newestRow(rows);
    for (const row of rows) {
      if (row.id !== keeper.id) {
        observationDeletes.push(row);
      }
    }
    if (keeper.match_id !== keeper.new_match_id) {
      observationUpdates.push(keeper);
    }
  }

  const conflictRows = state.conflicts
    .filter((row) => affectedOldIds.has(row.match_id) || affectedNewIds.has(row.match_id))
    .map((row) => ({ ...row, new_match_id: oldToNew.get(row.match_id) ?? row.match_id }));
  const conflictGroups = groupBy(
    conflictRows,
    (row) => `${row.field_name}:${row.status}:${row.new_match_id}`,
  );
  const conflictDeletes = [];
  const conflictUpdates = [];
  for (const rows of conflictGroups.values()) {
    const keeper = newestRow(rows);
    for (const row of rows) {
      if (row.id !== keeper.id) {
        conflictDeletes.push(row);
      }
    }
    if (keeper.match_id !== keeper.new_match_id) {
      conflictUpdates.push(keeper);
    }
  }

  return {
    matchMappings,
    changedMappings,
    affectedGroups,
    oldToNew,
    affectedOldIds,
    affectedNewIds,
    predictionDeletes,
    predictionUpdates,
    observationDeletes,
    observationUpdates,
    conflictDeletes,
    conflictUpdates,
  };
}

function makeSummary(state, plan) {
  const collisions = plan.affectedGroups
    .filter((group) => group.rows.length > 1)
    .map((group) => ({
      newId: group.newId,
      canonicalId: group.canonical.id,
      matches: group.rows.map((row) => ({
        id: row.id,
        providerMatchId: row.provider_match_id,
        kickoffAt: row.kickoff_at,
        predictionCount: row.prediction_count,
      })),
      duplicatePredictionUsers: [
        ...groupBy(
          state.predictions
            .filter((row) => group.rows.some((match) => match.id === row.match_id))
            .map((row) => ({ ...row, new_match_id: group.newId })),
          (row) => `${row.discord_user_id}:${row.new_match_id}`,
        ).values(),
      ]
        .filter((rows) => rows.length > 1)
        .map((rows) => rows[0].discord_user_id),
    }));

  return {
    mode: apply ? "apply" : "dry-run",
    matches: {
      current: state.matches.length,
      changedIds: plan.changedMappings.length,
      affectedGroups: plan.affectedGroups.length,
      collisions: collisions.length,
    },
    predictions: {
      current: state.predictions.length,
      updates: plan.predictionUpdates.length,
      duplicateDeletes: plan.predictionDeletes.length,
    },
    matchObservations: {
      current: state.observations.length,
      updates: plan.observationUpdates.length,
      duplicateDeletes: plan.observationDeletes.length,
    },
    matchConflicts: {
      current: state.conflicts.length,
      updates: plan.conflictUpdates.length,
      duplicateDeletes: plan.conflictDeletes.length,
    },
    collisions,
  };
}

function addDeleteByIdsQuery(queries, txn, table, ids) {
  if (ids.length === 0) {
    return;
  }

  queries.push(txn.query(
    `delete from mibr_fantasy_world_cup.${table}
     where id in (
       select jsonb_array_elements_text($1::jsonb)::bigint
     )`,
    [jsonArray(ids)],
  ));
}

function addUpdateMatchIdQueries(queries, txn, table, rows) {
  for (const row of rows) {
    queries.push(txn.query(
      `update mibr_fantasy_world_cup.${table}
       set match_id = $1
       where id = $2`,
      [row.new_match_id, row.id],
    ));
  }
}

function addUpsertMatchQueries(queries, txn, groups) {
  for (const group of groups) {
    const match = group.canonical;
    queries.push(txn`
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
        created_at,
        updated_at
      )
      values (
        ${group.newId},
        ${match.provider_match_id},
        ${match.stage},
        ${match.group_name},
        ${match.kickoff_at},
        ${match.lock_at},
        ${match.venue},
        ${match.home_team_id},
        ${match.away_team_id},
        ${match.status},
        ${match.home_score},
        ${match.away_score},
        ${match.winner},
        ${match.synced_at},
        ${match.created_at},
        ${match.updated_at}
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
          status = excluded.status,
          home_score = excluded.home_score,
          away_score = excluded.away_score,
          winner = excluded.winner,
          synced_at = excluded.synced_at,
          created_at = least(mibr_fantasy_world_cup.matches.created_at, excluded.created_at),
          updated_at = greatest(mibr_fantasy_world_cup.matches.updated_at, excluded.updated_at)
    `);
  }
}

function addDeleteOldMatchQueries(queries, txn, groups) {
  for (const group of groups) {
    const oldIds = group.rows.map((row) => row.id).filter((id) => id !== group.newId);
    if (oldIds.length === 0) {
      continue;
    }

    queries.push(txn`
      delete from mibr_fantasy_world_cup.matches
      where id in (
        select jsonb_array_elements_text(${jsonArray(oldIds)}::jsonb)
      )
    `);
  }
}

function addRecalculatePredictionQueries(queries, txn, targetIds) {
  if (targetIds.length === 0) {
    return;
  }

  queries.push(txn`
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
        total_points = (
          case
            when m.winner is not null and p.predicted_winner = m.winner then 3
            else 0
          end
        ) + (
          case
            when m.home_score is not null
             and m.away_score is not null
             and p.predicted_home_score = m.home_score
             and p.predicted_away_score = m.away_score then 2
            else 0
          end
        )
    from mibr_fantasy_world_cup.matches m
    where p.match_id = m.id
      and p.match_id in (
        select jsonb_array_elements_text(${jsonArray(targetIds)}::jsonb)
      )
  `);
}

async function applyPlan(plan) {
  const queries = [];
  await sql.transaction(
    (txn) => {
      queries.push(txn`
        alter table mibr_fantasy_world_cup.predictions
        disable trigger predictions_require_active_user
      `);

      addUpsertMatchQueries(queries, txn, plan.affectedGroups);
      addDeleteByIdsQuery(
        queries,
        txn,
        "predictions",
        plan.predictionDeletes.map((row) => row.id),
      );
      addUpdateMatchIdQueries(queries, txn, "predictions", plan.predictionUpdates);
      addDeleteByIdsQuery(
        queries,
        txn,
        "match_observations",
        plan.observationDeletes.map((row) => row.id),
      );
      addUpdateMatchIdQueries(queries, txn, "match_observations", plan.observationUpdates);
      addDeleteByIdsQuery(
        queries,
        txn,
        "match_conflicts",
        plan.conflictDeletes.map((row) => row.id),
      );
      addUpdateMatchIdQueries(queries, txn, "match_conflicts", plan.conflictUpdates);
      addDeleteOldMatchQueries(queries, txn, plan.affectedGroups);
      addRecalculatePredictionQueries(queries, txn, [...plan.affectedNewIds]);

      queries.push(txn`
        alter table mibr_fantasy_world_cup.predictions
        enable trigger predictions_require_active_user
      `);

      return queries;
    },
    { isolationLevel: "Serializable" },
  );
}

async function validate() {
  const timestampStyleIds = await sql`
    select id
    from mibr_fantasy_world_cup.matches
    where id ~ '_[0-9]{10}$'
    order by id
  `;

  const orphanPredictions = await sql`
    select count(*)::int as count
    from mibr_fantasy_world_cup.predictions p
    left join mibr_fantasy_world_cup.matches m on m.id = p.match_id
    where m.id is null
  `;

  const duplicatePredictions = await sql`
    select discord_user_id, match_id, count(*)::int as count
    from mibr_fantasy_world_cup.predictions
    group by discord_user_id, match_id
    having count(*) > 1
    order by match_id, discord_user_id
  `;

  const matchCount = await sql`
    select count(*)::int as count
    from mibr_fantasy_world_cup.matches
  `;

  const predictionCount = await sql`
    select count(*)::int as count
    from mibr_fantasy_world_cup.predictions
  `;

  return {
    matches: matchCount[0].count,
    predictions: predictionCount[0].count,
    timestampStyleMatchIds: timestampStyleIds.map((row) => row.id),
    orphanPredictions: orphanPredictions[0].count,
    duplicatePredictions,
  };
}

const state = await loadState();
const plan = buildPlan(state);
console.log(JSON.stringify(makeSummary(state, plan), null, 2));

if (!apply) {
  console.log("Dry-run only. Re-run with --apply to mutate the database.");
  process.exit(0);
}

await applyPlan(plan);
console.log(JSON.stringify({ validation: await validate() }, null, 2));
