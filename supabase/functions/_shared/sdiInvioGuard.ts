// Guardia di invio a SDI — logica condivisa tra la Edge Function `invia-sdi`
// e i test (vitest). NESSUN import remoto (esm.sh/Deno std) o global Deno qui:
// il modulo deve essere importabile sia da Deno sia da vite/esbuild.
//
// Risolve due bug fiscali P1:
//   #1 Doppio invio: `claimDocumentoPerInvio` fa un claim ATOMICO server-side
//      (stato → 'in_invio') prima della POST al provider. Due chiamate
//      concorrenti: solo una ottiene il claim, l'altra abortisce.
//   #2 Fattura scartata non reinviabile: `valutaPreInvio` accetta anche
//      'rifiutata'/'scartata' per il reinvio, ma blocca le fatture già prese
//      in carico/consegnate/accettate dallo SDI (anti-doppione).

/** Stato transitorio durante la trasmissione (impostato dal claim atomico). */
export const STATO_IN_INVIO = "in_invio";

/** Stati da cui è lecito (ri)avviare una trasmissione a SDI. */
export const STATI_INVIABILI = ["emessa", "rifiutata", "scartata"] as const;

/**
 * Stati di PAGAMENTO che finiscono nella stessa colonna `stato` del ciclo SDI.
 * Incassare una fattura la porta a 'pagata'/'parzialmente_pagata' e fino al
 * 20/09/2026 questo bastava a impedirne per sempre l'invio allo SDI: chi
 * emetteva e incassava in giornata (contanti, POS) non poteva più trasmetterla.
 * Incassare non è trasmettere: si accettano anche questi stati, ma solo finché
 * allo SDI la fattura non è mai partita (sdi_stato e id trasmissione vuoti).
 */
export const STATI_PAGAMENTO = ["pagata", "parzialmente_pagata"];

/**
 * sdi_stato che indicano una fattura già accettata/consegnata/in carico allo
 * SDI: non va MAI ritrasmessa (genererebbe un doppione fiscale). Per correggere
 * una di queste si emette una nota di credito, non si reinvia.
 *   AT = attesa esito · RC = ricevuta consegna · MC = mancata consegna (la
 *   fattura è emessa, lo SDI la mette nel cassetto fiscale del cliente) ·
 *   DT = decorrenza termini · EC01/EC02 = esito dell'ente, accettata o
 *   rifiutata: in entrambi i casi la fattura è stata consegnata.
 * Fino al 24/09/2026 qui c'erano solo «EC» e niente MC: il confronto è esatto,
 * quindi EC01, EC02 e MC passavano e una fattura rifiutata dall'ente risultava
 * reinviabile.
 */
const SDI_STATO_GIA_TRASMESSA = ["AT", "RC", "MC", "DT", "EC", "EC01", "EC02"];

export interface DocPreInvio {
  stato: string | null;
  sdi_stato?: string | null;
  sdi_id_trasmissione?: string | null;
}

export type PreInvioEsito =
  | { ok: true }
  | { ok: false; status: number; error: string; code: string };

/**
 * Decisione PURA: questo documento può essere inviato/reinviato a SDI?
 * Non tocca il DB — serve per dare messaggi chiari prima del claim atomico.
 */
export function valutaPreInvio(doc: DocPreInvio): PreInvioEsito {
  const stato = doc.stato ?? "";

  if (stato === STATO_IN_INVIO) {
    return {
      ok: false,
      status: 409,
      code: "invio_in_corso",
      error: "Invio a SDI già in corso per questo documento. Attendere il completamento.",
    };
  }

  const sdiStato = (doc.sdi_stato ?? "").toUpperCase();
  if (SDI_STATO_GIA_TRASMESSA.includes(sdiStato)) {
    return {
      ok: false,
      status: 422,
      code: "gia_trasmessa",
      error:
        `Documento già trasmesso allo SDI (stato SDI: ${sdiStato}). ` +
        "Reinvio non consentito per evitare un doppio invio fiscale: per correggere emettere una nota di credito.",
    };
  }

  const maiTrasmessa = !sdiStato && !doc.sdi_id_trasmissione;
  // Scartata (NS): per l'Agenzia non è mai stata emessa, si corregge e si
  // rimanda anche se nel frattempo è stata incassata.
  const scartata = sdiStato === "NS";
  const inviabile =
    STATI_INVIABILI.includes(stato as (typeof STATI_INVIABILI)[number]) ||
    ((maiTrasmessa || scartata) && STATI_PAGAMENTO.includes(stato));

  if (!inviabile) {
    const error =
      stato === "bozza"
        ? "Il documento è in stato 'bozza'. Azione: aprire il documento e cliccare 'Emetti' prima di inviare all'SDI."
        : `Il documento deve essere in stato 'emessa' (o 'rifiutata' per un reinvio dopo scarto) ` +
          `per essere inviato a SDI (stato attuale: '${stato || "?"}').`;
    return { ok: false, status: 422, code: "stato_non_valido", error };
  }

  return { ok: true };
}

// ─── Lo stato dopo l'invio e dopo un esito ───────────────────────────────────
//
// La colonna `stato` porta insieme il giro dello SDI e l'incasso. Fino al
// 24/09/2026 un invio riuscito la metteva sempre a 'inviata_sdi' e ogni esito
// la riscriveva: una fattura incassata in giornata e poi trasmessa tornava
// «da incassare», e bastava registrare di nuovo l'incasso per contarlo due
// volte. L'esito dello SDI resta in sdi_stato; lo stato dell'incasso non si
// tocca.

