import { describe, it, expect } from "vitest";
import {
  parsePrezzarioRegionale,
  parsePercentToFraction,
  deriveCapitoloCodice,
  summarizePrezzario,
} from "./import";
import { pickAdapter, GENERIC_PRESET } from "./adapters";

describe("parsePrezzarioRegionale — gerarchia dedotta dal codice voce", () => {
  // Matrice tipo prezzario regionale: header IT, codici gerarchici, numeri IT,
  // incidenza manodopera in formati misti, + 1 riga invalida (prezzo non valido).
  const matrix: string[][] = [
    ["Codice", "Descrizione", "UM", "Prezzo unitario", "Incidenza manodopera"],
    ["01", "OPERE EDILI", "", "", ""], // header di capitolo (no prezzo) → riga "invalida" ma inclusa
    ["01.A.001", "Scavo di sbancamento a sezione ampia", "mc", "8,50", "35%"],
    ["01.A.002", "Rinterro con materiale di risulta", "mc", "1.234,56", "0,40"],
    ["02.B.010", "Muratura in mattoni pieni", "mq", "85,00", "50"],
    ["02.B.011", "Intonaco civile su pareti", "mq", "n.d.", "30%"], // prezzo invalido
  ];

  const res = parsePrezzarioRegionale(matrix, { regione: "Toscana" });

  it("non produce errori globali (colonne riconosciute)", () => {
    expect(res.globalErrors).toEqual([]);
    expect(res.detectedColumns.codice).toBe(0);
    expect(res.detectedColumns.descrizione).toBe(1);
    expect(res.detectedColumns.unita_misura).toBe(2);
    expect(res.detectedColumns.prezzo).toBe(3);
    expect(res.detectedColumns.incidenza_manodopera).toBe(4);
  });

  it("deduce i capitoli gerarchici dai prefissi dei codici", () => {
    const byCodice = Object.fromEntries(res.capitoli.map((c) => [c.codice, c]));
    // capitoli attesi: 01, 01.A, 02, 02.B
    expect(Object.keys(byCodice).sort()).toEqual(["01", "01.A", "02", "02.B"]);

    // livelli e parent
    expect(byCodice["01"].livello).toBe(0);
    expect(byCodice["01"].parentCodice).toBeNull();
    expect(byCodice["01.A"].livello).toBe(1);
    expect(byCodice["01.A"].parentCodice).toBe("01");
    expect(byCodice["02"].livello).toBe(0);
    expect(byCodice["02.B"].parentCodice).toBe("02");

    // ordine contiguo 0..n
    const ordini = res.capitoli.map((c) => c.ordine).sort((a, b) => a - b);
    expect(ordini).toEqual([0, 1, 2, 3]);
  });

  it("usa il titolo della riga-capitolo quando il codice combacia (01 → OPERE EDILI)", () => {
    const cap01 = res.capitoli.find((c) => c.codice === "01");
    expect(cap01?.titolo).toBe("OPERE EDILI");
  });

  it("assegna a ogni voce il capitoloCodice giusto", () => {
    const byCodice = Object.fromEntries(res.voci.map((v) => [v.codice, v]));
    expect(byCodice["01.A.001"].capitoloCodice).toBe("01.A");
    expect(byCodice["01.A.002"].capitoloCodice).toBe("01.A");
    expect(byCodice["02.B.010"].capitoloCodice).toBe("02.B");
    expect(byCodice["02.B.011"].capitoloCodice).toBe("02.B");
  });

  it("parsa i prezzi all'italiana e l'unità di misura", () => {
    const byCodice = Object.fromEntries(res.voci.map((v) => [v.codice, v]));
    expect(byCodice["01.A.001"].prezzo).toBe(8.5);
    expect(byCodice["01.A.002"].prezzo).toBeCloseTo(1234.56, 2);
    expect(byCodice["02.B.010"].prezzo).toBe(85);
    expect(byCodice["01.A.001"].unita_misura).toBe("mc");
    expect(byCodice["02.B.010"].unita_misura).toBe("mq");
  });

  it("normalizza l'incidenza manodopera a frazione 0..1 (35%, 0,40, 50)", () => {
    const byCodice = Object.fromEntries(res.voci.map((v) => [v.codice, v]));
    expect(byCodice["01.A.001"].incidenza_manodopera_pct).toBeCloseTo(0.35, 5);
    expect(byCodice["01.A.002"].incidenza_manodopera_pct).toBeCloseTo(0.4, 5);
    expect(byCodice["02.B.010"].incidenza_manodopera_pct).toBeCloseTo(0.5, 5);
  });

  it("marca la riga col prezzo invalido con errors (ma la include)", () => {
    const invalida = res.voci.find((v) => v.codice === "02.B.011");
    expect(invalida).toBeDefined();
    expect(invalida!.errors.length).toBeGreaterThan(0);
    expect(invalida!.errors[0]).toMatch(/prezzo/i);
    expect(invalida!.prezzo).toBe(0);
    // l'incidenza resta parsata anche se il prezzo è invalido
    expect(invalida!.incidenza_manodopera_pct).toBeCloseTo(0.3, 5);
  });

  it("la riga-capitolo senza prezzo è inclusa come voce con errors", () => {
    const cap = res.voci.find((v) => v.codice === "01");
    expect(cap).toBeDefined();
    expect(cap!.errors.length).toBeGreaterThan(0);
  });

  it("summarizePrezzario conta valide/errori coerentemente", () => {
    const stats = summarizePrezzario(res.voci);
    expect(stats.total).toBe(5);
    // valide: 01.A.001, 01.A.002, 02.B.010 = 3 ; con errori: 01 e 02.B.011 = 2
    expect(stats.valid).toBe(3);
    expect(stats.withErrors).toBe(2);
  });
});

