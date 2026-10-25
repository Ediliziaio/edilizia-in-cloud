/**
 * Limite di richieste per utente e per azienda sulla chat AI dei preventivi e sulla
 * trascrizione audio.
 *
 * Ogni richiesta alla chat o all'audio spende i crediti AI dell'azienda (e l'audio
 * anche soldi veri, all'API di OpenAI, prima ancora di addebitare). Il saldo ferma chi
 * non ha più crediti, ma non una raffica: finché il saldo basta, nessun limite diceva
 * quante richieste al minuto può mandare un utente, o tutti insieme. Un'azienda poteva
 * bruciare in pochi minuti il proprio credito, o far spendere alla piattaforma più di
 * quanto verrà mai addebitato.
 *
 * Il conteggio è quello atomico che già c'è, `check_ai_router_rate_limit` (blocco per
 * chiamante, conta e registra nella stessa transazione): più richieste parallele non
 * passano tutte insieme. Le tre finestre hanno nomi diversi, così ogni richiesta pesa
 * UNA volta in ciascuna. Se il conteggio non risponde si lascia passare: il limite è
 * una protezione, e il saldo si controlla comunque a parte.
 *
 * I numeri sono larghi per chi lavora (una conversazione umana manda una richiesta ogni
 * qualche secondo) e stretti per chi automatizza.
 */
export const QUOTE_RATE_LIMITS = {
  chat: { utenteAlMinuto: 20, utenteIn10Minuti: 150, aziendaAlMinuto: 60 },
  audio: { utenteAlMinuto: 6, utenteIn10Minuti: 40, aziendaAlMinuto: 20 },
} as const;

export type QuoteRateKind = keyof typeof QUOTE_RATE_LIMITS;

type RpcDb = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error?: { message?: string } | null }>;
};

/** Forma piatta (niente unione): il controllo tipi del progetto non restringe le unioni su `ok`/`allowed`. */
export type QuoteRateDecision = { allowed: boolean; retryAfterSeconds: number };

export async function checkQuoteRateLimit(
  db: RpcDb,
  kind: QuoteRateKind,
  companyId: string,
  userId: string,
): Promise<QuoteRateDecision> {
  const l = QUOTE_RATE_LIMITS[kind];
  const base = kind === "chat" ? "quote-chat" : "quote-audio";
  const controlli = [
    { funzione: `${base}:1m`, chi: `user:${userId}`, max: l.utenteAlMinuto, finestra: 60 },
    { funzione: `${base}:10m`, chi: `user:${userId}`, max: l.utenteIn10Minuti, finestra: 600 },
    { funzione: `${base}:azienda`, chi: `company:${companyId}`, max: l.aziendaAlMinuto, finestra: 60 },
  ];
  for (const c of controlli) {
    try {
      const { data, error } = await db.rpc("check_ai_router_rate_limit", {
        p_function_name: c.funzione,
        p_caller_id: c.chi,
        p_max_calls: c.max,
        p_window_seconds: c.finestra,
      });
      if (error) {
        console.warn("[quote-rate-limit] conteggio non disponibile, richiesta lasciata passare:", error.message);
        continue;
      }
      const r = data as { allowed?: boolean; retry_after_seconds?: number } | null;
      if (r && r.allowed === false) {
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(Number(r.retry_after_seconds) || c.finestra)) };
      }
    } catch (e) {
      console.warn("[quote-rate-limit] conteggio non riuscito, richiesta lasciata passare:", e instanceof Error ? e.message : e);
    }
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export const QUOTE_RATE_LIMIT_MESSAGE =
  "Troppe richieste ravvicinate. Attendi qualche istante e riprova: nessuna modifica alle voci e nessun addebito.";
