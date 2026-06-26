export type Stage =
  | "GROUP_STAGE"
  | "ROUND_OF_32"
  | "ROUND_OF_16"
  | "QUARTER_FINALS"
  | "SEMI_FINALS"
  | "THIRD_PLACE"
  | "FINAL";

export type MatchStatus =
  | "SCHEDULED"
  | "LIVE"
  | "IN_PLAY"
  | "PAUSED"
  | "FINISHED"
  | "POSTPONED"
  | "SUSPENDED"
  | "CANCELLED";

export type WinnerPick = "home" | "away" | "draw";

export type Team = {
  id: string;
  name: string;
  shortName: string;
  abbreviation: string;
  flagUrl: string;
};

export type Match = {
  id: string;
  providerMatchId?: string;
  stage: Stage;
  groupName?: string;
  kickoffAt: string;
  lockAt: string;
  venue: string;
  homeTeam: Team;
  awayTeam: Team;
  status: MatchStatus;
  homeScore?: number;
  awayScore?: number;
  homePenaltyScore?: number;
  awayPenaltyScore?: number;
  winner?: WinnerPick;
};

export type PredictionDraft = {
  matchId: string;
  predictedWinner?: WinnerPick;
  predictedHomeScore?: number;
  predictedAwayScore?: number;
};

export type PredictionResult = PredictionDraft & {
  winnerPoints: number;
  scorePoints: number;
  totalPoints: number;
};

export type KnockoutSubmission = {
  discordUserId: string;
  picks: Record<string, string>;
  championTeamId: string;
  lockAt?: string;
  submittedAt: string;
};

export type LeaderboardEntry = {
  rank: number;
  discordUserId: string;
  displayLabel: string;
  discordAvatarUrl?: string;
  paidEntry: boolean;
  totalPoints: number;
  winnerPoints: number;
  winnerScores: number;
  scorePoints: number;
  exactScores: number;
  predictions: number;
};

export type AdminUser = {
  discordUserId: string;
  displayLabel: string;
  discordAvatarUrl?: string;
  role: "owner" | "admin" | "player";
  paidEntry: boolean;
  predictions: number;
  totalPoints: number;
  lastLoginAt?: string;
  createdAt: string;
};

export type MatchSyncSourceStatus = {
  source: string;
  status: string;
  normalizedMatches: number;
  observedAt: string;
  message?: string;
};

export type MatchSyncConflict = {
  matchId: string;
  fieldName: string;
  selectedValue: string;
  observedValues: Record<string, string[]>;
  observedAt: string;
};

export type MatchSyncOverview = {
  consolidatedMatches: number;
  openConflicts: number;
  sources: MatchSyncSourceStatus[];
  conflicts: MatchSyncConflict[];
};

export const STAGE_LABELS: Record<Stage, { en: string; pt: string }> = {
  GROUP_STAGE: { en: "Group Stage", pt: "Fase de grupos" },
  ROUND_OF_32: { en: "Round of 32", pt: "Primeira eliminatoria" },
  ROUND_OF_16: { en: "Round of 16", pt: "Oitavas de final" },
  QUARTER_FINALS: { en: "Quarter-finals", pt: "Quartas de final" },
  SEMI_FINALS: { en: "Semi-finals", pt: "Semifinais" },
  THIRD_PLACE: { en: "Third place", pt: "Disputa de 3o lugar" },
  FINAL: { en: "Final", pt: "Final" },
};

export const KNOCKOUT_STAGES: readonly Stage[] = [
  "ROUND_OF_32",
  "ROUND_OF_16",
  "QUARTER_FINALS",
  "SEMI_FINALS",
  "THIRD_PLACE",
  "FINAL",
];

export function isKnockoutStage(stage: Stage) {
  return KNOCKOUT_STAGES.includes(stage);
}

export function getKnockoutLockAt(matches: Match[]) {
  const lockValues = matches
    .filter((match) => isKnockoutStage(match.stage))
    .map((match) => match.lockAt || match.kickoffAt)
    .filter((value): value is string => Boolean(value))
    .sort();

  return lockValues[0];
}

export function getWinnerFromScore(homeScore: number, awayScore: number): WinnerPick {
  if (homeScore > awayScore) {
    return "home";
  }

  if (awayScore > homeScore) {
    return "away";
  }

  return "draw";
}

export function validatePrediction(
  draft: PredictionDraft,
  options: { allowDraw?: boolean; allowScores?: boolean } = {},
) {
  const allowDraw = options.allowDraw ?? true;
  const allowScores = options.allowScores ?? true;

  if (!draft.predictedWinner) {
    return { valid: false, message: "Choose a winner or draw first." };
  }
  if (!allowDraw && draft.predictedWinner === "draw") {
    return { valid: false, message: "Choose a team to advance." };
  }

  const hasHomeScore = Number.isInteger(draft.predictedHomeScore);
  const hasAwayScore = Number.isInteger(draft.predictedAwayScore);
  if (!allowScores && (hasHomeScore || hasAwayScore)) {
    return { valid: false, message: "Knockout picks only choose who advances." };
  }

  if (hasHomeScore !== hasAwayScore) {
    return { valid: false, message: "Fill both score boxes or leave both blank." };
  }

  if (!hasHomeScore || !hasAwayScore) {
    return { valid: true, message: null };
  }

  const homeScore = draft.predictedHomeScore as number;
  const awayScore = draft.predictedAwayScore as number;

  if (homeScore < 0 || awayScore < 0) {
    return { valid: false, message: "Scores must be zero or positive." };
  }

  const scoreWinner = getWinnerFromScore(homeScore, awayScore);
  if (scoreWinner !== draft.predictedWinner) {
    return { valid: false, message: "The score must match the selected result." };
  }

  return { valid: true, message: null };
}

export function isMatchLocked(match: Match, now = new Date()) {
  return now.getTime() >= new Date(match.lockAt).getTime();
}

export function isTeamPending(team: Team) {
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

export function isMatchPickable(match: Match, now = new Date()) {
  return (
    match.status === "SCHEDULED" &&
    !isMatchLocked(match, now) &&
    !isTeamPending(match.homeTeam) &&
    !isTeamPending(match.awayTeam)
  );
}

export function getLockAt(kickoffAt: string) {
  return new Date(new Date(kickoffAt).getTime() - 5 * 60 * 1000).toISOString();
}

function matchKeyPart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 24);
}

const teamCodeAliases: Record<string, string> = {
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

function canonicalTeamKeyPart(team: Team) {
  const candidates = [team.abbreviation, team.shortName, team.name, team.id].map(matchKeyPart);
  for (const candidate of candidates) {
    if (teamCodeAliases[candidate]) {
      return teamCodeAliases[candidate];
    }
  }

  return candidates[0];
}

function matchTeamKeyPart(team: Team) {
  if (isTeamPending(team)) {
    return matchKeyPart(team.id || team.shortName || team.name || team.abbreviation);
  }

  return canonicalTeamKeyPart(team);
}

export function buildMatchKey(homeTeam: Team, awayTeam: Team, stage: Stage, slotKey?: string) {
  const home = matchTeamKeyPart(homeTeam);
  const away = matchTeamKeyPart(awayTeam);
  const stagePart = matchKeyPart(stage);

  if (slotKey && (isTeamPending(homeTeam) || isTeamPending(awayTeam))) {
    return `${home}_${away}_${stagePart}_${matchKeyPart(slotKey)}`;
  }

  return `${home}_${away}_${stagePart}`;
}
