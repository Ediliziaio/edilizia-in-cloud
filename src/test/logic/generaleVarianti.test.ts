import { describe, expect, it } from "vitest";
import type { ElencoUnita, UnitaGenerale } from "@/lib/orders/generali/unita";
import { prezzoConVarianti } from "@/lib/orders/generali/unita";
import { contiUnita, pagamentiUnita, riepilogoVendite } from "@/lib/orders/generali/unitaConti";
import { calcolaPianoEconomico, conVariantiAcquirenti, confrontoVoci, type VocePiano } from "@/lib/orders/generali/pianoConti";
import {
  conVarianti, leggiVarianti, ricavoVariantiPerUnita, scadenzaScelte, statoVariante, totaliVarianti, variantiPerPiano, variantiPerUnita,
} from "@/lib/orders/generali/varianti";

/** Varianti chieste dall'acquirente di un'unità (05/11/2028): ordini_variazione sulla commessa dell'unità. */
const risposta = {
  permessi: { importi: true, costi: true, modifica: true },
  varianti: [
    { id: "v1", order_id: "o-A1", numero: 1, titolo: "Parquet", stato: "approvato", importo: "8000.00", costo_previsto: "5000,00", scadenza_scelte: null as string | null, firmata_il: "2026-10-10T00:00:00+00:00", canale: "offline", documento: true },
    { id: "v2", order_id: "o-A1", numero: 2, titolo: "Doccia", stato: "in_attesa", importo: 3000, costo_previsto: null, scadenza_scelte: "2026-11-03", documento: true },
    { id: "v3", order_id: "o-A1", numero: 3, titolo: "Camino", stato: "rifiutato", importo: 6000, costo_previsto: "4000" },
    { id: "v4", order_id: "o-A2", numero: 1, titolo: "Riduzione", stato: "approvato", importo: -1500, costo_previsto: "costo?" },
    { id: "v5", order_id: "o-A2", numero: 2, titolo: "Bozza", stato: "bozza", importo: 2000, scadenza_scelte: "2026-10-20" },
    { titolo: "senza id" },
  ],
};

const unita = (over: Partial<UnitaGenerale>): UnitaGenerale => ({
  orderId: `o-${over.sigla}`, codice: null, nome: over.sigla ?? "", scheda: true, id: `u-${over.sigla}`, sigla: "A1",
  edificio: null, piano: null, tipologia: null, mq: 100, millesimi: null, listino: null, trattato: null, rogito: null,
  provvigione: null, stato: "libera", dataPrenotazione: null, dataCompromesso: null, rogitoPrevisto: null, dataRogito: null,
  acquirenteId: null, acquirente: null, agenzia: null, note: null, origineId: null, divisaIl: null, movimenti: [],
  importoCommessa: null, costoDiretto: 0, ...over,
});

const elenco = (): ElencoUnita => ({
  modello: "sviluppo",
  costiGenerale: 20000,
  permessi: { importi: true, costi: true, margini: true, modifica: true },
  unita: [
    unita({ sigla: "A1", stato: "compromesso", trattato: 300000, costoDiretto: 100000, movimenti: [{ id: "m", tipo: "caparra", importo: 30000, data: "2026-09-01", descrizione: null }] }),
    unita({ sigla: "A2", stato: "rogitata", rogito: 200000, costoDiretto: 80000 }),
  ],
});

