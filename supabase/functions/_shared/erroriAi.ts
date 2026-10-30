/**
 * Cosa dire all'utente quando una lettura AI non riesce (30/10/2026).
 *
 * Le funzioni che leggono documenti rispondevano a qualunque errore con
 * `errorResponse(err.message, 500)`. In 90 giorni tutti i 9 errori di lettura in
 * produzione erano di credito, e l'utente vedeva:
 *   · se il credito finito era quello del provider (della piattaforma): un testo
 *     tecnico («Tutti i modelli falliti … OpenRouter 402 …»), e quando il testo
 *     conteneva «credito provider insufficiente» la finestra di ricarica del
 *     CLIENTE si apriva (la riconosce dalle parole, vedi src/lib/creditoEsaurito.ts)
 *     anche con il portafoglio pieno;
 *   · se era il suo saldo: il messaggio giusto, ma con stato 500 invece di 402.
 *
 * Qui si distinguono i casi per NOME della classe e per testo (così il modulo è
 * puro e si prova senza il router). Un errore non riconosciuto torna `null` e la
 * funzione si comporta come prima.
 *
 *   saldo/budget dell'azienda  → 402, code insufficient_credits (finestra di ricarica)
 *   carta mancante             → 402, code payment_method_required
 *   credito del provider       → 503, servizio_non_disponibile, senza parole di credito
 *   modelli tutti falliti      → 502, lettura_non_riuscita
 *   esito della richiesta incerto → 409, esito_incerto
 */

export interface ErroreAiPerUtente {
  status: number;
  body: { error: string; code: string; [campo: string]: unknown };
}

/** I messaggi che l'utente può leggere, scritti in modo che la finestra di ricarica NON si apra. */
const MESSAGGI = {
  servizio_non_disponibile: "La lettura dei documenti è momentaneamente ferma. Riprova tra qualche minuto; se resta ferma, scrivi all'assistenza.",
  lettura_non_riuscita: "Non sono riuscito a leggere il documento. Riprova tra poco; se il problema resta, scrivici indicando il nome del file.",
  esito_incerto: "L'esito della lettura precedente non è ancora certo. Aspetta un minuto e riprova.",
} as const;

const STATO_PER_CODICE: Record<string, number> = {
  insufficient_credits: 402,
  payment_method_required: 402,
  servizio_non_disponibile: 503,
  lettura_non_riuscita: 502,
  esito_incerto: 409,
};

/** Credito finito presso il provider: dell'azienda non è, e non c'è nulla da ricaricare. */
const CREDITO_PROVIDER = /OpenRouter(?:\s+error)?\s*402\b|requires (?:at least \$|more credits)|credito provider/i;

function risposta(code: keyof typeof MESSAGGI): ErroreAiPerUtente {
  return { status: STATO_PER_CODICE[code], body: { error: MESSAGGI[code], code } };
}

/** Il modello ha risposto ma con qualcosa che non si legge (non è un JSON, è troncato…). */
export const letturaNonRiuscita = (): ErroreAiPerUtente => risposta("lettura_non_riuscita");

/**
 * La risposta da dare all'utente per un errore del router AI, oppure `null` se
 * non è uno di quelli riconosciuti (allora si risponde come prima).
 */
export function erroreAiPerUtente(err: unknown): ErroreAiPerUtente | null {
  const nome = err instanceof Error ? err.name : "";
  const messaggio = err instanceof Error ? err.message : String(err);

  // 1. Il saldo (o il budget del piano) dell'AZIENDA: il messaggio resta quello di sempre,
  //    che la finestra di ricarica sa leggere; cambia lo stato (402) e c'è il codice.
  if (nome === "AiCompanyCreditError") {
    const motivo = (err as { reason?: unknown }).reason;
    return {
      status: 402,
      body: { error: messaggio, code: "insufficient_credits", motivo: typeof motivo === "string" ? motivo : null },
    };
  }
  if (nome === "AiRouterError" && /^Budget AI\b/i.test(messaggio)) {
    return { status: 402, body: { error: messaggio, code: "insufficient_credits", motivo: "budget_piano" } };
  }
  if (nome === "AiRouterError" && /carta di pagamento/i.test(messaggio)) {
    return { status: 402, body: { error: messaggio, code: "payment_method_required" } };
  }

  // 2. Il credito del provider è finito: lo sa e lo risolve il team (l'allarme parte dal router).
  if (nome === "AiProviderCreditError" || CREDITO_PROVIDER.test(messaggio)) return risposta("servizio_non_disponibile");

  // 3. Il controllo del saldo non ha risposto: è un guasto nostro, non una richiesta di ricarica.
  if (nome === "AiRouterError" && /^Credito insufficiente o bloccato/i.test(messaggio)) return risposta("servizio_non_disponibile");

  // 4. Nessun modello ha risposto.
  if (nome === "AiRouterError" && /^Tutti i modelli falliti/i.test(messaggio)) return risposta("lettura_non_riuscita");

  // 5. Una richiesta precedente potrebbe essere andata a buon fine: non si rilancia alla cieca.
  if (nome === "AiRequestGuardError" && /provider_outcome_unknown/.test(messaggio)) return risposta("esito_incerto");

  return null;
}

/**
 * Ricostruisce lo stato e il corpo dal corpo JSON che una funzione ha già risposto
 * (ai-document-analyzer lo usa per rilanciare l'errore di router e parser al
 * client senza il prefisso «router:» né l'avviso generico di supabase-js).
 */
export function erroreDaCorpo(corpo: unknown): ErroreAiPerUtente | null {
  if (!corpo || typeof corpo !== "object") return null;
  const { error, code } = corpo as { error?: unknown; code?: unknown };
  if (typeof code !== "string" || typeof error !== "string" || !(code in STATO_PER_CODICE)) return null;
  const { motivo } = corpo as { motivo?: unknown };
  return {
    status: STATO_PER_CODICE[code],
    body: typeof motivo === "string" ? { error, code, motivo } : { error, code },
  };
}
