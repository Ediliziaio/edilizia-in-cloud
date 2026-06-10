import { describe, it, expect } from "vitest";
import {
  valutaPreInvio,
  claimDocumentoPerInvio,
  rilasciaClaimInvio,
  aggiornaStatoDaNotifica,
  STATO_IN_INVIO,
  STATI_INVIABILI,
} from "../../../supabase/functions/_shared/sdiInvioGuard";

/**
 * Test della guardia di invio a SDI (modulo condiviso tra la Edge Function
 * `invia-sdi` e questi test). Copre i due bug fiscali P1:
 *
 *   #1 Doppio invio / idempotenza  → claim atomico prima della POST al provider.
 *   #2 Fattura scartata non reinviabile → accettare 'rifiutata' per il reinvio,
 *      bloccando però le fatture già prese in carico/accettate dallo SDI.
 *
 * L'atomicità reale del claim è garantita lato DB da `SELECT ... FOR UPDATE`
 * (vedi migration claim_documento_per_invio). Qui simuliamo quella semantica
 * con un fake che muta la riga in modo sincrono tra lettura e scrittura,
 * esattamente come fa Postgres con il row lock.
 */

// ─── Fake DB che modella la RPC atomica + l'update di rilascio (CAS) ──────────

function makeFakeDb(initialStato: string, opts: { deleted?: boolean } = {}) {
  const row = {
    id: "doc-1",
    stato: initialStato,
    deleted_at: opts.deleted ? "2026-01-01T00:00:00Z" : (null as string | null),
  };
  let rpcError: unknown = null;

  return {
    row,
    setRpcError(e: unknown) {
      rpcError = e;
    },
    // Modella claim_documento_per_invio: lettura + CAS atomici (FOR UPDATE).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async rpc(fn: string, args: Record<string, any>) {
      if (fn !== "claim_documento_per_invio") throw new Error("unexpected rpc " + fn);
      if (rpcError) return { data: null, error: rpcError };
      if (args.p_documento_id !== row.id || row.deleted_at) {
        return { data: [{ claimed: false, previous_stato: null, current_stato: null }], error: null };
      }
      const prev = row.stato;
      if (STATI_INVIABILI.includes(prev as never)) {
        row.stato = STATO_IN_INVIO; // mutazione sincrona = serializzazione FOR UPDATE
        return { data: [{ claimed: true, previous_stato: prev, current_stato: STATO_IN_INVIO }], error: null };
      }
      return { data: [{ claimed: false, previous_stato: prev, current_stato: prev }], error: null };
    },
    // Modella .from(t).update(patch).eq().eq() come compare-and-set sulla riga.
    from(_table: string) {
      const conds: Array<[string, unknown]> = [];
      let patch: Record<string, unknown> | null = null;
      const builder = {
        update(p: Record<string, unknown>) {
          patch = p;
          return builder;
        },
        eq(col: string, val: unknown) {
          conds.push([col, val]);
          return builder;
        },
        // PostgREST builders sono thenable: await fa scattare .then
        then(resolve: (v: { data: unknown; error: unknown }) => void) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const match = conds.every(([c, v]) => (row as any)[c] === v);
          if (match && patch) Object.assign(row, patch);
          resolve({ data: null, error: null });
        },
      };
      return builder;
    },
  };
}

// ─── valutaPreInvio: politica di stato (bug #2 + messaggi) ────────────────────