describe("parsePrezzarioRegionale — colonna capitolo esplicita", () => {
  const matrix: string[][] = [
    ["Cod", "Descrizione", "Capitolo", "Prezzo"],
    ["A1", "Tinteggiatura pareti interne", "Finiture", "12,00"],
    ["A2", "Tinteggiatura soffitti", "Finiture", "14,00"],
    ["B1", "Posa pavimento gres", "Pavimenti", "30,00"],
  ];
  const res = parsePrezzarioRegionale(matrix);

  it("raggruppa per titolo capitolo, deduplicando", () => {
    expect(res.capitoli.map((c) => c.titolo).sort()).toEqual(["Finiture", "Pavimenti"]);
    // due voci "Finiture" → stesso capitoloCodice
    const finit = res.voci.filter((v) => ["A1", "A2"].includes(v.codice ?? ""));
    expect(finit[0].capitoloCodice).toBe(finit[1].capitoloCodice);
    // voce "Pavimenti" → capitolo diverso
    const pav = res.voci.find((v) => v.codice === "B1");
    expect(pav!.capitoloCodice).not.toBe(finit[0].capitoloCodice);
  });
});

describe("parsePrezzarioRegionale — errori globali", () => {
  it("file vuoto", () => {
    const res = parsePrezzarioRegionale([]);
    expect(res.globalErrors).toContain("Il file è vuoto.");
    expect(res.voci).toEqual([]);
  });

  it("colonna prezzo mancante → globalError + nessuna voce", () => {
    const res = parsePrezzarioRegionale([
      ["Codice", "Descrizione"],
      ["01.A.001", "Scavo"],
    ]);
    expect(res.globalErrors.some((e) => /prezzo/i.test(e))).toBe(true);
    expect(res.voci).toEqual([]);
  });
});

describe("parsePercentToFraction", () => {
  it("35% → 0.35", () => expect(parsePercentToFraction("35%")).toBeCloseTo(0.35, 5));
  it('"0,35" → 0.35', () => expect(parsePercentToFraction("0,35")).toBeCloseTo(0.35, 5));
  it('"35" → 0.35', () => expect(parsePercentToFraction("35")).toBeCloseTo(0.35, 5));
  it("0.5 frazione resta 0.5", () => expect(parsePercentToFraction(0.5)).toBeCloseTo(0.5, 5));
  it("clamp a 1 per valori > 100%", () => expect(parsePercentToFraction("150")).toBe(1));
  it("stringa vuota / non numerica → null", () => {
    expect(parsePercentToFraction("")).toBeNull();
    expect(parsePercentToFraction("n.d.")).toBeNull();
  });
});

describe("deriveCapitoloCodice", () => {
  it("01.A.005 → 01.A", () => expect(deriveCapitoloCodice("01.A.005")).toBe("01.A"));
  it("01.A → 01", () => expect(deriveCapitoloCodice("01.A")).toBe("01"));
  it("01 → null (top-level)", () => expect(deriveCapitoloCodice("01")).toBeNull());
  it("separatori misti (01-A-005) → 01.A", () => expect(deriveCapitoloCodice("01-A-005")).toBe("01.A"));
  it("null → null", () => expect(deriveCapitoloCodice(null)).toBeNull());
});

describe("pickAdapter", () => {
  it("regione nota (case/accent-insensitive) → preset dedicato", () => {
    expect(pickAdapter("Toscana").label).toMatch(/Toscana/i);
    expect(pickAdapter("toscana")).toBe(pickAdapter("Toscana"));
  });
  it("regione sconosciuta → generico", () => {
    expect(pickAdapter("Atlantide")).toBe(GENERIC_PRESET);
    expect(pickAdapter(undefined)).toBe(GENERIC_PRESET);
  });
});
