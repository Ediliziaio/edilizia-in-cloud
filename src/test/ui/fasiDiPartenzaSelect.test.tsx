// src/test/ui/fasiDiPartenzaSelect.test.tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FasiDiPartenzaSelect } from "@/components/orders/FasiDiPartenzaSelect";
import type { ModelloFasi } from "@/lib/orders/modelliFasi";

const modello = (id: string, nome: string): ModelloFasi => ({ id, origine: "azienda", nome, descrizione: "", fasi: [] });
const offerti = [modello("m1", "Ristrutturazione completa"), modello("m2", "Solo bagno")];

afterEach(cleanup);

describe("FasiDiPartenzaSelect", () => {
  it("senza scelta dice «Nessuna: le scelgo dopo»", () => {
    render(<FasiDiPartenzaSelect offerti={offerti} valore="" onChange={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Fasi di lavoro" })).toHaveTextContent("Nessuna: le scelgo dopo");
  });
  it("mostra il modello scelto", () => {
    render(<FasiDiPartenzaSelect offerti={offerti} valore="m2" onChange={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Fasi di lavoro" })).toHaveTextContent("Solo bagno");
  });
  it("scegliere un modello avvisa con il suo id", () => {
    const onChange = vi.fn();
    render(<FasiDiPartenzaSelect offerti={offerti} valore="" onChange={onChange} />);
    fireEvent.click(screen.getByRole("combobox", { name: "Fasi di lavoro" }));
    fireEvent.click(screen.getByText("Ristrutturazione completa"));
    expect(onChange).toHaveBeenCalledWith("m1");
  });
  it("«Nessuna» avvisa con il testo vuoto", () => {
    const onChange = vi.fn();
    render(<FasiDiPartenzaSelect offerti={offerti} valore="m1" onChange={onChange} />);
    fireEvent.click(screen.getByRole("combobox", { name: "Fasi di lavoro" }));
    fireEvent.click(screen.getByText("Nessuna: le scelgo dopo"));
    expect(onChange).toHaveBeenCalledWith("");
  });
  it("senza nessun modello da offrire non si vede (niente riga inutile)", () => {
    const { container } = render(<FasiDiPartenzaSelect offerti={[]} valore="" onChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
