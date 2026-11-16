/**
 * Rimborso di un addebito AI quando l'errore è nostro (decisione del 16/11/2026).
 *
 * Il provider ha lavorato e ci fa pagare, ma il risultato non arriva all'azienda
 * per colpa nostra: il JSON non si legge, il salvataggio fallisce, il video
 * avviato fallisce dopo. Allora l'addebito si storna: `ai_rimborsa_addebito`
 * scrive una riga di rimborso nel registro (mai cancellando la riga originale),
 * restituisce l'omaggio (se è ancora il suo mese) e il portafoglio, e annulla
 * l'eventuale debito ancora aperto. Il costo vero resta nostro e registrato.
 *
 * Gli errori del PROVIDER non passano di qui: non sono mai stati addebitati.
 *
 * Idempotente (chiave `rimborso:<chiave originale>`). Non lancia mai: chi lo
 * chiama sta già gestendo un errore. Serve il client del service role.
 */

// deno-lint-ignore no-explicit-any
type Db = any;

export interface RimborsoAiArgs {
  /** Riga del router (`ai_call_ledger.id`), es. `AiRouterCompleteResult.ledgerId`. */
  ledgerId?: string | null;
  /** Oppure la chiave dell'addebito sul router (es. `video_replicate_<id>`). */
  idempotencyKey?: string | null;
  /** Riga della strada diretta (`ai_model_usage_log.id`), es. `ChargeResult.usage_log_id`. */
  usageLogId?: string | null;
  /** Breve, senza dati del cliente: «salvataggio fallito», «JSON non leggibile». */
  motivo: string;
}

export interface RimborsoAiEsito {
  rimborsato: boolean;
  importoEur: number;
  reason?: string;
}

export async function rimborsaAddebitoAi(db: Db, args: RimborsoAiArgs): Promise<RimborsoAiEsito> {
  if (!db || (!args.ledgerId && !args.idempotencyKey && !args.usageLogId)) {
    return { rimborsato: false, importoEur: 0, reason: "niente_da_rimborsare" };
  }
  try {
    const { data, error } = await db.rpc("ai_rimborsa_addebito", {
      p_motivo: (args.motivo || "errore nostro").slice(0, 200),
      p_idempotency_key: args.idempotencyKey ?? null,
      p_ledger_id: args.usageLogId ? null : (args.ledgerId ?? null),
      p_usage_log_id: args.usageLogId ?? null,
    });
    if (error) {
      console.error("[rimborsoAi] ai_rimborsa_addebito:", error.message);
      return { rimborsato: false, importoEur: 0, reason: "rpc_error" };
    }
    const r = (data ?? {}) as { ok?: boolean; reason?: string; rimborsato_eur?: number; debito_annullato_eur?: number; idempotent_replay?: boolean };
    const importo = Number(r.rimborsato_eur ?? 0) + Number(r.debito_annullato_eur ?? 0);
    return {
      rimborsato: r.ok === true && (r.idempotent_replay === true || importo > 0),
      importoEur: importo,
      reason: r.reason,
    };
  } catch (e) {
    console.error("[rimborsoAi] eccezione:", (e as Error)?.message ?? e);
    return { rimborsato: false, importoEur: 0, reason: "eccezione" };
  }
}
