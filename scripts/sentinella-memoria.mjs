import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/*
 * Sentinella della MEMORIA del server del database.
 *
 * Perché esiste (17/10/2026): il 15/10 il server ha finito la memoria due volte (blocco alle 13:38 UTC,
 * riavvio da solo alle 15:17 UTC). Supabase ha confermato: nessun guasto loro, RAM e swap pieni.
 * La sentinella del database se ne accorge quando è già fermo; questa guarda la memoria PRIMA.
 *
 * Tre numeri, dalle metriche che Supabase espone (customer/v1/privileged/metrics, formato Prometheus):
 *  - memoria impegnata (Committed_AS) sul tetto (CommitLimit): sul server di Supabase il tetto vale davvero,
 *    quando lo si tocca le nuove richieste di memoria falliscono. È il numero del grafico di Supabase;
 *  - memoria disponibile (MemAvailable) sul totale;
 *  - swap usato: quando cresce il server sta già soffrendo (il 15/10 era pieno un minuto prima del riavvio).
 *
 * Tre letture a 20 secondi l'una dall'altra; si avvisa solo se il problema c'è in TUTTE e tre,
 * così un picco di pochi secondi non sveglia nessuno.
 *
 * La FOTO: se anche una sola lettura supera il livello di attenzione, la sentinella chiede al database
 * cosa sta girando (memoria_scatta_foto, migrazione 20281017090000). Il testo delle query resta nella
 * tabella chiusa memoria_foto_picchi; qui, e quindi su GitHub che è pubblico, arrivano solo numeri,
 * nomi di applicazioni e di job.
 */

export const SOGLIE = {
  attenzione: { impegnataPct: 90, disponibilePct: 20, swapPct: 25 },
  critico: { impegnataPct: 97, disponibilePct: 10, swapPct: 50 },
};

const NOMI = ["MemTotal", "MemAvailable", "SwapTotal", "SwapFree", "Committed_AS", "CommitLimit"];

/** Legge dal testo Prometheus le metriche di memoria del database. */
export function leggiMemoria(testo) {
  const valori = {};
  for (const riga of String(testo ?? "").split("\n")) {
    const m = /^node_memory_(\w+)_bytes\{([^}]*)\}\s+(\S+)/.exec(riga);
    if (!m || !NOMI.includes(m[1])) continue;
    if (!/service_type="db"/.test(m[2])) continue;
    const v = Number(m[3]);
    if (Number.isFinite(v)) valori[m[1]] = v;
  }
  if (!NOMI.every((n) => n in valori) || valori.MemTotal <= 0 || valori.CommitLimit <= 0) return null;
  const swapUsato = valori.SwapTotal > 0 ? valori.SwapTotal - valori.SwapFree : 0;
  return {
    impegnataPct: (valori.Committed_AS / valori.CommitLimit) * 100,
    disponibilePct: (valori.MemAvailable / valori.MemTotal) * 100,
    swapPct: valori.SwapTotal > 0 ? (swapUsato / valori.SwapTotal) * 100 : 0,
    impegnataGiB: valori.Committed_AS / 2 ** 30,
    tettoGiB: valori.CommitLimit / 2 ** 30,
    disponibileGiB: valori.MemAvailable / 2 ** 30,
    totaleGiB: valori.MemTotal / 2 ** 30,
  };
}

/** "ok" | "attenzione" | "critico" per una lettura. */
export function livello(l) {
  const sopra = (s) => l.impegnataPct >= s.impegnataPct || l.disponibilePct <= s.disponibilePct || l.swapPct >= s.swapPct;
  if (sopra(SOGLIE.critico)) return "critico";
  if (sopra(SOGLIE.attenzione)) return "attenzione";
  return "ok";
}

const ORDINE = { ok: 0, attenzione: 1, critico: 2 };

/** Il livello che vale per l'avviso: il più basso delle letture (deve esserci in tutte). */
export function livelloPersistente(letture) {
  if (letture.length === 0) return "ok";
  return letture.map(livello).reduce((a, b) => (ORDINE[b] < ORDINE[a] ? b : a));
}

/** Il livello più alto visto in almeno una lettura: basta questo per scattare la foto. */
export function livelloMassimo(letture) {
  return letture.map(livello).reduce((a, b) => (ORDINE[b] > ORDINE[a] ? b : a), "ok");
}

