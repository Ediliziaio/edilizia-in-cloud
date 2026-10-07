// src/test/ui/comeSiPagaSelect.test.tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComeSiPagaSelect } from "@/components/orders/ComeSiPagaSelect";
import type { ModelloPagamento, RataModello } from "@/lib/orders/modelliPagamento";

const rata = (nome: string, percent: number, tipo: RataModello["tipo"], evento: RataModello["evento"]): RataModello => ({ nome, percent, tipo, evento, numero: null, preavviso: 7 });
const modello = (id: string, nome: string): ModelloPagamento => ({
  id, origine: "azienda", nome, descrizione: "", righe: [rata("Acconto", 30, "deposit", "firma_contratto"), rata("Saldo", 70, "balance", "fine_lavori")],
});
const offerti = [modello("m1", "Acconto e saldo"), modello("m2", "Altro piano")];

afterEach(cleanup);

describe("ComeSiPagaSelect", () => {
  it("senza modello applicato dice «Scrivo io le rate» e non mostra il riepilogo", () => {
    render(<ComeSiPagaSelect offerti={offerti} valore="" onChange={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Come si paga" })).toHaveTextContent("Scrivo io le rate");
    expect(screen.queryByText(/le rate seguono il totale/)).not.toBeInTheDocument();
  });
  it("con un modello applicato lo mostra, con come si incassa", () => {
    render(<ComeSiPagaSelect offerti={offerti} valore="m1" onChange={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Come si paga" })).toHaveTextContent("Acconto e saldo");
    expect(screen.getByText("30% alla firma del contratto · 70% a fine lavori · le rate seguono il totale")).toBeInTheDocument();
  });
  it("scegliere un modello avvisa con il suo id", () => {
    const onChange = vi.fn();
    render(<ComeSiPagaSelect offerti={offerti} valore="" onChange={onChange} />);
    fireEvent.click(screen.getByRole("combobox", { name: "Come si paga" }));
    fireEvent.click(screen.getByText("Altro piano"));
    expect(onChange).toHaveBeenCalledWith("m2");
  });
  it("«Scrivo io le rate» avvisa con il testo vuoto", () => {
    const onChange = vi.fn();
    render(<ComeSiPagaSelect offerti={offerti} valore="m1" onChange={onChange} />);
    fireEvent.click(screen.getByRole("combobox", { name: "Come si paga" }));
    fireEvent.click(screen.getByRole("option", { name: "Scrivo io le rate" }));
    expect(onChange).toHaveBeenCalledWith("");
  });
  it("senza nessun modello da offrire non si vede", () => {
    const { container } = render(<ComeSiPagaSelect offerti={[]} valore="" onChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
