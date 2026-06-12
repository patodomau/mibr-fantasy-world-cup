import type {
  AdminUser,
  LeaderboardEntry,
  Match,
  MatchSyncOverview,
  PredictionResult,
  WinnerPick,
} from "@/lib/fantasy-types";

type FixturePrediction = {
  discordUserId: string;
  matchId: string;
  predictedWinner: WinnerPick;
  predictedHomeScore: number;
  predictedAwayScore: number;
};

const kickoffAt = "2026-06-11T18:00:00.000Z";
const lockAt = "2026-06-11T17:55:00.000Z";

const teams = {
  alpha: {
    id: "score-alpha",
    name: "Score Alpha",
    shortName: "Alpha",
    abbreviation: "ALP",
    flagUrl: "",
  },
  beta: {
    id: "score-beta",
    name: "Score Beta",
    shortName: "Beta",
    abbreviation: "BET",
    flagUrl: "",
  },
  gamma: {
    id: "score-gamma",
    name: "Score Gamma",
    shortName: "Gamma",
    abbreviation: "GAM",
    flagUrl: "",
  },
  delta: {
    id: "score-delta",
    name: "Score Delta",
    shortName: "Delta",
    abbreviation: "DEL",
    flagUrl: "",
  },
  epsilon: {
    id: "score-epsilon",
    name: "Score Epsilon",
    shortName: "Epsilon",
    abbreviation: "EPS",
    flagUrl: "",
  },
  zeta: {
    id: "score-zeta",
    name: "Score Zeta",
    shortName: "Zeta",
    abbreviation: "ZET",
    flagUrl: "",
  },
};

export const scoreMatrixMatches: Match[] = [
  {
    id: "score_matrix_home_win",
    stage: "GROUP_STAGE",
    groupName: "Matrix",
    kickoffAt,
    lockAt,
    venue: "Matrix Arena",
    homeTeam: teams.alpha,
    awayTeam: teams.beta,
    status: "FINISHED",
    homeScore: 2,
    awayScore: 0,
    winner: "home",
  },
  {
    id: "score_matrix_draw",
    stage: "GROUP_STAGE",
    groupName: "Matrix",
    kickoffAt,
    lockAt,
    venue: "Matrix Arena",
    homeTeam: teams.gamma,
    awayTeam: teams.delta,
    status: "FINISHED",
    homeScore: 1,
    awayScore: 1,
    winner: "draw",
  },
  {
    id: "score_matrix_away_win",
    stage: "GROUP_STAGE",
    groupName: "Matrix",
    kickoffAt,
    lockAt,
    venue: "Matrix Arena",
    homeTeam: teams.epsilon,
    awayTeam: teams.zeta,
    status: "FINISHED",
    homeScore: 0,
    awayScore: 3,
    winner: "away",
  },
];

const users = [
  ["case_home_exact", "Case Home Exact"],
  ["case_home_winner_only", "Case Home Winner Only"],
  ["case_home_wrong_draw", "Case Home Wrong Draw"],
  ["case_home_wrong_away", "Case Home Wrong Away"],
  ["case_draw_exact", "Case Draw Exact"],
  ["case_draw_winner_only", "Case Draw Winner Only"],
  ["case_draw_wrong_home", "Case Draw Wrong Home"],
  ["case_draw_wrong_away", "Case Draw Wrong Away"],
  ["case_away_exact", "Case Away Exact"],
  ["case_away_winner_only", "Case Away Winner Only"],
  ["case_away_wrong_home", "Case Away Wrong Home"],
  ["case_away_wrong_draw", "Case Away Wrong Draw"],
  ["agg_all_exact", "Aggregate All Exact"],
  ["agg_winner_only", "Aggregate Winner Only"],
  ["agg_all_wrong", "Aggregate All Wrong"],
  ["agg_mixed", "Aggregate Mixed"],
] as const;

const singleCasePredictions: FixturePrediction[] = [
  pick("case_home_exact", "score_matrix_home_win", "home", 2, 0),
  pick("case_home_winner_only", "score_matrix_home_win", "home", 1, 0),
  pick("case_home_wrong_draw", "score_matrix_home_win", "draw", 1, 1),
  pick("case_home_wrong_away", "score_matrix_home_win", "away", 0, 1),
  pick("case_draw_exact", "score_matrix_draw", "draw", 1, 1),
  pick("case_draw_winner_only", "score_matrix_draw", "draw", 2, 2),
  pick("case_draw_wrong_home", "score_matrix_draw", "home", 1, 0),
  pick("case_draw_wrong_away", "score_matrix_draw", "away", 0, 1),
  pick("case_away_exact", "score_matrix_away_win", "away", 0, 3),
  pick("case_away_winner_only", "score_matrix_away_win", "away", 0, 1),
  pick("case_away_wrong_home", "score_matrix_away_win", "home", 1, 0),
  pick("case_away_wrong_draw", "score_matrix_away_win", "draw", 0, 0),
];

