import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn() } }));
import {
  AVVISO_CARICO_NON_RIUSCITO, caricaAlSalvataggio, messaggioCarico, mostraSpuntaCarico, preparaCarico, unitaDdt,
  type RigaSalvata,
} from "@/lib/ddt/caricoAlSalvataggio";

const riga = (p: Partial<RigaSalvata> = {}): RigaSalvata => ({
  id: "r1", descrizione: "Sacco malta", codice_articolo: null, quantita: 10, unita_misura: "pz", ...p,
});
const base = { warehouseId: "w", odaSullaBolla: false, giaConsegnate: new Set<string>(), articoli: [] as never[] };

describe("carico in magazzino al salvataggio (12/11/2026)", () => {
  it("la spunta compare solo per il magazzino e per chi può muoverlo", () => {
    expect(mostraSpuntaCarico({ destinazione: "magazzino", puoMagazzino: true })).toBe(true);
    expect(mostraSpuntaCarico({ destinazione: "cantiere", puoMagazzino: true })).toBe(false);
    expect(mostraSpuntaCarico({ destinazione: "magazzino", puoMagazzino: false })).toBe(false);
  });
  it("le unità si confrontano come il database: nr è pz, m2 è mq", () => {
    expect(unitaDdt(" NR ")).toBe("pz");
    expect(unitaDdt("m2")).toBe("mq");
  });
  it("riga senza articolo: la crea la funzione, come «Conferma consegne»", () => {
    const { invio, escluse } = preparaCarico({ ...base, righe: [riga()] });
    expect(escluse).toEqual([]);
    expect(invio).toEqual([{
      riga_id: "r1", quantita: 10, destinazione: "magazzino", warehouse_id: "w", tipo: "ingresso",
      crea_articolo: true, stock_item_id: null, conferma_unita: false, accetta_eccedenza: false,
    }]);
  });
  it("articolo certo per codice: si somma a quello, non se ne crea un altro", () => {
    const { invio } = preparaCarico({
      ...base,
      righe: [riga({ codice_articolo: "M25" })],
      articoli: [{ id: "s1", name: "Malta", internal_code: "M25", barcode: null, unita_misura: null }],
    });
    expect(invio[0]).toMatchObject({ crea_articolo: false, stock_item_id: "s1", conferma_unita: true });
  });
  it("scarta prima le righe che farebbero fallire tutta la chiamata, e dice perché", () => {
    const { invio, escluse } = preparaCarico({
      ...base,
      odaSullaBolla: true,
      righe: [
        riga({ id: "a", quantita: null }),
        riga({ id: "b", unita_misura: null }),
        riga({ id: "c" }),
        riga({ id: "d", abbinamento: "manuale" }),
        riga({ id: "e", purchase_order_item_id: "poi", unita_misura: "kg" }),
        riga({ id: "f", arrivo_registrato_il: "2026-11-12" }),
        riga({ id: "g", codice_articolo: "X", unita_misura: "kg", abbinamento: "manuale" }),
      ],
      articoli: [{ id: "s", name: "Altro", internal_code: "X", barcode: null, unita_misura: "pz" }],
      righeOrdine: new Map([["poi", { id: "poi", unit_of_measure: "pz", quantity: 5, quantity_received: 0 }]]),
    });
    expect(invio.map((r) => r.riga_id)).toEqual(["d"]);
    expect(escluse.map((e) => [e.riga_id, e.motivo])).toEqual([
      ["a", "manca la quantità"],
      ["b", "manca l'unità di misura"],
      ["c", "da abbinare all'ordine"],
      ["e", "unità diversa dall'ordine"],
      ["g", "unità diversa dall'articolo «Altro» in magazzino"],
    ]);
  });
});

function dbFinto(opzioni: { ddt?: Record<string, unknown>; righe?: RigaSalvata[]; errore?: string }) {
  const rpc = vi.fn(async () => ({ data: { righe: 1 }, error: opzioni.errore ? { message: opzioni.errore } : null }));
  const tabelle: Record<string, unknown[]> = {
    ddt_righe: opzioni.righe ?? [riga()],
    ddt_consegne: [],
    warehouse_stock: [],
    purchase_order_items: [],
  };
  const from = (t: string) => {
    const q: Record<string, unknown> = {};
    const fine = { data: tabelle[t] ?? [], error: null as null };
    Object.assign(q, {
      select: () => q, eq: () => q, order: () => q, in: () => Promise.resolve(fine),
      range: () => Promise.resolve(fine),
      single: () => Promise.resolve({ data: { id: "d", company_id: "c", warehouse_id: "w", destinazione: "magazzino", purchase_order_id: null, ...opzioni.ddt }, error: null }),
      then: (ok: (v: unknown) => void) => Promise.resolve(fine).then(ok),
    });
    return q;
  };
  return { from, rpc } as never as Parameters<typeof caricaAlSalvataggio>[1] & { rpc: typeof rpc };
}

describe("caricaAlSalvataggio", () => {
  it("chiama ddt_conferma_consegna con le righe pronte", async () => {
    const db = dbFinto({});
    const esito = await caricaAlSalvataggio("d", db);
    expect(esito).toEqual({ stato: "caricato", righe: 1, escluse: [] });
    expect(db.rpc).toHaveBeenCalledWith("ddt_conferma_consegna", expect.objectContaining({ p_ddt: "d", p_righe: [expect.objectContaining({ riga_id: "r1", crea_articolo: true })] }));
  });
  it("se il carico fallisce la bolla resta salvata e lo si dice", async () => {
    const esito = await caricaAlSalvataggio("d", dbFinto({ errore: "Magazzino non disponibile" }));
    expect(esito.stato).toBe("errore");
    expect(messaggioCarico(esito)?.titolo).toBe(AVVISO_CARICO_NON_RIUSCITO);
  });
  it("senza magazzino di arrivo il carico resta in sospeso, senza chiamare la funzione", async () => {
    const db = dbFinto({ ddt: { warehouse_id: null } });
    const esito = await caricaAlSalvataggio("d", db);
    expect(esito.stato).toBe("sospeso");
    expect(db.rpc).not.toHaveBeenCalled();
    expect(messaggioCarico(esito)?.titolo).toMatch(/resta in sospeso/);
  });
  it("in cantiere non si carica niente", async () => {
    const db = dbFinto({ ddt: { destinazione: "cantiere" } });
    expect((await caricaAlSalvataggio("d", db)).stato).toBe("niente");
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("il messaggio elenca le righe rimaste da confermare", () => {
    const m = messaggioCarico({ stato: "caricato", righe: 2, escluse: [{ riga_id: "x", descrizione: "Tubo", motivo: "manca l'unità di misura" }] }, "B-7");
    expect(m).toEqual({
      tipo: "avviso",
      titolo: "2 righe caricate in magazzino (bolla B-7); 1 da confermare dalla pagina della bolla",
      descrizione: "Tubo: manca l'unità di misura",
    });
  });
});
