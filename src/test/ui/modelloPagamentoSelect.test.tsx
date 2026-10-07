// src/test/ui/modelloPagamentoSelect.test.tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelloPagamentoSelect } from "@/components/orders/ModelloPagamentoSelect";
import type { ModelloPagamento, RataModello } from "@/lib/orders/modelliPagamento";

const rata = (nome: string, percent: number, tipo: RataModello["tipo"], evento: RataModello["evento"]): RataModello => ({ nome, percent, tipo, evento, numero: null, preavviso: 7 });
const modello = (id: string, nome: string): ModelloPagamento => ({
  id, origine: "azienda", nome, descrizione: "", righe: [rata("Acconto", 30, "deposit", "firma_contratto"), rata("Saldo", 70, "balance", "fine_lavori")],
});
const offerti = [modello("m1", "Acconto e saldo"), modello("m2", "Altro piano")];

afterEach(cleanup);

describe("ModelloPagamentoSelect", () => {
  it("senza modello applicato dice «Scrivo io le rate» e non mostra il riepilogo", () => {
    render(<ModelloPagamentoSelect offerti={offerti} valore="" onChange={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Modello di pagamento" })).toHaveTextContent("Scrivo io le rate");
    expect(screen.queryByText(/le rate seguono il totale/)).not.toBeInTheDocument();
  });
  it("con un modello applicato lo mostra, con come si incassa", () => {
    render(<ModelloPagamentoSelect offerti={offerti} valore="m1" onChange={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Modello di pagamento" })).toHaveTextContent("Acconto e saldo");
    expect(screen.getByText("30% alla firma del contratto · 70% a fine lavori · le rate seguono il totale")).toBeInTheDocument();
  });
  it("scegliere un modello avvisa con il suo id", () => {
    const onChange = vi.fn();
    render(<ModelloPagamentoSelect offerti={offerti} valore="" onChange={onChange} />);
    fireEvent.click(screen.getByRole("combobox", { name: "Modello di pagamento" }));
    fireEvent.click(screen.getByText("Altro piano"));
    expect(onChange).toHaveBeenCalledWith("m2");
  });
  it("«Scrivo io le rate» avvisa con il testo vuoto", () => {
    const onChange = vi.fn();
    render(<ModelloPagamentoSelect offerti={offerti} valore="m1" onChange={onChange} />);
    fireEvent.click(screen.getByRole("combobox", { name: "Modello di pagamento" }));
    fireEvent.click(screen.getByRole("option", { name: "Scrivo io le rate" }));
    expect(onChange).toHaveBeenCalledWith("");
  });
  it("senza nessun modello da offrire non si vede", () => {
    const { container } = render(<ModelloPagamentoSelect offerti={[]} valore="" onChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
