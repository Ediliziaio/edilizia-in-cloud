/**
 * allarmeAISonda — la richiesta di prova a OpenRouter, ogni cinque minuti.
 *
 * Gli errori delle chiamate vere dicono che il credito è finito, ma solo
 * quando qualcuno chiama: di notte, o quando nessuno usa Silvio, l'AI può
 * essere ferma per ore senza una sola traccia. E, soprattutto, il silenzio
 * dopo una ricarica non prova che il credito sia tornato: può essere solo che
 * nessuno ha chiamato. La sonda dà la risposta in entrambi i casi.
 *
 * COSA CHIEDE. Una richiesta minima a Sonnet 4.5 (il modello più caro fra
 * quelli che la piattaforma usa davvero) con un tetto di risposta realistico,
 * 4.000 token. OpenRouter rifiuta con 402 una richiesta il cui tetto di token
 * non è coperto dal saldo («You requested up to 1800 tokens, but can only
 * afford 76»), quindi la sonda passa solo se il saldo basta a una chiamata
 * vera, non solo a una di un token. Il tetto è una prenotazione: si paga ciò
 * che il modello scrive davvero, due o tre token, cioè ~0,00004 $ a prova
 * (~0,01 $ al giorno a una prova ogni cinque minuti).
 *
 * Logica pura: il fetch arriva da fuori, così i test lo simulano.
 */
import { classificaErroreAI, type MotivoAllarmeAI } from "./allarmeAIClassifica.ts";

export const MODELLO_SONDA = "anthropic/claude-sonnet-4.5";
export const TETTO_TOKEN_SONDA = 4_000;

export interface EsitoSonda {
  ok: boolean;
  stato: number | null;
  /** Il perché del rifiuto, se è credito, chiave o tetto. `null` se riuscita o se l'errore è d'altro tipo (rete, 5xx). */
  motivo: MotivoAllarmeAI | null;
  dettaglio: string | null;
  ms: number;
  /** Quanto è costata la prova, se OpenRouter lo dice. */
  costoUsd: number | null;
  modello: string;
}

export interface OpzioniSonda {
  apiKey: string;
  fetchFn?: typeof fetch;
  modello?: string;
  maxTokens?: number;
  timeoutMs?: number;
}

function messaggioDa(testo: string): string {
  try {
    const j = JSON.parse(testo) as { error?: { message?: unknown } | string };
    const m = typeof j.error === "string" ? j.error : j.error?.message;
    if (typeof m === "string" && m.trim()) return m.trim().slice(0, 300);
  } catch {
    // non è JSON: si tiene il testo com'è
  }
  return testo.replace(/\s+/g, " ").trim().slice(0, 300);
}

export async function sondaOpenRouter(o: OpzioniSonda): Promise<EsitoSonda> {
  const fetchFn = o.fetchFn ?? fetch;
  const modello = o.modello ?? MODELLO_SONDA;
  const inizio = Date.now();
  const ms = () => Date.now() - inizio;

  try {
    const risposta = await fetchFn("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${o.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://www.ediliziaincloud.com",
        // Solo ASCII: un carattere oltre Latin-1 (un trattino lungo) in un'intestazione fa lanciare fetch, e la sonda fallirebbe ogni volta in silenzio.
        "X-Title": "Edilizia in Cloud - sonda credito",
      },
      body: JSON.stringify({
        model: modello,
        messages: [{ role: "user", content: "Rispondi solo: ok" }],
        max_tokens: o.maxTokens ?? TETTO_TOKEN_SONDA,
        temperature: 0,
        usage: { include: true },
      }),
      signal: AbortSignal.timeout(o.timeoutMs ?? 25_000),
    });

    if (!risposta.ok) {
      const testo = await risposta.text().catch(() => "");
      const c = classificaErroreAI({ provider: "openrouter", stato: risposta.status, messaggio: testo });
      return { ok: false, stato: risposta.status, motivo: c?.motivo ?? null, dettaglio: messaggioDa(testo) || null, ms: ms(), costoUsd: null, modello };
    }

    const json = await risposta.json().catch((): null => null) as
      | { error?: { message?: unknown; code?: unknown }; usage?: { cost?: unknown } }
      | null;
    // OpenRouter a volte risponde 200 con l'errore nel corpo.
    if (json?.error) {
      const testo = typeof json.error.message === "string" ? json.error.message : JSON.stringify(json.error);
      const codice = typeof json.error.code === "number" ? json.error.code : null;
      const c = classificaErroreAI({ provider: "openrouter", stato: codice, messaggio: testo });
      return { ok: false, stato: codice, motivo: c?.motivo ?? null, dettaglio: testo.slice(0, 300), ms: ms(), costoUsd: null, modello };
    }
    const costo = Number(json?.usage?.cost);
    return { ok: true, stato: 200, motivo: null, dettaglio: null, ms: ms(), costoUsd: Number.isFinite(costo) ? costo : null, modello };
  } catch (e) {
    const testo = e instanceof Error ? e.message : String(e);
    return { ok: false, stato: null, motivo: null, dettaglio: testo.slice(0, 300), ms: ms(), costoUsd: null, modello };
  }
}