/** Stati che un esito SDI non deve toccare: incasso, storno, annullamento. */
const STATI_NON_DA_ESITO = [...STATI_PAGAMENTO, "stornata", "annullata", STATO_IN_INVIO];

/**
 * Lo stato del documento dopo un esito dello SDI. null = non cambiarlo: la
 * notifica si registra comunque in sdi_stato.
 */
export function statoDopoEsito(
  statoAttuale: string | null | undefined,
  statoDaEsito: string | null | undefined,
): string | null {
  if (!statoDaEsito) return null;
  const s = statoAttuale ?? "";
  if (STATI_NON_DA_ESITO.includes(s)) return null;
  return statoDaEsito === s ? null : statoDaEsito;
}

/** Lo stato dopo un invio riuscito: se era già incassata resta incassata. */
export function statoDopoInvio(statoPrima: string | null | undefined): string {
  return statoPrima && STATI_PAGAMENTO.includes(statoPrima) ? statoPrima : "inviata_sdi";
}

// ─── Claim atomico (idempotenza, bug #1) ─────────────────────────────────────

export interface ClaimResult {
  claimed: boolean;
  previousStato: string | null;
  currentStato: string | null;
}

/** Sottoinsieme minimo del client Supabase necessario al claim (per testabilità). */
export interface ClaimDb {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown }>;
}

/**
 * Esegue il claim atomico via RPC `claim_documento_per_invio`.
 * L'atomicità reale è garantita lato DB da `SELECT ... FOR UPDATE`: due
 * richieste concorrenti vengono serializzate e solo la prima trova uno stato
 * inviabile → `claimed:true`. La seconda vede 'in_invio' → `claimed:false`.
 *
 * Su errore DB LANCIA: l'invio NON deve proseguire (meglio non inviare che
 * rischiare un doppio invio fiscale).
 */
export async function claimDocumentoPerInvio(
  db: ClaimDb,
  documentoId: string,
): Promise<ClaimResult> {
  const { data, error } = await db.rpc("claim_documento_per_invio", {
    p_documento_id: documentoId,
  });
  if (error) {
    throw new Error(
      `claim_documento_per_invio fallito: ${
        (error as { message?: string })?.message ?? String(error)
      }`,
    );
  }
  // RETURNS TABLE(...) → PostgREST restituisce un array di una riga.
  const row = (Array.isArray(data) ? data[0] : data) as
    | { claimed?: boolean; previous_stato?: string | null; current_stato?: string | null }
    | null
    | undefined;
  return {
    claimed: !!row?.claimed,
    previousStato: row?.previous_stato ?? null,
    currentStato: row?.current_stato ?? null,
  };
}

/** Sottoinsieme minimo del client Supabase per il rilascio (per testabilità). */
export interface ReleaseDb {
  from(table: string): {
    update(patch: Record<string, unknown>): {
      eq(col: string, val: unknown): {
        eq(col: string, val: unknown): PromiseLike<{ data: unknown; error: unknown }>;
      };
    };
  };
}

/**
 * Rilascia il claim ripristinando lo stato precedente, MA solo se il documento
 * è ANCORA 'in_invio' (compare-and-set): non sovrascrive uno stato impostato nel
 * frattempo dal webhook SDI. Best-effort — un errore qui non deve mascherare la
 * causa originale del fallimento dell'invio.
 */
export async function rilasciaClaimInvio(
  db: ReleaseDb,
  documentoId: string,
  previousStato: string,
): Promise<void> {
  await db
    .from("documenti_fiscali")
    .update({ stato: previousStato })
    .eq("id", documentoId)
    .eq("stato", STATO_IN_INVIO);
}

/** Sottoinsieme minimo del client Supabase per l'update guardato del webhook. */
export interface NotificaDb {
  from(table: string): {
    update(patch: Record<string, unknown>): {
      eq(col: string, val: unknown): {
        neq(col: string, val: unknown): PromiseLike<{ data: unknown; error: unknown }>;
      };
    };
  };
}

/**
 * Applica al documento lo stato derivato da una notifica SDI (webhook), con
 * guardia ATOMICA a livello DB: `.neq("stato", 'in_invio')`. Chiude la finestra
 * TOCTOU tra la lettura di `doc.stato` nel webhook e l'update — se nel frattempo
 * invia-sdi ha fatto il claim, la notifica NON sovrascrive 'in_invio' (l'esito
 * della trasmissione in corso lo deciderà invia-sdi al termine).
 */
export async function aggiornaStatoDaNotifica(
  db: NotificaDb,
  documentoId: string,
  newStato: string,
): Promise<void> {
  await db
    .from("documenti_fiscali")
    .update({ stato: newStato })
    .eq("id", documentoId)
    .neq("stato", STATO_IN_INVIO);
}

// ─── Canale di invio e firma delle fatture PA ─────────────────────────────────

/** Solo questi canali trasmettono davvero allo SDI; ogni altro valore = XML da caricare a mano. */
export function invioManuale(provider: string | null | undefined): boolean {
  return provider !== "aruba" && provider !== "openapi";
}

/**
 * La fattura verso la PA va firmata da noi prima dell'invio? Solo con Aruba.
 * openapi.it la firma da solo prima di trasmetterla (FAQ Invoice di openapi:
 * «le fatture elettroniche destinate alla PA vengono firmate automaticamente dal
 * sistema prima dell'invio»); in modalità manuale non trasmettiamo niente.
 * Prima si pretendeva la firma su ogni canale e nessuna fattura PA partiva.
 */
export function firmaPaACaricoNostro(isPa: boolean, provider: string | null | undefined): boolean {
  return isPa && provider === "aruba";
}
