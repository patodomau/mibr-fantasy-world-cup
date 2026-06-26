"use client";

import { Brackets, Check, ChevronDown, Gamepad2, RefreshCw, Settings, Trophy } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  isMatchPickable,
  isMatchLocked,
  STAGE_LABELS,
  type AdminUser,
  type KnockoutSubmission,
  validatePrediction,
  type LeaderboardEntry,
  type Match,
  type MatchSyncOverview,
  type PredictionDraft,
  type PredictionResult,
  type Stage,
  type WinnerPick,
} from "@/lib/fantasy-types";

type Locale = "pt" | "en";
type Panel = "games" | "ranking" | "bracket" | "admin";
type GamesTab = "open" | "closed";
type DateSort = "asc" | "desc";
type StageFilter = Stage | "all";
type StoredPrediction = PredictionDraft | PredictionResult;

type Props = {
  matches: Match[];
  leaderboard: LeaderboardEntry[];
  adminUsers: AdminUser[];
  syncOverview: MatchSyncOverview;
  initialDrafts: Record<string, PredictionResult>;
  initialKnockoutSubmission?: KnockoutSubmission;
  user: {
    discordUserId?: string;
    displayLabel: string;
    avatarUrl?: string;
    paidEntry: boolean;
    role?: "owner" | "admin" | "player";
  };
};

const copy = {
  pt: {
    games: "Jogos",
    ranking: "Ranking",
    bracket: "Chaves",
    admin: "Administracao",
    fantasyGames: "Jogos Fantasy",
    winner: "Vencedor",
    draw: "Empate",
    scoreGuess: "Arriscar placar",
    locked: "Travado",
    open: "Aberto",
    lock: "Fecha",
    save: "Salvar palpite",
    saving: "Salvando...",
    exactScore: "Placar exato",
    winnerPoints: "Vencedor",
    scorePoints: "Placar",
    points: "Pontos",
    predictions: "Palpites",
    localTime: "Horario local",
    source: "Fonte planejada",
    sourceText: "ESPN Scoreboard para tabela, status e placares.",
    saved: "Palpite salvo no banco",
    saveError: "Nao foi possivel salvar o palpite.",
    openGames: "Jogos abertos",
    closedGames: "Jogos encerrados",
    noOpenGames: "Nenhum jogo aberto para palpite agora.",
    noClosedGames: "Nenhum jogo encerrado ainda.",
    noFilteredGames: "Nenhum jogo encontrado com esse filtro.",
    sortByDate: "Data",
    dateAsc: "ASC",
    dateDesc: "DESC",
    stageFilter: "Etapa",
    allStages: "Todas",
    openTimeRangeToggle: "Jogos nos proximos 2 dias",
    closedTimeRangeToggle: "Jogos ate 2 dias atras",
    firstTeamFilter: "Time 1",
    secondTeamFilter: "Time 2",
    allTeams: "Qualquer time",
    yourPick: "Seu palpite",
    noPick: "Sem palpite salvo",
    finalResult: "Resultado",
    earned: "Pontuacao",
    waitingResult: "Aguardando resultado",
    paid: "Pago",
    unpaid: "Pendente",
    users: "Usuarios",
    role: "Funcao",
    lastLogin: "Ultimo login",
    previous: "Anterior",
    next: "Proxima",
    player: "Jogador",
    remove: "Desativar",
    cancel: "Cancelar",
    confirmRemove: "Confirmar desativacao",
    removeUserTitle: "Desativar usuario",
    removeUserText: "Esta acao desativa o acesso deste usuario ao fantasy, mantendo seus palpites. Confirme para continuar.",
    syncStatus: "Sync dos jogos",
    syncNow: "Atualizar resultados",
    syncingNow: "Atualizando...",
    syncComplete: "Resultados atualizados",
    syncError: "Nao foi possivel atualizar os resultados.",
    syncUpdatedMatches: "Jogos atualizados",
    syncConsolidatedMatches: "Jogos consolidados",
    consolidatedMatches: "Jogos consolidados",
    sourceStatus: "Fontes",
    usersPerPage: "10 usuarios por pagina",
    winnerChip: "3 pts vencedor",
    scoreChip: "2 pts placar exato",
    winnerScoreHit: "acerto",
    winnerScoreHits: "acertos",
    exactScoreHit: "acerto",
    exactScoreHits: "acertos",
    pointsShort: "pts",
    lockChip: "Fecha: inicio - 5 min",
    pendingSlot: "A definir",
    bracketHint: "Visualizacao por fase. A pontuacao continua somando o campeonato inteiro.",
    knockoutSave: "Salvar chave mata-mata",
    knockoutSaving: "Salvando chave...",
    knockoutSaved: "Chave mata-mata salva",
    knockoutPickHint: "Escolha quem avanca em cada confronto. Cada acerto vale 5 pontos.",
    knockoutChampion: "Campeao",
    knockoutIncomplete: "Complete a chave ate a final antes de salvar.",
    knockout: "Mata-mata",
    groupTable: "Jogos do grupo",
    rankingPlayer: "Jogador",
    errorChoose: "Escolha vencedor ou empate primeiro.",
    errorBothScores: "Preencha os dois placares ou deixe ambos vazios.",
    errorPositive: "Placar deve ser zero ou positivo.",
    errorWinnerMismatch: "O placar precisa combinar com o resultado escolhido.",
  },
  en: {
    games: "Games",
    ranking: "Ranking",
    bracket: "Bracket",
    admin: "Administration",
    fantasyGames: "Fantasy Games",
    winner: "Winner",
    draw: "Draw",
    scoreGuess: "Guess score",
    locked: "Locked",
    open: "Open",
    lock: "Closes",
    save: "Save pick",
    saving: "Saving...",
    exactScore: "Exact score",
    winnerPoints: "Winner",
    scorePoints: "Score",
    points: "Points",
    predictions: "Picks",
    localTime: "Local time",
    source: "Planned source",
    sourceText: "ESPN Scoreboard for schedule, status, and scores.",
    saved: "Pick saved to database",
    saveError: "Could not save pick.",
    openGames: "Open games",
    closedGames: "Closed games",
    noOpenGames: "No games are open for picks right now.",
    noClosedGames: "No closed games yet.",
    noFilteredGames: "No games match this filter.",
    sortByDate: "Date",
    dateAsc: "ASC",
    dateDesc: "DESC",
    stageFilter: "Stage",
    allStages: "All",
    openTimeRangeToggle: "Matches within 2 days",
    closedTimeRangeToggle: "Matches up to 2 days before",
    firstTeamFilter: "Team 1",
    secondTeamFilter: "Team 2",
    allTeams: "Any team",
    yourPick: "Your pick",
    noPick: "No saved pick",
    finalResult: "Result",
    earned: "Score",
    waitingResult: "Waiting for result",
    paid: "Paid",
    unpaid: "Pending",
    users: "Users",
    role: "Role",
    lastLogin: "Last login",
    previous: "Previous",
    next: "Next",
    player: "Player",
    remove: "Disable",
    cancel: "Cancel",
    confirmRemove: "Confirm disable",
    removeUserTitle: "Disable user",
    removeUserText: "This disables this user's fantasy access while keeping their picks. Confirm to continue.",
    syncStatus: "Match sync",
    syncNow: "Update results",
    syncingNow: "Updating...",
    syncComplete: "Results updated",
    syncError: "Could not update results.",
    syncUpdatedMatches: "Updated games",
    syncConsolidatedMatches: "Consolidated games",
    consolidatedMatches: "Consolidated games",
    sourceStatus: "Sources",
    usersPerPage: "10 users per page",
    winnerChip: "3 pts winner",
    scoreChip: "2 pts exact score",
    winnerScoreHit: "correct pick",
    winnerScoreHits: "correct picks",
    exactScoreHit: "correct score",
    exactScoreHits: "correct scores",
    pointsShort: "pts",
    lockChip: "Lock: kickoff - 5 min",
    pendingSlot: "TBD",
    bracketHint: "Phase-by-phase view. Scoring still adds up across the full tournament.",
    knockoutSave: "Save knockout bracket",
    knockoutSaving: "Saving bracket...",
    knockoutSaved: "Knockout bracket saved",
    knockoutPickHint: "Choose who advances in every matchup. Each correct pick is worth 5 points.",
    knockoutChampion: "Champion",
    knockoutIncomplete: "Complete the bracket through the final before saving.",
    knockout: "Knockout",
    groupTable: "Group games",
    rankingPlayer: "Player",
    errorChoose: "Choose a winner or draw first.",
    errorBothScores: "Fill both score boxes or leave both blank.",
    errorPositive: "Scores must be zero or positive.",
    errorWinnerMismatch: "The score must match the selected result.",
  },
};

