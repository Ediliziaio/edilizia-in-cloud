/**
 * Il giro del server che collega da sole le fatture dei subappaltatori
 * (supabase/functions/subappalti-collega-fatture/handler.ts), sul database finto.
 * La funzione SQL subappalto_collega_fattura è finta: qui si prova chi la chiama, quando e con cosa.
 */
import { describe, expect, it, vi } from "vitest";
import { DbFinto, type Riga } from "../helpers/dbFinto";
import { giroSubappalti, TETTO } from "../../../supabase/functions/subappalti-collega-fatture/handler";

const A = "az-a";
const B = "az-b";
const PIVA = "01234567890";
const OGGI = new Date("2026-11-15T12:00:00Z");
const ieri = "2026-11-14T10:00:00Z";

function seme(over: Partial<Record<string, Riga[]>> = {}) {
  return {
    company_governance_settings: [{ company_id: A, collegamento_automatico: true }, { company_id: B, collegamento_automatico: false }],
    contratti_subappalto: [
      { id: "c1", company_id: A, numero_contratto: "SUB-07", importo_contrattuale: 30000, oneri_sicurezza: 0, acconto_importo: 0, stato: "attivo", subappaltatore_id: "d1" },
      { id: "cb", company_id: B, numero_contratto: "SUB-07", importo_contrattuale: 30000, oneri_sicurezza: 0, acconto_importo: 0, stato: "attivo", subappaltatore_id: "db" },
    ],
    subappaltatori_sicurezza: [{ id: "d1", company_id: A, piva: `IT${PIVA}` }, { id: "db", company_id: B, piva: PIVA }],
    sal_subappaltatori: [
      { id: "s1", company_id: A, contratto_id: "c1", numero_sal: 1, importo_lordo: 10000, oneri_quota: 0, ritenuta_importo: 500, acconto_recuperato: 0, importo_netto: 9500, stato: "verificato" },
      { id: "s2", company_id: A, contratto_id: "c1", numero_sal: 2, importo_lordo: 8000, oneri_quota: 0, ritenuta_importo: 400, acconto_recuperato: 0, importo_netto: 7600, stato: "ricevuto" },
      { id: "sb", company_id: B, contratto_id: "cb", numero_sal: 1, importo_lordo: 10000, oneri_quota: 0, ritenuta_importo: 500, acconto_recuperato: 0, importo_netto: 9500, stato: "verificato" },
    ],
    fatture_ricevute: [] as Riga[],
    acquisti_collegamenti: [] as Riga[],
    ...over,
  };
}
const fattura = (id: string, over: Riga = {}): Riga => ({
  id, company_id: A, cedente_piva: PIVA, numero_fattura: id, tipo_documento: "TD01", imponibile_totale: 9500, stato: null,
  contratto_subappalto_id: null, sal_subappaltatore_id: null, righe: [{ descrizione: "Contratto SUB-07, SAL n. 1" }], note: null,
  created_at: ieri, ...over,
});

/** Il client del finto con subappalto_collega_fattura che collega davvero (o risponde «proposta»). */
function cliente(db: DbFinto, rispostaCollega: "collega" | "proposta" = "collega") {
  const c = db.client;
  const chiamate: Array<Record<string, unknown>> = [];
  c.rpc = async (nome: string, args: Record<string, unknown>) => {
    await Promise.resolve();
    db.chiamateRpc.push({ nome, args });
    if (nome !== "subappalto_collega_fattura") return { data: null, error: null };
    chiamate.push(args);
    if (rispostaCollega === "proposta") return { data: { esito: "proposta" }, error: null };
    const f = db.righe("fatture_ricevute").find((r) => r.id === args.p_fattura)!;
    f.contratto_subappalto_id = args.p_contratto;
    f.sal_subappaltatore_id = args.p_sal;
    db.righe("acquisti_collegamenti").push({ company_id: f.company_id, da_tipo: "fattura_ricevuta", da_id: f.id, a_tipo: "contratto", a_id: args.p_contratto });
    return { data: { esito: "collegata" }, error: null };
  };
  return { c, chiamate };
}

