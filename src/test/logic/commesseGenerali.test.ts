import { describe, expect, it } from "vitest";
import {
  avvisiGenerale,
  leggiRiepilogo,
  modelliValidi,
  quota,
  totaliGenerale,
  type FigliaGenerale,
  type RiepilogoGenerale,
} from "@/lib/orders/commesseGenerali";

/**
 * Commesse generali (30/10/2026): una commessa che raccoglie altre commesse.
 * I numeri in alto si ricavano dalle figlie che arrivano da `commessa_generale_riepilogo`:
 * un totale non si mostra se chi guarda non può vedere anche una sola delle sue parti.
 */

const figlia = (parziale: Partial<FigliaGenerale>): FigliaGenerale => ({
  id: "f", codice: null, nome: "Lavoro", stato: null, statoNome: null, statoColore: null,
  indirizzo: null, inizio: null, fine: null, avanzamento: 0,
  importo: 0, eseguito: 0, fatturato: 0, incassato: 0, costo: null, margine: null,
  ...parziale,
});

const tuttiIPermessi = { importi: true, costi: true, margini: true };

const appalto = (figlie: FigliaGenerale[], valore: number | null = 2_970_000, permessi = tuttiIPermessi): RiepilogoGenerale => ({
  generale: { id: "g", codice: "C-014", nome: "Appalto scuole", cliente: "Comune", clienteId: "c", modello: "appalto", creataIl: null, valore },
  figlie,
  permessi,
});

describe("i numeri della commessa generale", () => {
  const r = appalto([
    figlia({ id: "a", importo: 1_500_000, avanzamento: 60, eseguito: 900_000, fatturato: 800_000, incassato: 600_000, costo: 700_000, margine: 100_000 }),
    figlia({ id: "b", importo: 900_000, avanzamento: 40, eseguito: 360_000, fatturato: 394_000, incassato: 300_000, costo: 420_000, margine: -60_000 }),
  ]);
  const t = totaliGenerale(r);

  it("il contratto scala: assegnato, da assegnare, eseguito, fatturato, incassato", () => {
    expect(t.assegnato).toBe(2_400_000);
    expect(t.daAssegnare).toBe(570_000);
    expect(t.eseguito).toBe(1_260_000);
    expect(t.fatturato).toBe(1_194_000);
    expect(t.incassato).toBe(900_000);
    expect(t.daIncassare).toBe(294_000);
    expect(t.base).toBe(2_970_000);
  });

  it("costi e margini sono la somma delle commesse dentro", () => {
    expect(t.costo).toBe(1_120_000);
    expect(t.margine).toBe(40_000);
  });

  it("l'avanzamento è pesato sugli importi, non una media semplice", () => {
    // (60 × 1,5 M + 40 × 0,9 M) / 2,4 M = 52,5 — la media semplice direbbe 50.
    expect(t.avanzamento).toBe(52.5);
  });

  it("senza importi l'avanzamento è la media semplice", () => {
    const senza = totaliGenerale(appalto([figlia({ importo: 0, avanzamento: 20 }), figlia({ importo: 0, avanzamento: 80 })]));
    expect(senza.avanzamento).toBe(50);
  });

  it("senza valore non c'è «da assegnare» e la base delle barre è l'assegnato", () => {
    const senzaValore = totaliGenerale(appalto(r.figlie, null));
    expect(senzaValore.daAssegnare).toBeNull();
    expect(senzaValore.base).toBe(2_400_000);
  });

  it("figlie oltre il valore: da assegnare negativo e un avviso", () => {
    const oltre = appalto(r.figlie, 2_000_000);
    const to = totaliGenerale(oltre);
    expect(to.daAssegnare).toBe(-400_000);
    expect(avvisiGenerale(oltre, to).map((a) => a.id)).toContain("oltre");
  });

  it("una commessa in perdita compare tra le cose da guardare", () => {
    expect(avvisiGenerale(r, t)).toEqual(expect.arrayContaining([expect.objectContaining({ id: "perdita", tono: "attenzione" })]));
  });

  it("le fatture fatte sul contratto (SAL di contratto) si sommano a quelle delle figlie", () => {
    const conContratto = totaliGenerale({ ...r, fattureGenerale: { fatturato: 100_000, incassato: 40_000 } });
    expect(conContratto.fatturato).toBe(1_294_000);
    expect(conContratto.incassato).toBe(940_000);
    expect(conContratto.daIncassare).toBe(354_000);
  });

  it("un'unità divisa non è «in perdita»: vale zero e i costi passano alle parti", () => {
    const divisa = appalto([figlia({ id: "x", codice: "A1", importo: 0, margine: -20_000, divisa: true })]);
    expect(avvisiGenerale(divisa, totaliGenerale(divisa)).map((a) => a.id)).not.toContain("perdita");
  });

  it("generale vuota: il prossimo passo è aggiungere la prima commessa, non uno zero", () => {
    const vuota = appalto([]);
    const avvisi = avvisiGenerale(vuota, totaliGenerale(vuota));
    expect(avvisi[0]).toMatchObject({ id: "vuota", tono: "info" });
    expect(avvisi[0].testo).toContain("ordine di lavoro");
  });
});

