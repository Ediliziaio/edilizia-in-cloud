import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

import { SerramentiPagesOrderEditor } from "@/components/serramenti/SerramentiPagesOrderEditor";
import type { SrPdfPageOrderItem } from "@/types/serramenti";

/** «Ordine pagine» dell'editor Serramenti con i blocchi della libreria (22/09/2026). */
afterEach(cleanup);

function Editor({ conBlocchi = true }: { conBlocchi?: boolean }) {
  const [ordine, setOrdine] = useState<SrPdfPageOrderItem[] | null>(null);
  const [blocchi, setBlocchi] = useState<Record<string, unknown>>({});
  return (
    <>
      <SerramentiPagesOrderEditor
        value={ordine}
        onChange={setOrdine}
        {...(conBlocchi ? { blocchi, onBlocchi: setBlocchi, campoFoto: () => <div>foto</div> } : {})}
      />
      <output data-testid="salvato">{JSON.stringify({ ordine, blocchi })}</output>
    </>
  );
}
const salvato = () => JSON.parse(screen.getByTestId("salvato").textContent ?? "{}");

describe("editor Serramenti: le pagine dei blocchi", () => {
  it("le quattro pagine che promettono sono spente e lo dicono", () => {
    render(<Editor />);
    expect(screen.getAllByText(/Spenta di serie: promette qualcosa al cliente/)).toHaveLength(4);
  });

  it("la matita apre testi e voci del blocco, e salva solo quello che cambia", () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Modifica Come è fatto un serramento" }));
    fireEvent.change(screen.getByDisplayValue("Cosa rende *isolante* un serramento."), { target: { value: "Le finestre *giuste*." } });
    expect(salvato().blocchi).toEqual({ comeFunziona: { titolo: "Le finestre *giuste*." } });
    // l'ordine delle pagine non si tocca
    expect(salvato().ordine).toBeNull();
  });

  it("senza chi salva i blocchi, niente matita", () => {
    render(<Editor conBlocchi={false} />);
    expect(screen.queryByRole("button", { name: /^Modifica / })).toBeNull();
  });
});
