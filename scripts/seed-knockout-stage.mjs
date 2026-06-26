import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const tableName = process.env.MIBR_DYNAMODB_TABLE ?? "ddb-mibr-fantasy-api-dynamodb-state";
const profile = process.env.AWS_PROFILE ?? "bootstrap-admin";
const apply = process.argv.includes("--apply");

function aws(args, input) {
  return execFileSync("aws", [...args, "--profile", profile, "--output", "json"], {
    encoding: "utf8",
    input,
  });
}

function tempJson(value, name) {
  const path = join(tmpdir(), `${name}-${process.pid}-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(value), "utf8");
  return path;
}

function ddbToJs(value) {
  if (!value || typeof value !== "object") return undefined;
  if ("S" in value) return value.S;
  if ("N" in value) return Number(value.N);
  if ("BOOL" in value) return Boolean(value.BOOL);
  if ("NULL" in value) return null;
  if ("M" in value) return Object.fromEntries(Object.entries(value.M).map(([key, item]) => [key, ddbToJs(item)]));
  if ("L" in value) return value.L.map(ddbToJs);
  return undefined;
}

function jsToDdb(value) {
  if (value === null || value === undefined) return { NULL: true };
  if (typeof value === "string") return { S: value };
  if (typeof value === "number") return { N: String(value) };
  if (typeof value === "boolean") return { BOOL: value };
  if (Array.isArray(value)) return { L: value.map(jsToDdb) };
  return { M: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsToDdb(item)])) };
}

function queryPartition(pk) {
  const exprPath = tempJson({ ":pk": { S: pk } }, "mibr-query");
  try {
    const raw = aws([
      "dynamodb",
      "query",
      "--table-name",
      tableName,
      "--key-condition-expression",
      "pk = :pk",
      "--expression-attribute-values",
      `file://${exprPath}`,
    ]);
    return JSON.parse(raw).Items ?? [];
  } finally {
    unlinkSync(exprPath);
  }
}

function normalizeGroupName(groupName) {
  const match = String(groupName ?? "").trim().match(/(?:GROUP|Group)[_\s-]?([A-L])$/i);
  return match ? `Group ${match[1].toUpperCase()}` : String(groupName ?? "").trim();
}

function groupLetter(groupName) {
  return normalizeGroupName(groupName).replace("Group ", "");
}

function deterministicRank(groupName, team) {
  const text = `${groupName}:${team.id}:${team.abbreviation}`;
  let hash = 0;
  for (const char of text) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function rankGroup(groupName, matches) {
  const rows = new Map();
  for (const match of matches) {
    for (const team of [match.homeTeam, match.awayTeam]) {
      const teamKey = team.abbreviation || team.id;
      if (!rows.has(teamKey)) {
        rows.set(teamKey, {
          team,
          groupName,
          played: 0,
          points: 0,
          gf: 0,
          ga: 0,
          gd: 0,
          tiebreaker: deterministicRank(groupName, team),
        });
      }
    }
  }

  let resultsUsed = 0;
  for (const match of matches) {
    if (!Number.isInteger(match.homeScore) || !Number.isInteger(match.awayScore)) continue;
    const home = rows.get(match.homeTeam.abbreviation || match.homeTeam.id);
    const away = rows.get(match.awayTeam.abbreviation || match.awayTeam.id);
    resultsUsed += 1;
    home.played += 1;
    away.played += 1;
    home.gf += match.homeScore;
    home.ga += match.awayScore;
    away.gf += match.awayScore;
    away.ga += match.homeScore;
    if (match.homeScore > match.awayScore) home.points += 3;
    else if (match.awayScore > match.homeScore) away.points += 3;
    else {
      home.points += 1;
      away.points += 1;
    }
    home.gd = home.gf - home.ga;
    away.gd = away.gf - away.ga;
  }

  return {
    groupName,
    resultsUsed,
    ranked: [...rows.values()].sort(
      (left, right) =>
        right.points - left.points ||
        right.gd - left.gd ||
        right.gf - left.gf ||
        right.tiebreaker - left.tiebreaker,
    ),
  };
}

function placeholderTeam(label, abbreviation) {
  const clean = label.trim();
  return {
    id: `slot-${clean.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    name: clean,
    shortName: clean,
    abbreviation,
    flagUrl: "https://flagcdn.com/w160/un.png",
  };
}

function getLockAt(kickoffAt) {
  return new Date(new Date(kickoffAt).getTime() - 5 * 60 * 1000).toISOString();
}

function matchKeyPart(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 24);
}

function isPendingTeam(team) {
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

function matchTeamKeyPart(team) {
  if (isPendingTeam(team)) {
    return matchKeyPart(team.id || team.shortName || team.name || team.abbreviation);
  }

  return matchKeyPart(team.abbreviation || team.shortName || team.name || team.id);
}

function buildMatchKey(homeTeam, awayTeam, stage, slotKey) {
  const home = matchTeamKeyPart(homeTeam);
  const away = matchTeamKeyPart(awayTeam);
  const stagePart = matchKeyPart(stage);

  if (slotKey && (isPendingTeam(homeTeam) || isPendingTeam(awayTeam))) {
    return `${home}_${away}_${stagePart}_${matchKeyPart(slotKey)}`;
  }

  return `${home}_${away}_${stagePart}`;
}

function makeMatch(stage, kickoffAt, homeTeam, awayTeam, slotKey) {
  const id = buildMatchKey(homeTeam, awayTeam, stage, slotKey);
  return {
    id,
    providerMatchId: `stage-seed-${slotKey ?? id}`,
    stage,
    kickoffAt,
    lockAt: getLockAt(kickoffAt),
    venue: "Stage test seed",
    homeTeam,
    awayTeam,
    status: "SCHEDULED",
    homeScore: undefined,
    awayScore: undefined,
    winner: undefined,
  };
}

function batchWrite(requests) {
  for (let index = 0; index < requests.length; index += 25) {
    const requestPath = tempJson({ [tableName]: requests.slice(index, index + 25) }, "mibr-batch-write");
    try {
      aws(["dynamodb", "batch-write-item", "--request-items", `file://${requestPath}`]);
    } finally {
      unlinkSync(requestPath);
    }
  }
}