describe("giro del server: fatture dei subappaltatori collegate da sole", () => {
  it("collega solo l'«unico e verificato», con esito automatico, regola e prove; il resto resta all'utente", async () => {
    const db = new DbFinto(seme({ fatture_ricevute: [
      fattura("f-ok"),
      fattura("f-sal-non-verificato", { imponibile_totale: 7600, righe: [{ descrizione: "SAL n. 2" }] }),
      fattura("f-senza-sal", { imponibile_totale: 1234, righe: [] }),
    ] }));
    const { c, chiamate } = cliente(db);
    const esito = await giroSubappalti(c, { oggi: OGGI });
    expect(chiamate).toHaveLength(1);
    expect(chiamate[0]).toMatchObject({ p_fattura: "f-ok", p_contratto: "c1", p_sal: "s1", p_esito: "automatico", p_regola: "subappalto_controllo_fattura" });
    expect((chiamate[0].p_prove as unknown[]).length).toBeGreaterThan(0);
    expect(esito).toMatchObject({ aziende: 1, controllate: 3, collegate: 1, proposte: 0, errori: [] });
    expect(esito.lasciate.proposta).toBe(2);
    // Il lavoro chiuso senza AI finisce nel conto del titolare.
    expect(db.chiamateRpc).toContainEqual(expect.objectContaining({ nome: "registra_esito_lavoro_ai", args: expect.objectContaining({ p_chiave: "f-ok", p_esito: "senza_ai" }) }));
  });

  it("interruttore spento: l'azienda non è nemmeno guardata", async () => {
    const db = new DbFinto(seme({ fatture_ricevute: [fattura("fb", { company_id: B })] }));
    const { c, chiamate } = cliente(db);
    const esito = await giroSubappalti(c, { oggi: OGGI });
    expect(chiamate).toHaveLength(0);
    expect(esito.aziende).toBe(1);
  });

  it("isolamento: contratto, SAL e P.IVA uguali di un'altra azienda non servono", async () => {
    const db = new DbFinto(seme({
      contratti_subappalto: [{ id: "cb", company_id: B, numero_contratto: "SUB-07", importo_contrattuale: 30000, oneri_sicurezza: 0, stato: "attivo", subappaltatore_id: "db" }],
      fatture_ricevute: [fattura("f-a")],
    }));
    const { c, chiamate } = cliente(db);
    await giroSubappalti(c, { oggi: OGGI });
    expect(chiamate).toHaveLength(0);
  });

  it("due fatture uguali sullo stesso SAL nello stesso giro: se ne collega una sola", async () => {
    const db = new DbFinto(seme({ fatture_ricevute: [fattura("f1", { created_at: "2026-11-14T10:00:00Z" }), fattura("f2", { created_at: "2026-11-14T11:00:00Z" })] }));
    const { c, chiamate } = cliente(db);
    const esito = await giroSubappalti(c, { oggi: OGGI });
    expect(chiamate).toHaveLength(1);
    expect(esito.lasciate.conflitto).toBe(1);
  });

  it("ripetuto (retry o due giri sovrapposti in sequenza): la fattura collegata non si ripassa", async () => {
    const db = new DbFinto(seme({ fatture_ricevute: [fattura("f-ok")] }));
    const { c, chiamate } = cliente(db);
    await giroSubappalti(c, { oggi: OGGI });
    const secondo = await giroSubappalti(c, { oggi: OGGI });
    expect(chiamate).toHaveLength(1);
    expect(secondo.controllate).toBe(0);
  });

  it("una fattura già nella traccia (una persona l'ha annullata o rifiutata) non si ripassa", async () => {
    const db = new DbFinto(seme({
      fatture_ricevute: [fattura("f-ok")],
      acquisti_collegamenti: [{ company_id: A, da_tipo: "fattura_ricevuta", da_id: "f-ok", a_tipo: "contratto", a_id: "c1", stato: "rifiutato" }],
    }));
    const { c, chiamate } = cliente(db);
    await giroSubappalti(c, { oggi: OGGI });
    expect(chiamate).toHaveLength(0);
  });

  it("l'interruttore spento fra lettura e scrittura: la funzione registra la proposta, il giro la conta", async () => {
    const db = new DbFinto(seme({ fatture_ricevute: [fattura("f-ok")] }));
    const { c } = cliente(db, "proposta");
    const esito = await giroSubappalti(c, { oggi: OGGI });
    expect(esito).toMatchObject({ collegate: 0, proposte: 1 });
  });

  it("fatture vecchie fuori dalla finestra; le proposte non tolgono il posto: si controllano tutte", async () => {
    const molte = Array.from({ length: TETTO + 5 }, (_, i) => fattura(`f${i}`, { imponibile_totale: 100 + i, righe: [] }));
    const db = new DbFinto(seme({ fatture_ricevute: [...molte, fattura("vecchia", { created_at: "2026-01-01T00:00:00Z" })] }));
    const { c } = cliente(db);
    const esito = await giroSubappalti(c, { oggi: OGGI });
    expect(esito.controllate).toBe(TETTO + 5);
  });

  it("il tetto vale sui collegamenti scritti: il resto si collega al giro dopo, senza rivedere sempre le stesse", async () => {
    const sal = Array.from({ length: 5 }, (_, i) => ({ id: `sx${i}`, company_id: A, contratto_id: "c1", numero_sal: 10 + i, importo_lordo: 1000 + i, oneri_quota: 0, ritenuta_importo: 0, acconto_recuperato: 0, importo_netto: 1000 + i, stato: "verificato" }));
    const fatture = sal.map((x, i) => fattura(`fx${i}`, { imponibile_totale: 1000 + i, righe: [{ descrizione: `SAL n. ${10 + i}` }] }));
    const db = new DbFinto(seme({ sal_subappaltatori: sal, fatture_ricevute: fatture }));
    const { c, chiamate } = cliente(db);
    const primo = await giroSubappalti(c, { oggi: OGGI, tetto: 3 });
    expect(primo).toMatchObject({ collegate: 3, rimandate: 2 });
    const secondo = await giroSubappalti(c, { oggi: OGGI, tetto: 3 });
    expect(secondo.collegate).toBe(2);
    expect(new Set(chiamate.map((x) => x.p_fattura)).size).toBe(5);
  });

  it("tutte le aziende accese sono guardate: la prima, piena di proposte, non ferma la seconda", async () => {
    const proposteA = Array.from({ length: 60 }, (_, i) => fattura(`pa${i}`, { imponibile_totale: 50 + i, righe: [] }));
    const db = new DbFinto(seme({
      company_governance_settings: [{ company_id: A, collegamento_automatico: true }, { company_id: B, collegamento_automatico: true }],
      fatture_ricevute: [...proposteA, fattura("fb", { company_id: B, righe: [{ descrizione: "SAL n. 1" }] })],
    }));
    const { c, chiamate } = cliente(db);
    const esito = await giroSubappalti(c, { oggi: OGGI });
    expect(esito.aziende).toBe(2);
    expect(chiamate.map((x) => x.p_fattura)).toEqual(["fb"]);
  });

  it("nessuna chiamata a servizi esterni: niente AI nel giro", async () => {
    const fetchFinto = vi.fn();
    vi.stubGlobal("fetch", fetchFinto);
    const db = new DbFinto(seme({ fatture_ricevute: [fattura("f-ok")] }));
    const { c } = cliente(db);
    await giroSubappalti(c, { oggi: OGGI });
    expect(fetchFinto).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
