import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AnalisiInterventoEditor } from "@/components/serramenti/AnalisiInterventoEditor";
import { nuovaAnalisiIntervento, type AnalisiIntervento } from "@/lib/serramenti/analisiIntervento";
function Prova() {
  const [a, setA] = useState<AnalisiIntervento | null>(null);
  return <><AnalisiInterventoEditor value={a} onChange={setA} /><output data-testid="salvato">{JSON.stringify(a)}</output></>;
}
describe("Valutazione nel preventivatore", () => {
  it("seleziona standard, motivazione e posa senza prestazioni predefinite", () => {
    render(<Prova />); fireEvent.click(screen.getByText("Aggiungi valutazione dell'infisso esistente"));
    fireEvent.change(screen.getByLabelText("Serramento attuale"), { target: { value: "alluminio_freddo" } });
    fireEvent.change(screen.getByLabelText("Ripristini di intonaci e finiture"), { target: { value: "esclusa" } });
    fireEvent.change(screen.getByLabelText("Perche questa soluzione per il cliente"), { target: { value: "Comfort vicino al divano" } });
    const a = JSON.parse(screen.getByTestId("salvato").textContent!);
    expect(a.esistente).toBe("alluminio_freddo"); expect(a.uwPrima).toBeNull(); expect(a.uwDopo).toBeNull();
    expect(a.posa.ripristini).toBe("esclusa"); expect(a.motivo).toContain("divano");
    fireEvent.change(screen.getByLabelText("Uw prima (W/m²K), se disponibile"), { target: { value: "999" } });
    expect(screen.getByText("Inserisci un valore tra 0 e 20.")).toBeInTheDocument();
    expect(JSON.parse(screen.getByTestId("salvato").textContent!).esistente).toBe("alluminio_freddo");
    fireEvent.click(screen.getByText("Rimuovi valutazione dal preventivo"));
    expect(JSON.parse(screen.getByTestId("salvato").textContent!).attiva).toBe(false);
  });
  it("conserva le ipotesi economiche disattivando la valutazione", () => {
    const a = nuovaAnalisiIntervento(); a.risparmio = { uwAttuale: 3, uwNuovo: 1, bolletta: 1000, m2Casa: 100, zona: "E", superficie: 10, fonteBolletta: "cliente" };
    let salvato: AnalisiIntervento | null = null;
    render(<AnalisiInterventoEditor value={a} onChange={v => { salvato = v; }} />);
    fireEvent.click(screen.getByText("Rimuovi valutazione dal preventivo"));
    expect(salvato!.risparmio).toEqual(a.risparmio); expect(salvato!.attiva).toBe(false);
  });
});