const items = queryPartition("MATCHES#2026");
const existingMatches = items.map((item) => ddbToJs(item.data));
const groupMatches = existingMatches.filter((match) => match.stage === "GROUP_STAGE");
const existingKnockoutItems = items.filter((item) => {
  const data = ddbToJs(item.data);
  return data.stage !== "GROUP_STAGE";
});

const groups = new Map();
for (const match of groupMatches) {
  const groupName = normalizeGroupName(match.groupName);
  if (!groups.has(groupName)) groups.set(groupName, []);
  groups.get(groupName).push({ ...match, groupName });
}

const standings = [...groups.entries()]
  .map(([groupName, matches]) => rankGroup(groupName, matches))
  .sort((left, right) => left.groupName.localeCompare(right.groupName));
const byLetter = Object.fromEntries(standings.map((standing) => [groupLetter(standing.groupName), standing]));
const thirdPlaceRows = standings
  .map((standing) => standing.ranked[2])
  .filter(Boolean)
  .sort(
    (left, right) =>
      right.points - left.points ||
      right.gd - left.gd ||
      right.gf - left.gf ||
      right.tiebreaker - left.tiebreaker,
  )
  .slice(0, 8);
let thirdCursor = 0;
const thirdTeam = () => thirdPlaceRows[thirdCursor++ % thirdPlaceRows.length].team;
const first = (letter) => byLetter[letter].ranked[0].team;
const second = (letter) => byLetter[letter].ranked[1].team;

const r32Slots = [
  [second("A"), second("B")],
  [first("E"), thirdTeam()],
  [first("F"), second("C")],
  [first("C"), second("F")],
  [first("I"), thirdTeam()],
  [second("E"), second("I")],
  [first("A"), thirdTeam()],
  [first("L"), thirdTeam()],
  [first("D"), thirdTeam()],
  [first("G"), thirdTeam()],
  [second("K"), second("L")],
  [first("H"), second("J")],
  [first("B"), thirdTeam()],
  [first("J"), second("H")],
  [first("K"), thirdTeam()],
  [second("D"), second("G")],
];
const r32Dates = [
  "2026-06-28T19:00:00.000Z",
  "2026-06-29T20:30:00.000Z",
  "2026-06-30T01:00:00.000Z",
  "2026-06-29T17:00:00.000Z",
  "2026-06-30T21:00:00.000Z",
  "2026-06-30T17:00:00.000Z",
  "2026-07-01T01:00:00.000Z",
  "2026-07-01T16:00:00.000Z",
  "2026-07-02T00:00:00.000Z",
  "2026-07-01T20:00:00.000Z",
  "2026-07-02T23:00:00.000Z",
  "2026-07-02T19:00:00.000Z",
  "2026-07-03T03:00:00.000Z",
  "2026-07-03T22:00:00.000Z",
  "2026-07-04T01:30:00.000Z",
  "2026-07-03T18:00:00.000Z",
];
const r16Dates = [
  "2026-07-04T17:00:00.000Z",
  "2026-07-04T21:00:00.000Z",
  "2026-07-05T20:00:00.000Z",
  "2026-07-06T00:00:00.000Z",
  "2026-07-07T00:00:00.000Z",
  "2026-07-06T19:00:00.000Z",
  "2026-07-07T20:00:00.000Z",
  "2026-07-07T16:00:00.000Z",
];
const qfDates = [
  "2026-07-09T20:00:00.000Z",
  "2026-07-11T21:00:00.000Z",
  "2026-07-10T19:00:00.000Z",
  "2026-07-12T01:00:00.000Z",
];
const sfDates = ["2026-07-14T19:00:00.000Z", "2026-07-15T19:00:00.000Z"];

