import { describe, it, expect } from "vitest";
import {
  parseItalianNumber,
  normalizeTipo,
  normalizeUnita,
  legacyUnitaFrom,
  parsePrezziarioRows,
  parsePrezziarioCsv,
  toImportPayload,
  buildPrezziarioTemplateCsv,
  buildTariffeExportCsv,
  summarizePrezziario,
  type ParsedPrezziarioRow,
} from "@/lib/tariffe/prezziarioImport";

describe("parseItalianNumber", () => {
  it("interi e decimali semplici", () => {
    expect(parseItalianNumber("85")).toBe(85);
    expect(parseItalianNumber("85.5")).toBe(85.5);
    expect(parseItalianNumber("0")).toBe(0);
  });

  it("decimale a virgola (formato IT)", () => {
    expect(parseItalianNumber("85,00")).toBe(85);
    expect(parseItalianNumber("1234,56")).toBe(1234.56);
  });

  it("separatore migliaia IT (punto) + decimale virgola", () => {
    expect(parseItalianNumber("1.234,56")).toBe(1234.56);
    expect(parseItalianNumber("12.000")).toBe(12000); // più punti? no, uno → ambiguo
  });

  it("separatore migliaia EN (virgola) + decimale punto", () => {
    expect(parseItalianNumber("1,234.56")).toBe(1234.56);
  });

  it("raggruppamenti multipli senza decimali", () => {
    expect(parseItalianNumber("1.234.567")).toBe(1234567);
    expect(parseItalianNumber("1,234,567")).toBe(1234567);
  });

  it("simboli valuta e spazi", () => {
    expect(parseItalianNumber("€ 1.234,56")).toBe(1234.56);
    expect(parseItalianNumber("85,00 €")).toBe(85);
    expect(parseItalianNumber("EUR 60")).toBe(60);
    expect(parseItalianNumber("  22,00  ")).toBe(22);
  });

  it("valori non interpretabili → null", () => {
    expect(parseItalianNumber("")).toBeNull();
    expect(parseItalianNumber("   ")).toBeNull();
    expect(parseItalianNumber("abc")).toBeNull();
    expect(parseItalianNumber(null)).toBeNull();
    expect(parseItalianNumber(undefined)).toBeNull();
    expect(parseItalianNumber("-")).toBeNull();
  });

  it("number passthrough", () => {
    expect(parseItalianNumber(42)).toBe(42);
    expect(parseItalianNumber(Number.NaN)).toBeNull();
  });
});

describe("normalizeTipo", () => {
  it("match diretto sull'enum", () => {
    expect(normalizeTipo("posa")).toEqual({ tipo: "posa", matched: true });
    expect(normalizeTipo("manodopera")).toEqual({ tipo: "manodopera", matched: true });
    expect(normalizeTipo("falso_telaio")).toEqual({ tipo: "falso_telaio", matched: true });
    expect(normalizeTipo("Falso Telaio")).toEqual({ tipo: "falso_telaio", matched: true });
  });

  it("sinonimi", () => {
    expect(normalizeTipo("noleggio").tipo).toBe("nolo");
    expect(normalizeTipo("installazione").tipo).toBe("posa");
    expect(normalizeTipo("trasporti").tipo).toBe("trasporto");
  });

  it("non riconosciuto → altro, matched false", () => {
    expect(normalizeTipo("xyz")).toEqual({ tipo: "altro", matched: false });
    expect(normalizeTipo("")).toEqual({ tipo: "altro", matched: false });
  });
});

describe("normalizeUnita", () => {
  it("match diretto", () => {
    expect(normalizeUnita("mq", "posa")).toEqual({ unita: "mq", matched: true });
    expect(normalizeUnita("a_corpo", "altro")).toEqual({ unita: "a_corpo", matched: true });
  });

  it("sinonimi IT", () => {
    expect(normalizeUnita("cad", "posa").unita).toBe("pz");
    expect(normalizeUnita("m2", "posa").unita).toBe("mq");
    expect(normalizeUnita("ore", "manodopera").unita).toBe("h");
    expect(normalizeUnita("a corpo", "pratica").unita).toBe("a_corpo");
    expect(normalizeUnita("giornata", "manodopera").unita).toBe("gg");
  });

  it("fallback al default del tipo se non riconosciuta", () => {
    expect(normalizeUnita("???", "manodopera")).toEqual({ unita: "h", matched: false });
    expect(normalizeUnita("", "tiro_piano")).toEqual({ unita: "piano", matched: false });
    expect(normalizeUnita("", "posa")).toEqual({ unita: "pz", matched: false });
  });
});

