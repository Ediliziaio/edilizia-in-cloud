/**
 * I bottoni dei complementi nel box di una finestra: uno per tipologia del
 * listino, al singolare; mentre uno si aggiunge gli altri aspettano, e senza
 * tipologie da complemento resta il complemento a mano.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BarraComplementi } from "@/components/serramenti/BarraComplementi";
import type { TipologiaListino } from "@/lib/listino/lineeListino";

const tipologia = (chiave: string, nome: string) =>
  ({ chiave, nome, standard: null, linee: [] }) as unknown as TipologiaListino;

afterEach(() => cleanup());

describe("BarraComplementi", () => {
  const tipologie = [tipologia("tap", "Tapparelle"), tipologia("zan", "Zanzariere"), tipologia("cas", "Cassonetti")];

  it("un bottone per tipologia, al singolare, che aggiunge quella tipologia alla finestra", () => {
    const onAggiungi = vi.fn();
    render(<BarraComplementi tipologie={tipologie} onAggiungi={onAggiungi} destinazione="Alla finestra 3" />);

    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Tapparella", "Zanzariera", "Cassonetto"]);
    fireEvent.click(screen.getByRole("button", { name: "Alla finestra 3: aggiungi Cassonetto" }));
    expect(onAggiungi).toHaveBeenCalledWith(tipologie[2]);
  });

  it("mentre un complemento si aggiunge i bottoni aspettano; senza tipologie resta il complemento a mano", () => {
    const onAMano = vi.fn();
    const { rerender } = render(<BarraComplementi tipologie={tipologie} onAggiungi={vi.fn()} onAMano={onAMano} inCorso="tap" occupata />);
    expect(screen.getAllByRole("button").every((b) => (b as HTMLButtonElement).disabled)).toBe(true);

    rerender(<BarraComplementi tipologie={[]} onAggiungi={vi.fn()} onAMano={onAMano} />);
    fireEvent.click(screen.getByRole("button", { name: "Complemento a mano" }));
    expect(onAMano).toHaveBeenCalledTimes(1);
  });
});
