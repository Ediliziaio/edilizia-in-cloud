import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { FinancingProposal } from "@/components/marketing/preventivi/QuoteFinancingPanel";

/**
 * La proposta di finanziamento del preventivo classico: l'importo finanziato
 * non può superare il totale, e se il totale cambia (sconto, prezzo a mano)
 * mentre la proposta è aperta, la rata si ricalcola. Prima l'importo restava
 * quello della prima volta: con un totale sceso da 12.000 a 10.800 € il PDF
 * stampava la rata di 12.000 € («oppure in comode rate mensili»).
 *
 * Tabella di prova: 24 rate, rata = importo / 24 × 1,10 (totale dovuto = rata × 24).
 */

const riga = (importo: number) => ({
  id: `r${importo}`, tabella_id: "t1", company_id: "c1", subtariffa: null as string | null, importo_erogato: importo,
  spese_istruttoria: 0, importo_totale_credito: importo, numero_rate: 24, durata_mesi: 24, prima_rata_giorni: 30,
  importo_rata: Math.round((importo / 24) * 1.1 * 100) / 100, spese_incasso_rata: 0, interessi_cliente: importo * 0.1,
  importo_totale_dovuto: Math.round(importo * 1.1 * 100) / 100, tan: 5, taeg: 6, icc: null as number | null, provvigione_dealer: 0, created_at: "2026-10-01",
});
const tabella = {
  id: "t1", nome_prodotto: "Prestito di prova", attiva: true, tan_base: 5, importo_min: 5000, importo_max: 20000,
  durate_disponibili: [24], finanziaria_nome: "Banca", righe_count: 4,
};
vi.mock("@/lib/finanziamenti/queries", () => ({
  useTabelle: () => ({ data: [tabella], isLoading: false }),
  useRighe: () => ({ data: [riga(5000), riga(10000), riga(15000), riga(20000)] }),
}));

import { QuoteFinancingPanel } from "@/components/marketing/preventivi/QuoteFinancingPanel";

afterEach(cleanup);

const proposta = (amount: number): FinancingProposal => ({
  table_id: "t1", amount, num_installments: 24,
  monthly_rate: Math.round((amount / 24) * 1.1 * 100) / 100, total_due: Math.round(amount * 1.1 * 100) / 100,
  calculation: { importo_richiesto: amount, numero_rate: 24, modalita: "esatto" },
});

const ultima = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls.at(-1)?.[0] as FinancingProposal | null;
const campoImporto = () => screen.getByRole("spinbutton") as HTMLInputElement;

describe("proposta di finanziamento: l'importo segue il totale del preventivo", () => {
  it("riaperta con un importo più alto del totale (lo sconto è sceso dopo): si porta al totale e la rata si ricalcola", () => {
    const onChange = vi.fn();
    render(<QuoteFinancingPanel quoteTotal={10800} value={proposta(12000)} onChange={onChange} />);
    expect(campoImporto().value).toBe("10800");
    const p = ultima(onChange)!;
    expect(p.amount).toBe(10800);
    // 10.800 sta fra 10.000 (rata 458,33) e 15.000 (rata 687,50): 458,33 + (687,5 − 458,33) × 0,16 = 495,00.
    expect(p.monthly_rate).toBeCloseTo(495, 2);
    expect(p.total_due).toBeCloseTo(11880, 2);
  });

  it("l'importo che coincide col totale lo segue quando il totale cambia con la proposta aperta", () => {
    const onChange = vi.fn();
    const { rerender } = render(<QuoteFinancingPanel quoteTotal={12000} value={proposta(12000)} onChange={onChange} />);
    expect(campoImporto().value).toBe("12000");
    // Sconto del 10%: il totale scende. Anche in alto: sale a 13.000.
    rerender(<QuoteFinancingPanel quoteTotal={10800} value={ultima(onChange)} onChange={onChange} />);
    expect(campoImporto().value).toBe("10800");
    expect(ultima(onChange)!.amount).toBe(10800);
    rerender(<QuoteFinancingPanel quoteTotal={13000} value={ultima(onChange)} onChange={onChange} />);
    expect(campoImporto().value).toBe("13000");
    expect(ultima(onChange)!.amount).toBe(13000);
  });

  it("un importo scelto a mano (finanzia solo una parte) non si muove, ma si dice quanto è sul totale", () => {
    const onChange = vi.fn();
    const { rerender } = render(<QuoteFinancingPanel quoteTotal={12000} value={proposta(8000)} onChange={onChange} />);
    expect(campoImporto().value).toBe("8000");
    rerender(<QuoteFinancingPanel quoteTotal={10800} value={ultima(onChange)} onChange={onChange} />);
    expect(campoImporto().value).toBe("8000");
    expect(ultima(onChange)!.amount).toBe(8000);
    const avviso = screen.getByText(/Stai finanziando/);
    expect(avviso.textContent).toMatch(/8\.000,00.*su un totale di.*10\.800,00/);
    // «Usa il totale»: un clic e l'importo è il totale.
    fireEvent.click(screen.getByRole("button", { name: /Usa il totale/ }));
    expect(campoImporto().value).toBe("10800");
    expect(ultima(onChange)!.amount).toBe(10800);
    expect(screen.queryByText(/Stai finanziando/)).toBeNull();
  });

  it("scrivere un importo oltre il totale non è possibile: si ferma al totale", () => {
    const onChange = vi.fn();
    render(<QuoteFinancingPanel quoteTotal={10800} value={proposta(10800)} onChange={onChange} />);
    fireEvent.change(campoImporto(), { target: { value: "15000" } });
    expect(campoImporto().value).toBe("10800");
    expect(ultima(onChange)!.amount).toBe(10800);
  });

  it("senza avviso quando importo e totale coincidono", () => {
    render(<QuoteFinancingPanel quoteTotal={10000} value={proposta(10000)} onChange={vi.fn()} />);
    expect(screen.queryByText(/Stai finanziando/)).toBeNull();
  });
});