describe("legacyUnitaFrom", () => {
  it("mappa sui valori legacy del CHECK DB", () => {
    expect(legacyUnitaFrom("a_corpo")).toBe("fisso");
    expect(legacyUnitaFrom("gg")).toBe("h");
    expect(legacyUnitaFrom("kg")).toBe("pz");
    expect(legacyUnitaFrom("mq")).toBe("mq");
    expect(legacyUnitaFrom("piano")).toBe("piano");
  });
});

describe("parsePrezziarioRows", () => {
  it("rileva colonne e parsa righe valide", () => {
    const m = [
      ["Nome", "Tipo", "Unità", "Prezzo vendita", "Costo interno", "Descrizione"],
      ["Posa pavimento", "posa", "mq", "22,00", "14,00", "Gres su sottofondo"],
      ["Manodopera spec.", "manodopera", "ore", "60,00", "40,00", ""],
    ];
    const res = parsePrezziarioRows(m);
    expect(res.missingRequired).toEqual([]);
    expect(res.globalErrors).toEqual([]);
    expect(res.rows).toHaveLength(2);

    const r0 = res.rows[0];
    expect(r0.nome).toBe("Posa pavimento");
    expect(r0.tipo).toBe("posa");
    expect(r0.unitaFatturazione).toBe("mq");
    expect(r0.prezzoVendita).toBe(22);
    expect(r0.costoInterno).toBe(14);
    expect(r0.descrizione).toBe("Gres su sottofondo");
    expect(r0.errors).toEqual([]);

    const r1 = res.rows[1];
    expect(r1.unitaFatturazione).toBe("h"); // "ore" → h
    expect(r1.descrizione).toBeNull();
  });

  it("colonne obbligatorie mancanti → globalErrors, nessuna riga", () => {
    const m = [
      ["Codice", "Tipo", "Unità"],
      ["A1", "posa", "mq"],
    ];
    const res = parsePrezziarioRows(m);
    expect(res.missingRequired).toContain("nome");
    expect(res.missingRequired).toContain("prezzo_vendita");
    expect(res.rows).toHaveLength(0);
    expect(res.globalErrors.length).toBeGreaterThan(0);
  });

  it("'descrizione' come unica colonna testo è usata come nome", () => {
    const m = [
      ["Descrizione", "Prezzo"],
      ["Tinteggiatura pareti interne", "8,50"],
    ];
    const res = parsePrezziarioRows(m);
    expect(res.missingRequired).toEqual([]);
    expect(res.rows[0].nome).toBe("Tinteggiatura pareti interne");
    expect(res.rows[0].prezzoVendita).toBe(8.5);
  });

  it("riga senza nome → errore; prezzo non valido o <=0 → errore", () => {
    const m = [
      ["Nome", "Prezzo"],
      ["", "10,00"],
      ["Voce A", "abc"],
      ["Voce B", "0"],
      ["Voce C", "-5"],
    ];
    const res = parsePrezziarioRows(m);
    expect(res.rows[0].errors.some((e) => /Nome mancante/i.test(e))).toBe(true);
    expect(res.rows[1].errors.some((e) => /Prezzo non valido/i.test(e))).toBe(true);
    expect(res.rows[2].errors.some((e) => /maggiore di zero/i.test(e))).toBe(true);
    expect(res.rows[3].errors.length).toBeGreaterThan(0);
  });

  it("warning: costo non valido ignorato; costo>prezzo margine negativo", () => {
    const m = [
      ["Nome", "Prezzo", "Costo"],
      ["Voce A", "50,00", "xx"],
      ["Voce B", "50,00", "80,00"],
    ];
    const res = parsePrezziarioRows(m);
    expect(res.rows[0].costoInterno).toBeNull();
    expect(res.rows[0].warnings.some((w) => /Costo non valido/i.test(w))).toBe(true);
    expect(res.rows[1].costoInterno).toBe(80);
    expect(res.rows[1].warnings.some((w) => /margine negativo/i.test(w))).toBe(true);
  });

  it("warning: tipo/unità non riconosciuti → default con avviso", () => {
    const m = [
      ["Nome", "Tipo", "Unità", "Prezzo"],
      ["Voce X", "fantasia", "barili", "10,00"],
    ];
    const res = parsePrezziarioRows(m);
    const r = res.rows[0];
    expect(r.tipo).toBe("altro");
    expect(r.unitaFatturazione).toBe("pz"); // default tipo altro
    expect(r.warnings.some((w) => /Tipo .* non riconosciuto/i.test(w))).toBe(true);
    expect(r.warnings.some((w) => /Unità .* non riconosciuta/i.test(w))).toBe(true);
  });

  it("codice viene prependato alla descrizione", () => {
    const m = [
      ["Codice", "Nome", "Prezzo", "Descrizione"],
      ["NP.01", "Voce A", "10,00", "dettaglio"],
      ["NP.02", "Voce B", "10,00", ""],
    ];
    const res = parsePrezziarioRows(m);
    expect(res.rows[0].descrizione).toBe("Cod. NP.01 — dettaglio");
    expect(res.rows[1].descrizione).toBe("Cod. NP.02");
  });

  it("salta righe completamente vuote e file vuoto", () => {
    expect(parsePrezziarioRows([]).globalErrors.length).toBeGreaterThan(0);
    const m = [
      ["Nome", "Prezzo"],
      ["", ""],
      ["Voce A", "10,00"],
      ["   ", "  "],
    ];
    const res = parsePrezziarioRows(m);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].nome).toBe("Voce A");
  });

  it("intestazioni con accenti e punteggiatura: 'Unità di misura', 'Prezzo (IVA escl.)'", () => {
    const m = [
      ["Voce", "Unità di misura", "Prezzo (IVA escl.)"],
      ["Sopralluogo", "a corpo", "80,00"],
    ];
    const res = parsePrezziarioRows(m);
    expect(res.missingRequired).toEqual([]);
    expect(res.rows[0].unitaFatturazione).toBe("a_corpo");
    expect(res.rows[0].prezzoVendita).toBe(80);
  });
});