describe("lettura e parole dell'acquirente", () => {
  it("bozza e in attesa sono proposte, approvato è accettata", () => {
    expect(statoVariante("bozza")).toBe("proposta");
    expect(statoVariante("in_attesa")).toBe("proposta");
    expect(statoVariante("approvato")).toBe("accettata");
    expect(statoVariante("rifiutato")).toBe("rifiutata");
    expect(statoVariante("annullato")).toBe("annullata");
  });

  it("legge importi e il costo scritto nella bozza all'italiana; scarta un costo illeggibile", () => {
    const d = leggiVarianti(risposta);
    expect(d.varianti).toHaveLength(5);
    expect(d.varianti[0]).toMatchObject({ stato: "accettata", importo: 8000, costoPrevisto: 5000, canale: "offline", documento: true });
    expect(d.varianti[3].costoPrevisto).toBeNull();
    expect(d.varianti[4].inBozza).toBe(true);
  });

  it("totali per unità, senza importi chi non li vede", () => {
    const d = leggiVarianti(risposta);
    const perUnita = variantiPerUnita(d.varianti);
    expect(totaliVarianti(perUnita.get("o-A1")!, d.permessi)).toEqual({
      accettate: 8000, costoAccettate: 5000, proposte: 3000, numeroAccettate: 1, numeroProposte: 1,
    });
    expect(totaliVarianti(d.varianti, { importi: false, costi: false })).toMatchObject({ accettate: null, costoAccettate: null });
    expect([...ricavoVariantiPerUnita(d)]).toEqual([["o-A1", 8000], ["o-A2", -1500]]);
    expect(ricavoVariantiPerUnita({ ...d, permessi: { ...d.permessi, importi: false } }).size).toBe(0);
  });

  it("avvisa delle scelte in scadenza solo sulle proposte", () => {
    const d = leggiVarianti(risposta);
    expect(scadenzaScelte(d.varianti[1], "2026-10-30")).toBe("vicina");
    expect(scadenzaScelte(d.varianti[1], "2026-10-20")).toBeNull();
    expect(scadenzaScelte(d.varianti[4], "2026-10-30")).toBe("scaduta");
    expect(scadenzaScelte({ stato: "accettata", scadenzaScelte: "2026-10-01" }, "2026-10-30")).toBeNull();
  });
});

describe("le accettate entrano nel prezzo e nel margine dell'unità", () => {
  const e = conVarianti(elenco(), leggiVarianti(risposta));
  const [a1, a2] = e.unita;

  it("prezzo con varianti e residuo da incassare", () => {
    expect(prezzoConVarianti(a1)).toBe(308000);
    expect(prezzoConVarianti(a2)).toBe(198500);
    expect(pagamentiUnita(a1).residuo).toBe(278000);
  });

  it("margine e venduto", () => {
    const c = contiUnita(e);
    // Costi comuni 20.000 per m² (100 e 100): 10.000 a testa.
    expect(c.perUnita.get("o-A1")).toMatchObject({ prezzo: 308000, varianti: 8000, margine: 308000 - 100000 - 10000 });
    expect(c.perUnita.get("o-A2")).toMatchObject({ prezzo: 198500, varianti: -1500, margine: 198500 - 80000 - 10000 });
    expect(riepilogoVendite(e).venduto).toBe(506500);
  });

  it("senza varianti lette tutto resta com'era", () => {
    const senza = conVarianti(elenco(), null);
    expect(senza.varianti).toBeNull();
    expect(contiUnita(senza).perUnita.get("o-A1")?.prezzo).toBe(300000);
  });
});

describe("le accettate entrano nel piano economico", () => {
  const voce: VocePiano = {
    id: "ric", tipo: "ricavo", categoria: "vendite", descrizione: "Vendite", importo: 500000, mese: "2027-06", durataMesi: 1,
    figliaId: null, categorieCosto: [], aFinire: null, nota: null, ordine: 1, origineId: null,
  };

  it("ricavo e costo previsto a finire, nella stima e nel margine; non nel previsto", () => {
    const base = confrontoVoci([voce], []);
    const c = conVariantiAcquirenti(base, { ricavo: 6500, costo: 5000 });
    expect(c.ricavi.map((r) => r.etichetta)).toEqual(["Vendite", "Varianti accettate dagli acquirenti"]);
    expect(c.totali.ricavi).toMatchObject({ previsto: 500000, stima: 506500, scostamento: 6500 });
    expect(c.totali.costi).toMatchObject({ previsto: 0, stima: 5000 });
    expect(c.totali.margine).toMatchObject({ previsto: 500000, stima: 501500 });
    expect(conVariantiAcquirenti(base, null)).toBe(base);
  });

  it("non diventano un avviso di reale fuori piano", () => {
    const p = calcolaPianoEconomico({
      oggi: "2026-10-30", generaleId: "G", voci: [voce], righe: [], incassi: [], figlie: [],
      varianti: variantiPerPiano(leggiVarianti(risposta)),
    });
    expect(p.confronto.totali.ricavi.stima).toBe(506500);
    expect(p.avvisi.some((a) => a.includes("non ha una voce"))).toBe(false);
  });

  it("niente righe senza accettate o senza importi", () => {
    expect(variantiPerPiano(leggiVarianti({ permessi: { importi: true }, varianti: [] }))).toBeNull();
    expect(variantiPerPiano({ ...leggiVarianti(risposta), permessi: { importi: false, costi: false, modifica: false } })).toBeNull();
  });
});
