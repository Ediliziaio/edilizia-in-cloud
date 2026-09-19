/**
 * Il calendario dentro le pagine del sito (CalendarioInPagina, 19/09/2026).
 *
 * Tiene fermo:
 *   · la prenotazione confermata nel riquadro arriva alla pagina che lo ospita
 *     (onPrenotato), che la conta come conversione;
 *   · conta solo il nostro riquadro: lo stesso messaggio da un'altra origine o
 *     da un'altra finestra non è una prenotazione;
 *   · l'altezza la dice la pagina dentro il riquadro, con un tetto.
 */
import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CalendarioInPagina } from "@/components/marketing/CalendarioInPagina";

function monta(onPrenotato = vi.fn()) {
  render(<CalendarioInPagina slug="demo-edilizia-in-cloud" onPrenotato={onPrenotato} />);
  const riquadro = document.querySelector("iframe") as HTMLIFrameElement;
  return { riquadro, onPrenotato };
}

function messaggio(dati: unknown, { origin = window.location.origin, source }: { origin?: string; source: Window | null }) {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data: dati, origin, source }));
  });
}

const prenotato = {
  source: "eic-prenota",
  event: "prenotato",
  detail: { date: "2026-09-22", time: "09:30", calendar: "demo-edilizia-in-cloud" },
};

describe("CalendarioInPagina", () => {
  it("apre la pagina di prenotazione in versione riquadro", () => {
    const { riquadro } = monta();
    expect(riquadro).toHaveAttribute("src", "/prenota/demo-edilizia-in-cloud?embed=1");
  });

  it("la prenotazione confermata nel riquadro arriva alla pagina", () => {
    const { riquadro, onPrenotato } = monta();
    messaggio(prenotato, { source: riquadro.contentWindow });
    expect(onPrenotato).toHaveBeenCalledTimes(1);
    expect(onPrenotato).toHaveBeenCalledWith({ date: "2026-09-22", time: "09:30", calendar: "demo-edilizia-in-cloud" });
  });

  it("senza dettagli arrivano dei null, non undefined", () => {
    const { riquadro, onPrenotato } = monta();
    messaggio({ source: "eic-prenota", event: "prenotato" }, { source: riquadro.contentWindow });
    expect(onPrenotato).toHaveBeenCalledWith({ date: null, time: null, calendar: null });
  });

  it("un messaggio da un'altra origine non è una prenotazione", () => {
    const { riquadro, onPrenotato } = monta();
    messaggio(prenotato, { origin: "https://sito-qualsiasi.example", source: riquadro.contentWindow });
    expect(onPrenotato).not.toHaveBeenCalled();
  });

  it("un messaggio da un'altra finestra non è una prenotazione", () => {
    const { onPrenotato } = monta();
    messaggio(prenotato, { source: window });
    expect(onPrenotato).not.toHaveBeenCalled();
  });

  it("l'altezza la decide la pagina nel riquadro, fino a 2000px", () => {
    const { riquadro } = monta();
    expect(riquadro.style.height).toBe("720px");

    messaggio({ source: "eic-prenota", event: "altezza", height: 900 }, { source: riquadro.contentWindow });
    expect(riquadro.style.height).toBe("908px");

    messaggio({ source: "eic-prenota", event: "altezza", height: 9000 }, { source: riquadro.contentWindow });
    expect(riquadro.style.height).toBe("2000px");

    // Un'altezza assurda (la pagina non ancora disegnata) non schiaccia il riquadro.
    messaggio({ source: "eic-prenota", event: "altezza", height: 40 }, { source: riquadro.contentWindow });
    expect(riquadro.style.height).toBe("2000px");
  });
});
