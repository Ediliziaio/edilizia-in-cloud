// src/test/ui/pianoPagamentiAzioni.test.tsx
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Installment } from "@/lib/orderUtils";
import { modelliPagamentoDaOffrire, type ModelloPagamento, type RataModello } from "@/lib/orders/modelliPagamento";

const state = vi.hoisted(() => ({
  modelli: [] as unknown[], rateConSal: [] as string[], sostituisci: vi.fn(), conferma: vi.fn(),
}));
vi.mock("@/hooks/useModelliPagamento", () => ({
  useModelliPagamento: () => ({ offerti: modelliPagamentoDaOffrire(true, state.modelli as ModelloPagamento[]) }),
}));
vi.mock("@/hooks/usePianoPagamenti", () => ({
  useSalLegatiARate: () => ({ rateConSal: new Set(state.rateConSal) }),
  useSostituisciRate: () => ({ mutate: state.sostituisci, isPending: false }),
}));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => state.conferma }));

import { PianoPagamentiAzioni } from "@/components/orders/PianoPagamentiAzioni";

const rata = (nome: string, percent: number, tipo: RataModello["tipo"], evento: RataModello["evento"], numero: number | null = null): RataModello =>
  ({ nome, percent, tipo, evento, numero, preavviso: 7 });
const treRate: ModelloPagamento = {
  id: "m1", origine: "azienda", nome: "Tre rate", descrizione: "",
  righe: [rata("Alla firma", 30, "deposit", "firma_contratto"), rata("SAL 1", 40, "deposit", "sal_numero", 1), rata("Saldo", 30, "balance", "fine_lavori")],
};
const rate = (...importi: number[]): Installment[] => importi.map((amount, i) => ({
  id: `r${i}`, position: i, label: i === importi.length - 1 ? "Saldo" : `Acconto ${i + 1}`, type: i === importi.length - 1 ? "balance" : "deposit", amount, is_paid: false,
}));
const props = { orderId: "o1", totalAmount: 10000, vatRate: 22, paymentType: "standard" as const, financingCost: 0, installments: [] as Installment[], puoModificare: true };

beforeEach(() => {
  vi.clearAllMocks();
  state.modelli = [treRate]; state.rateConSal = [];
  state.conferma.mockResolvedValue(true);
});
afterEach(cleanup);

describe("commessa senza rate", () => {
  it("chiede come si paga e offre di scegliere il piano", () => {
    render(<PianoPagamentiAzioni {...props} />);
    expect(screen.getByText("Come si paga questa commessa?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scegli il piano" })).toBeInTheDocument();
  });

  it("l'anteprima mostra le rate col totale con IVA e il loro momento d'incasso, e applicare le manda senza id", () => {
    render(<PianoPagamentiAzioni {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Scegli il piano" }));
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByText(/12\.200,00/)).toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Applica questo piano" })).toBeDisabled();
    fireEvent.click(within(dialogo).getByRole("radio", { name: /Tre rate/ }));
    const anteprima = within(dialogo).getByRole("list", { name: "Anteprima delle rate" });
    expect(within(anteprima).getByText(/Alla firma/)).toBeInTheDocument();
    expect(within(anteprima).getByText(/al SAL n\. 1/)).toBeInTheDocument();
    expect(within(anteprima).getAllByText(/3\.660,00/)).toHaveLength(2);
    expect(within(anteprima).getByText(/4\.880,00/)).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Applica questo piano" }));
    expect(state.sostituisci).toHaveBeenCalledTimes(1);
    const mandate = state.sostituisci.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(mandate.map((r) => r.amount)).toEqual([3660, 4880, 3660]);
    expect(mandate.map((r) => r.trigger_evento)).toEqual(["firma_contratto", "sal_numero", "fine_lavori"]);
    expect(mandate[1]).toMatchObject({ trigger_numero: 1, type: "deposit" });
    expect(mandate.every((r) => !("id" in r) && !("percent" in r))).toBe(true);
  });

  it("senza importo non si può scegliere un piano: lo dice", () => {
    render(<PianoPagamentiAzioni {...props} totalAmount={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Scegli il piano" }));
    expect(within(screen.getByRole("dialog")).getByText(/non ha ancora un importo/)).toBeInTheDocument();
  });

  it("senza modelli da offrire non c'è niente da fare", () => {
    state.modelli = [];
    const { container } = render(<PianoPagamentiAzioni {...props} />);
    expect(container.textContent).toBe("");
  });

  it("chi non può modificare la commessa non vede niente", () => {
    const { container } = render(<PianoPagamentiAzioni {...props} puoModificare={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("con un finanziamento il piano ha la sua logica: nessun modello", () => {
    const { container } = render(<PianoPagamentiAzioni {...props} paymentType="financing" />);
    expect(container.textContent).toBe("");
  });
});

describe("commessa con rate", () => {
  it("si può cambiare il piano, e le rate di adesso vengono sostituite", () => {
    render(<PianoPagamentiAzioni {...props} installments={rate(3000, 9200)} />);
    fireEvent.click(screen.getByRole("button", { name: "Cambia il piano" }));
    expect(screen.getByText(/Le rate di adesso vengono sostituite/)).toBeInTheDocument();
  });

  it("con una rata incassata, una fattura o un SAL il piano non si rifà (il comando non c'è)", () => {
    const incassata = rate(3000, 9200).map((r, i) => (i === 0 ? { ...r, is_paid: true } : r));
    const { rerender } = render(<PianoPagamentiAzioni {...props} installments={incassata} />);
    expect(screen.queryByRole("button", { name: "Cambia il piano" })).not.toBeInTheDocument();
    rerender(<PianoPagamentiAzioni {...props} installments={rate(3000, 9200).map((r) => ({ ...r, documento_fiscale_id: "d1" }))} />);
    expect(screen.queryByRole("button", { name: "Cambia il piano" })).not.toBeInTheDocument();
    state.rateConSal = ["r0"];
    rerender(<PianoPagamentiAzioni {...props} installments={rate(3000, 9200)} />);
    expect(screen.queryByRole("button", { name: "Cambia il piano" })).not.toBeInTheDocument();
  });

  it("il saldo salvato senza IVA si segnala, e «Allinea» chiede conferma e manda tutte le rate con i loro id", async () => {
    render(<PianoPagamentiAzioni {...props} installments={rate(3000, 7000)} />);
    expect(screen.getByText("Il saldo salvato non torna con il totale")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Allinea il saldo a/ }));
    await waitFor(() => expect(state.sostituisci).toHaveBeenCalledTimes(1));
    expect(state.conferma).toHaveBeenCalledWith(expect.objectContaining({ confirmLabel: "Allinea il saldo" }));
    const mandate = state.sostituisci.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(mandate.map((r) => [r.id, r.amount])).toEqual([["r0", 3000], ["r1", 9200]]);
  });

  it("se non si conferma l'allineamento non cambia niente", async () => {
    state.conferma.mockResolvedValue(false);
    render(<PianoPagamentiAzioni {...props} installments={rate(3000, 7000)} />);
    fireEvent.click(screen.getByRole("button", { name: /Allinea il saldo a/ }));
    await waitFor(() => expect(state.conferma).toHaveBeenCalled());
    expect(state.sostituisci).not.toHaveBeenCalled();
  });

  it("un saldo che torna non si segnala", () => {
    render(<PianoPagamentiAzioni {...props} installments={rate(3000, 9200)} />);
    expect(screen.queryByText("Il saldo salvato non torna con il totale")).not.toBeInTheDocument();
  });
});
