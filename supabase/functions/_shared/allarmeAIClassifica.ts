/**
 * allarmeAIClassifica — capire se un errore di un provider AI vuol dire «il
 * credito è finito» (o «la chiave non va»), e non spedire cento segnalazioni
 * uguali.
 *
 * PERCHÉ ESISTE (05/10/2026)
 * --------------------------
 * Dal 02/10 il conto OpenRouter era a zero e quasi ogni chiamata AI rispondeva
 * 402 («This request requires more credits… can only afford 76»). Silvio
 * ripiegava su gpt-4o-mini, il resto taceva. Nessuno è stato avvisato: l'unico
 * avviso che esisteva stava in UNA funzione (la lettura dei PDF in allegato),
 * finiva solo nella campanella dell'app, al massimo una volta al giorno, e il
 * titolare non ha il push attivo. Era già successo il 23/08 e il 01/09.
 *
 * Il router non lo racconta nemmeno nel suo registro: logga l'errore solo se
 * falliscono TUTTI i modelli della catena. Se il modello principale dà 402 e
 * il ripiego risponde, nel registro c'è un «success» e il 402 è sparito.
 * Quindi l'errore va guardato dove nasce, nel punto in cui il provider
 * risponde, non a valle.
 *
 * Solo logica pura (niente Deno, niente fetch): la usano il router, i client
 * dei provider, il controllo del canarino e i test
 * (src/test/logic/allarmeAI.test.ts). Il lato che scrive nel database e
 * sveglia il canarino è allarmeAI.ts.
 */

export type ProviderAI = "openrouter" | "openai" | "anthropic";

/**
 *  · credito_esaurito — il conto non ha più credito (OpenRouter 402, OpenAI
 *    insufficient_quota, Anthropic «credit balance is too low»);
 *  · chiave_non_valida — il provider rifiuta la chiave (revocata, disattivata,
 *    sbagliata): tutta l'AI di quel provider è ferma;
 *  · limite_chiave — il conto ha credito ma la CHIAVE ha raggiunto il suo tetto
 *    di spesa: la cura è un'altra (si alza il tetto, non si ricarica).
 */
export type MotivoAllarmeAI = "credito_esaurito" | "chiave_non_valida" | "limite_chiave";

/** «Credito basso» non nasce da un errore ma dal saldo letto col conto: sta nel controllo, non qui. */
export type MotivoAllarmeAnche = MotivoAllarmeAI | "credito_basso";

export interface ErroreGrezzo {
  /** Il testo dell'errore: spesso «OpenRouter 402: {…}», oppure il corpo della risposta. */
  messaggio?: string | null;
  /** Lo status HTTP, se chi chiama ce l'ha. Altrimenti si legge dal testo. */
  stato?: number | null;
  /** Il provider, se noto. Altrimenti lo dice il prefisso del testo. */
  provider?: ProviderAI | null;
}

export interface ErroreClassificato {
  provider: ProviderAI;
  motivo: MotivoAllarmeAI;
  stato: number | null;
}

// «OpenRouter 402:» / «OpenAI 429:» — il formato con cui router e client dei
// provider scrivono gli errori HTTP.
const PREFISSO_STATO = /\b(openrouter|openai|anthropic)\s+(\d{3})\b/i;

// I testi con cui i provider dicono «il credito è finito». Volutamente stretti:
// un falso allarme alle tre di notte fa perdere la fiducia nel prossimo.
const TESTO_CREDITO = new RegExp(
  [
    "requires more credits",
    "can only afford",
    "insufficient credits?",
    "requires at least \\$?\\s*[\\d.,]+\\s+in\\s+(?:your\\s+)?balance",
    "would exceed your (?:available )?credits",
    "insufficient_quota",
    "exceeded your current quota",
    "billing_hard_limit_reached",
    "credit balance is too low",
  ].join("|"),
  "i",
);

// Il tetto della chiave, non del conto: OpenRouter lo distingue con
// `limit_source` nei metadati dell'errore.
const TESTO_LIMITE_CHIAVE = /key limit exceeded|limit_source\W+(?:api_)?key|\bkey (?:spend|spending|credit) limit/i;

