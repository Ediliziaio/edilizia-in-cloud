import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Only public keys may be used to exercise the same REST path as the app. */
export function pickPublicApiKey(keys) {
  if (!Array.isArray(keys)) return null;
  for (const key of keys) {
    if (key.disabled || key.deleted_at || typeof key.api_key !== "string") continue;
    if (key.type === "publishable" && key.api_key.startsWith("sb_publishable_")) return key.api_key;
  }
  for (const key of keys) {
    if (key.disabled || key.deleted_at || typeof key.api_key !== "string") continue;
    try {
      const payload = JSON.parse(Buffer.from(key.api_key.split(".")[1], "base64url").toString());
      if (payload.role === "anon") return key.api_key;
    } catch { /* Not an anonymous legacy key. */ }
  }
  return null;
}

export async function probeDatabase({ ref, token, publicKey, thresholdMs = 8000 }, send = fetch, clock = Date.now) {
  async function probe(url, headers, body, valid) {
    const start = clock();
    try {
      const response = await send(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
      const data = await response.json();
      const durationMs = Math.max(0, clock() - start);
      return { status: response.status, durationMs, outcome: response.ok && valid(data) ? (durationMs > thresholdMs ? "slow" : "ok") : "failed" };
    } catch {
      return { status: null, durationMs: Math.max(0, clock() - start), outcome: "failed" };
    }
  }
  // Sequential small probes, never load tests or statistics scans. The public
  // API can fail while Management API SELECT 1 succeeds: report both paths.
  const publicApi = await probe(`https://${ref}.supabase.co/rest/v1/rpc/battito_ping`, {
    apikey: publicKey, "Content-Type": "application/json",
  }, {}, data => data === true);
  const management = await probe(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    Authorization: `Bearer ${token}`, "Content-Type": "application/json",
  }, { query: "select 1 as ok" }, data => Array.isArray(data) && data[0]?.ok === 1);
  return { publicApi, management, healthy: publicApi.outcome === "ok" && management.outcome === "ok" };
}

export async function runSentinel(env = process.env, send = fetch, wait = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  if (!env.TOKEN || !/^[a-z0-9]{20}$/.test(env.REF ?? "")) throw new Error("Configurazione sentinella mancante");
  let publicKey = env.SUPABASE_PUBLISHABLE_KEY;
  if (!publicKey) {
    // Existing GitHub deployment token, existing keys only; no creation or
    // rotation. Never print this response, provider bodies, or any key.
    const response = await send(`https://api.supabase.com/v1/projects/${env.REF}/api-keys?reveal=true`, {
      headers: { Authorization: `Bearer ${env.TOKEN}` }, signal: AbortSignal.timeout(20_000),
    });
    if (response.ok) publicKey = pickPublicApiKey(await response.json());
  }
  if (!publicKey || !pickPublicApiKey([{ api_key: publicKey, type: "publishable" }])) throw new Error("Chiave pubblica della sonda non disponibile");
  const thresholdMs = Number(env.SOGLIA_LENTO_MS ?? 8000);
  if (!Number.isFinite(thresholdMs) || thresholdMs <= 0) throw new Error("Soglia sentinella non valida");
  const attempts = [];
  for (let i = 0; i < 3; i++) {
    attempts.push(await probeDatabase({ ref: env.REF, token: env.TOKEN, publicKey, thresholdMs }, send));
    // In normal operation one attempt instead of the old three (less load).
    if (attempts.at(-1).publicApi.outcome === "ok") break;
    if (i < 2) await wait(20_000);
  }
  const healthy = attempts.some(attempt => attempt.publicApi.outcome === "ok") && env.PROVA !== "true";
  return { healthy, managementHealthy: attempts.some(attempt => attempt.management.outcome === "ok"), attempts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runSentinel();
    const lines = result.attempts.map((a, i) => `| ${i + 1} | ${a.publicApi.outcome} (${a.publicApi.durationMs} ms) | ${a.management.outcome} (${a.management.durationMs} ms) |`);
    const summary = `### Sentinella database\n\n| Prova | API pubblica dell’app | Connessione Management API |\n|---|---|---|\n${lines.join("\n")}\n`;
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    console.log(summary);
    if (result.healthy && !result.managementHealthy) console.warn("::warning title=Management API non disponibile::L’API pubblica dell’app risponde; il percorso amministrativo della sonda non è disponibile o è lento.");
    if (!result.healthy) {
      console.error("::error title=Database/API non disponibili o lenti::Nessuna prova completa veloce, oppure prova esplicita della sentinella. Consultare log e metriche prima di qualsiasi riavvio.");
      process.exitCode = 1;
    }
  } catch {
    console.error("::error title=Sentinella non eseguita::Verificare configurazione e accesso Management API; questo errore non dimostra che l’app sia indisponibile.");
    process.exitCode = 1;
  }
}
