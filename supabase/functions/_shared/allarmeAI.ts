/**
 * allarmeAI — il punto dove un errore del provider AI diventa un allarme.
 *
 * Si chiama dove il provider risponde (router, client OpenRouter, proxy
 * Claude, render): `segnalaErroreAI(errore, { funzione, modello, companyId })`.
 * Se l'errore è «credito finito», «chiave non valida» o «tetto della chiave»
 * (vedi allarmeAIClassifica.ts) scrive nel database (`ai_allarme_registra`), e
 * alla prima segnalazione sveglia il canarino (`ops-canarino`, modo
 * `credito-ai`) che manda l'email e la campanella. Il resto — timeout, 429,
 * 5xx — non fa niente.
 *
 * REGOLE
 * - Non lancia MAI e non fa MAI aspettare chi chiama: la classificazione è
 *   sincrona, tutto il resto gira in background (EdgeRuntime.waitUntil). Un
 *   avviso che rompe la chiamata AI sarebbe peggio del silenzio.
 * - Parla con PostgREST via fetch, senza supabase-js: niente client da creare
 *   in ogni funzione che importa il router.
 * - L'invio dell'avviso NON sta qui: lo decide il canarino (una volta, con i
 *   promemoria spaziati). Qui si registra e basta, così cento funzioni che
 *   falliscono insieme non fanno cento email.
 *
 * Il controllo ogni 5 minuti (cron `ai-credito-controllo`) fa da rete di
 * sicurezza: se una funzione non è agganciata qui, la sonda se ne accorge lo
 * stesso entro cinque minuti.
 */
import {
  classificaErroreAI,
  creaLimitatore,
  erroreGrezzoDa,
  type ErroreGrezzo,
} from "./allarmeAIClassifica.ts";

export interface ContestoAllarmeAI {
  /** Chi chiamava: il task del router, il nome della funzione. */
  funzione?: string | null;
  modello?: string | null;
  companyId?: string | null;
}

const limitatore = creaLimitatore();

const leggiEnv = (nome: string): string | undefined => {
  try {
    return (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get(nome);
  } catch {
    return undefined;
  }
};

function inBackground(lavoro: Promise<unknown>): void {
  try {
    (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil?.(lavoro);
  } catch {
    // la promessa gira lo stesso: waitUntil serve solo a non far ritirare il worker
  }
}

async function registra(
  provider: string,
  motivo: string,
  stato: number | null,
  errore: ErroreGrezzo,
  contesto: ContestoAllarmeAI,
  quante: number,
): Promise<void> {
  const url = leggiEnv("SUPABASE_URL");
  const chiave = leggiEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !chiave) return;

  const risposta = await fetch(`${url}/rest/v1/rpc/ai_allarme_registra`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: chiave, Authorization: `Bearer ${chiave}` },
    body: JSON.stringify({
      p_provider: provider,
      p_motivo: motivo,
      p_funzione: contesto.funzione ?? null,
      p_modello: contesto.modello ?? null,
      p_dettaglio: `${stato ?? ""} ${String(errore.messaggio ?? "").replace(/\s+/g, " ").trim()}`.trim().slice(0, 600) || null,
      p_azienda: contesto.companyId ?? null,
      p_conteggio: quante,
    }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!risposta.ok) {
    console.warn(`[allarmeAI] registrazione fallita: ${risposta.status}`);
    return;
  }
  const esito = await risposta.json().catch((): null => null) as { da_notificare?: boolean } | null;
  if (esito?.da_notificare) await svegliaControllo(url);
}

/**
 * Il canarino manda l'avviso. Si aspetta la risposta per intero (siamo già in
 * background): una connessione chiusa prima farebbe fermare il lavoro a metà,
 * come è successo ai cron il 20/09/2026.
 */
async function svegliaControllo(urlProgetto: string): Promise<void> {
  const segreto = leggiEnv("INTERNAL_CRON_SECRET");
  if (!segreto) return; // senza segreto ci pensa il cron dei 5 minuti
  try {
    const r = await fetch(`${urlProgetto}/functions/v1/ops-canarino`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": segreto },
      body: JSON.stringify({ modo: "credito-ai" }),
      signal: AbortSignal.timeout(40_000),
    });
    await r.text().catch(() => "");
  } catch (e) {
    console.warn("[allarmeAI] canarino non svegliato:", e instanceof Error ? e.message : e);
  }
}

/**
 * Da chiamare nel punto in cui un provider AI risponde male. `errore` può
 * essere un Error, una stringa («OpenRouter 402: …») o `{ stato, messaggio,
 * provider }`. Torna subito.
 */
export function segnalaErroreAI(errore: unknown, contesto: ContestoAllarmeAI = {}): void {
  try {
    const grezzo = erroreGrezzoDa(errore);
    const c = classificaErroreAI(grezzo);
    if (!c) return;
    const quante = limitatore.registra(`${c.provider}:${c.motivo}`);
    if (quante === 0) return;
    inBackground(
      registra(c.provider, c.motivo, c.stato, grezzo, contesto, quante).catch((e) => {
        console.warn("[allarmeAI] non registrato:", e instanceof Error ? e.message : e);
      }),
    );
  } catch {
    // mai: l'allarme non deve rompere la chiamata AI
  }
}
