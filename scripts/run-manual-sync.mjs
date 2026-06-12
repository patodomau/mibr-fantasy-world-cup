const productionUrl = "https://mibr-fantasy-world-cup.vercel.app";

function readOption(name) {
  const prefix = `--${name}=`;
  const option = process.argv.find((arg) => arg.startsWith(prefix));
  return option ? option.slice(prefix.length) : undefined;
}

function normalizeBaseUrl(value) {
  return (value || productionUrl).replace(/\/+$/, "");
}

function endpointForScope(scope) {
  if (scope === "daily") {
    return "/api/cron/sync-daily";
  }

  if (scope === "live") {
    return "/api/cron/sync-live";
  }

  throw new Error(`Invalid sync scope "${scope}". Use "daily" or "live".`);
}

function printMetric(label, value) {
  if (Number.isFinite(value)) {
    console.log(`${label}: ${value}`);
  }
}

function printSource(source) {
  const message = source.message ? ` - ${source.message}` : "";
  const matches = Number.isFinite(source.normalizedMatches)
    ? `, ${source.normalizedMatches} matches`
    : "";

  console.log(`  - ${source.source}: ${source.status}${matches}${message}`);
}

async function main() {
  const scope = readOption("scope") || process.env.MIBR_SYNC_SCOPE || "daily";
  const baseUrl = normalizeBaseUrl(
    readOption("url") || process.env.MIBR_SYNC_URL || process.env.NEXTAUTH_URL,
  );
  const endpoint = `${baseUrl}${endpointForScope(scope)}`;
  const cronSecret = process.env.CRON_SECRET?.trim();
  const headers = cronSecret ? { authorization: `Bearer ${cronSecret}` } : {};

  console.log(`Running MiBR manual ${scope} sync...`);
  console.log(`Endpoint: ${endpoint}`);

  const response = await fetch(endpoint, {
    method: "GET",
    headers,
  });
  const rawBody = await response.text();

  let payload;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    payload = { rawBody };
  }

  if (!response.ok) {
    console.error(`Manual sync failed with HTTP ${response.status}.`);
    console.error(JSON.stringify(payload, null, 2));
    process.exitCode = 1;
    return;
  }

  const result = payload.result || {};

  console.log("Manual sync finished.");
  console.log(`HTTP: ${response.status}`);
  console.log(`Scope: ${payload.scope || scope}`);

  if (result.status) {
    console.log(`Status: ${result.status}`);
  }

  printMetric("Consolidated matches", result.consolidatedMatches);
  printMetric("Normalized observations", result.normalizedObservations);
  printMetric("Auto-resolved disagreements", result.autoResolvedDisagreements);
  printMetric("Updated matches", result.updatedMatches);

  if (Array.isArray(result.sources) && result.sources.length > 0) {
    console.log("Sources:");
    result.sources.forEach(printSource);
  }

  if (result.message) {
    console.log(`Message: ${result.message}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