describe("parsePrezziarioCsv", () => {
  it("CSV con delimitatore ; e decimali a virgola (export IT)", () => {
    const csv = [
      "Codice;Nome;Tipo;Unità;Prezzo vendita;Costo interno",
      "NP.01;Posa gres;posa;mq;22,00;14,00",
      "NP.02;Manodopera;manodopera;h;60,00;40,00",
    ].join("\n");
    const res = parsePrezziarioCsv(csv);
    expect(res.globalErrors).toEqual([]);
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0].nome).toBe("Posa gres");
    expect(res.rows[0].prezzoVendita).toBe(22);
    expect(res.rows[0].descrizione).toBe("Cod. NP.01");
    expect(res.rows[1].unitaFatturazione).toBe("h");
  });

  it("CSV con delimitatore , e decimali a punto (export EN)", () => {
    const csv = [
      "Nome,Prezzo,Costo",
      "Tinteggiatura,8.50,5.00",
    ].join("\n");
    const res = parsePrezziarioCsv(csv);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].prezzoVendita).toBe(8.5);
    expect(res.rows[0].costoInterno).toBe(5);
  });
});

describe("toImportPayload", () => {
  const baseRow: ParsedPrezziarioRow = {
    rowIndex: 2,
    nome: "Posa gres",
    tipo: "posa",
    unitaFatturazione: "mq",
    prezzoVendita: 22,
    costoInterno: 14,
    descrizione: "Gres",
    errors: [],
    warnings: [],
  };

  it("admin: include costo_interno e prezzo_costo, attivo true, vertical null", () => {
    const p = toImportPayload(baseRow, { companyId: "c1", includeCosto: true });
    expect(p).toMatchObject({
      company_id: "c1",
      nome: "Posa gres",
      tipo: "posa",
      unita: "mq",
      unita_fatturazione: "mq",
      prezzo_vendita: 22,
      attivo: true,
      vertical_associato: null,
      costo_interno: 14,
      prezzo_costo: 14,
    });
  });

  it("non-admin: omette costo", () => {
    const p = toImportPayload(baseRow, { companyId: "c1", includeCosto: false });
    expect(p.costo_interno).toBeUndefined();
    expect(p.prezzo_costo).toBeUndefined();
    expect(p.prezzo_vendita).toBe(22);
  });

  it("legacy unita mapping a_corpo→fisso", () => {
    const p = toImportPayload(
      { ...baseRow, unitaFatturazione: "a_corpo" },
      { companyId: "c1", includeCosto: true },
    );
    expect(p.unita).toBe("fisso");
    expect(p.unita_fatturazione).toBe("a_corpo");
  });

  it("costo null non viene incluso anche se admin", () => {
    const p = toImportPayload(
      { ...baseRow, costoInterno: null },
      { companyId: "c1", includeCosto: true },
    );
    expect(p.costo_interno).toBeUndefined();
  });
});

