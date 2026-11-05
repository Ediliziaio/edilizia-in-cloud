import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { CostiSenzaFaseDialog, costiPerFornitore, type CostoDaSistemare } from "@/components/orders/CostiSenzaFase";

const costo = (id: string, importo: number, fornitore: string | null): CostoDaSistemare => ({ id, importo, nome: `Fattura ${id}`, data: "2026-10-05", fornitore });
const costi = [costo("a", 100, "Ditta Uno"), costo("b", 900, "Ditta Due"), costo("c", 50, "Ditta Uno")];
const fasi = [{ id: "f1", name: "Murature" }, { id: "f2", name: "Impianti" }];
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Costi senza fase", () => {
  it("raggruppa per fornitore, dal più pesante", () => {
    expect(costiPerFornitore(costi).map((g) => [g.nome, g.costi.length, g.totale])).toEqual([["Ditta Due", 1, 900], ["Ditta Uno", 2, 150]]);
    expect(costiPerFornitore([costo("x", 1, null)])[0].nome).toBe("Senza fornitore");
  });
  it("assegna tutti i costi di un fornitore, solo dopo aver scelto la fase", () => {
    const onAssegna = vi.fn();
    render(<CostiSenzaFaseDialog aperto onChiudi={vi.fn()} costi={costi} fasi={fasi} inCorso={false} onAssegna={onAssegna} />);
    const dialogo = within(screen.getByRole("dialog"));
    expect(dialogo.getByRole("button", { name: "Assegna 2" })).toBeDisabled();
    fireEvent.change(dialogo.getByLabelText("Fase di tutti i costi di Ditta Uno"), { target: { value: "f2" } });
    fireEvent.click(dialogo.getByRole("button", { name: "Assegna 2" }));
    expect(onAssegna).toHaveBeenCalledExactlyOnceWith(["a", "c"], "f2");
  });
  it("aperto il fornitore, si assegna anche una fattura sola", () => {
    const onAssegna = vi.fn();
    render(<CostiSenzaFaseDialog aperto onChiudi={vi.fn()} costi={costi} fasi={fasi} inCorso={false} onAssegna={onAssegna} />);
    fireEvent.click(screen.getByRole("button", { name: /Ditta Uno/ }));
    fireEvent.change(screen.getByLabelText("Fase di Fattura c"), { target: { value: "f1" } });
    expect(onAssegna).toHaveBeenCalledExactlyOnceWith(["c"], "f1");
  });
});
