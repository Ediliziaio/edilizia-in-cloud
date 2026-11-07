/**
 * A destra del fotovoltaico, il documento vero (07/11/2026): la pagina di `fv-genera-pdf` in modalità
 * `solo_anteprima`, rifatta dopo ogni salvataggio del progetto e non a ogni tasto (ogni giro chiede a Google
 * le viste satellitari).
 */
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
// jsdom non ha ResizeObserver: il pannello lo usa per adattare il foglio alla colonna.
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));

import { PdfVeroFotovoltaico } from "@/components/fotovoltaico/PdfVeroFotovoltaico";

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue({ data: { html: "<html><body>Preventivo FV</body></html>", pages_count: 12 }, error: null });
});

const aspetta = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe("Il documento vero del fotovoltaico", () => {
  it("chiede la pagina senza salvarla, coi dati dell'impianto, e dice quante pagine ha", async () => {
    render(<PdfVeroFotovoltaico progettoId="p1" versione="1" extra={{ azimut: "S" }} attivo />);
    await aspetta();
    expect(invoke).toHaveBeenCalledWith("fv-genera-pdf", { body: { progetto_id: "p1", tipo: "vendita", solo_anteprima: true, azimut: "S" } });
    expect(screen.getByRole("status")).toHaveTextContent("12 pagine");
    expect(screen.getByTitle("Il documento vero del preventivo fotovoltaico")).toHaveAttribute("srcdoc", "<html><body>Preventivo FV</body></html>");
  });

  it("si rifà dopo un salvataggio, non a ogni rendering", async () => {
    const { rerender } = render(<PdfVeroFotovoltaico progettoId="p1" versione="1" attivo />);
    await aspetta();
    rerender(<PdfVeroFotovoltaico progettoId="p1" versione="1" attivo />);
    await aspetta();
    expect(invoke).toHaveBeenCalledTimes(1);
    rerender(<PdfVeroFotovoltaico progettoId="p1" versione="2" attivo />);
    await aspetta();
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("a colonna chiusa non chiede niente", async () => {
    render(<PdfVeroFotovoltaico progettoId="p1" versione="1" attivo={false} />);
    await aspetta();
    expect(invoke).not.toHaveBeenCalled();
    expect(screen.getByText(/si prepara quando il pannello è aperto/)).toBeInTheDocument();
  });

  it("se la pagina non si fa, lo dice col motivo", async () => {
    invoke.mockResolvedValue({ data: null, error: { context: { json: async () => ({ error: "progetto non trovato" }) } } });
    render(<PdfVeroFotovoltaico progettoId="p1" versione="1" attivo />);
    await aspetta(); await aspetta();
    expect(screen.getByText(/Il documento non si è generato: progetto non trovato/)).toBeInTheDocument();
  });
});