// Solo con 403: un 403 può anche essere «input segnalato dalla moderazione», e
// quello non è un problema della chiave.
const TESTO_CHIAVE =
  /invalid(?:\s+api)?\s+key|incorrect api key|invalid_api_key|api key.{0,30}(?:revoked|disabled|deleted|not found|invalid)|(?:revoked|disabled|deleted).{0,30}api key|no auth credentials|user not found|unauthorized|authentication (?:failed|required)/i;

function providerDaTesto(testo: string): ProviderAI | null {
  const m = testo.match(PREFISSO_STATO);
  if (m) return m[1].toLowerCase() as ProviderAI;
  // Un id di modello come «openai/gpt-4o-mini» NON dice che la chiamata sia
  // andata a OpenAI: passa da OpenRouter. Per questo si guarda prima il nome
  // del gateway, e le altre due sole se non seguite da «/».
  if (/openrouter/i.test(testo)) return "openrouter";
  if (/\bopenai\b(?!\/)/i.test(testo)) return "openai";
  if (/\banthropic\b(?!\/)/i.test(testo)) return "anthropic";
  return null;
}

function statoDaTesto(testo: string): number | null {
  const m = testo.match(PREFISSO_STATO);
  return m ? Number(m[2]) : null;
}

/**
 * `null` se l'errore non è né credito né chiave (timeout, 429 di velocità,
 * 5xx, modello inesistente, moderazione…): quelli sono rumore normale e non
 * devono svegliare nessuno.
 */
export function classificaErroreAI(errore: ErroreGrezzo): ErroreClassificato | null {
  const testo = String(errore.messaggio ?? "");
  const provider = errore.provider ?? providerDaTesto(testo);
  if (!provider) return null;
  const stato = errore.stato ?? statoDaTesto(testo);

  if (TESTO_LIMITE_CHIAVE.test(testo)) return { provider, motivo: "limite_chiave", stato };
  if (stato === 402 || TESTO_CREDITO.test(testo)) return { provider, motivo: "credito_esaurito", stato };
  if (stato === 401) return { provider, motivo: "chiave_non_valida", stato };
  if (stato === 403 && TESTO_CHIAVE.test(testo)) return { provider, motivo: "chiave_non_valida", stato };
  return null;
}

/**
 * Da qualunque cosa sia stata lanciata: un Error (anche quelli dei client dei
 * provider, che portano `provider_status`), una stringa o un oggetto già nella
 * forma giusta.
 */
export function erroreGrezzoDa(valore: unknown): ErroreGrezzo {
  if (valore == null) return {};
  if (typeof valore === "string") return { messaggio: valore };
  if (valore instanceof Error) {
    const stato = (valore as { provider_status?: unknown }).provider_status;
    return { messaggio: valore.message, stato: typeof stato === "number" ? stato : null };
  }
  if (typeof valore === "object") {
    const o = valore as Record<string, unknown>;
    return {
      messaggio: typeof o.messaggio === "string" ? o.messaggio : typeof o.message === "string" ? o.message : null,
      stato: typeof o.stato === "number" ? o.stato : typeof o.status === "number" ? o.status : null,
      provider: o.provider === "openrouter" || o.provider === "openai" || o.provider === "anthropic" ? o.provider : null,
    };
  }
  return {};
}

/**
 * Quando il credito è finito falliscono decine di chiamate al secondo: una
 * scrittura nel database per ciascuna sarebbe un secondo guasto. Il primo
 * errore passa subito (è quello che apre l'allarme); i successivi, nella
 * finestra, si contano e passano tutti insieme al primo errore dopo la
 * finestra. I conteggi sono per isolate: sono «almeno N», non N esatto.
 */
export function creaLimitatore(finestraMs = 20_000, adesso: () => number = () => Date.now()) {
  const ultimoInvio = new Map<string, number>();
  const trattenute = new Map<string, number>();
  return {
    /** Quante segnalazioni mandare ORA per questa chiave: 0 = tienile da parte. */
    registra(chiave: string): number {
      const t = adesso();
      const ultimo = ultimoInvio.get(chiave);
      if (ultimo !== undefined && t - ultimo < finestraMs) {
        trattenute.set(chiave, (trattenute.get(chiave) ?? 0) + 1);
        return 0;
      }
      const accumulate = trattenute.get(chiave) ?? 0;
      trattenute.delete(chiave);
      ultimoInvio.set(chiave, t);
      return accumulate + 1;
    },
  };
}