const aggregatePredictions: FixturePrediction[] = [
  pick("agg_all_exact", "score_matrix_home_win", "home", 2, 0),
  pick("agg_all_exact", "score_matrix_draw", "draw", 1, 1),
  pick("agg_all_exact", "score_matrix_away_win", "away", 0, 3),
  pick("agg_winner_only", "score_matrix_home_win", "home", 1, 0),
  pick("agg_winner_only", "score_matrix_draw", "draw", 2, 2),
  pick("agg_winner_only", "score_matrix_away_win", "away", 0, 1),
  pick("agg_all_wrong", "score_matrix_home_win", "away", 0, 1),
  pick("agg_all_wrong", "score_matrix_draw", "home", 1, 0),
  pick("agg_all_wrong", "score_matrix_away_win", "draw", 0, 0),
  pick("agg_mixed", "score_matrix_home_win", "home", 2, 0),
  pick("agg_mixed", "score_matrix_draw", "home", 1, 0),
  pick("agg_mixed", "score_matrix_away_win", "away", 0, 1),
];

export const scoreMatrixPredictions = [...singleCasePredictions, ...aggregatePredictions];

const matchesById = new Map(scoreMatrixMatches.map((match) => [match.id, match]));

export const scoreMatrixSyncOverview: MatchSyncOverview = {
  consolidatedMatches: scoreMatrixMatches.length,
  openConflicts: 0,
  conflicts: [],
  sources: [
    {
      source: "score-matrix-fixture",
      status: "ready",
      normalizedMatches: scoreMatrixMatches.length,
      observedAt: kickoffAt,
    },
  ],
};

export const scoreMatrixAdminUsers: AdminUser[] = users.map(([discordUserId, displayLabel], index) => ({
  discordUserId,
  displayLabel,
  role: index === 0 ? "owner" : "player",
  paidEntry: true,
  predictions: scoreMatrixPredictions.filter((prediction) => prediction.discordUserId === discordUserId).length,
  totalPoints: 0,
  createdAt: kickoffAt,
}));

export function getScoreMatrixInitialDrafts(discordUserId: string): Record<string, PredictionResult> {
  return Object.fromEntries(
    scoreMatrixPredictions
      .filter((prediction) => prediction.discordUserId === discordUserId)
      .map((prediction) => [prediction.matchId, scorePrediction(prediction)]),
  );
}

export function getScoreMatrixLeaderboard(): LeaderboardEntry[] {
  const rows = users.map(([discordUserId, displayLabel]) => {
    const predictions = scoreMatrixPredictions
      .filter((prediction) => prediction.discordUserId === discordUserId)
      .map(scorePrediction);

    return {
      rank: 0,
      discordUserId,
      displayLabel,
      paidEntry: true,
      totalPoints: sum(predictions, "totalPoints"),
      winnerPoints: sum(predictions, "winnerPoints"),
      winnerScores: predictions.filter((prediction) => prediction.winnerPoints > 0).length,
      scorePoints: sum(predictions, "scorePoints"),
      exactScores: predictions.filter((prediction) => prediction.scorePoints > 0).length,
      predictions: predictions.length,
    };
  });

  return rows
    .sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }
      if (b.exactScores !== a.exactScores) {
        return b.exactScores - a.exactScores;
      }
      if (b.predictions !== a.predictions) {
        return b.predictions - a.predictions;
      }
      return a.displayLabel.localeCompare(b.displayLabel);
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function pick(
  discordUserId: string,
  matchId: string,
  predictedWinner: WinnerPick,
  predictedHomeScore: number,
  predictedAwayScore: number,
): FixturePrediction {
  return { discordUserId, matchId, predictedWinner, predictedHomeScore, predictedAwayScore };
}

function scorePrediction(prediction: FixturePrediction): PredictionResult {
  const match = matchesById.get(prediction.matchId);
  if (!match) {
    throw new Error(`Unknown score matrix match ${prediction.matchId}`);
  }

  const winnerPoints = match.winner === prediction.predictedWinner ? 3 : 0;
  const scorePoints =
    match.homeScore === prediction.predictedHomeScore && match.awayScore === prediction.predictedAwayScore ? 2 : 0;

  return {
    matchId: prediction.matchId,
    predictedWinner: prediction.predictedWinner,
    predictedHomeScore: prediction.predictedHomeScore,
    predictedAwayScore: prediction.predictedAwayScore,
    winnerPoints,
    scorePoints,
    totalPoints: winnerPoints + scorePoints,
  };
}

function sum(predictions: PredictionResult[], key: "winnerPoints" | "scorePoints" | "totalPoints") {
  return predictions.reduce((total, prediction) => total + prediction[key], 0);
}
