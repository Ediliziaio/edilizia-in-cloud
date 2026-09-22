import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
// Il voto del Profilo azienda si legge dal database: qui basta sapere che c'è.
vi.mock("@/components/preventivi/VotoOnlineDelProfilo", () => ({
  VotoOnlineDelProfilo: () => <p>Il voto del Profilo azienda</p>,
}));

import { FvPagesOrderEditor } from "@/components/fotovoltaico/FvPagesOrderEditor";
import type { FvPdfPageOrderItem } from "@/lib/fotovoltaico/pdfPages";

/** «Ordine e visibilità delle pagine» del Fotovoltaico con i blocchi della libreria (22/09/2026). */
afterEach(cleanup);

function Editor() {
  const [ordine, setOrdine] = useState<FvPdfPageOrderItem[] | null>(null);
  const [blocchi, setBlocchi] = useState<Record<string, unknown>>({});
  return (
    <>
      <FvPagesOrderEditor value={ordine} onChange={setOrdine} blocchi={blocchi} onBlocchi={setBlocchi} campoFoto={() => <div>foto</div>} />
      <output data-testid="salvato">{JSON.stringify({ ordine, blocchi })}</output>
    </>
  );
}
const salvato = () => JSON.parse(screen.getByTestId("salvato").textContent ?? "{}");

describe("editor Fotovoltaico: le pagine dei blocchi", () => {
  it("l'ordine di serie apre con la fiducia, e le pagine che promettono sono accese e chiedono di rileggerle", () => {
    render(<Editor />);
    expect(screen.getAllByText(/Promette qualcosa al cliente: rileggila/)).toHaveLength(4);
    expect(screen.getAllByText(/^(Chi siamo e garanzie|Investimento)$/).map((e) => e.textContent)).toEqual(["Chi siamo e garanzie", "Investimento"]);
  });

  it("la matita apre il blocco coi testi del fotovoltaico, e salva solo quello che cambia", () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Modifica Come funziona un impianto" }));
    fireEvent.change(screen.getByDisplayValue("Dal tuo tetto *alla tua presa*."), { target: { value: "Il sole, *in casa*." } });
    expect(salvato().blocchi).toEqual({ comeFunziona: { titolo: "Il sole, *in casa*." } });
    expect(salvato().ordine).toBeNull();
  });

  it("«Dicono di noi», FAQ e garanzie hanno la matita; il titolo delle garanzie di serie lo sceglie il documento", () => {
    render(<Editor />);
    expect(screen.getByRole("button", { name: "Modifica Dicono di noi" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Modifica FAQ" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Modifica Chi siamo e garanzie" }));
    expect(screen.getByLabelText("Occhiello")).toHaveValue("Garanzie e assistenza");
    expect(screen.getByLabelText("Titolo")).toHaveValue("");
    expect(screen.getByLabelText("Titolo")).toHaveAttribute("placeholder", expect.stringMatching(/anni di tranquillità/));
    fireEvent.change(screen.getByLabelText("Titolo"), { target: { value: "Dieci anni\nsenza pensieri." } });
    expect(salvato().blocchi).toEqual({ testata_garanzie: { titolo: "Dieci anni\nsenza pensieri." } });
  });
});