const seededMatches = [
  ...r32Slots.map(([homeTeam, awayTeam], index) =>
    makeMatch("ROUND_OF_32", r32Dates[index], homeTeam, awayTeam),
  ),
  ...r16Dates.map((kickoffAt, index) =>
    makeMatch(
      "ROUND_OF_16",
      kickoffAt,
      placeholderTeam(`Winner R32 ${String(index * 2 + 1).padStart(2, "0")}`, `W${index * 2 + 1}`),
      placeholderTeam(`Winner R32 ${String(index * 2 + 2).padStart(2, "0")}`, `W${index * 2 + 2}`),
      `R16_${String(index + 1).padStart(2, "0")}`,
    ),
  ),
  ...qfDates.map((kickoffAt, index) =>
    makeMatch(
      "QUARTER_FINALS",
      kickoffAt,
      placeholderTeam(`Winner R16 ${String(index * 2 + 1).padStart(2, "0")}`, `W${index * 2 + 1}`),
      placeholderTeam(`Winner R16 ${String(index * 2 + 2).padStart(2, "0")}`, `W${index * 2 + 2}`),
      `QF_${String(index + 1).padStart(2, "0")}`,
    ),
  ),
  ...sfDates.map((kickoffAt, index) =>
    makeMatch(
      "SEMI_FINALS",
      kickoffAt,
      placeholderTeam(`Winner QF ${String(index * 2 + 1).padStart(2, "0")}`, `W${index * 2 + 1}`),
      placeholderTeam(`Winner QF ${String(index * 2 + 2).padStart(2, "0")}`, `W${index * 2 + 2}`),
      `SF_${String(index + 1).padStart(2, "0")}`,
    ),
  ),
  makeMatch(
    "FINAL",
    "2026-07-19T19:00:00.000Z",
    placeholderTeam("Winner SF 01", "W1"),
    placeholderTeam("Winner SF 02", "W2"),
    "FINAL_01",
  ),
];

const updatedAt = new Date().toISOString();
const deleteRequests = existingKnockoutItems.map((item) => ({
  DeleteRequest: { Key: { pk: item.pk, sk: item.sk } },
}));
const putRequests = seededMatches.map((match) => ({
  PutRequest: {
    Item: {
      pk: { S: "MATCHES#2026" },
      sk: { S: `MATCH#${match.id}` },
      data: jsToDdb(match),
      updatedAt: { S: updatedAt },
    },
  },
}));

console.log("Knockout stage seed plan");
console.log(`Table: ${tableName}`);
console.log(`Profile: ${profile}`);
console.log(`Mode: ${apply ? "apply" : "dry-run"}`);
console.log(`Existing non-group matches to delete: ${deleteRequests.length}`);
console.log(`Seeded matches to write: ${putRequests.length}`);
console.log("");
console.table(
  standings.map((standing) => ({
    group: standing.groupName,
    first: standing.ranked[0]?.team.abbreviation,
    second: standing.ranked[1]?.team.abbreviation,
    third: standing.ranked[2]?.team.abbreviation,
    resultsUsed: standing.resultsUsed,
  })),
);
console.log("Best third-place teams:", thirdPlaceRows.map((row) => `${row.groupName}:${row.team.abbreviation}`).join(", "));
console.log("");
console.table(seededMatches.map((match) => ({
  id: match.id,
  stage: match.stage,
  home: match.homeTeam.abbreviation,
  away: match.awayTeam.abbreviation,
  kickoffAt: match.kickoffAt,
})));

if (!apply) {
  console.log("");
  console.log("Dry-run only. Re-run with --apply after approval to write DynamoDB stage data.");
  process.exit(0);
}

batchWrite([...deleteRequests, ...putRequests]);
console.log(`Applied knockout seed: deleted ${deleteRequests.length}, wrote ${putRequests.length}.`);
