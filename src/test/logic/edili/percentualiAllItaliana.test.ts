/**
 * Le percentuali del preventivo all'italiana (06/10/2026): virgola, fino a due decimali,
 * senza zeri inutili. L'anteprima a destra e il PDF dicono «Sconto 7,25%», non «7,3%»
 * accanto a un importo calcolato sul 7,25.
 */
import { describe, expect, it } from "vitest";
import * as calcoli from "@/lib/climatizzazione/calcoli";
import { anteprimaComputo } from "@/lib/preventivatore/anteprimaComputo";
import { numeroPercentuale, percentualeIt } from "@/lib/preventivi/percentuale";

describe("percentualeIt", () => {
  it.each([
    [22, "22%"], [10, "10%"], [0, "0%"], [4, "4%"],
    [7.5, "7,5%"], [13.5, "13,5%"], [7.25, "7,25%"], [0.333, "0,33%"], [9.9, "9,9%"], [12.5, "12,5%"],
    [100, "100%"],
  ])("%s → %s", (valore, atteso) => {
    expect(percentualeIt(valore)).toBe(atteso);
  });

  it("valori non validi valgono 0%, e lo zero negativo non porta il segno", () => {
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY, null, undefined, "abc", -0]) expect(percentualeIt(v)).toBe("0%");
    expect(numeroPercentuale("7.5")).toBe("7,5");
  });
});

describe("l'anteprima a destra scrive le percentuali come il PDF", () => {
  const voce = { id: "a", capitolo_nome: "Opere", descrizione: "Posa", unita_misura: "mq", quantita: 1, prezzo_unitario: 1000, sconto_pct: 12.5, costo_materiali: 0, costo_manodopera: 0 };
  it("sconto 7,25%, IVA 13,5%, sconto di riga 12,5%", () => {
    const a = anteprimaComputo([voce], { sconto_pct: 7.25, iva_pct: 13.5 }, calcoli, { ivaDefault: 22 });
    expect(a.totali.map((t) => t.etichetta)).toEqual(["Totale voci", "Sconto 7,25%", "Imponibile", "IVA 13,5%", "Totale"]);
    expect(a.gruppi[0].righe[0].dettaglio).toBe("sconto 12,5%");
  });
});