describe("buildPrezziarioTemplateCsv", () => {
  it("contiene le intestazioni e si re-importa correttamente", () => {
    const csv = buildPrezziarioTemplateCsv();
    expect(csv).toMatch(/Nome/);
    expect(csv).toMatch(/Prezzo vendita/);
    const res = parsePrezziarioCsv(csv);
    expect(res.missingRequired).toEqual([]);
    expect(res.rows.length).toBe(2);
    expect(res.rows.every((r) => r.errors.length === 0)).toBe(true);
  });
});

describe("summarizePrezziario", () => {
  it("conta valide / con errori / con warning", () => {
    const rows: ParsedPrezziarioRow[] = [
      { rowIndex: 2, nome: "A", tipo: "posa", unitaFatturazione: "pz", prezzoVendita: 10, costoInterno: null, descrizione: null, errors: [], warnings: [] },
      { rowIndex: 3, nome: "B", tipo: "posa", unitaFatturazione: "pz", prezzoVendita: 0, costoInterno: null, descrizione: null, errors: ["x"], warnings: [] },
      { rowIndex: 4, nome: "C", tipo: "posa", unitaFatturazione: "pz", prezzoVendita: 10, costoInterno: null, descrizione: null, errors: [], warnings: ["w"] },
    ];
    expect(summarizePrezziario(rows)).toEqual({ total: 3, valid: 2, withErrors: 1, withWarnings: 1 });
  });
});

describe("buildTariffeExportCsv", () => {
  const tariffe = [
    { nome: "Posa gres", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 22, costo_interno: 14, descrizione: "Su sottofondo" },
    { nome: "Manodopera", tipo: "manodopera", unita_fatturazione: "h", prezzo_vendita: 60, costo_interno: 40, descrizione: null },
  ];

  it("include la colonna Costo solo per gli admin", () => {
    const admin = buildTariffeExportCsv(tariffe, { includeCosto: true });
    const base = buildTariffeExportCsv(tariffe, { includeCosto: false });
    expect(admin).toContain("Costo interno");
    expect(base).not.toContain("Costo interno");
  });

  it("usa il delimitatore ; e i decimali con virgola", () => {
    const csv = buildTariffeExportCsv(tariffe, { includeCosto: true });
    expect(csv.split(/\r?\n/)[0]).toBe("Nome;Tipo;Unità;Prezzo vendita;Costo interno;Descrizione");
    expect(csv).toContain("22,00");
    expect(csv).toContain("60,00");
  });

  it("gestisce prezzi/costi mancanti senza rompere", () => {
    const csv = buildTariffeExportCsv(
      [{ nome: "X", tipo: "altro", unita_fatturazione: "pz", prezzo_vendita: null, costo_interno: null }],
      { includeCosto: true },
    );
    expect(csv).toContain("X;altro;pz;;;");
  });

  it("round-trip: export → import restituisce le stesse voci", () => {
    const csv = buildTariffeExportCsv(tariffe, { includeCosto: true });
    const res = parsePrezziarioCsv(csv);
    expect(res.rows.length).toBe(2);
    expect(res.rows.every((r) => r.errors.length === 0)).toBe(true);
    expect(res.rows[0].nome).toBe("Posa gres");
    expect(res.rows[0].prezzoVendita).toBe(22);
    expect(res.rows[0].costoInterno).toBe(14);
    expect(res.rows[0].unitaFatturazione).toBe("mq");
    expect(res.rows[1].tipo).toBe("manodopera");
  });
});
