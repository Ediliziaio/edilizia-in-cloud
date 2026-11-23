// @vitest-environment jsdom
/**
 * 23/11/2026 — il lampo blu sulle fatture ricevute.
 *
 * La pagina ha due testate: la striscia dei mesi con i sei numeri (quando è
 * scelto un anno) e il riquadro blu scuro con quattro conteggi (quando sono
 * scelti «tutti gli anni»). La scelta si faceva su `mesi`, che era nullo finché
 * non arrivavano i saldi: i saldi aspettano l'azienda, che si risolve dopo il
 * primo disegno, e così partiva SEMPRE il riquadro blu per poi essere
 * sostituito dalla striscia mezzo secondo dopo. Si vedeva lampeggiare.
 *
 * Adesso la testata dipende solo dall'anno scelto, e la striscia si disegna
 * subito: senza saldi i mesi hanno gli importi delle fatture e pagato/residuo a
 * zero, e la striscia è già alla sua altezza definitiva.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import sorgentePagina from "@/pages/azienda/fatturazione/FattureRicevutePage.tsx?raw";
import { mesiRicevute, type RicevutaPerMesi } from "@/lib/fatturazione/mesiRicevute";
import { MonthlyTimeline } from "@/components/fatturazione/MonthlyTimeline";
import { RiepilogoFatture, TESTI_RICEVUTE } from "@/components/fatturazione/RiepilogoFatture";

const fattura: RicevutaPerMesi = {
  id: "f1", data_fattura: "2026-03-10", tipo_documento: "TD01",
  totale_documento: 122, imponibile_totale: 100, iva_totale: 22,
};

describe("la testata delle fatture ricevute non lampeggia", () => {
  it("la striscia dei mesi non aspetta i saldi: importi sì, pagato e residuo a zero", () => {
    const mesi = mesiRicevute([fattura], 2026, new Map(), "2026-11-23");
    expect(mesi).toHaveLength(12);
    const marzo = mesi[2];
    expect(marzo.docCount).toBe(1);
    expect(marzo.totalAmount).toBe(122);
    expect(marzo.imponibile).toBe(100);
    // Senza saldi non si sa cosa è stato pagato: zero, non un errore.
    expect(marzo.incassato).toBe(0);
    expect(marzo.daIncassare).toBe(0);
    expect(marzo.scaduto).toBe(0);
  });

  it("senza saldi la striscia è già tutta lì: dodici mesi e il totale dell'anno", () => {
    const mesi = mesiRicevute([fattura], 2026, new Map(), "2026-11-23");
    render(
      <MonthlyTimeline
        months={mesi} selectedMonth={null} onSelectMonth={vi.fn()}
        year={2026} onYearChange={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(12);
    expect(screen.getByLabelText("Totale 2026")).toBeTruthy();
    expect(screen.getByTitle(/Marzo 2026: 1 doc/)).toBeTruthy();
  });

  it("finché non è arrivata nessuna fattura i sei numeri non mostrano zeri finti", () => {
    const { container } = render(
      <RiepilogoFatture
        mesi={mesiRicevute([], 2026, new Map(), "2026-11-23")}
        meseScelto={null} testi={TESTI_RICEVUTE} etichettaDocumenti="fatture ricevute"
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("la pagina decide la testata dall'anno, non dai saldi", () => {
    const memoria = sorgentePagina.slice(
      sorgentePagina.indexOf("const mesi = useMemo("),
      sorgentePagina.indexOf("const mesi = useMemo(") + 400,
    );
    // Il guardiano: `!saldi` qui dentro è esattamente ciò che faceva partire il riquadro blu.
    expect(memoria).not.toMatch(/!saldi/);
    expect(memoria).toContain("saldi ?? SALDI_IN_ARRIVO");
  });
});
