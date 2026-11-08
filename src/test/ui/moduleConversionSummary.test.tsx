import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModuleConversionSummary } from "@/components/moduli/ModuleConversionSummary";
import type { AnteprimaConversioneModulo } from "@/lib/moduli/convertiInCommessa";

afterEach(cleanup);
const voce = (id: string, proposta: boolean) => ({ id, nome: id, quantita: 1, unita: "cad", proposta });
const riepilogo: AnteprimaConversioneModulo = {
  materiali: [], fasi: [{ name: "Smontaggio", notes: "1 corpo" }], imponibile: 100, aliquota: 10, totale: 110, impronta: "x", esclusi: 0, descrizione: "Bagno",
  voci_materiale: [voce("Box doccia", true), voce("Smontaggio", false)],
};

describe("anteprima della commessa", () => {
  it("in vista ci sono solo le cose da comprare, il lavoro sta a parte e si può aggiungere", () => {
    const onCambiaVoci = vi.fn();
    render(<ModuleConversionSummary riepilogo={riepilogo} vociScelte={new Set(["Box doccia"])} onCambiaVoci={onCambiaVoci} />);
    expect(screen.getByRole("checkbox", { name: "Box doccia" })).toBeChecked();
    const altra = screen.getByRole("checkbox", { name: "Smontaggio", hidden: true });
    expect(altra.closest("details")).not.toBeNull();
    expect(altra).not.toBeChecked();
    fireEvent.click(altra);
    expect([...onCambiaVoci.mock.calls[0][0]]).toEqual(["Box doccia", "Smontaggio"]);
  });
  it("non dice più che non c'è niente da ordinare", () => {
    render(<ModuleConversionSummary riepilogo={riepilogo} vociScelte={new Set()} onCambiaVoci={vi.fn()} />);
    expect(screen.queryByText(/Nessun articolo da ordinare/)).toBeNull();
  });
});
