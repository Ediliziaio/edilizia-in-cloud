/**
 * Editor della griglia L×H del listino (05/10/2026).
 *
 * Quattro difetti verificati sul codice:
 *  - editor, simulatore e preventivo leggevano la griglia sotto la STESSA
 *    chiave di cache con righe di forma diversa: chi arrivava primo la
 *    riempiva per tutti (l'editor salvava celle con id undefined, il
 *    preventivo leggeva costo 0);
 *  - il CSV senza colonna acquisto copiava la vendita nell'acquisto;
 *  - l'import AI partiva dall'acquisto anche nei prodotti a prezzo di vendita;
 *  - misure come 62,5 passavano e il database (colonne INTEGER) rifiutava
 *    il salvataggio; la vendita derivata si salvava con 4 decimali.
 */
import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import {
  leggiCsvGriglia,
  prezziCellaDaAcquisto,
  problemaMisuraGriglia,
} from "@/components/listino/FamilyGridEditor";
import { campoImportoGriglia } from "@/components/listino/GridBulkImportDialog";
import { calcolaPrezzoFamiglia } from "@/hooks/useFamilyPricing";
import type { FamilyWithAxes } from "@/types/articleFamily";

type Cella = { prezzo_vendita: number; prezzo_acquisto: number };
const celle = (voci: Record<string, Cella> = {}) => new Map<string, Cella>(Object.entries(voci));

describe("ogni lettura della griglia ha la sua chiave di cache", () => {
  const viste = ["editor", "anteprima", "preventivo"] as const;

  it("le tre chiavi sono diverse e iniziano tutte con grid(id)", () => {
    const chiavi = viste.map((v) => queryKeys.articleFamilies.gridView("fam-1", v));
    expect(new Set(chiavi.map((k) => JSON.stringify(k))).size).toBe(3);
    for (const k of chiavi) {
      expect(k.slice(0, 3)).toEqual([...queryKeys.articleFamilies.grid("fam-1")]);
      expect(k.slice(0, 1)).toEqual([...queryKeys.articleFamilies.all]);
    }
  });

  it("i dati del simulatore (senza id) non finiscono nella cache dell'editor", () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.articleFamilies.gridView("fam-1", "anteprima"), [
      { valore_x: 1000, valore_y: 1200, prezzo_vendita: 300, prezzo_acquisto: 200 },
    ]);
    expect(qc.getQueryData(queryKeys.articleFamilies.gridView("fam-1", "editor"))).toBeUndefined();
    expect(qc.getQueryData(queryKeys.articleFamilies.gridView("fam-1", "preventivo"))).toBeUndefined();
  });

  it("invalidare grid(id) dopo il salvataggio rinfresca tutte e tre, e solo di quel prodotto", async () => {
    const qc = new QueryClient();
    for (const v of viste) {
      qc.setQueryData(queryKeys.articleFamilies.gridView("fam-1", v), []);
      qc.setQueryData(queryKeys.articleFamilies.gridView("fam-2", v), []);
    }
    await qc.invalidateQueries({ queryKey: queryKeys.articleFamilies.grid("fam-1") });
    for (const v of viste) {
      expect(qc.getQueryState(queryKeys.articleFamilies.gridView("fam-1", v))?.isInvalidated).toBe(true);
      expect(qc.getQueryState(queryKeys.articleFamilies.gridView("fam-2", v))?.isInvalidated).toBe(false);
    }
  });

  it("anche l'invalidazione larga dopo ogni modifica al prodotto le prende", async () => {
    const qc = new QueryClient();
    for (const v of viste) qc.setQueryData(queryKeys.articleFamilies.gridView("fam-1", v), []);
    await qc.invalidateQueries({ queryKey: queryKeys.articleFamilies.all });
    for (const v of viste) {
      expect(qc.getQueryState(queryKeys.articleFamilies.gridView("fam-1", v))?.isInvalidated).toBe(true);
    }
  });
});