describe("chi non ha i permessi non vede i totali", () => {
  it("senza importi: nessun importo, nessun residuo, nessuna base", () => {
    const r = appalto([figlia({ importo: null, eseguito: null, fatturato: null, incassato: null, avanzamento: 30 })], null, { importi: false, costi: false, margini: false });
    const t = totaliGenerale(r);
    expect([t.assegnato, t.daAssegnare, t.eseguito, t.fatturato, t.incassato, t.daIncassare, t.base]).toEqual([null, null, null, null, null, null, null]);
    expect(t.costo).toBeNull();
    expect(t.margine).toBeNull();
    expect(t.avanzamento).toBe(30);
  });
});

describe("lettura della risposta del database", () => {
  it("numeri come testo, modello sconosciuto, avanzamento fuori scala", () => {
    const r = leggiRiepilogo({
      generale: { id: "g", nome: "Residenza", modello: "boh", valore: "3200000.00" },
      figlie: [{ id: "a", nome: "A1", avanzamento: 140, importo: "450000.50", margine: null, divisa: true, acconti: "30000" }, { nome: "senza id" }],
      fatture_generale: { fatturato: "1000", incassato: 400 },
      permessi: { importi: true },
    });
    expect(r?.figlie[0]).toMatchObject({ divisa: true, acconti: 30_000 });
    expect(r?.fattureGenerale).toEqual({ fatturato: 1_000, incassato: 400 });
    expect(r?.generale.modello).toBe("appalto");
    expect(r?.generale.valore).toBe(3_200_000);
    expect(r?.figlie).toHaveLength(1);
    expect(r?.figlie[0]).toMatchObject({ avanzamento: 100, importo: 450_000.5, margine: null });
    expect(r?.permessi).toEqual({ importi: true, costi: false, margini: false });
  });

  it("risposta vuota o senza generale: null", () => {
    expect(leggiRiepilogo(null)).toBeNull();
    expect(leggiRiepilogo({ figlie: [] })).toBeNull();
  });
});

describe("impostazioni e percentuali", () => {
  it("modelli accesi: nell'ordine di lettura, senza doppioni né valori sconosciuti", () => {
    expect(modelliValidi(["compravendita", "appalto", "appalto", "x"])).toEqual(["appalto", "compravendita"]);
    expect(modelliValidi(null)).toEqual([]);
  });

  it("quota tra 0 e 100, null senza base", () => {
    expect(quota(50, 200)).toBe(25);
    expect(quota(300, 200)).toBe(100);
    expect(quota(10, 0)).toBeNull();
    expect(quota(null, 100)).toBeNull();
  });
});