/** Chiede al database la foto di cosa sta girando. Mai un errore: un database in affanno può non rispondere. */
export async function scattaFoto(env, livelloVisto, letture, send = fetch) {
  const arrotonda = letture.map((l) => ({
    impegnata_pct: Math.round(l.impegnataPct), disponibile_pct: Math.round(l.disponibilePct), swap_pct: Math.round(l.swapPct),
  }));
  const query = `select public.memoria_scatta_foto(${sqlTesto(livelloVisto)}, ${sqlTesto(JSON.stringify(arrotonda))}::jsonb) as foto`;
  try {
    const r = await send(`https://api.supabase.com/v1/projects/${env.REF}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(20_000),
    });
    const dati = r.ok ? await r.json() : null;
    return Array.isArray(dati) && dati[0]?.foto ? dati[0].foto : null;
  } catch {
    return null;
  }
}

const sqlTesto = (v) => `'${String(v).replace(/'/g, "''")}'`;

export async function chiaveServizio(ref, token, send = fetch) {
  const r = await send(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) return null;
  const chiavi = await r.json();
  if (!Array.isArray(chiavi)) return null;
  const k = chiavi.find((c) => c?.name === "service_role" && typeof c.api_key === "string" && !c.disabled);
  return k?.api_key ?? null;
}

export async function controllaMemoria(env = process.env, send = fetch, wait = (ms) => new Promise((r) => setTimeout(r, ms))) {
  if (!env.TOKEN || !/^[a-z0-9]{20}$/.test(env.REF ?? "")) throw new Error("Configurazione sentinella mancante");
  const chiave = await chiaveServizio(env.REF, env.TOKEN, send);
  if (!chiave) throw new Error("Chiave per le metriche non disponibile");
  // La chiave non va mai nei log.
  if (env.GITHUB_ACTIONS) console.log(`::add-mask::${chiave}`);
  const auth = "Basic " + Buffer.from(`service_role:${chiave}`).toString("base64");
  const letture = [];
  for (let i = 0; i < 3; i++) {
    try {
      const r = await send(`https://${env.REF}.supabase.co/customer/v1/privileged/metrics`, {
        headers: { Authorization: auth }, signal: AbortSignal.timeout(20_000),
      });
      const l = r.ok ? leggiMemoria(await r.text()) : null;
      if (l) letture.push(l);
    } catch { /* lettura persa: conta solo quelle riuscite */ }
    if (i < 2) await wait(20_000);
  }
  const massimo = env.PROVA === "true" ? "critico" : livelloMassimo(letture);
  const foto = massimo === "ok" ? null : await scattaFoto(env, env.PROVA === "true" ? "prova" : massimo, letture, send);
  return { letture, livello: env.PROVA === "true" ? "critico" : livelloPersistente(letture), foto };
}

const f = (n) => n.toFixed(1);

/** La foto per il riepilogo di GitHub: solo numeri e nomi (il dettaglio è in memoria_foto_picchi). */
export function testoFoto(foto) {
  if (!foto) return "";
  const conn = (foto.connessioni ?? []).slice(0, 8)
    .map((c) => `| ${c.app} | ${c.n} | ${c.attive} | ${c.ferme_in_transazione} | ${c.attiva_da_s ?? "-"} |`).join("\n");
  const lunghe = (foto.piu_lunghe ?? []).slice(0, 8)
    .map((q) => `| ${q.app} | ${q.stato} | ${q.attesa ?? "-"} | ${q.durata_s ?? "-"} | ${q.query_id ?? "-"} |`).join("\n");
  const cron = (foto.cron_in_corso ?? []).map((c) => `${c.jobname} (${c.da_s} s)`).join(", ") || "nessuno";
  return `\n### Foto del picco\n\nDettaglio completo: tabella \`memoria_foto_picchi\` (query_id → pg_stat_statements).\n\n` +
    `| Applicazione | Connessioni | Attive | Ferme in transazione | Attiva da (s) |\n|---|---|---|---|---|\n${conn}\n\n` +
    `Query attive: ${foto.query_attive ?? 0}\n\n| Applicazione | Stato | Attesa | Durata (s) | query_id |\n|---|---|---|---|---|\n${lunghe}\n\n` +
    `Job pg_cron in corso: ${cron}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { letture, livello: liv, foto } = await controllaMemoria();
    const righe = letture.map((l, i) =>
      `| ${i + 1} | ${f(l.impegnataGiB)} / ${f(l.tettoGiB)} GiB (${Math.round(l.impegnataPct)}%) | ${f(l.disponibileGiB)} / ${f(l.totaleGiB)} GiB (${Math.round(l.disponibilePct)}%) | ${Math.round(l.swapPct)}% | ${livello(l)} |`);
    const riepilogo = `### Memoria del database\n\n| Lettura | Impegnata / tetto | Disponibile | Swap usato | Livello |\n|---|---|---|---|---|\n${righe.join("\n")}\n`;
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, riepilogo + testoFoto(foto));
    console.log(riepilogo + testoFoto(foto));
    if (letture.length === 0) {
      console.warn("::warning title=Metriche di memoria non lette::Le metriche di Supabase non hanno risposto: la sentinella del database dice se il database è su.");
    } else if (process.env.PROVA === "true") {
      console.error("::error title=Prova della sentinella memoria::Fallimento di prova: se ti è arrivato l'avviso, l'allarme memoria funziona.");
      process.exitCode = 1;
    } else if (liv === "critico") {
      console.error("::error title=MEMORIA del database quasi finita::Edilizia in Cloud: il server del database è al limite della memoria da almeno un minuto. Rischio blocco o riavvio entro pochi minuti. Guarda cosa sta girando (invii di massa, importazioni, automazioni) e fermalo.");
      process.exitCode = 1;
    } else if (liv === "attenzione") {
      console.error("::error title=Memoria del database alta::Edilizia in Cloud: la memoria del server del database è sopra il livello di attenzione da almeno un minuto. Non è ancora un blocco: controlla cosa sta girando.");
      process.exitCode = 1;
    }
  } catch {
    console.warn("::warning title=Sentinella memoria non eseguita::Accesso alle metriche non riuscito; questo non vuol dire che il database sia giù.");
  }
}