describe("CSV della griglia: l'acquisto che manca resta mancante", () => {
  it("prodotto a prezzo di vendita, file a 3 colonne: cella nuova con acquisto 0, non uguale alla vendita", () => {
    const esito = leggiCsvGriglia("L,H,prezzo_vendita\n1000,1200,350", "vendita", celle());
    expect(esito.importate).toBe(1);
    expect(esito.celle.get("1000_1200")).toEqual({ prezzo_vendita: 350, prezzo_acquisto: 0 });
  });

  it("…e una cella che c'era tiene il suo acquisto", () => {
    const esito = leggiCsvGriglia(
      "L,H,prezzo_vendita\n1000,1200,350",
      "vendita",
      celle({ "1000_1200": { prezzo_vendita: 300, prezzo_acquisto: 210 } }),
    );
    expect(esito.celle.get("1000_1200")).toEqual({ prezzo_vendita: 350, prezzo_acquisto: 210 });
  });

  it("colonna acquisto presente ma vuota in una riga: come se mancasse", () => {
    const esito = leggiCsvGriglia("L;H;vendita;acquisto\n1000;1200;350;\n1000;1400;380;250", "vendita", celle());
    expect(esito.celle.get("1000_1200")).toEqual({ prezzo_vendita: 350, prezzo_acquisto: 0 });
    expect(esito.celle.get("1000_1400")).toEqual({ prezzo_vendita: 380, prezzo_acquisto: 250 });
  });

  it("CSV di Excel italiano: punto e virgola e virgola decimale", () => {
    const esito = leggiCsvGriglia("L;H;vendita;acquisto\n1000;1200;1.350,50;980,25", "vendita", celle());
    expect(esito.celle.get("1000_1200")).toEqual({ prezzo_vendita: 1350.5, prezzo_acquisto: 980.25 });
  });

  it("prodotto con ricarico sul fornitore, file senza acquisto: non importa nulla (prima la vendita diventava listino)", () => {
    const esito = leggiCsvGriglia(
      "L,H,prezzo_vendita\n1000,1200,350\n1000,1400,380",
      "acquisto_markup",
      celle(),
    );
    expect(esito.importate).toBe(0);
    expect(esito.senzaAcquisto).toBe(2);
    expect(esito.celle.size).toBe(0);
  });

  it("prodotto con ricarico sul fornitore: entra l'acquisto, anche senza vendita nel file", () => {
    const esito = leggiCsvGriglia(
      "L,H,prezzo_vendita,prezzo_acquisto\n1000,1200,,200\n1000,1400,999,220",
      "acquisto_markup",
      celle(),
    );
    expect(esito.importate).toBe(2);
    expect(esito.celle.get("1000_1200")?.prezzo_acquisto).toBe(200);
    expect(esito.celle.get("1000_1400")?.prezzo_acquisto).toBe(220);
  });

  it("prodotto a prezzo di vendita: la riga senza vendita resta fuori", () => {
    const esito = leggiCsvGriglia("L,H,v,a\n1000,1200,,200", "vendita", celle());
    expect(esito.importate).toBe(0);
    expect(esito.scartate).toBe(1);
  });

  it("le misure del file finiscono negli assi, ordinate", () => {
    const esito = leggiCsvGriglia("L,H,v\n1200,1400,10\n800,1400,9\n1200,600,8", "vendita", celle());
    expect(esito.xs).toEqual([800, 1200]);
    expect(esito.ys).toEqual([600, 1400]);
  });

  it("file vuoto o solo intestazione", () => {
    expect(leggiCsvGriglia("", "vendita", celle()).vuoto).toBe(true);
    expect(leggiCsvGriglia("L,H,v,a\n", "vendita", celle()).vuoto).toBe(true);
  });
});

describe("misure in millimetri interi", () => {
  it("62,5 si rifiuta con un messaggio chiaro, 1200 va bene", () => {
    expect(problemaMisuraGriglia(62.5)).toMatch(/millimetri interi/);
    expect(problemaMisuraGriglia(62.5)).toContain("62,5");
    expect(problemaMisuraGriglia(1200)).toBeNull();
  });

  it("zero, negativi e testo non sono misure", () => {
    expect(problemaMisuraGriglia(0)).toMatch(/maggiore di zero/);
    expect(problemaMisuraGriglia(-500)).toMatch(/maggiore di zero/);
    expect(problemaMisuraGriglia(Number.NaN)).toMatch(/maggiore di zero/);
  });

  it("nel CSV la riga con una misura decimale si scarta e si dice quale", () => {
    const esito = leggiCsvGriglia("L;H;v;a\n62,5;1200;100;80\n1000;1.200;100;80\n1000;1200;100;80", "vendita", celle());
    expect(esito.importate).toBe(1);
    expect(esito.misureNonIntere).toEqual(["62,5", "1.200"]);
    expect(Array.from(esito.celle.keys())).toEqual(["1000_1200"]);
  });
});

describe("import da tabella o immagine: il campo che il prodotto usa", () => {
  it("prodotto a prezzo di vendita: si parte dalla vendita, l'acquisto resta una scelta", () => {
    expect(campoImportoGriglia("vendita")).toBe("prezzo_vendita");
    expect(campoImportoGriglia("vendita", "prezzo_acquisto")).toBe("prezzo_acquisto");
  });

  it("prodotto con ricarico sul fornitore: sempre l'acquisto, anche se arriva «vendita»", () => {
    expect(campoImportoGriglia("acquisto_markup")).toBe("prezzo_acquisto");
    expect(campoImportoGriglia("acquisto_markup", "prezzo_vendita")).toBe("prezzo_acquisto");
  });
});

describe("vendita derivata della cella: al centesimo, come nel preventivo", () => {
  const parametri = { scontoFornitore1: 0, scontoFornitore2: 0, markupTipo: "percentuale" as const, markupValore: 33.333 };

  it("100 € + 33,333% si salva 133,33, non 133,333", () => {
    expect(prezziCellaDaAcquisto(100, parametri).vendita).toBe(133.33);
  });

  it("con gli sconti fornitore: lordo 1000, −55% −3% → netto 436,50; +33% → 580,55", () => {
    const { netto, vendita } = prezziCellaDaAcquisto(1000, {
      scontoFornitore1: 55,
      scontoFornitore2: 3,
      markupTipo: "percentuale",
      markupValore: 33,
    });
    expect(netto).toBeCloseTo(436.5, 10);
    expect(vendita).toBe(580.55);
  });

  it("è lo stesso prezzo che il motore dei preventivi dà per quella cella", () => {
    const famiglia = {
      id: "fam-1",
      modalita_prezzo_base: "griglia",
      prezzo_base_mode: "acquisto_markup",
      prezzo_base_vendita: 0,
      prezzo_base_acquisto: 0,
      sconto_fornitore_1: 55,
      sconto_fornitore_2: 3,
      markup_tipo: "percentuale",
      markup_valore: 33.333,
      axes: [],
    } as unknown as FamilyWithAxes;
    const cache = prezziCellaDaAcquisto(1000, {
      scontoFornitore1: 55,
      scontoFornitore2: 3,
      markupTipo: "percentuale",
      markupValore: 33.333,
    }).vendita;
    const r = calcolaPrezzoFamiglia(
      { family: famiglia, selections: {}, larghezza_mm: 1000, altezza_mm: 1200, quantita: 1 },
      [{ valore_x: 1000, valore_y: 1200, prezzo_vendita: cache, prezzo_acquisto_netto: 1000 }],
    );
    expect(r.unit_price_vendita).toBe(cache);
  });
});
