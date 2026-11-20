import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ComputoSceltaCopertina } from "@/components/computo/ComputoSceltaCopertina";
import { modelloComputoDiSerie } from "@/lib/computo/modelloComputo";

describe("scelta della copertina con frecce", () => {
  it("sfoglia tutti gli otto stili senza cambiare il documento finché non si sceglie una copertina", () => {
    const onChange = vi.fn(), modello = modelloComputoDiSerie();
    render(<ComputoSceltaCopertina modello={modello} colore="#244C3A" font="Arial" onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Copertine precedenti" })).toBeDisabled();
    for (const nome of ["Architettura", "Editoriale", "Compatta", "Essenziale"]) expect(screen.getByRole("radio", { name: nome })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Altre copertine" }));
    expect(screen.getByRole("button", { name: "Altre copertine" })).toBeDisabled();
    for (const nome of ["Panoramica", "Dinamica", "Cornice", "Laterale"]) expect(screen.getByRole("radio", { name: nome })).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", { name: "Laterale" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ copertina: "colonna", copertinaSeparata: true, sezioni: expect.objectContaining({ copertina: true }) }));
  });
  it.each(["fascia", "sobria"] as const)("riattiva davvero la copertina anche scegliendo di nuovo %s", copertina => {
    const onChange = vi.fn(), modello = { ...modelloComputoDiSerie(), copertina };
    modello.sezioni.copertina = false;
    render(<ComputoSceltaCopertina modello={modello} colore="#244C3A" font="Arial" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: copertina === "fascia" ? "Compatta" : "Essenziale" }));
    expect(onChange.mock.calls[0][0]).toMatchObject({ copertina, copertinaSeparata: true, sezioni: { copertina: true } });
  });
  it("apre il gruppo dello stile già salvato e mantiene la scelta mentre si sfogliano gli altri", () => {
    const onChange = vi.fn(), modello = { ...modelloComputoDiSerie(), copertina: "cornice" as const };
    render(<ComputoSceltaCopertina modello={modello} colore="#244C3A" font="Arial" onChange={onChange} />);
    expect(screen.getByRole("radio", { name: "Cornice" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("button", { name: "Copertine precedenti" }));
    expect(screen.getByRole("radio", { name: "Architettura" })).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
