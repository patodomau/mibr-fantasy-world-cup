import { FantasyApp } from "@/components/fantasy-app";
import { requireFantasySession } from "@/lib/auth";
import {
  getAdminUsers,
  getLeaderboard,
  getMatches,
  getMatchSyncOverview,
  getUserPredictions,
} from "@/lib/fantasy-data";

export default async function Home() {
  const session = await requireFantasySession();
  const matches = await getMatches();
  const [leaderboard, adminUsers, syncOverview, initialDrafts] = await Promise.all([
    getLeaderboard(),
    getAdminUsers(),
    getMatchSyncOverview(),
    getUserPredictions(session.user.discordId, matches),
  ]);

  return (
    <FantasyApp
      adminUsers={adminUsers}
      initialDrafts={initialDrafts}
      leaderboard={leaderboard}
      matches={matches}
      syncOverview={syncOverview}
      user={{
        discordUserId: session.user.discordId,
        displayLabel: session.user.displayLabel ?? session.user.name ?? session.user.discordId ?? "Player",
        avatarUrl: session.user.discordAvatarUrl ?? session.user.image ?? undefined,
        paidEntry: session.user.paidEntry ?? false,
        role: session.user.mibrRole ?? "player",
      }}
    />
  );
}
