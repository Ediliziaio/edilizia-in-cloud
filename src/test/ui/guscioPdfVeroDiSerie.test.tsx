/**
 * A destra dei preventivatori, di serie, il PDF vero (07/11/2026).
 *
 * Florin: «vorrei vedere l'anteprima proprio del PDF che si va a generare». Le altre prove partono
 * dall'anteprima veloce (src/test/setup.ts); qui si toglie quell'impostazione e si guarda la scelta vera.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hammer } from "lucide-react";
import type { ReactElement } from "react";

vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewMargins: false, canViewCosts: false }) }));

import { GuscioEdile } from "@/components/preventivatore/GuscioEdile";

const g = globalThis as typeof globalThis & { __anteprimaDiSerie?: string };
let prima: string | undefined;
beforeEach(() => { prima = g.__anteprimaDiSerie; delete g.__anteprimaDiSerie; localStorage.clear(); });
afterEach(() => { g.__anteprimaDiSerie = prima; localStorage.clear(); });

const anteprima = { cliente: { nome: "Mario Rossi", righe: [] }, gruppi: [], totali: [], totaleDocumento: 1000, avvisi: [], note: [] } as never;

function disegna(pdfVero?: (attivo: boolean) => ReactElement) {
  return render(
    <GuscioEdile
      testata={{ icona: Hammer, titolo: "BGN-2026-001", onEsci: () => {} }}
      passi={[{ key: "cliente", label: "Cliente" }]}
      corrente="cliente"
      completati={new Set()}
      onSelect={() => {}}
      anteprima={anteprima}
      statoSalvataggio="salvato"
      piede={{ onIndietro: () => {}, indietroDisabilitato: true, onAvanti: () => {}, etichettaAvanti: "Salva", avantiDisabilitato: false, inCorso: false, ultimoPasso: false }}
      pdfVero={pdfVero}
    >
      <p>passo</p>
    </GuscioEdile>,
  );
}

describe("Il pannello di destra", () => {
  it("di serie mostra il PDF vero del preventivo", () => {
    disegna(() => <div data-testid="pdf-vero" />);
    expect(screen.getAllByTestId("pdf-vero").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "PDF vero" })[0]).toHaveAttribute("aria-pressed", "true");
  });

  it("si torna all'anteprima veloce con un clic, e la scelta resta per la prossima volta", () => {
    const { unmount } = disegna(() => <div data-testid="pdf-vero" />);
    fireEvent.click(screen.getAllByRole("button", { name: "Anteprima" })[0]);
    expect(screen.queryByTestId("pdf-vero")).toBeNull();
    unmount();
    disegna(() => <div data-testid="pdf-vero" />);
    expect(screen.queryByTestId("pdf-vero")).toBeNull();
    expect(localStorage.getItem("preventivatore_anteprima_modalita")).toBe("veloce");
  });

  it("un preventivo non ancora salvato non ha il PDF: resta l'anteprima veloce, e lo dice", () => {
    disegna(undefined);
    expect(screen.queryByRole("button", { name: "PDF vero" })).toBeNull();
    expect(screen.getAllByText(/Il PDF vero compare qui appena il preventivo è salvato/).length).toBeGreaterThan(0);
  });

  it("sotto i 1280 px la colonna non c'è: il PDF non si prepara", () => {
    const attivi: boolean[] = [];
    disegna((attivo) => { attivi.push(attivo); return <div data-testid="pdf-vero" />; });
    // jsdom: matchMedia risponde sempre «no», come uno schermo stretto.
    expect(attivi.every((a) => a === false)).toBe(true);
  });
});
