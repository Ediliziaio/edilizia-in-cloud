import { describe, expect, it } from "vitest";
import { numeriMancanti, progressivoDaNumero, raggruppaPerMese, type EmessaImportata } from "@/lib/fatturazione/emesseImportate";

const f = (n: string, data: string | null, totale: number, extra: Partial<EmessaImportata> = {}): EmessaImportata => ({
  id: n, invoice_number: n, document_type: "TD01", status: "emessa", client_company_name: "Cliente",
  issue_date: data, subtotal: totale / 1.22, tax_amount: totale - totale / 1.22, total: totale, paid_amount: 0, ...extra,
});

describe("fatture emesse importate", () => {
  it("il progressivo si legge da «FPR 62/26»", () => {
    expect(progressivoDaNumero("FPR 62/26")).toBe(62);
    expect(progressivoDaNumero("FPR 9/26")).toBe(9);
    expect(progressivoDaNumero("senza numero")).toBe(0);
  });
  it("raggruppa per mese dal più recente e ordina i numeri come numeri (9 prima di 10)", () => {
    const mesi = raggruppaPerMese([f("FPR 10/26", "2026-03-20", 100), f("FPR 9/26", "2026-03-02", 200), f("FPR 40/26", "2026-07-01", 300)]);
    expect(mesi.map((m) => m.chiave)).toEqual(["2026-07", "2026-03"]);
    expect(mesi[1].etichetta).toBe("Marzo 2026");
    expect(mesi[1].fatture.map((x) => x.invoice_number)).toEqual(["FPR 9/26", "FPR 10/26"]);
    expect(mesi[1].totale).toBe(300);
    expect(mesi[0].totale).toBe(300);
  });
  it("una nota di credito toglie dal totale del mese", () => {
    const [m] = raggruppaPerMese([f("FPR 1/26", "2026-01-10", 1000), f("FPR 2/26", "2026-01-20", 400, { document_type: "TD04" })]);
    expect(m.totale).toBe(600);
  });
  it("le fatture senza data vanno in fondo, in «Senza data»", () => {
    const mesi = raggruppaPerMese([f("FPR 1/26", null, 10), f("FPR 2/26", "2026-02-01", 20)]);
    expect(mesi.map((m) => m.etichetta)).toEqual(["Febbraio 2026", "Senza data"]);
  });
  it("numeriMancanti trova i buchi della serie", () => {
    const righe = [f("FPR 1/26", "2026-01-01", 1), f("FPR 2/26", "2026-01-02", 1), f("FPR 5/26", "2026-01-03", 1)];
    expect(numeriMancanti(righe, 6)).toEqual([3, 4, 6]);
  });
});
