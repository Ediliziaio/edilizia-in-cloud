import { describe, expect, it } from "vitest";
import {
  calcolaTotaliCE,
  costruisciBudget,
  etichettaMesiChiusi,
  mesiChiusi,
  semaforoScostamento,
} from "@/lib/controlloGestione/budgetCE";
import { formatEuroRiquadro, formatImportiNelTesto, formatPct, leggiImporto } from "@/lib/controlloGestione/formatCG";
import type { VoceCE } from "@/hooks/controlloGestione/useCEriclassificato";

// CE Demo 2, anno 2026 (cg_get_ce_safe 1→12 al 22/10/2026): le voci.
const VOCI_DEMO2: Record<string, number> = {
  "01": 4655616.76, "02": 0, "03": 2048830.51, "04": 0, "05": 991200.65,
  "06": 948458.17, "07": 42300, "08": 39652, "08b": 54380, "09": 70539.8,
  "10": 7350, "11": 2400, "12": 0, "13": 0, "14": 0, "15": 163061.19,
};

describe("Totali del CE ricalcolati dalle voci", () => {
  it("rifà la cascata del database (EBITDA 530.795,43, utile 287.444,44)", () => {
    const t = calcolaTotaliCE(VOCI_DEMO2);
    expect(t.A).toBeCloseTo(4655616.76, 2);
    expect(t.D).toBeCloseTo(1615585.6, 2);
    expect(t.E).toBeCloseTo(530795.43, 2);
    expect(t.F).toBeCloseTo(460255.63, 2);
    expect(t.I).toBeCloseTo(450505.63, 2);
    expect(t.L).toBeCloseTo(287444.44, 2);
  });
});

describe("Budget contro consuntivo", () => {
  const ceVoci: VoceCE[] = Object.entries(VOCI_DEMO2).map(([codice, valore]) => ({
    codice, label: codice, tipo: "voce", valore,
  }));

  it("la previsione è il consuntivo dei mesi chiusi riportato a 12 mesi", () => {
    const r = costruisciBudget({ "01": 6_000_000 }, ceVoci, 9);
    const ricavi = r.righe.find((x) => x.codice === "01")!;
    expect(ricavi.consuntivo).toBeCloseTo(4655616.76, 2);
    expect(ricavi.previsione).toBeCloseTo(4655616.76 / 9 * 12, 2);
  });

  it("i totali hanno anche il budget, calcolato dalle voci", () => {
    const r = costruisciBudget({ "01": 1000, "03": 400, "06": 300, "15": 50 }, ceVoci, 12);
    const ebitda = r.righe.find((x) => x.codice === "E")!;
    const utile = r.righe.find((x) => x.codice === "L")!;
    expect(ebitda.budget).toBe(300);
    expect(utile.budget).toBe(250);
    expect(ebitda.consuntivo).toBeCloseTo(530795.43, 2);
    expect(r.utile.budget).toBe(250);
  });

  it("i riquadri non sommano ricavi e costi insieme", () => {
    const r = costruisciBudget({ "01": 850000, "03": 280000, "05": 95000 }, ceVoci, 12);
    expect(r.ricavi.budget).toBe(850000);
    expect(r.costi.budget).toBe(375000);
    expect(r.ricavi.previsione).toBeCloseTo(4655616.76, 2);
  });

  it("senza budget: nessun confronto e haBudget falso", () => {
    const r = costruisciBudget({}, ceVoci, 9);
    expect(r.haBudget).toBe(false);
    expect(r.righe.every((x) => x.scostamentoPct === null)).toBe(true);
  });

  it("un costo sopra budget è rosso, un ricavo sopra budget è verde", () => {
    expect(semaforoScostamento("03", 100, 130)).toBe("rosso");
    expect(semaforoScostamento("08", 100, 110)).toBe("giallo");
    expect(semaforoScostamento("01", 100, 130)).toBe("verde");
    expect(semaforoScostamento("E", 100, 80)).toBe("rosso");
    expect(semaforoScostamento("01", 0, 80)).toBe("grigio");
  });

  it("mesi chiusi: al 22 ottobre sono 9 (gen–set), non 10", () => {
    const oggi = new Date(2026, 9, 22);
    expect(mesiChiusi(2026, oggi)).toBe(9);
    expect(mesiChiusi(2025, oggi)).toBe(12);
    expect(mesiChiusi(2027, oggi)).toBe(0);
    expect(etichettaMesiChiusi(9)).toBe("gen–set");
  });
});

describe("Formati all'italiana", () => {
  it("percentuali con la virgola", () => {
    expect(formatPct(11.4)).toBe("11,4%");
    expect(formatPct(557.26, 1, true)).toBe("+557,3%");
    expect(formatPct(null)).toBe("—");
  });

  it("importi dei riquadri compatti, senza troncature", () => {
    expect(formatEuroRiquadro(4655616.76)).toBe("4,66 Mln €");
    expect(formatEuroRiquadro(530795.43)).toBe("530.795 €");
    expect(formatEuroRiquadro(-6611.8)).toBe("-6.612 €");
  });

  it("riscrive gli importi nei testi del database", () => {
    expect(formatImportiNelTesto("Stato patrimoniale non riconciliato: differenza 1346331.55 €"))
      .toBe("Stato patrimoniale non riconciliato: differenza 1.346.331,55 €");
    expect(formatImportiNelTesto("già 1.000,00 € e data 2026-10-22")).toBe("già 1.000,00 € e data 2026-10-22");
  });

  it("legge gli importi scritti a mano", () => {
    expect(leggiImporto("120.000")).toBe(120000);
    expect(leggiImporto("12.500,50")).toBe(12500.5);
    expect(leggiImporto("12500.5")).toBe(12500.5);
    expect(leggiImporto("")).toBe(0);
    expect(leggiImporto("abc")).toBeNull();
  });
});
