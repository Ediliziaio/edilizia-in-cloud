import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
// Il voto del Profilo azienda si legge dal database: qui basta sapere che c'è.
vi.mock("@/components/preventivi/VotoOnlineDelProfilo", () => ({
  VotoOnlineDelProfilo: () => <p>Il voto del Profilo azienda</p>,
}));

import { SerramentiPagesOrderEditor } from "@/components/serramenti/SerramentiPagesOrderEditor";
import type { SrPdfPageOrderItem } from "@/types/serramenti";

/** «Ordine pagine» dell'editor Serramenti con i blocchi della libreria (22/09/2026). */
afterEach(cleanup);

function Editor({ conBlocchi = true, contenuti }: { conBlocchi?: boolean; contenuti?: Partial<Record<"recensioni" | "domande" | "garanzie" | "lavori", ReactNode>> }) {
  const [ordine, setOrdine] = useState<SrPdfPageOrderItem[] | null>(null);
  const [blocchi, setBlocchi] = useState<Record<string, unknown>>({});
  return (
    <>
      <SerramentiPagesOrderEditor
        value={ordine}
        onChange={setOrdine}
        {...(conBlocchi ? { blocchi, onBlocchi: setBlocchi, campoFoto: () => <div>foto</div>, contenuti } : {})}
      />
      <output data-testid="salvato">{JSON.stringify({ ordine, blocchi })}</output>
    </>
  );
}
const salvato = () => JSON.parse(screen.getByTestId("salvato").textContent ?? "{}");

describe("editor Serramenti: le pagine dei blocchi", () => {
  it("le quattro pagine che promettono sono accese e chiedono di rileggerle", () => {
    render(<Editor />);
    expect(screen.getAllByText(/Promette qualcosa al cliente: rileggila/)).toHaveLength(4);
  });

  it("la matita apre testi e voci del blocco, e salva solo quello che cambia", () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Modifica Come è fatto un serramento" }));
    fireEvent.change(screen.getByDisplayValue("Cosa rende *isolante* un serramento."), { target: { value: "Le finestre *giuste*." } });
    expect(salvato().blocchi).toEqual({ comeFunziona: { titolo: "Le finestre *giuste*." } });
    // l'ordine delle pagine non si tocca
    expect(salvato().ordine).toBeNull();
  });

  it("domande, garanzie, lavori e «Dicono di noi»: la matita apre la testata di serie e il contenuto della pagina", () => {
    render(<Editor contenuti={{ domande: <p>Le domande del modello</p> }} />);
    for (const nome of ["Le nostre garanzie", "I nostri lavori", "Dicono di noi"]) {
      expect(screen.getByRole("button", { name: `Modifica ${nome}` })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Modifica FAQ — obiezioni anticipate" }));
    expect(screen.getByLabelText("Occhiello")).toHaveValue("Domande frequenti");
    expect(screen.getByLabelText("Titolo")).toHaveValue("Le risposte\nprima della conferma.");
    expect(screen.getByText("Le domande del modello")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Introduzione"), { target: { value: "Quello che ci chiedono tutti." } });
    expect(salvato().blocchi).toEqual({ testata_domande: { intro: "Quello che ci chiedono tutti." } });
    expect(salvato().ordine).toBeNull();
  });

  it("senza chi salva i blocchi, niente matita", () => {
    render(<Editor conBlocchi={false} />);
    expect(screen.queryByRole("button", { name: /^Modifica / })).toBeNull();
  });
});
