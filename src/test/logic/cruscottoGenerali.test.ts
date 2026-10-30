/**
 * Le commesse generali nel cruscotto (cruscottoGenerali.ts): la risposta di
 * cruscotto_commesse_generali diventa il portafoglio contratti e le operazioni
 * immobiliari, con gli stessi conti della pagina della generale.
 */
import { describe, expect, it } from "vitest";
import { leggiCruscottoGenerali, leggiPianoInBreve } from "@/lib/orders/generali/cruscottoGenerali";

const permessi = { importi: true, costi: true, margini: true };

const figlia = (id: string, importo: number | null, avanzamento: number, extra: Record<string, unknown> = {}) => ({
  id, codice: id.toUpperCase(), nome: `Commessa ${id}`, avanzamento,
  importo, eseguito: importo === null ? null : (importo * avanzamento) / 100,
  fatturato: importo === null ? null : 0, incassato: importo === null ? null : 0, costo: 0, margine: importo, ...extra,
});

const appalto = {
  id: "g-app", codice: "O-0026", modello: "appalto", in_corso: true,
  riepilogo: {
    generale: { id: "g-app", codice: "O-0026", nome: "Appalto scuole", cliente: "Comune" as string | null, modello: "appalto", valore: 1_000_000 },
    figlie: [
      figlia("a", 300_000, 50, { fatturato: 120_000, incassato: 100_000 }),
      figlia("b", 200_000, 10),
    ],
    fatture_generale: { fatturato: 30_000, incassato: 0 },
    permessi,
  },
  unita: null as unknown,
  piano: {
    versione_numero: 1, versione_stato: "approvata", ricavi_previsti: 1_000_000, costi_previsti: 800_000,
    ricavi_reali: 0, costi_reali: 100_000, ricavi_stima: 1_000_000, costi_stima: 820_000,
    capitale_massimo_previsto: 50_000, capitale_investito: 70_000,
  },
  errore: null as string | null,
};

const unita = (orderId: string, u: Record<string, unknown> | null) => ({ order_id: orderId, codice: orderId, nome: orderId, importo: 0, costo: 0, unita: u });

const sviluppo = {
  id: "g-svi", codice: "O-0031", modello: "sviluppo", in_corso: true,
  riepilogo: {
    generale: { id: "g-svi", codice: "O-0031", nome: "Residenza Via Roma", cliente: null as string | null, modello: "sviluppo", valore: 600_000 },
    figlie: [figlia("u1", 290_000, 0), figlia("u2", 280_000, 0)],
    permessi,
  },
  unita: {
    modello: "sviluppo",
    permessi: { ...permessi, modifica: true },
    figlie: [
      unita("u1", { id: "x1", sigla: "A1", stato: "compromesso", prezzo_listino: 300_000, prezzo_trattato: 290_000,
        movimenti: [{ id: "m1", tipo: "caparra", importo: 30_000, data: "2026-10-01" }] }),
      unita("u2", { id: "x2", sigla: "A2", stato: "libera", prezzo_listino: 280_000, movimenti: [] }),
      // un'unità divisa non conta più: si vendono le parti
      unita("u3", { id: "x3", sigla: "A3", stato: "libera", prezzo_listino: 100_000, divisa_il: "2026-09-01", movimenti: [] }),
    ],
  },
  piano: null as unknown,
  errore: null as string | null,
};

describe("leggiCruscottoGenerali", () => {
  it("il portafoglio contratti usa i conti della pagina della generale", () => {
    const c = leggiCruscottoGenerali({ attiva: true, permessi, generali: [appalto, sviluppo] })!;
    expect(c.attiva).toBe(true);
    expect(c.appalti).toHaveLength(1);
    const a = c.appalti[0];
    expect(a.valore).toBe(1_000_000);
    expect(a.eseguito).toBe(170_000);
    expect(a.daEseguire).toBe(830_000);
    // le fatture sulla generale stessa si sommano a quelle degli ordini
    expect(a.fatturato).toBe(150_000);
    expect(a.daIncassare).toBe(50_000);
    expect(a.margineAFinire).toBe(180_000);
    expect(a.avanzamento).toBe(34);
    expect(c.totaleAppalti).toMatchObject({ appalti: 1, valore: 1_000_000, daEseguire: 830_000, margineAFinire: 180_000, conPiano: 1 });
  });

  it("le operazioni immobiliari contano le unità vive, il venduto e l'incassato", () => {
    const c = leggiCruscottoGenerali({ attiva: true, permessi, generali: [appalto, sviluppo] })!;
    expect(c.operazioni).toHaveLength(1);
    expect(c.operazioni[0]).toMatchObject({
      id: "g-svi", modello: "sviluppo", unita: 2, vendute: 1, libere: 1,
      venduto: 290_000, incassato: 30_000, capitaleImpegnato: null, margineAFinire: null, piano: false,
    });
    expect(c.totaleOperazioni).toMatchObject({ operazioni: 1, unita: 2, vendute: 1, venduto: 290_000, margineAFinire: null, conPiano: 0 });
  });

  it("solo le generali in corso; quelle che non si leggono si contano a parte", () => {
    const c = leggiCruscottoGenerali({
      attiva: true, permessi,
      generali: [{ ...appalto, in_corso: false }, { ...sviluppo, riepilogo: null, errore: "permesso negato" }],
    })!;
    expect(c.appalti).toHaveLength(0);
    expect(c.operazioni).toHaveLength(0);
    expect(c.nonLette).toBe(1);
  });

  it("senza il permesso degli importi i totali restano vuoti, non a zero", () => {
    const senza = { importi: false, costi: false, margini: false };
    const r = {
      ...appalto.riepilogo,
      generale: { ...appalto.riepilogo.generale, valore: null as number | null },
      figlie: [figlia("a", null, 50), figlia("b", null, 10)],
      fatture_generale: null as unknown,
      permessi: senza,
    };
    const c = leggiCruscottoGenerali({ attiva: true, permessi: senza, generali: [{ ...appalto, riepilogo: r, piano: null }] })!;
    expect(c.permessi.margini).toBe(false);
    expect(c.appalti[0]).toMatchObject({ valore: null, eseguito: null, daEseguire: null, fatturato: null, margineAFinire: null });
    expect(c.totaleAppalti.valore).toBeNull();
  });

  it("una risposta senza forma non rompe il cruscotto", () => {
    expect(leggiCruscottoGenerali(null)).toBeNull();
    expect(leggiCruscottoGenerali({ generali: "no" })).toBeNull();
    expect(leggiCruscottoGenerali({ generali: [] })).toMatchObject({ attiva: false, appalti: [], operazioni: [] });
  });
});

describe("leggiPianoInBreve", () => {
  it("margine a finire = ricavi meno costi della stima finale", () => {
    expect(leggiPianoInBreve(appalto.piano)).toMatchObject({ margineAFinire: 180_000, capitaleImpegnato: 70_000, versione: 1, stato: "approvata" });
  });
  it("niente piano, niente numeri", () => {
    expect(leggiPianoInBreve(null)).toBeNull();
    expect(leggiPianoInBreve({})).toBeNull();
  });
});
