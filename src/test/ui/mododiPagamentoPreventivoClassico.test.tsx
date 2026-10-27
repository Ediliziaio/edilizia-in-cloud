/**
 * I modi di pagare nel preventivo classico (26/10/2026): gli stessi dei preventivatori edili (firma e merce, SAL…),
 * non solo il «30/70». Le fasi del classico tengono il «quando» nel nome, perché non hanno l'evento come dato.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { quotePaymentPresets, paymentPlanError, recalcPhaseAmounts } from "@/lib/preventivi/paymentTerms";
import { PIANI_DI_PARTENZA } from "@/lib/preventivi/pianoPagamento";
import { QuotePaymentTermsCard } from "@/components/marketing/preventivi/QuotePaymentTermsCard";

afterEach(() => cleanup());

describe("i modi pronti del classico", () => {
  it("sono gli stessi dei preventivatori edili: una definizione sola", () => {
    expect(quotePaymentPresets().map((p) => p.chiave)).toEqual(PIANI_DI_PARTENZA.map((p) => p.chiave));
  });

  it("ogni modo è un piano valido che copre il prezzo intero", () => {
    for (const preset of quotePaymentPresets()) {
      expect(paymentPlanError(recalcPhaseAmounts(preset.fasi, 10000)), preset.chiave).toBeNull();
      expect(recalcPhaseAmounts(preset.fasi, 10000).reduce((s, f) => s + f.amount, 0), preset.chiave).toBe(10000);
    }
  });

  it("l'ultima fase è il saldo, le altre acconti", () => {
    for (const preset of quotePaymentPresets()) {
      expect(preset.fasi.at(-1)!.type, preset.chiave).toBe("balance");
      expect(preset.fasi.slice(0, -1).every((f) => f.type === "deposit"), preset.chiave).toBe(true);
    }
  });

  it("«Firma, merce e saldo» dice l'arrivo della merce nel nome della fase", () => {
    const fasi = quotePaymentPresets().find((p) => p.chiave === "firma-merce-saldo")!.fasi;
    expect(fasi.map((f) => f.label)).toEqual(["Acconto alla firma", "All'arrivo della merce", "Saldo a fine lavori"]);
  });

  it("«Acconto e SAL» porta i SAL numerati nei nomi", () => {
    const fasi = quotePaymentPresets().find((p) => p.chiave === "acconto-sal-saldo")!.fasi;
    expect(fasi.map((f) => f.label)).toEqual(["Acconto alla firma", "SAL 1", "SAL 2", "SAL 3", "Saldo a fine lavori"]);
  });
});

describe("la scheda del classico", () => {
  const monta = (phases: Parameters<typeof QuotePaymentTermsCard>[0]["phases"] = []) => {
    const onPhasesChange = vi.fn();
    render(<QuotePaymentTermsCard total={10000} method="" phases={phases} onMethodChange={vi.fn()} onPhasesChange={onPhasesChange} />);
    return onPhasesChange;
  };

  it("senza fasi offre tutti i modi, non solo il 30/70", () => {
    monta();
    for (const p of quotePaymentPresets()) expect(screen.getByRole("button", { name: new RegExp(p.nome) }), p.nome).toBeTruthy();
  });

  it("scegliere «Firma, merce e saldo» scrive le tre fase con gli importi sul prezzo", () => {
    const onPhasesChange = monta();
    fireEvent.click(screen.getByRole("button", { name: /Firma, merce e saldo/ }));
    const fasi = onPhasesChange.mock.calls.at(-1)![0] as ReturnType<typeof recalcPhaseAmounts>;
    expect(fasi.map((f) => f.label)).toEqual(["Acconto alla firma", "All'arrivo della merce", "Saldo a fine lavori"]);
    expect(fasi.map((f) => f.amount)).toEqual([3000, 4000, 3000]);
  });

  it("con le fasi già scritte i modi non compaiono più: non si butta via il piano fatto", () => {
    monta([{ label: "Acconto", type: "deposit", percent: 50, amount: 5000 }, { label: "Saldo", type: "balance", percent: 50, amount: 5000 }]);
    expect(screen.queryByRole("button", { name: /Firma, merce e saldo/ })).toBeNull();
  });
});
