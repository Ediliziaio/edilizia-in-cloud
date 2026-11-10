/**
 * SAL standard, lotto 1 (10/11/2026): ogni voce sa di quale fase è, il verbale
 * nuovo riparte dal SAL precedente, e una voce che scende è una rettifica.
 */
import { describe, expect, it } from "vitest";
import { collegaVociAFasi, percentualiPrecedenti, vociSalDaFasi, vociSottoIlPrecedente, type FasePerSal, type VoceSalDraft } from "@/lib/orders/salDaFasi";
import { prepareSalLines } from "@/lib/orders/salDraft";

const storico = [
  { id: "s1", numero_sal: 1, stato: "approvato", sal_voci: [
    { descrizione: "Demolizioni", percentuale_avanzamento: 100, fase_id: "f1" },
    { descrizione: "Massetti", percentuale_avanzamento: 30, fase_id: "f2" },
  ] },
  { id: "s2", numero_sal: 2, stato: "emesso", sal_voci: [
    { descrizione: "Demolizioni", percentuale_avanzamento: 100, fase_id: "f1" },
    { descrizione: "Massetti", percentuale_avanzamento: 60, fase_id: "f2" },
    { descrizione: "Oneri sicurezza", percentuale_avanzamento: 50, fase_id: null },
  ] },
  { id: "s3", numero_sal: 3, stato: "bozza", sal_voci: [
    { descrizione: "Massetti", percentuale_avanzamento: 90, fase_id: "f2" },
  ] },
];

describe("percentualiPrecedenti", () => {
  it("prende l'ultimo SAL emesso con numero più basso, non le bozze", () => {
    const p = percentualiPrecedenti(4, storico);
    expect(p.numero).toBe(2);
    expect(p.perFase.get("f2")).toBe(60);
    expect(p.perNome.get("oneri sicurezza")).toBe(50);
  });

  it("primo SAL: nessun precedente", () => {
    const p = percentualiPrecedenti(1, storico);
    expect(p.numero).toBeNull();
    expect(p.perFase.size).toBe(0);
  });
});

describe("vociSalDaFasi con il SAL precedente", () => {
  it("porta il fase_id e non parte mai sotto la % già certificata", () => {
    const voci = vociSalDaFasi([
      { id: "f1", name: "Demolizioni", status: "in_corso", percentuale: 80, importo_venduto: 1000 },
      { id: "f2", name: "Massetti", status: "in_corso", percentuale: 75, importo_venduto: 4000 },
      { id: "f3", name: "Impianti", status: "da_iniziare", percentuale: 0, importo_venduto: null },
    ], percentualiPrecedenti(3, storico));
    expect(voci.map((v) => [v.fase_id, v.percentuale_avanzamento])).toEqual([
      ["f1", "100"], // il cantiere dice 80, il SAL 2 ha già certificato 100
      ["f2", "75"],  // il cantiere è avanti: vale il cantiere
      ["f3", "0"],
    ]);
  });
});

describe("collegaVociAFasi", () => {
  it("collega per nome solo se la fase è una sola; le altre restano libere", () => {
    const fasi: FasePerSal[] = [
      { id: "f1", name: "Massetti", percentuale: 0, importo_venduto: null },
      { id: "f2", name: "Pittura", percentuale: 0, importo_venduto: null },
      { id: "f3", name: "pittura ", percentuale: 0, importo_venduto: null },
    ];
    const voci = collegaVociAFasi<VoceSalDraft>([
      { descrizione: " massetti", importo_contrattuale: "1", percentuale_avanzamento: "1", note: "" },
      { descrizione: "Pittura", importo_contrattuale: "1", percentuale_avanzamento: "1", note: "" },
      { descrizione: "Extra", importo_contrattuale: "1", percentuale_avanzamento: "1", note: "" },
    ], fasi);
    expect(voci.map((v) => v.fase_id ?? null)).toEqual(["f1", null, null]);
  });
});

describe("vociSottoIlPrecedente", () => {
  it("segnala la voce che scende, per fase e per nome", () => {
    const prec = percentualiPrecedenti(3, storico);
    expect(vociSottoIlPrecedente([
      { descrizione: "Massetti", importo_contrattuale: "4000", percentuale_avanzamento: "50", note: "", fase_id: "f2" },
      { descrizione: "Demolizioni", importo_contrattuale: "1000", percentuale_avanzamento: "100", note: "", fase_id: "f1" },
      { descrizione: "Oneri sicurezza", importo_contrattuale: "500", percentuale_avanzamento: "40,5", note: "" },
    ], prec)).toEqual([
      { descrizione: "Massetti", precedente: 60, attuale: 50 },
      { descrizione: "Oneri sicurezza", precedente: 50, attuale: 40.5 },
    ]);
  });
});

describe("prepareSalLines porta il fase_id al salvataggio", () => {
  it("solo sulle voci che ce l'hanno", () => {
    const { rows } = prepareSalLines([
      { descrizione: "Massetti", importo_contrattuale: "4000", percentuale_avanzamento: "60", note: "", fase_id: "f2" },
      { descrizione: "Extra", importo_contrattuale: "100", percentuale_avanzamento: "100", note: "" },
    ]);
    expect(rows[0].fase_id).toBe("f2");
    expect("fase_id" in rows[1]).toBe(false);
  });
});
