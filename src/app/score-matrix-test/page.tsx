import { notFound } from "next/navigation";
import { FantasyApp } from "@/components/fantasy-app";
import {
  getScoreMatrixInitialDrafts,
  getScoreMatrixLeaderboard,
  scoreMatrixAdminUsers,
  scoreMatrixMatches,
  scoreMatrixSyncOverview,
} from "@/data/score-matrix-fixture";
import { isEnvFlagEnabled } from "@/lib/env";

const testUser = {
  discordUserId: "case_home_exact",
  displayLabel: "Case Home Exact",
  paidEntry: true,
  role: "owner" as const,
};

export default function ScoreMatrixTestPage() {
  if (!isEnvFlagEnabled("FANTASY_SCORE_MATRIX_TEST")) {
    notFound();
  }

  return (
    <FantasyApp
      adminUsers={scoreMatrixAdminUsers}
      initialDrafts={getScoreMatrixInitialDrafts(testUser.discordUserId)}
      leaderboard={getScoreMatrixLeaderboard()}
      matches={scoreMatrixMatches}
      syncOverview={scoreMatrixSyncOverview}
      user={testUser}
    />
  );
}
