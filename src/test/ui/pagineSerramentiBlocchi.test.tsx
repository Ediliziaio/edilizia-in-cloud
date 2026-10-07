import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

import { SerramentiPagesOrderEditor } from "@/components/serramenti/SerramentiPagesOrderEditor";
import type { SrPdfPageOrderItem } from "@/types/serramenti";

/**
 * «Ordine pagine» dell'editor Serramenti (22/09/2026): ogni pagina che si scrive ha la
 * sua sezione nel menu «Pagine del PDF», e la matita della riga porta lì.
 */
afterEach(cleanup);

function Editor({ apriSezione }: { apriSezione?: (sezione: string) => void }) {
  const [ordine, setOrdine] = useState<SrPdfPageOrderItem[] | null>(null);
  const [blocchi, setBlocchi] = useState<Record<string, unknown>>({});
  return (
    <>
      <SerramentiPagesOrderEditor
        value={ordine}
        onChange={setOrdine}
        blocchi={blocchi}
        onBlocchi={setBlocchi}
        campoFoto={() => <div>foto</div>}
        apriSezione={apriSezione}
      />
      <output data-testid="salvato">{JSON.stringify({ ordine, blocchi })}</output>
    </>
  );
}
const salvato = () => JSON.parse(screen.getByTestId("salvato").textContent ?? "{}");

describe("editor Serramenti: le pagine nell'ordine delle pagine", () => {
  it("le quattro pagine che promettono sono accese e chiedono di rileggerle", () => {
    render(<Editor />);
    expect(screen.getAllByText(/Promette qualcosa al cliente: rileggila/)).toHaveLength(4);
  });

  it("la matita porta alla sezione della pagina, senza toccare niente", () => {
    const apri = vi.fn();
    render(<Editor apriSezione={apri} />);
    for (const nome of ["Come è fatto un serramento", "Le nostre garanzie", "I nostri lavori", "Dicono di noi", "FAQ — obiezioni anticipate", "Il tuo percorso"]) {
      fireEvent.click(screen.getByRole("button", { name: `Modifica ${nome}` }));
    }
    expect(apri.mock.calls.map((c) => c[0])).toEqual(["page_come_funziona", "page_garanzie", "page_lavori", "page_recensioni", "page_faq", "page_percorso"]);
    expect(salvato()).toEqual({ ordine: null, blocchi: {} });
  });

  it("qui restano le foto delle pagine senza sezione: proposta, allegato, dettagli economici", () => {
    render(<Editor apriSezione={vi.fn()} />);
    const foto = screen.getAllByRole("button", { name: /^Foto di / }).map((b) => b.getAttribute("aria-label"));
    expect(foto).toEqual(["Foto di Proposta di intervento", "Foto di Allegato tecnico", "Foto di Proposta economica"]);
  });

  it("la pagina economica ha due foto: sotto il prezzo e in fondo ai dettagli; le altre una sola", () => {
    render(<Editor apriSezione={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Foto di Proposta economica" }));
    expect(screen.getByText("Foto sotto il prezzo")).toBeTruthy();
    expect(screen.getByText("Foto in fondo ai dettagli economici")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Foto di Proposta di intervento" }));
    expect(screen.getByText("Foto in fondo alla proposta")).toBeTruthy();
  });

  it("senza chi apre le sezioni, niente matita", () => {
    render(<Editor />);
    expect(screen.queryByRole("button", { name: /^Modifica / })).toBeNull();
  });
});