const stageOrder: Stage[] = [
  "GROUP_STAGE",
  "ROUND_OF_32",
  "ROUND_OF_16",
  "QUARTER_FINALS",
  "SEMI_FINALS",
  "THIRD_PLACE",
  "FINAL",
];

const panelIcons = {
  games: Gamepad2,
  ranking: Trophy,
  bracket: Brackets,
  admin: Settings,
} satisfies Record<Panel, typeof Gamepad2>;

const localeSounds: Record<Locale, string> = {
  en: "/sounds/blam-this-is-america.mp3",
  pt: "/sounds/ai-que-delicia-mickey.mp3",
};

function paymentTone(paidEntry: boolean) {
  return paidEntry
    ? "border-emerald-500/30 bg-emerald-950/24"
    : "border-red-500/30 bg-red-950/24";
}

function Avatar({ src, label, className }: { src?: string; label: string; className: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const fallback = label.trim().slice(0, 2).toUpperCase() || "??";
  const failed = Boolean(src && failedSrc === src);

  if (!src || failed) {
    return (
      <div
        className={`${className} flex items-center justify-center border border-amber-500/30 bg-stone-950 text-xs font-black text-amber-200`}
      >
        {fallback}
      </div>
    );
  }

  return (
    <img
      alt=""
      className={`${className} border border-amber-500/30 object-cover`}
      onError={() => setFailedSrc(src)}
      src={src}
    />
  );
}

function formatDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "pt" ? "pt-BR" : "en-US", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function localizeValidationMessage(message: string | null, locale: Locale) {
  const t = copy[locale];
  if (message === "Choose a winner or draw first.") {
    return t.errorChoose;
  }
  if (message === "Fill both score boxes or leave both blank.") {
    return t.errorBothScores;
  }
  if (message === "Scores must be zero or positive.") {
    return t.errorPositive;
  }
  if (message === "The score must match the selected result.") {
    return t.errorWinnerMismatch;
  }

  return message;
}

function localizeRole(role: AdminUser["role"], locale: Locale) {
  if (locale === "en") {
    return role;
  }

  if (role === "owner") {
    return "Dono";
  }
  if (role === "admin") {
    return "Admin";
  }

  return "Jogador";
}

function TeamBlock({ side, selected }: { side: Match["homeTeam"]; selected: boolean }) {
  return (
    <div
      className={[
        "flex min-w-0 flex-1 flex-col items-center gap-2 border px-3 py-3 transition",
        selected ? "border-amber-400 bg-amber-500/12" : "border-white/10 bg-black/20",
      ].join(" ")}
    >
      <img
        alt=""
        className="h-12 w-16 border border-white/15 object-cover shadow-md"
        loading="lazy"
        src={side.flagUrl}
      />
      <div className="min-w-0 text-center">
        <div className="text-sm font-bold text-stone-100">{side.abbreviation}</div>
        <div className="truncate text-xs text-stone-400">{side.shortName}</div>
      </div>
    </div>
  );
}

type TeamOption = Pick<Match["homeTeam"], "id" | "abbreviation" | "flagUrl" | "shortName">;

function getTeamOptions(matches: Match[]) {
  return Array.from(
    matches
      .reduce((teams, match) => {
        for (const team of [match.homeTeam, match.awayTeam]) {
          if (!teams.has(team.id)) {
            teams.set(team.id, {
              id: team.id,
              abbreviation: team.abbreviation,
              flagUrl: team.flagUrl,
              shortName: team.shortName,
            });
          }
        }

        return teams;
      }, new Map<string, TeamOption>())
      .values(),
  ).sort((left, right) => left.abbreviation.localeCompare(right.abbreviation));
}

function compareMatchesByDate(left: Match, right: Match, sort: DateSort) {
  const dateDelta = new Date(left.kickoffAt).getTime() - new Date(right.kickoffAt).getTime();
  const orderedDelta = sort === "asc" ? dateDelta : -dateDelta;

  return orderedDelta || left.id.localeCompare(right.id);
}

function isWithinTabTimeRange(match: Match, gamesTab: GamesTab) {
  const now = Date.now();
  const twoDays = 2 * 24 * 60 * 60 * 1000;
  const kickoff = new Date(match.kickoffAt).getTime();

  if (gamesTab === "open") {
    return kickoff >= now && kickoff <= now + twoDays;
  }

  return kickoff <= now && kickoff >= now - twoDays;
}

function TeamFilterDropdown({
  allLabel,
  label,
  onChange,
  options,
  selectedId,
}: {
  allLabel: string;
  label: string;
  onChange: (teamId: string) => void;
  options: TeamOption[];
  selectedId: string;
}) {
  const selected = options.find((team) => team.id === selectedId);
  const [open, setOpen] = useState(false);
  const [menuRect, setMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const toggleOpen = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuRect({
        left: rect.left,
        top: Math.min(rect.bottom + 6, window.innerHeight - 160),
        width: Math.max(rect.width, 240),
      });
    }
    setOpen((current) => !current);
  };

  return (
    <div className="relative min-w-44 flex-1 sm:flex-none">
      <button
        className="flex h-12 w-full items-center justify-between gap-3 border border-white/10 bg-black/30 px-3 text-left text-sm font-bold text-stone-100 shadow-lg shadow-black/20 transition hover:border-amber-500/40 hover:bg-black/45"
        onClick={toggleOpen}
        ref={triggerRef}
        type="button"
      >
        <span className="min-w-0">
          <span className="block text-[0.65rem] font-black uppercase text-stone-500">{label}</span>
          {selected ? (
            <span className="mt-0.5 flex min-w-0 items-center gap-2">
              <img
                alt=""
                className="h-4 w-6 shrink-0 border border-white/15 object-cover"
                loading="lazy"
                src={selected.flagUrl}
              />
              <span className="truncate">{selected.abbreviation}</span>
            </span>
          ) : (
            <span className="mt-0.5 block truncate">{allLabel}</span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
      </button>

      {open ? (
        <>
          <button className="fixed inset-0 z-30 cursor-default bg-transparent" onClick={() => setOpen(false)} type="button" />
          <div
            className="fantasy-scrollbar fixed z-[80] max-h-80 overflow-y-auto border border-amber-500/30 bg-stone-950 p-1 shadow-2xl shadow-black/50"
            style={{
              left: menuRect?.left ?? 0,
              top: menuRect?.top ?? 0,
              width: menuRect?.width ?? 240,
            }}
          >
          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-bold text-stone-200 transition hover:bg-amber-500/15"
            onClick={() => {
              onChange("all");
              setOpen(false);
            }}
            type="button"
          >
            <span className="min-w-0 flex-1 truncate">{allLabel}</span>
            {selectedId === "all" ? <Check className="h-4 w-4 text-emerald-300" aria-hidden="true" /> : null}
          </button>
            {options.map((team) => (
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-bold text-stone-200 transition hover:bg-amber-500/15"
                key={team.id}
                onClick={() => {
                  onChange(team.id);
                  setOpen(false);
                }}
                type="button"
              >
                <img
                  alt=""
                  className="h-5 w-7 shrink-0 border border-white/15 object-cover"
                  loading="lazy"
                  src={team.flagUrl}
                />
                <span className="w-10 text-amber-100">{team.abbreviation}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-stone-400">{team.shortName}</span>
                {team.id === selectedId ? <Check className="h-4 w-4 text-emerald-300" aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function StageFilterDropdown({
  allLabel,
  label,
  locale,
  onChange,
  options,
  selectedStage,
}: {
  allLabel: string;
  label: string;
  locale: Locale;
  onChange: (stage: StageFilter) => void;
  options: Stage[];
  selectedStage: StageFilter;
}) {
  const [open, setOpen] = useState(false);
  const [menuRect, setMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedLabel = selectedStage === "all" ? allLabel : STAGE_LABELS[selectedStage][locale];

  const toggleOpen = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuRect({
        left: rect.left,
        top: Math.min(rect.bottom + 6, window.innerHeight - 160),
        width: Math.max(rect.width, 220),
      });
    }
    setOpen((current) => !current);
  };

  return (
    <div className="relative min-w-44 flex-1 sm:flex-none">
      <button
        className="flex h-12 w-full items-center justify-between gap-3 border border-white/10 bg-black/30 px-3 text-left text-sm font-bold text-stone-100 shadow-lg shadow-black/20 transition hover:border-amber-500/40 hover:bg-black/45"
        onClick={toggleOpen}
        ref={triggerRef}
        type="button"
      >
        <span className="min-w-0">
          <span className="block text-[0.65rem] font-black uppercase text-stone-500">{label}</span>
          <span className="mt-0.5 block truncate">{selectedLabel}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
      </button>

      {open ? (
        <>
          <button className="fixed inset-0 z-30 cursor-default bg-transparent" onClick={() => setOpen(false)} type="button" />
          <div
            className="fantasy-scrollbar fixed z-[80] max-h-80 overflow-y-auto border border-amber-500/30 bg-stone-950 p-1 shadow-2xl shadow-black/50"
            style={{
              left: menuRect?.left ?? 0,
              top: menuRect?.top ?? 0,
              width: menuRect?.width ?? 220,
            }}
          >
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-bold text-stone-200 transition hover:bg-amber-500/15"
              onClick={() => {
                onChange("all");
                setOpen(false);
              }}
              type="button"
            >
              <span className="min-w-0 flex-1 truncate">{allLabel}</span>
              {selectedStage === "all" ? <Check className="h-4 w-4 text-emerald-300" aria-hidden="true" /> : null}
            </button>
            {options.map((stage) => (
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-bold text-stone-200 transition hover:bg-amber-500/15"
                key={stage}
                onClick={() => {
                  onChange(stage);
                  setOpen(false);
                }}
                type="button"
              >
                <span className="min-w-0 flex-1 truncate">{STAGE_LABELS[stage][locale]}</span>
                {stage === selectedStage ? <Check className="h-4 w-4 text-emerald-300" aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function isOpenForPicks(match: Match) {
  return isMatchPickable(match);
}

function isPendingTeam(team: Match["homeTeam"]) {
  const value = `${team.id} ${team.name} ${team.shortName} ${team.abbreviation}`.toLowerCase();
  return (
    team.abbreviation.toUpperCase() === "TBD" ||
    team.flagUrl.includes("/un.") ||
    value.includes("placeholder") ||
    value.includes("winner") ||
    value.includes("runner") ||
    value.includes("finalist") ||
    value.includes("third-place")
  );
}

function hasResolvedTeams(match: Match) {
  return !isPendingTeam(match.homeTeam) && !isPendingTeam(match.awayTeam);
}

function hasPoints(draft?: StoredPrediction): draft is PredictionResult {
  return Boolean(draft && "totalPoints" in draft);
}

function getPredictionPoints(draft?: StoredPrediction) {
  return {
    winnerPoints: hasPoints(draft) ? draft.winnerPoints : 0,
    scorePoints: hasPoints(draft) ? draft.scorePoints : 0,
    totalPoints: hasPoints(draft) ? draft.totalPoints : 0,
  };
}

function getWinnerLabel(match: Match, winner: WinnerPick | undefined, locale: Locale) {
  if (!winner) {
    return copy[locale].pendingSlot;
  }
  if (winner === "draw") {
    return copy[locale].draw;
  }

  return winner === "home" ? match.homeTeam.shortName : match.awayTeam.shortName;
}

function formatPrediction(match: Match, draft: StoredPrediction | undefined, locale: Locale) {
  if (!draft?.predictedWinner) {
    return copy[locale].noPick;
  }

  const hasScore =
    Number.isInteger(draft.predictedHomeScore) && Number.isInteger(draft.predictedAwayScore);
  const score = hasScore ? ` (${draft.predictedHomeScore} x ${draft.predictedAwayScore})` : "";

  return `${getWinnerLabel(match, draft.predictedWinner, locale)}${score}`;
}

function formatActualScore(match: Match, locale: Locale) {
  if (Number.isInteger(match.homeScore) && Number.isInteger(match.awayScore)) {
    return `${match.homeScore} x ${match.awayScore}`;
  }

  return copy[locale].waitingResult;
}

function hasActualScore(match: Match) {
  return Number.isInteger(match.homeScore) && Number.isInteger(match.awayScore);
}

function ScoreInput({
  value,
  onChange,
  disabled,
}: {
  value?: number;
  onChange: (value?: number) => void;
  disabled: boolean;
}) {
  const currentValue = value ?? 0;

  return (
    <div className="grid grid-cols-[2rem_3.5rem_2rem] overflow-hidden border border-amber-500/30 bg-stone-950/70">
      <button
        className="bg-white/5 text-lg font-black text-amber-200 transition hover:bg-amber-500/15 disabled:text-stone-600"
        disabled={disabled || currentValue <= 0}
        onClick={() => onChange(Math.max(0, currentValue - 1))}
        type="button"
      >
        -
      </button>
      <input
        className="h-10 w-14 border-x border-amber-500/20 bg-transparent text-center text-lg font-bold text-amber-100 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        disabled={disabled}
        inputMode="numeric"
        min={0}
        onChange={(event) => {
          const nextValue = event.target.value;
          if (nextValue === "") {
            onChange(undefined);
            return;
          }

          const parsed = Number(nextValue);
          if (Number.isInteger(parsed) && parsed >= 0) {
            onChange(parsed);
          }
        }}
        type="number"
        value={value ?? ""}
      />
      <button
        className="bg-white/5 text-lg font-black text-amber-200 transition hover:bg-amber-500/15 disabled:text-stone-600"
        disabled={disabled}
        onClick={() => onChange(currentValue + 1)}
        type="button"
      >
        +
      </button>
    </div>
  );
}

function MatchCard({
  match,
  draft,
  locale,
  onDraft,
  onSave,
  saved,
  saveError,
  saving,
}: {
  match: Match;
  draft: PredictionDraft;
  locale: Locale;
  onDraft: (draft: PredictionDraft) => void;
  onSave: (draft: PredictionDraft) => void;
  saved: boolean;
  saveError?: string;
  saving: boolean;
}) {
  const t = copy[locale];
  const locked = isMatchLocked(match);
  const validation = validatePrediction(draft);
  const hasPick = Boolean(draft.predictedWinner);

  const chooseWinner = (winner: WinnerPick) => {
    onDraft({
      matchId: match.id,
      predictedWinner: winner,
      predictedHomeScore: undefined,
      predictedAwayScore: undefined,
    });
  };

  return (
    <article className="guild-frame bg-[var(--card)] p-4">
      <div className="relative z-10 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">
              {STAGE_LABELS[match.stage][locale]}
              {match.groupName ? ` / ${match.groupName}` : ""}
            </div>
            <h3 className="mt-1 text-base font-bold text-stone-100">
              {match.homeTeam.shortName} vs {match.awayTeam.shortName}
            </h3>
          </div>
          <div className="border border-white/10 bg-black/30 px-3 py-2 text-right text-xs text-stone-300">
            <div>{formatDate(match.kickoffAt, locale)}</div>
            <div className={locked ? "font-bold text-red-300" : "font-bold text-emerald-300"}>
              {locked ? t.locked : t.open}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
          <button disabled={locked} onClick={() => chooseWinner("home")} type="button">
            <TeamBlock side={match.homeTeam} selected={draft.predictedWinner === "home"} />
          </button>
          <button
            className={[
              "flex min-h-24 w-16 items-center justify-center border px-2 text-xs font-bold uppercase text-stone-200 transition",
              draft.predictedWinner === "draw"
                ? "border-amber-400 bg-amber-500/12"
                : "border-white/10 bg-black/20",
            ].join(" ")}
            disabled={locked}
            onClick={() => chooseWinner("draw")}
            type="button"
          >
            {t.draw}
          </button>
          <button disabled={locked} onClick={() => chooseWinner("away")} type="button">
            <TeamBlock side={match.awayTeam} selected={draft.predictedWinner === "away"} />
          </button>
        </div>

        {hasPick ? (
          <div className="border border-amber-500/20 bg-stone-950/50 p-3">
            <div className="mb-3 flex items-center justify-between gap-3 text-sm">
              <span className="font-bold text-amber-200">{t.scoreGuess}</span>
              <span className="text-xs text-stone-400">
                {t.lock}: {formatDate(match.lockAt, locale)}
              </span>
            </div>
            <div className="flex items-center justify-center gap-3">
              <ScoreInput
                disabled={locked}
                onChange={(value) => onDraft({ ...draft, predictedHomeScore: value })}
                value={draft.predictedHomeScore}
              />
              <span className="text-lg font-bold text-stone-500">x</span>
              <ScoreInput
                disabled={locked}
                onChange={(value) => onDraft({ ...draft, predictedAwayScore: value })}
                value={draft.predictedAwayScore}
              />
            </div>
            {!validation.valid ? (
              <p className="mt-3 text-center text-xs font-semibold text-red-300">
                {localizeValidationMessage(validation.message, locale)}
              </p>
            ) : null}
            <button
              className="mt-3 w-full border border-amber-400/40 bg-amber-500 px-4 py-2 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:border-white/10 disabled:bg-white/10 disabled:text-stone-500"
              disabled={locked || !validation.valid || saving}
              onClick={() => onSave(draft)}
              type="button"
            >
              {saving ? t.saving : t.save}
            </button>
            {saved ? (
              <p className="mt-2 text-center text-xs font-semibold text-emerald-300">{t.saved}</p>
            ) : null}
            {saveError ? (
              <p className="mt-2 text-center text-xs font-semibold text-red-300">{saveError}</p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-400">
          <span>{match.venue}</span>
          <span>
            {t.localTime}: {formatDate(match.kickoffAt, locale)}
          </span>
        </div>
      </div>
    </article>
  );
}

function ClosedMatchCard({
  match,
  draft,
  locale,
}: {
  match: Match;
  draft?: StoredPrediction;
  locale: Locale;
}) {
  const t = copy[locale];
  const points = getPredictionPoints(draft);

  return (
    <article className="guild-frame bg-[var(--card)] p-4">
      <div className="relative z-10 flex h-full flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">
              {STAGE_LABELS[match.stage][locale]}
              {match.groupName ? ` / ${match.groupName}` : ""}
            </div>
            <h3 className="mt-1 text-base font-bold text-stone-100">
              {match.homeTeam.shortName} vs {match.awayTeam.shortName}
            </h3>
          </div>
          <div className="border border-red-500/25 bg-red-950/30 px-3 py-2 text-right text-xs font-bold text-red-200">
            {t.closedGames}
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border border-white/10 bg-black/20 p-3">
          <TeamBlock side={match.homeTeam} selected={match.winner === "home"} />
          <div className="min-w-20 text-center">
            <div className="text-xs font-bold uppercase text-stone-500">{t.finalResult}</div>
            <div className="mt-1 text-xl font-black text-amber-100">
              {formatActualScore(match, locale)}
            </div>
          </div>
          <TeamBlock side={match.awayTeam} selected={match.winner === "away"} />
        </div>

        <div className="grid gap-3 border border-amber-500/20 bg-stone-950/50 p-3 text-sm md:grid-cols-2">
          <div>
            <div className="text-xs font-bold uppercase text-stone-500">{t.yourPick}</div>
            <div className={draft?.predictedWinner ? "mt-1 font-bold text-stone-100" : "mt-1 font-bold text-red-200"}>
              {formatPrediction(match, draft, locale)}
            </div>
          </div>
          <div className="md:text-right">
            <div className="text-xs font-bold uppercase text-stone-500">{t.earned}</div>
            <div className="mt-1 text-xl font-black text-emerald-300">{points.totalPoints}</div>
            <div className="text-xs text-stone-400">
              {t.winnerPoints}: {points.winnerPoints} / {t.scorePoints}: {points.scorePoints}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-400">
          <span>{match.venue}</span>
          <span>
            {t.localTime}: {formatDate(match.kickoffAt, locale)}
          </span>
        </div>
      </div>
    </article>
  );
}

function GamesPanel({
  matches,
  drafts,
  locale,
  savedDrafts,
  saveErrors,
  savingDrafts,
  setDrafts,
  onSaveDraft,
  setSavedDrafts,
}: {
  matches: Match[];
  drafts: Record<string, StoredPrediction>;
  locale: Locale;
  savedDrafts: Record<string, boolean>;
  saveErrors: Record<string, string | undefined>;
  savingDrafts: Record<string, boolean>;
  setDrafts: (drafts: Record<string, StoredPrediction>) => void;
  onSaveDraft: (draft: PredictionDraft) => void;
  setSavedDrafts: (drafts: Record<string, boolean>) => void;
}) {
  const [gamesTab, setGamesTab] = useState<GamesTab>("open");
  const [dateSort, setDateSort] = useState<DateSort>("asc");
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [firstTeamFilter, setFirstTeamFilter] = useState("all");
  const [secondTeamFilter, setSecondTeamFilter] = useState("all");
  const [openTimeRangeOnly, setOpenTimeRangeOnly] = useState(false);
  const [closedTimeRangeOnly, setClosedTimeRangeOnly] = useState(false);
  const t = copy[locale];
  const timeRangeOnly = gamesTab === "open" ? openTimeRangeOnly : closedTimeRangeOnly;
  const baseMatches = useMemo(
    () =>
      matches.filter(
        (match) =>
          hasResolvedTeams(match) &&
          (gamesTab === "open" ? isOpenForPicks(match) : !isOpenForPicks(match)),
      ),
    [gamesTab, matches],
  );
  const stageOptions = useMemo(
    () =>
      stageOrder.filter((stage) => baseMatches.some((match) => match.stage === stage)),
    [baseMatches],
  );
  const teamOptions = useMemo(() => getTeamOptions(baseMatches), [baseMatches]);
  const activeStageFilter =
    stageFilter === "all" || stageOptions.includes(stageFilter) ? stageFilter : "all";
  const activeFirstTeamFilter =
    firstTeamFilter === "all" || teamOptions.some((team) => team.id === firstTeamFilter)
      ? firstTeamFilter
      : "all";
  const activeSecondTeamFilter =
    secondTeamFilter === "all" || teamOptions.some((team) => team.id === secondTeamFilter)
      ? secondTeamFilter
      : "all";
  const visibleMatches = useMemo(
    () => {
      const filteredMatches = baseMatches.filter(
        (match) => {
          const matchTeamIds = new Set([match.homeTeam.id, match.awayTeam.id]);
          return (
            (activeStageFilter === "all" || match.stage === activeStageFilter) &&
            (activeFirstTeamFilter === "all" || matchTeamIds.has(activeFirstTeamFilter)) &&
            (activeSecondTeamFilter === "all" || matchTeamIds.has(activeSecondTeamFilter)) &&
            (!timeRangeOnly || isWithinTabTimeRange(match, gamesTab))
          );
        },
      );

      return filteredMatches.sort((left, right) => compareMatchesByDate(left, right, dateSort));
    },
    [activeFirstTeamFilter, activeSecondTeamFilter, activeStageFilter, baseMatches, dateSort, gamesTab, timeRangeOnly],
  );
  const emptyMessage =
    baseMatches.length === 0
      ? gamesTab === "open"
        ? t.noOpenGames
        : t.noClosedGames
      : t.noFilteredGames;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {(["open", "closed"] satisfies GamesTab[]).map((item) => (
          <button
            className={[
              "border px-4 py-2 text-sm font-black transition",
              gamesTab === item
                ? "border-amber-400 bg-amber-500 text-stone-950"
                : "border-white/10 bg-white/5 text-stone-300 hover:border-amber-500/40 hover:text-amber-100",
            ].join(" ")}
            key={item}
            onClick={() => setGamesTab(item)}
            type="button"
          >
            {item === "open" ? t.openGames : t.closedGames}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 border border-white/10 bg-black/20 p-3">
        <div>
          <div className="mb-1 text-[0.65rem] font-black uppercase text-stone-500">{t.sortByDate}</div>
          <div className="flex overflow-hidden border border-white/10 bg-black/30">
            {(["asc", "desc"] satisfies DateSort[]).map((sort) => (
              <button
                className={[
                  "h-10 px-3 text-xs font-black transition",
                  dateSort === sort
                    ? "bg-amber-500 text-stone-950"
                    : "text-stone-300 hover:bg-amber-500/15 hover:text-amber-100",
                ].join(" ")}
                key={sort}
                onClick={() => setDateSort(sort)}
                type="button"
              >
                {sort === "asc" ? t.dateAsc : t.dateDesc}
              </button>
            ))}
          </div>
        </div>

        <button
          className={[
            "h-10 self-end border px-3 text-xs font-black transition",
            timeRangeOnly
              ? "border-emerald-400 bg-emerald-500 text-stone-950"
              : "border-white/10 bg-black/30 text-stone-300 hover:border-emerald-500/40 hover:text-emerald-100",
          ].join(" ")}
          onClick={() => {
            if (gamesTab === "open") {
              setOpenTimeRangeOnly((current) => !current);
              return;
            }
            setClosedTimeRangeOnly((current) => !current);
          }}
          type="button"
        >
          {gamesTab === "open" ? t.openTimeRangeToggle : t.closedTimeRangeToggle}
        </button>

        <StageFilterDropdown
          allLabel={t.allStages}
          label={t.stageFilter}
          locale={locale}
          onChange={setStageFilter}
          options={stageOptions}
          selectedStage={activeStageFilter}
        />

        <TeamFilterDropdown
          allLabel={t.allTeams}
          label={t.firstTeamFilter}
          onChange={setFirstTeamFilter}
          options={teamOptions}
          selectedId={activeFirstTeamFilter}
        />
        <TeamFilterDropdown
          allLabel={t.allTeams}
          label={t.secondTeamFilter}
          onChange={setSecondTeamFilter}
          options={teamOptions}
          selectedId={activeSecondTeamFilter}
        />
      </div>

      {visibleMatches.length === 0 ? (
        <div className="guild-frame bg-[var(--card)] p-6 text-sm font-bold text-stone-300">
          <div className="relative z-10">{emptyMessage}</div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {visibleMatches.map((match) =>
          gamesTab === "open" ? (
            <MatchCard
              draft={drafts[match.id] ?? { matchId: match.id }}
              key={match.id}
              locale={locale}
              match={match}
              onDraft={(draft) => {
                setDrafts({ ...drafts, [match.id]: draft });
                setSavedDrafts({ ...savedDrafts, [match.id]: false });
              }}
              onSave={onSaveDraft}
              saved={Boolean(savedDrafts[match.id] || hasPoints(drafts[match.id]))}
              saveError={saveErrors[match.id]}
              saving={Boolean(savingDrafts[match.id])}
            />
          ) : (
            <ClosedMatchCard
              draft={drafts[match.id]}
              key={match.id}
              locale={locale}
              match={match}
            />
          ),
        )}
      </div>
    </div>
  );
}

function RankingPanel({ leaderboard, locale }: { leaderboard: LeaderboardEntry[]; locale: Locale }) {
  const t = copy[locale];

  return (
    <div className="guild-frame overflow-hidden bg-[var(--card)]">
      <table className="relative z-10 w-full min-w-[620px] text-left text-sm">
        <thead className="bg-amber-500/10 text-xs uppercase text-amber-200">
          <tr>
            <th className="px-4 py-3">#</th>
            <th className="px-4 py-3">{t.rankingPlayer}</th>
            <th className="px-4 py-3">{t.points}</th>
            <th className="px-4 py-3">{t.winnerPoints}</th>
            <th className="px-4 py-3">{t.exactScore}</th>
            <th className="px-4 py-3">{t.predictions}</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.map((entry) => (
            <tr
              className={`border-t ${paymentTone(entry.paidEntry)} transition`}
              data-testid={`ranking-row-${entry.discordUserId}`}
              key={entry.discordUserId}
            >
              <td className="px-4 py-3 text-lg font-black text-amber-300" data-testid="ranking-rank">
                {entry.rank}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10" label={entry.displayLabel} src={entry.discordAvatarUrl} />
                  <div>
                    <span className="font-bold text-stone-100" data-testid="ranking-player">
                      {entry.displayLabel}
                    </span>
                    <div
                      className={
                        entry.paidEntry
                          ? "text-xs font-bold text-emerald-300"
                          : "text-xs font-bold text-red-300"
                      }
                    >
                      {entry.paidEntry ? t.paid : t.unpaid}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 font-black text-emerald-300" data-testid="ranking-total-points">
                {entry.totalPoints}
              </td>
              <td className="px-4 py-3">
                <div className="font-bold text-stone-100" data-testid="ranking-winner-scores">
                  {entry.winnerScores} {entry.winnerScores === 1 ? t.winnerScoreHit : t.winnerScoreHits}
                </div>
                <div className="text-xs font-semibold text-stone-400" data-testid="ranking-winner-points">
                  {entry.winnerPoints} {t.pointsShort}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="font-bold text-stone-100" data-testid="ranking-exact-scores">
                  {entry.exactScores} {entry.exactScores === 1 ? t.exactScoreHit : t.exactScoreHits}
                </div>
                <div className="text-xs font-semibold text-stone-400" data-testid="ranking-score-points">
                  {entry.scorePoints} {t.pointsShort}
                </div>
              </td>
              <td className="px-4 py-3" data-testid="ranking-predictions">
                {entry.predictions}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type KnockoutDisplayMatch = {
  match: Match;
  homeTeam: Match["homeTeam"];
  awayTeam: Match["awayTeam"];
  selectedTeamId?: string;
  selectable: boolean;
};

function compareKickoffThenId(left: Match, right: Match) {
  return new Date(left.kickoffAt).getTime() - new Date(right.kickoffAt).getTime() || left.id.localeCompare(right.id);
}

function buildKnockoutDisplay(matches: Match[], picks: Record<string, string>) {
  const displayMatches: KnockoutDisplayMatch[] = [];
  let previousWinners: Match["homeTeam"][] = [];

  for (const stage of stageOrder.filter((item) => item !== "GROUP_STAGE" && item !== "THIRD_PLACE")) {
    const stageMatches = matches.filter((match) => match.stage === stage).sort(compareKickoffThenId);
    const stageWinners: Match["homeTeam"][] = [];

    stageMatches.forEach((match, index) => {
      const homeTeam = previousWinners[index * 2] ?? match.homeTeam;
      const awayTeam = previousWinners[index * 2 + 1] ?? match.awayTeam;
      const selectable =
        !isPendingTeam(homeTeam) &&
        !isPendingTeam(awayTeam) &&
        (!previousWinners.length || Boolean(previousWinners[index * 2] && previousWinners[index * 2 + 1]));
      const selectedTeamId = picks[match.id];

      displayMatches.push({
        match,
        homeTeam,
        awayTeam,
        selectedTeamId,
        selectable,
      });

      if (selectable) {
        if (selectedTeamId === homeTeam.id) {
          stageWinners.push(homeTeam);
        } else if (selectedTeamId === awayTeam.id) {
          stageWinners.push(awayTeam);
        }
      }
    });

    previousWinners = stageWinners.length === stageMatches.length ? stageWinners : [];
  }

  return displayMatches;
}

function KnockoutTeamButton({
  disabled,
  onPick,
  selected,
  team,
}: {
  disabled: boolean;
  onPick: () => void;
  selected: boolean;
  team: Match["homeTeam"];
}) {
  return (
    <button
      className={[
        "flex min-w-0 items-center justify-between gap-2 border px-2 py-2 text-left transition",
        selected
          ? "border-emerald-400/70 bg-emerald-500/16 text-emerald-100"
          : "border-white/10 bg-white/5 text-stone-200 hover:border-amber-400/50",
        disabled ? "cursor-not-allowed opacity-55 hover:border-white/10" : "",
      ].join(" ")}
      disabled={disabled}
      onClick={onPick}
      type="button"
    >
      <span className="flex min-w-0 items-center gap-2">
        <img alt="" className="h-6 w-8 shrink-0 border border-white/15 object-cover" src={team.flagUrl} />
        <span className="truncate text-sm font-bold">{team.abbreviation}</span>
      </span>
      {selected ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
    </button>
  );
}

function BracketPanel({
  initialKnockoutSubmission,
  knockoutSaveError,
  knockoutSaved,
  knockoutSaving,
  locale,
  matches,
  onSaveKnockout,
}: {
  initialKnockoutSubmission?: KnockoutSubmission;
  knockoutSaveError?: string;
  knockoutSaved: boolean;
  knockoutSaving: boolean;
  locale: Locale;
  matches: Match[];
  onSaveKnockout: (picks: Record<string, string>, championTeamId: string) => void;
}) {
  const t = copy[locale];
  const groupNames = Array.from(
    new Set(
      matches
        .filter((match) => match.stage === "GROUP_STAGE")
        .map((match) => match.groupName)
        .filter((groupName): groupName is string => Boolean(groupName)),
    ),
  ).sort((a, b) => a.localeCompare(b));
  const [activeBracketTab, setActiveBracketTab] = useState<string>(groupNames[0] ?? "knockout");
  const activeGroupMatches = matches.filter(
    (match) => match.stage === "GROUP_STAGE" && match.groupName === activeBracketTab,
  );
  const knockoutMatches = matches.filter((match) => match.stage !== "GROUP_STAGE");
  const [knockoutPicks, setKnockoutPicks] = useState<Record<string, string>>(
    () => initialKnockoutSubmission?.picks ?? {},
  );
  const knockoutDisplay = useMemo(
    () => buildKnockoutDisplay(knockoutMatches, knockoutPicks),
    [knockoutMatches, knockoutPicks],
  );
  const finalDisplayMatch = knockoutDisplay.find((entry) => entry.match.stage === "FINAL");
  const championTeamId = finalDisplayMatch?.selectedTeamId;
  const champion = finalDisplayMatch
    ? championTeamId === finalDisplayMatch.homeTeam.id
      ? finalDisplayMatch.homeTeam
      : championTeamId === finalDisplayMatch.awayTeam.id
        ? finalDisplayMatch.awayTeam
        : undefined
    : undefined;
  const completeKnockout =
    knockoutDisplay.length > 0 &&
    knockoutDisplay.every((entry) => !entry.selectable || Boolean(entry.selectedTeamId)) &&
    Boolean(championTeamId);

  const chooseKnockoutWinner = (matchId: string, teamId: string) => {
    setKnockoutPicks((current) => {
      const next = { ...current, [matchId]: teamId };
      const display = buildKnockoutDisplay(knockoutMatches, next);
      const validMatchIds = new Set(display.map((entry) => entry.match.id));

      for (const entry of display) {
        if (!entry.selectable || (entry.selectedTeamId !== entry.homeTeam.id && entry.selectedTeamId !== entry.awayTeam.id)) {
          delete next[entry.match.id];
        }
      }
      for (const matchIdKey of Object.keys(next)) {
        if (!validMatchIds.has(matchIdKey)) {
          delete next[matchIdKey];
        }
      }

      return next;
    });
  };

  return (
    <div className="space-y-6">
      <section className="guild-frame bg-[var(--card)] p-4">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-black text-amber-100">{t.bracket}</h2>
          <p className="max-w-2xl text-sm text-stone-400">{t.bracketHint}</p>
        </div>
        <div className="relative z-10 mt-4 flex flex-wrap gap-2">
          {groupNames.map((groupName) => (
            <button
              className={[
                "border px-3 py-2 text-sm font-bold transition",
                activeBracketTab === groupName
                  ? "border-amber-400 bg-amber-500/15 text-amber-100"
                  : "border-white/10 bg-white/5 text-stone-300 hover:border-amber-500/40",
              ].join(" ")}
              key={groupName}
              onClick={() => setActiveBracketTab(groupName)}
              type="button"
            >
              {groupName.replace("Group", locale === "pt" ? "Grupo" : "Group")}
            </button>
          ))}
          <button
            className={[
              "border px-3 py-2 text-sm font-bold transition",
              activeBracketTab === "knockout"
                ? "border-amber-400 bg-amber-500/15 text-amber-100"
                : "border-white/10 bg-white/5 text-stone-300 hover:border-amber-500/40",
            ].join(" ")}
            onClick={() => setActiveBracketTab("knockout")}
            type="button"
          >
            {t.knockout}
          </button>
        </div>
      </section>
      {activeBracketTab !== "knockout" ? (
        <section className="guild-frame bg-[var(--card)] p-4">
          <div className="relative z-10">
            <h2 className="mb-4 border-b border-amber-500/30 pb-2 text-sm font-black uppercase tracking-[0.16em] text-amber-100">
              {t.groupTable}: {activeBracketTab.replace("Group", locale === "pt" ? "Grupo" : "Group")}
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {activeGroupMatches.map((match) => (
                <article className="border border-white/12 bg-black/30 p-3" key={match.id}>
                  <div className="mb-3 text-xs font-semibold text-stone-400">
                    {formatDate(match.kickoffAt, locale)} / {match.venue}
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_4.75rem_minmax(0,1fr)] items-center gap-3">
                    <div
                      className={[
                        "flex min-w-0 items-center gap-3 border px-2 py-2",
                        match.winner === "home"
                          ? "border-emerald-400/70 bg-emerald-500/16"
                          : match.winner === "draw"
                            ? "border-amber-400/60 bg-amber-500/12"
                            : "border-white/10 bg-white/5",
                      ].join(" ")}
                    >
                      <img
                        alt=""
                        className="h-9 w-12 shrink-0 border border-white/15 object-cover"
                        src={match.homeTeam.flagUrl}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-stone-100">
                          {match.homeTeam.name}
                        </div>
                        <div className="text-xs font-bold text-amber-200">
                          {match.homeTeam.abbreviation}
                        </div>
                      </div>
                    </div>
                    <div
                      className={[
                        "border px-2 py-2 text-center font-black",
                        hasActualScore(match)
                          ? "border-amber-500/35 bg-stone-950/80 text-lg text-amber-100"
                          : "border-white/10 bg-white/5 text-sm text-stone-500",
                      ].join(" ")}
                    >
                      {hasActualScore(match) ? `${match.homeScore} x ${match.awayScore}` : "- x -"}
                    </div>
                    <div
                      className={[
                        "flex min-w-0 items-center justify-end gap-3 border px-2 py-2 text-right",
                        match.winner === "away"
                          ? "border-emerald-400/70 bg-emerald-500/16"
                          : match.winner === "draw"
                            ? "border-amber-400/60 bg-amber-500/12"
                            : "border-white/10 bg-white/5",
                      ].join(" ")}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-stone-100">
                          {match.awayTeam.name}
                        </div>
                        <div className="text-xs font-bold text-amber-200">
                          {match.awayTeam.abbreviation}
                        </div>
                      </div>
                      <img
                        alt=""
                        className="h-9 w-12 shrink-0 border border-white/15 object-cover"
                        src={match.awayTeam.flagUrl}
                      />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="guild-frame bg-[var(--card)] p-4">
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-amber-100">{t.knockout}</h2>
                <p className="mt-1 text-sm text-stone-400">{t.knockoutPickHint}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {champion ? (
                  <div className="border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-sm font-black text-emerald-100">
                    {t.knockoutChampion}: {champion.shortName}
                  </div>
                ) : null}
                <button
                  className="border border-amber-400/45 bg-amber-500 px-4 py-2 text-sm font-black text-stone-950 transition hover:bg-amber-300 disabled:border-white/10 disabled:bg-white/10 disabled:text-stone-500"
                  disabled={!completeKnockout || knockoutSaving}
                  onClick={() => {
                    if (championTeamId) {
                      onSaveKnockout(knockoutPicks, championTeamId);
                    }
                  }}
                  type="button"
                >
                  {knockoutSaving ? t.knockoutSaving : t.knockoutSave}
                </button>
              </div>
            </div>
            {!completeKnockout ? (
              <p className="relative z-10 mt-3 text-xs font-semibold text-amber-200">{t.knockoutIncomplete}</p>
            ) : null}
            {knockoutSaved ? (
              <p className="relative z-10 mt-3 text-xs font-semibold text-emerald-300">{t.knockoutSaved}</p>
            ) : null}
            {knockoutSaveError ? (
              <p className="relative z-10 mt-3 text-xs font-semibold text-red-300">{knockoutSaveError}</p>
            ) : null}
          </section>
          {stageOrder
          .filter((stage) => stage !== "GROUP_STAGE" && stage !== "THIRD_PLACE")
          .map((stage) => {
            const stageMatches = knockoutDisplay.filter((entry) => entry.match.stage === stage);

            return (
          <section className="guild-frame bg-[var(--card)] p-4" key={stage}>
            <div className="relative z-10">
              <h2 className="mb-4 border-b border-amber-500/30 pb-2 text-sm font-black uppercase tracking-[0.16em] text-amber-100">
                {STAGE_LABELS[stage][locale]}
              </h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {stageMatches.length > 0 ? (
                  stageMatches.map((entry) => {
                    return (
                      <div className="relative min-h-24" key={entry.match.id}>
                        <div className="absolute -bottom-2 left-1/2 h-4 w-px bg-white/15" />
                        <div className="border border-white/12 bg-black/34 p-2 shadow-lg">
                          <KnockoutTeamButton
                            disabled={!entry.selectable}
                            onPick={() => chooseKnockoutWinner(entry.match.id, entry.homeTeam.id)}
                            selected={entry.selectedTeamId === entry.homeTeam.id}
                            team={entry.homeTeam}
                          />
                          <div className="mt-1" />
                          <KnockoutTeamButton
                            disabled={!entry.selectable}
                            onPick={() => chooseKnockoutWinner(entry.match.id, entry.awayTeam.id)}
                            selected={entry.selectedTeamId === entry.awayTeam.id}
                            team={entry.awayTeam}
                          />
                          <div className="mt-2 text-[11px] font-semibold text-stone-500">
                            {formatDate(entry.match.kickoffAt, locale)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="border border-dashed border-white/15 bg-black/20 p-3 text-sm text-stone-500">
                    {copy[locale].pendingSlot}
                  </div>
                )}
              </div>
            </div>
          </section>
            );
          })}
        </>
      )}
    </div>
  );
}

function AdminPanel({
  users,
  locale,
  currentUserId,
  currentUserRole,
  syncOverview,
  onDataChanged,
}: {
  users: AdminUser[];
  locale: Locale;
  currentUserId?: string;
  currentUserRole?: "owner" | "admin" | "player";
  syncOverview: MatchSyncOverview;
  onDataChanged: () => void;
}) {
  const t = copy[locale];
  const [page, setPage] = useState(0);
  const [paidOverrides, setPaidOverrides] = useState<Record<string, boolean>>({});
  const [removedUserIds, setRemovedUserIds] = useState<Set<string>>(() => new Set());
  const [pendingRemove, setPendingRemove] = useState<AdminUser | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const pageSize = 10;
  const canTriggerSync = currentUserRole === "owner";
  const rows = useMemo(
    () =>
      users
        .filter((row) => !removedUserIds.has(row.discordUserId))
        .map((row) => ({
          ...row,
          paidEntry: paidOverrides[row.discordUserId] ?? row.paidEntry,
        })),
    [paidOverrides, removedUserIds, users],
  );
  const maxPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1);
  const visibleRows = rows.slice(page * pageSize, page * pageSize + pageSize);

  const updatePaid = async (discordUserId: string, paidEntry: boolean) => {
    setPaidOverrides((current) => ({ ...current, [discordUserId]: paidEntry }));
    const response = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discordUserId, paidEntry }),
    });

    if (!response.ok) {
      setPaidOverrides((current) => {
        const next = { ...current };
        delete next[discordUserId];
        return next;
      });
      return;
    }

    onDataChanged();
  };

  const removeUser = async (discordUserId: string) => {
    setRemovedUserIds((current) => new Set(current).add(discordUserId));
    setPendingRemove(null);
    const response = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discordUserId }),
    });

    if (!response.ok) {
      setRemovedUserIds((current) => {
        const next = new Set(current);
        next.delete(discordUserId);
        return next;
      });
    }
  };

  const triggerSync = async () => {
    setSyncing(true);
    setSyncMessage(null);

    try {
      const response = await fetch("/api/admin/sync", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        result?: {
          consolidatedMatches?: number;
          updatedMatches?: number;
        };
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? t.syncError);
      }

      const consolidatedMatches = payload.result?.consolidatedMatches;
      const updatedMatches = payload.result?.updatedMatches;
      setSyncMessage(
        Number.isFinite(consolidatedMatches)
          ? `${t.syncComplete}. ${t.syncConsolidatedMatches}: ${consolidatedMatches}`
          : Number.isFinite(updatedMatches)
            ? `${t.syncComplete}. ${t.syncUpdatedMatches}: ${updatedMatches}`
            : t.syncComplete,
      );
      onDataChanged();
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : t.syncError);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="guild-frame bg-[var(--card)] p-4">
        <div className="relative z-10 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-black text-amber-100">{t.syncStatus}</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase">
              <span className="border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-100">
                {t.consolidatedMatches}: {syncOverview.consolidatedMatches}
              </span>
              {canTriggerSync ? (
                <button
                  className="inline-flex items-center gap-2 border border-amber-400/50 bg-amber-500/15 px-3 py-2 text-amber-100 transition hover:bg-amber-500/24 disabled:cursor-wait disabled:opacity-60"
                  disabled={syncing}
                  onClick={() => void triggerSync()}
                  type="button"
                >
                  <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} aria-hidden="true" />
                  {syncing ? t.syncingNow : t.syncNow}
                </button>
              ) : null}
            </div>
          </div>
          {syncMessage ? <div className="text-sm font-bold text-amber-200">{syncMessage}</div> : null}
          <div>
            <h3 className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-stone-400">
              {t.sourceStatus}
            </h3>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {syncOverview.sources.map((source) => (
                <div className="border border-white/10 bg-black/25 p-3" key={source.source}>
                  <div className="text-sm font-black text-stone-100">{source.source}</div>
                  <div className="mt-1 text-xs text-stone-400">
                    {source.status} / {source.normalizedMatches} matches
                  </div>
                  <div className="mt-1 text-xs text-stone-500">{formatDate(source.observedAt, locale)}</div>
                  {source.message ? <div className="mt-1 text-xs text-red-300">{source.message}</div> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="guild-frame bg-[var(--card)] p-4">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-amber-100">{t.users}</h2>
            <p className="mt-1 text-sm text-stone-400">{t.usersPerPage}</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <button
              className="border border-white/15 bg-white/5 px-3 py-2 font-bold text-stone-200 disabled:text-stone-600"
              disabled={page <= 0}
              onClick={() => setPage((value) => Math.max(0, value - 1))}
              type="button"
            >
              {t.previous}
            </button>
            <span className="text-stone-400">
              {page + 1} / {maxPage + 1}
            </span>
            <button
              className="border border-white/15 bg-white/5 px-3 py-2 font-bold text-stone-200 disabled:text-stone-600"
              disabled={page >= maxPage}
              onClick={() => setPage((value) => Math.min(maxPage, value + 1))}
              type="button"
            >
              {t.next}
            </button>
          </div>
        </div>
      </section>
      <div className="grid gap-3">
        {visibleRows.map((row) => (
          <article className={`guild-frame p-4 ${paymentTone(row.paidEntry)}`} key={row.discordUserId}>
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="h-12 w-12" label={row.displayLabel} src={row.discordAvatarUrl} />
                <div className="min-w-0">
                  <h3 className="truncate text-base font-black text-stone-100">{row.displayLabel}</h3>
                  <p className="text-xs text-stone-400">{row.discordUserId}</p>
                  <p className="mt-1 text-xs font-bold text-amber-200">
                    {t.role}: {localizeRole(row.role, locale)} / {t.points}: {row.totalPoints}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm font-bold text-stone-200">
                  <span>{row.paidEntry ? t.paid : t.unpaid}</span>
                  <input
                    checked={row.paidEntry}
                    className="h-5 w-5 accent-emerald-500"
                    onChange={(event) => void updatePaid(row.discordUserId, event.target.checked)}
                    type="checkbox"
                  />
                </label>
                <button
                  className="border border-red-500/40 bg-red-950/50 px-3 py-2 text-sm font-bold text-red-100 transition hover:bg-red-900/70 disabled:opacity-40"
                  disabled={row.role === "owner" || row.discordUserId === currentUserId}
                  onClick={() => setPendingRemove(row)}
                  type="button"
                >
                  {t.remove}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {pendingRemove ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 px-4 backdrop-blur-sm">
          <div className="guild-frame w-full max-w-md bg-[var(--card)] p-5">
            <div className="relative z-10 space-y-4">
              <div>
                <h2 className="text-xl font-black text-amber-100">{t.removeUserTitle}</h2>
                <p className="mt-2 text-sm text-stone-300">{t.removeUserText}</p>
              </div>
              <div className="border border-red-500/25 bg-red-950/30 p-3">
                <div className="flex items-center gap-3">
                  <Avatar
                    className="h-11 w-11"
                    label={pendingRemove.displayLabel}
                    src={pendingRemove.discordAvatarUrl}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-stone-100">
                      {pendingRemove.displayLabel}
                    </div>
                    <div className="text-xs text-stone-400">{pendingRemove.discordUserId}</div>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  className="border border-white/15 bg-white/5 px-4 py-2 text-sm font-bold text-stone-200 transition hover:border-amber-400/50"
                  onClick={() => setPendingRemove(null)}
                  type="button"
                >
                  {t.cancel}
                </button>
                <button
                  className="border border-red-500/40 bg-red-700 px-4 py-2 text-sm font-black text-white transition hover:bg-red-600"
                  onClick={() => void removeUser(pendingRemove.discordUserId)}
                  type="button"
                >
                  {t.confirmRemove}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function FantasyApp({
  matches,
  leaderboard,
  adminUsers,
  syncOverview,
  initialDrafts,
  initialKnockoutSubmission,
  user,
}: Props) {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("pt");
  const [panel, setPanel] = useState<Panel>("games");
  const [draftOverrides, setDraftOverrides] = useState<Record<string, StoredPrediction>>({});
  const [localPersistedMatchIds, setLocalPersistedMatchIds] = useState<Set<string>>(() => new Set());
  const [savedDrafts, setSavedDrafts] = useState<Record<string, boolean>>(
    Object.fromEntries(Object.keys(initialDrafts).map((matchId) => [matchId, true])),
  );
  const [savingDrafts, setSavingDrafts] = useState<Record<string, boolean>>({});
  const [saveErrors, setSaveErrors] = useState<Record<string, string | undefined>>({});
  const [knockoutSaving, setKnockoutSaving] = useState(false);
  const [knockoutSaved, setKnockoutSaved] = useState(Boolean(initialKnockoutSubmission));
  const [knockoutSaveError, setKnockoutSaveError] = useState<string | undefined>();
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBuffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const t = copy[locale];
  const isAdmin = user.role === "owner" || user.role === "admin";
  const panels: Panel[] = isAdmin ? ["games", "ranking", "bracket", "admin"] : ["games", "ranking", "bracket"];
  const drafts = useMemo(() => ({ ...initialDrafts, ...draftOverrides }), [draftOverrides, initialDrafts]);
  const persistedMatchIds = useMemo(
    () => new Set([...Object.keys(initialDrafts), ...localPersistedMatchIds]),
    [initialDrafts, localPersistedMatchIds],
  );

  useEffect(() => {
    const refresh = () => router.refresh();
    const interval = window.setInterval(refresh, 15000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [router]);

  const saveDraft = async (draft: PredictionDraft) => {
    setSavingDrafts((current) => ({ ...current, [draft.matchId]: true }));
    setSaveErrors((current) => ({ ...current, [draft.matchId]: undefined }));

    try {
      const response = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? copy[locale].saveError);
      }

      const isNewPrediction = !persistedMatchIds.has(draft.matchId);
      if (isNewPrediction) {
        setLocalPersistedMatchIds((current) => new Set(current).add(draft.matchId));
      }

      setSavedDrafts((current) => ({ ...current, [draft.matchId]: true }));
    } catch (error) {
      const message = error instanceof Error ? error.message : copy[locale].saveError;
      setSaveErrors((current) => ({ ...current, [draft.matchId]: message }));
    } finally {
      setSavingDrafts((current) => ({ ...current, [draft.matchId]: false }));
    }
  };

  const saveKnockout = async (picks: Record<string, string>, championTeamId: string) => {
    setKnockoutSaving(true);
    setKnockoutSaveError(undefined);

    try {
      const response = await fetch("/api/knockout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ picks, championTeamId }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Could not save knockout bracket");
      }

      setKnockoutSaved(true);
    } catch (error) {
      setKnockoutSaveError(error instanceof Error ? error.message : "Could not save knockout bracket");
    } finally {
      setKnockoutSaving(false);
    }
  };

  const playLocaleSound = async (nextLocale: Locale) => {
    try {
      const soundUrl = localeSounds[nextLocale];
      const AudioContextConstructor = window.AudioContext;
      const audioContext = audioContextRef.current ?? new AudioContextConstructor();
      audioContextRef.current = audioContext;

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      let buffer = audioBuffersRef.current.get(soundUrl);
      if (!buffer) {
        const response = await fetch(soundUrl);
        const arrayBuffer = await response.arrayBuffer();
        buffer = await audioContext.decodeAudioData(arrayBuffer);
        audioBuffersRef.current.set(soundUrl, buffer);
      }

      const source = audioContext.createBufferSource();
      const gain = audioContext.createGain();
      gain.gain.value = 0.32;
      source.buffer = buffer;
      source.connect(gain);
      gain.connect(audioContext.destination);
      source.start();
    } catch (error) {
      console.error("Failed to play locale switch sound", error);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="fixed inset-x-0 top-0 z-30 border-b border-amber-500/20 bg-black/78 backdrop-blur">
        <div className="flex h-16 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-4">
            <div className="border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xl font-black text-amber-100">
              MiBR
            </div>
            <button
              className="hidden border-b-2 border-amber-400 px-2 py-1 text-sm font-bold text-amber-100 md:block"
              onClick={() => setPanel("games")}
              type="button"
            >
              {t.fantasyGames}
            </button>
            <button
              className="hidden px-2 py-1 text-sm font-bold text-stone-300 transition hover:text-amber-200 md:block"
              onClick={() => setPanel("bracket")}
              type="button"
            >
              {t.bracket}
            </button>
            {isAdmin ? (
              <button
                className="hidden px-2 py-1 text-sm font-bold text-stone-300 transition hover:text-amber-200 md:block"
                onClick={() => setPanel("admin")}
                type="button"
              >
                {t.admin}
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <button
              className="border border-white/15 bg-white/5 px-3 py-2 text-xs font-black text-stone-200 transition hover:border-amber-400"
              onClick={() => {
                const nextLocale = locale === "pt" ? "en" : "pt";
                setLocale(nextLocale);
                void playLocaleSound(nextLocale);
              }}
              type="button"
            >
              {locale === "pt" ? "PT-BR" : "EN"}
            </button>
            <div className="flex items-center gap-2">
              {user.avatarUrl ? (
                <Avatar className="h-9 w-9" label={user.displayLabel} src={user.avatarUrl} />
              ) : null}
              <span className="hidden text-sm font-bold text-stone-200 sm:inline">
                {user.displayLabel}
              </span>
            </div>
          </div>
        </div>
      </header>

      <aside className="fixed bottom-0 left-0 top-16 z-20 w-16 border-r border-amber-500/20 bg-black/62 transition-all duration-200 hover:w-52">
        <nav className="fantasy-scrollbar flex h-full flex-col gap-2 overflow-y-auto px-2 py-4">
          {panels.map((item) => (
            (() => {
              const Icon = panelIcons[item];
              return (
            <button
              className={[
                "flex h-11 items-center gap-3 overflow-hidden border px-3 text-left text-sm font-bold transition",
                panel === item
                  ? "border-amber-400 bg-amber-500/15 text-amber-100"
                  : "border-white/10 bg-white/5 text-stone-300 hover:border-amber-500/40",
              ].join(" ")}
              key={item}
              onClick={() => setPanel(item)}
              type="button"
              title={
                item === "games"
                  ? t.games
                  : item === "ranking"
                    ? t.ranking
                    : item === "bracket"
                      ? t.bracket
                      : t.admin
              }
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap">
                {item === "games"
                  ? t.games
                  : item === "ranking"
                    ? t.ranking
                    : item === "bracket"
                      ? t.bracket
                      : t.admin}
              </span>
            </button>
              );
            })()
          ))}
        </nav>
      </aside>

      <main className="pl-16 pt-16">
        <section className="border-b border-amber-500/20 bg-black/24 px-4 py-6 md:px-8">
          <div className="mx-auto max-w-7xl">
            <p className="text-xs font-bold uppercase tracking-[0.32em] text-emerald-300">
              Made in Brazil
            </p>
            <h1 className="mt-2 text-3xl font-black text-amber-100 md:text-5xl">
              MiBR Fantasy World Cup
            </h1>
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <span className="border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-100">
                {t.winnerChip}
              </span>
              <span className="border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-100">
                {t.scoreChip}
              </span>
              <span className="border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-blue-100">
                {t.lockChip}
              </span>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-6 md:px-8">
          {panel === "games" ? (
            <GamesPanel
              drafts={drafts}
              locale={locale}
              matches={matches}
              onSaveDraft={(draft) => void saveDraft(draft)}
              saveErrors={saveErrors}
              savedDrafts={savedDrafts}
              savingDrafts={savingDrafts}
              setDrafts={setDraftOverrides}
              setSavedDrafts={setSavedDrafts}
            />
          ) : null}
          {panel === "ranking" ? <RankingPanel leaderboard={leaderboard} locale={locale} /> : null}
          {panel === "bracket" ? (
            <BracketPanel
              initialKnockoutSubmission={initialKnockoutSubmission}
              knockoutSaveError={knockoutSaveError}
              knockoutSaved={knockoutSaved}
              knockoutSaving={knockoutSaving}
              locale={locale}
              matches={matches}
              onSaveKnockout={(picks, championTeamId) => void saveKnockout(picks, championTeamId)}
            />
          ) : null}
          {panel === "admin" && isAdmin ? (
            <AdminPanel
              currentUserId={user.discordUserId}
              currentUserRole={user.role}
              locale={locale}
              onDataChanged={() => router.refresh()}
              syncOverview={syncOverview}
              users={adminUsers}
            />
          ) : null}
        </section>
      </main>
    </div>
  );
}
