/**
 * SMS del codice di firma: tetto per richiesta (revisione del 05/10/2026).
 *
 * Si prova `inviaSmsCodiceFirma`, il pezzo che spedisce l'SMS per fea-genera-otp, con un database finto:
 * al massimo cinque SMS per richiesta, anche con molte chiamate nello stesso istante; un tentativo rifiutato
 * dal provider conta lo stesso; il tetto è per richiesta; e se il registro non si scrive l'SMS non parte
 * (sfuggirebbe al conteggio). Oltre il tetto resta l'email.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DbFinto, denoFinto, type Riga } from "../helpers/dbFinto";

const SMS_FIRMA = "../../../supabase/functions/_shared/inviaSmsFirma";
const AZIENDA = "az-1";
const RICHIESTA = "11111111-2222-3333-4444-555555555555";
const ALTRA_RICHIESTA = "99999999-2222-3333-4444-555555555555";
const NOME = "Rossi & Figli S.r.l.";
const TETTO = "tetto SMS per richiesta raggiunto";

type Esito = { inviato: boolean; motivo?: string };

function seme(giaMandati = 0, perRichiesta = RICHIESTA): Record<string, Riga[]> {
  const sms_messages: Riga[] = [];
  for (let i = 0; i < giaMandati; i++) {
    sms_messages.push({ id: `m${i}`, company_id: AZIENDA, trigger_entity: "documento", trigger_ref: perRichiesta, status: "delivered" });
  }
  return {
    sms_pricing_config: [{ prezzo_per_sms: 0.06 }],
    sms_wallet: [{ company_id: AZIENDA, crediti: 100, crediti_riservati: 0 }],
    sms_telnyx_numbers: [],
    sms_messages,
  };
}

let db: DbFinto;
let telnyx: ReturnType<typeof vi.fn>;

async function invia(richiestaId = RICHIESTA): Promise<Esito> {
  const { inviaSmsCodiceFirma } = await import(/* @vite-ignore */ SMS_FIRMA);
  return inviaSmsCodiceFirma(db.client, {
    companyId: AZIENDA, richiestaId, to: "+393331234567", otp: "482913", aziendaNome: NOME,
  }) as Promise<Esito>;
}

function avvia(righe: Record<string, Riga[]> = seme()) {
  db = new DbFinto(righe);
  vi.stubGlobal("Deno", denoFinto({ TELNYX_MASTER_API_KEY: "chiave-telnyx" }).deno);
}

beforeEach(() => {
  telnyx = vi.fn(async () => new Response(JSON.stringify({ data: { id: "tx-1" } }), { status: 200 }));
  vi.stubGlobal("fetch", telnyx);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("gli SMS del codice hanno un tetto per richiesta", () => {
  it("dopo cinque SMS non ne parte un altro", async () => {
    avvia();
    const esiti: Esito[] = [];
    for (let i = 0; i < 7; i++) esiti.push(await invia());
    expect(esiti.slice(0, 5).every((e) => e.inviato)).toBe(true);
    expect(esiti.slice(5)).toEqual([{ inviato: false, motivo: TETTO }, { inviato: false, motivo: TETTO }]);
    expect(telnyx).toHaveBeenCalledTimes(5);
    expect(db.righe("sms_messages")).toHaveLength(5);
  });

  it("un SMS rifiutato dal provider conta lo stesso: i tentativi sono limitati anche quando falliscono", async () => {
    avvia();
    telnyx.mockImplementation(async () => new Response("numero non valido", { status: 400 }));
    for (let i = 0; i < 8; i++) await invia();
    expect(telnyx).toHaveBeenCalledTimes(5);
  });

  it("il tetto è per richiesta: un'altra richiesta della stessa azienda ha i suoi cinque", async () => {
    avvia(seme(5));
    expect((await invia(RICHIESTA)).inviato).toBe(false);
    expect((await invia(ALTRA_RICHIESTA)).inviato).toBe(true);
  });
});

describe("il tetto degli SMS regge da solo, anche con molte chiamate nello stesso istante", () => {
  const insieme = async (gia: number, quanti: number) => {
    avvia(seme(gia));
    return Promise.all(Array.from({ length: quanti }, () => invia()));
  };

  it("dodici invii insieme su una richiesta nuova: al provider ne arrivano al massimo cinque", async () => {
    const esiti = await insieme(0, 12);
    expect(telnyx.mock.calls.length).toBeLessThanOrEqual(5);
    expect(esiti.filter((e) => e.inviato).length).toBeLessThanOrEqual(5);
    expect(db.righe("sms_messages").filter((r) => r.status !== "failed").length).toBeLessThanOrEqual(5);
  });

  it("con tre già mandati, dodici insieme ne aggiungono al massimo due", async () => {
    await insieme(3, 12);
    expect(telnyx.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("a tetto raggiunto non si scrive nemmeno una riga nel registro e non si tocca il provider", async () => {
    const esiti = await insieme(5, 1);
    expect(esiti[0]).toEqual({ inviato: false, motivo: TETTO });
    expect(telnyx).not.toHaveBeenCalled();
    expect(db.righe("sms_messages")).toHaveLength(5);
    expect(db.chiamateRpc).toHaveLength(0);
  });

  it("se il registro non si scrive l'SMS non parte: sfuggirebbe al tetto", async () => {
    avvia();
    db.erroriProssimi["sms_messages:insert"] = "violazione di un vincolo";
    const esito = await invia();
    expect(esito.inviato).toBe(false);
    expect(telnyx).not.toHaveBeenCalled();
  });
});
