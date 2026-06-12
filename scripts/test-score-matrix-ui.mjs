import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const expectedRows = [
  row("case_home_exact", "Case Home Exact", 5, 3, 1, 2, 1, 1),
  row("case_home_winner_only", "Case Home Winner Only", 3, 3, 1, 0, 0, 1),
  row("case_home_wrong_draw", "Case Home Wrong Draw", 0, 0, 0, 0, 0, 1),
  row("case_home_wrong_away", "Case Home Wrong Away", 0, 0, 0, 0, 0, 1),
  row("case_draw_exact", "Case Draw Exact", 5, 3, 1, 2, 1, 1),
  row("case_draw_winner_only", "Case Draw Winner Only", 3, 3, 1, 0, 0, 1),
  row("case_draw_wrong_home", "Case Draw Wrong Home", 0, 0, 0, 0, 0, 1),
  row("case_draw_wrong_away", "Case Draw Wrong Away", 0, 0, 0, 0, 0, 1),
  row("case_away_exact", "Case Away Exact", 5, 3, 1, 2, 1, 1),
  row("case_away_winner_only", "Case Away Winner Only", 3, 3, 1, 0, 0, 1),
  row("case_away_wrong_home", "Case Away Wrong Home", 0, 0, 0, 0, 0, 1),
  row("case_away_wrong_draw", "Case Away Wrong Draw", 0, 0, 0, 0, 0, 1),
  row("agg_all_exact", "Aggregate All Exact", 15, 9, 3, 6, 3, 3),
  row("agg_winner_only", "Aggregate Winner Only", 9, 9, 3, 0, 0, 3),
  row("agg_all_wrong", "Aggregate All Wrong", 0, 0, 0, 0, 0, 3),
  row("agg_mixed", "Aggregate Mixed", 8, 6, 2, 2, 1, 3),
]
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
  .map((entry, index) => ({ ...entry, rank: index + 1 }));

async function main() {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const next = startNext(port);

  let browser;
  try {
    await waitForServer(baseUrl);
    browser = await chromium.launch({
      executablePath: findBrowserExecutable(),
      headless: true,
    });

    const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
    await page.goto(`${baseUrl}/score-matrix-test`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /^Ranking$/ }).click();
    await page.getByTestId("ranking-row-agg_all_exact").waitFor();

    await assertHeader(page);
    for (const expected of expectedRows) {
      await assertRankingRow(page, expected);
    }

    console.log(`Validated ${expectedRows.length} ranking rows against the score matrix fixture.`);
  } finally {
    if (browser) {
      await browser.close();
    }
    await stopProcess(next);
  }
}

function row(
  discordUserId,
  displayLabel,
  totalPoints,
  winnerPoints,
  winnerScores,
  scorePoints,
  exactScores,
  predictions,
) {
  return {
    discordUserId,
    displayLabel,
    totalPoints,
    winnerPoints,
    winnerScores,
    scorePoints,
    exactScores,
    predictions,
  };
}

async function assertHeader(page) {
  const headerText = (await page.locator("thead").innerText()).toLowerCase();
  for (const label of ["Pontos", "Vencedor", "Placar exato", "Palpites"]) {
    if (!headerText.includes(label.toLowerCase())) {
      throw new Error(`Ranking header is missing "${label}". Header was: ${headerText}`);
    }
  }
}

async function assertRankingRow(page, expected) {
  const rankingRow = page.getByTestId(`ranking-row-${expected.discordUserId}`);
  await rankingRow.waitFor();

  await assertCell(rankingRow, "ranking-rank", String(expected.rank), expected);
  await assertCell(rankingRow, "ranking-player", expected.displayLabel, expected);
  await assertCell(rankingRow, "ranking-total-points", String(expected.totalPoints), expected);
  await assertCell(rankingRow, "ranking-winner-scores", hitLabel(expected.winnerScores), expected);
  await assertCell(rankingRow, "ranking-winner-points", `${expected.winnerPoints} pts`, expected);
  await assertCell(rankingRow, "ranking-exact-scores", exactLabel(expected.exactScores), expected);
  await assertCell(rankingRow, "ranking-score-points", `${expected.scorePoints} pts`, expected);
  await assertCell(rankingRow, "ranking-predictions", String(expected.predictions), expected);
}

async function assertCell(rankingRow, testId, expectedText, rowExpectation) {
  const actual = normalize(await rankingRow.getByTestId(testId).innerText());
  if (actual !== expectedText) {
    throw new Error(
      `${rowExpectation.displayLabel} ${testId}: expected "${expectedText}", received "${actual}"`,
    );
  }
}

function hitLabel(value) {
  return `${value} ${value === 1 ? "acerto" : "acertos"}`;
}

function exactLabel(value) {
  return `${value} ${value === 1 ? "acerto" : "acertos"}`;
}

function normalize(value) {
  return value.replace(/\s+/g, " ").trim();
}

function startNext(port) {
  const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

  const child = spawn(process.execPath, [nextBin, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AUTHORIZED_DISCORD_USERS: "case_home_exact:Case Home Exact:owner",
      AUTH_SECRET: "score-matrix-test-secret",
      DATABASE_URL: "",
      FANTASY_SCORE_MATRIX_TEST: "true",
      MOCK_AUTH: "true",
      NEXT_TELEMETRY_DISABLED: "1",
      NEXTAUTH_SECRET: "score-matrix-test-secret",
      NEXTAUTH_URL: `http://127.0.0.1:${port}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));

  return child;
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + 60_000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const status = await requestStatus(`${baseUrl}/score-matrix-test`);
      if (status >= 200 && status < 500) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await delay(500);
  }

  throw new Error(`Next dev server did not become ready. Last error: ${lastError?.message ?? "none"}`);
}

function requestStatus(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode ?? 0));
    });
    request.on("error", reject);
    request.setTimeout(5_000, () => {
      request.destroy(new Error(`Timed out requesting ${url}`));
    });
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function findBrowserExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ].filter(Boolean);

  const executable = candidates.find((candidate) => fs.existsSync(candidate));
  if (!executable) {
    throw new Error("No Chromium-compatible browser was found for Playwright.");
  }

  return executable;
}

async function stopProcess(child) {
  if (child.exitCode !== null) {
    return;
  }

  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(5_000).then(() => {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }),
  ]);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
