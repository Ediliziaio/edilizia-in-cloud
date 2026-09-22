import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

import { FvPagesOrderEditor } from "@/components/fotovoltaico/FvPagesOrderEditor";
import type { FvPdfPageOrderItem } from "@/lib/fotovoltaico/pdfPages";

/**
 * «Ordine e visibilità delle pagine» del Fotovoltaico (22/09/2026): ogni pagina che si
 * scrive ha la sua sezione nel menu «Pagine del PDF», e la matita della riga porta lì.
 */
afterEach(cleanup);

function Editor({ apriSezione }: { apriSezione?: (sezione: string) => void }) {
  const [ordine, setOrdine] = useState<FvPdfPageOrderItem[] | null>(null);
  const [blocchi, setBlocchi] = useState<Record<string, unknown>>({});
  return (
    <>
      <FvPagesOrderEditor value={ordine} onChange={setOrdine} blocchi={blocchi} onBlocchi={setBlocchi} campoFoto={() => <div>foto</div>} apriSezione={apriSezione} />
      <output data-testid="salvato">{JSON.stringify({ ordine, blocchi })}</output>
    </>
  );
}
const salvato = () => JSON.parse(screen.getByTestId("salvato").textContent ?? "{}");

describe("editor Fotovoltaico: le pagine nell'ordine delle pagine", () => {
  it("l'ordine di serie apre con la fiducia, e le pagine che promettono sono accese e chiedono di rileggerle", () => {
    render(<Editor />);
    expect(screen.getAllByText(/Promette qualcosa al cliente: rileggila/)).toHaveLength(4);
    expect(screen.getAllByText(/^(Chi siamo e garanzie|Investimento)$/).map((e) => e.textContent)).toEqual(["Chi siamo e garanzie", "Investimento"]);
  });

  it("la matita porta alla sezione della pagina, senza toccare niente", () => {
    const apri = vi.fn();
    render(<Editor apriSezione={apri} />);
    for (const nome of ["Chi siamo e garanzie", "Come funziona un impianto", "Sicurezza sul tetto", "Dicono di noi", "FAQ"]) {
      fireEvent.click(screen.getByRole("button", { name: `Modifica ${nome}` }));
    }
    expect(apri.mock.calls.map((c) => c[0])).toEqual(["page_chi_siamo", "page_come_funziona", "page_protezione", "page_recensioni", "page_faq"]);
    expect(salvato()).toEqual({ ordine: null, blocchi: {} });
  });

  it("le foto di garanzie, «Dicono di noi», domande e pagina finale stanno nelle loro sezioni: qui le altre", () => {
    render(<Editor apriSezione={vi.fn()} />);
    const foto = screen.getAllByRole("button", { name: /^Foto di / }).map((b) => b.getAttribute("aria-label"));
    for (const nome of ["Chi siamo e garanzie", "Dicono di noi", "FAQ", "CTA e firma"]) expect(foto).not.toContain(`Foto di ${nome}`);
    expect(foto).toEqual(expect.arrayContaining(["Foto di Componenti scelti", "Foto di Produzione", "Foto di Risparmio"]));
  });
});