describe("valutaPreInvio", () => {
  it("permette l'invio di un documento 'emessa'", () => {
    expect(valutaPreInvio({ stato: "emessa" })).toEqual({ ok: true });
  });

  it("permette il REINVIO di una fattura 'rifiutata' (scarto NS) — bug #2", () => {
    expect(valutaPreInvio({ stato: "rifiutata", sdi_stato: "NS", sdi_id_trasmissione: "26A00007" }))
      .toEqual({ ok: true });
  });

  it("blocca lo stato 'bozza' con istruzione ad emettere", () => {
    const r = valutaPreInvio({ stato: "bozza" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(422);
      expect(r.error).toMatch(/Emetti/i);
    }
  });

  it("blocca un invio già in corso ('in_invio') con 409", () => {
    const r = valutaPreInvio({ stato: "in_invio" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(409);
  });

  it.each(["inviata_sdi", "consegnata", "accettata", "pagata"])(
    "blocca il reinvio di una fattura già trasmessa (stato '%s')",
    (stato) => {
      expect(valutaPreInvio({ stato }).ok).toBe(false);
    },
  );

  it.each(["RC", "AT", "DT", "EC"])(
    "blocca il reinvio quando sdi_stato='%s' (già presa in carico/consegnata) — anti-doppione",
    (sdiStato) => {
      // Anche se lo stato documento fosse 'rifiutata', un esito consegnato/accettato
      // non va MAI ritrasmesso: si emette semmai una nota di credito.
      const r = valutaPreInvio({ stato: "rifiutata", sdi_stato: sdiStato });
      expect(r.ok).toBe(false);
    },
  );
});

// ─── claimDocumentoPerInvio: idempotenza atomica (bug #1) ─────────────────────

describe("claimDocumentoPerInvio", () => {
  it("ottiene il claim da 'emessa' e porta lo stato a 'in_invio'", async () => {
    const db = makeFakeDb("emessa");
    const res = await claimDocumentoPerInvio(db, "doc-1");
    expect(res).toEqual({ claimed: true, previousStato: "emessa", currentStato: STATO_IN_INVIO });
    expect(db.row.stato).toBe(STATO_IN_INVIO);
  });

  it("ottiene il claim da 'rifiutata' per il reinvio (bug #2)", async () => {
    const db = makeFakeDb("rifiutata");
    const res = await claimDocumentoPerInvio(db, "doc-1");
    expect(res.claimed).toBe(true);
    expect(res.previousStato).toBe("rifiutata");
  });

  it("due claim concorrenti: ESATTAMENTE UNO vince → un solo invio possibile (bug #1)", async () => {
    const db = makeFakeDb("emessa");
    const [a, b] = await Promise.all([
      claimDocumentoPerInvio(db, "doc-1"),
      claimDocumentoPerInvio(db, "doc-1"),
    ]);
    expect([a.claimed, b.claimed].filter(Boolean)).toHaveLength(1);
  });

  it("il secondo claim su un documento già 'in_invio' fallisce", async () => {
    const db = makeFakeDb("emessa");
    await claimDocumentoPerInvio(db, "doc-1");
    const second = await claimDocumentoPerInvio(db, "doc-1");
    expect(second.claimed).toBe(false);
  });

  it("propaga l'errore DB come eccezione (l'invio deve abortire, non procedere)", async () => {
    const db = makeFakeDb("emessa");
    db.setRpcError({ message: "deadlock detected" });
    await expect(claimDocumentoPerInvio(db, "doc-1")).rejects.toThrow();
  });
});

// ─── aggiornaStatoDaNotifica: webhook SDI, guardia atomica anti-TOCTOU ────────

describe("aggiornaStatoDaNotifica", () => {
  // Fake che modella .update(patch).eq("id",...).neq("stato","in_invio") come
  // compare-and-set: applica il patch solo se TUTTE le condizioni matchano.
  function makeNotificaDb(initialStato: string) {
    const row = { id: "doc-1", stato: initialStato };
    return {
      row,
      from(_table: string) {
        let patch: Record<string, unknown> | null = null;
        const eqConds: Array<[string, unknown]> = [];
        const neqConds: Array<[string, unknown]> = [];
        const builder = {
          update(p: Record<string, unknown>) { patch = p; return builder; },
          eq(col: string, val: unknown) { eqConds.push([col, val]); return builder; },
          neq(col: string, val: unknown) { neqConds.push([col, val]); return builder; },
          then(resolve: (v: { data: unknown; error: unknown }) => void) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const match = eqConds.every(([c, v]) => (row as any)[c] === v)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              && neqConds.every(([c, v]) => (row as any)[c] !== v);
            if (match && patch) Object.assign(row, patch);
            resolve({ data: null, error: null });
          },
        };
        return builder;
      },
    };
  }

  it("applica lo stato della notifica quando il documento NON è in invio", async () => {
    const db = makeNotificaDb("inviata_sdi");
    await aggiornaStatoDaNotifica(db, "doc-1", "consegnata");
    expect(db.row.stato).toBe("consegnata");
  });

  it("NON sovrascrive 'in_invio' anche se la lettura del webhook era stantia (TOCTOU)", async () => {
    // Scenario: il webhook ha letto stato='rifiutata', ma PRIMA del suo update
    // invia-sdi ha fatto il claim → 'in_invio'. La guardia atomica .neq() deve
    // impedire la sovrascrittura: l'esito lo deciderà invia-sdi.
    const db = makeNotificaDb(STATO_IN_INVIO);
    await aggiornaStatoDaNotifica(db, "doc-1", "rifiutata");
    expect(db.row.stato).toBe(STATO_IN_INVIO);
  });

  it("non tocca documenti con id diverso", async () => {
    const db = makeNotificaDb("inviata_sdi");
    await aggiornaStatoDaNotifica(db, "altro-doc", "consegnata");
    expect(db.row.stato).toBe("inviata_sdi");
  });
});

// ─── rilasciaClaimInvio: ripristino sicuro su fallimento ──────────────────────

describe("rilasciaClaimInvio", () => {
  it("ripristina lo stato precedente se il documento è ancora 'in_invio'", async () => {
    const db = makeFakeDb("emessa");
    await claimDocumentoPerInvio(db, "doc-1"); // → in_invio
    await rilasciaClaimInvio(db, "doc-1", "emessa");
    expect(db.row.stato).toBe("emessa");
  });

  it("NON sovrascrive uno stato impostato nel frattempo (es. webhook → 'consegnata')", async () => {
    const db = makeFakeDb("emessa");
    await claimDocumentoPerInvio(db, "doc-1"); // → in_invio
    db.row.stato = "consegnata"; // webhook SDI arrivato durante l'invio
    await rilasciaClaimInvio(db, "doc-1", "emessa");
    expect(db.row.stato).toBe("consegnata");
  });
});
