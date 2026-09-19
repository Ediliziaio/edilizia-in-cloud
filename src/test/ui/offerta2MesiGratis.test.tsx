/**
 * /offerta-2-mesi-gratis — la pagina di vendita dell'annuale (19/09/2026).
 *
 * Tiene fermo:
 *   · i numeri dell'offerta tornano tra loro: annuale = 10 mensilità, primo
 *     anno sul mensile = 12 mensilità + avvio, risparmio = la differenza;
 *   · ogni «Prenota» porta al calendario in fondo alla pagina, e il calendario
 *     è quello della demo di Edilizia in Cloud;
 *   · una prenotazione confermata nel calendario è la conversione della pagina
 *     (Pixel «Lead» + evento GA4);
 *   · su telefono la barra «Prenota» c'è solo quando nessun altro pulsante è a
 *     portata: non accanto a quelli dell'hero, non sopra il calendario; e il
 *     pulsante WhatsApp sale e scende con lei.
 */
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const trackPixel = vi.fn();
vi.mock("@/lib/meta/fbcTracker", () => ({
  trackPixel: (...args: unknown[]) => trackPixel(...args),
}));

// Le sezioni della home hanno le loro animazioni e i loro dati: qui bastano
// dei segnaposto, la pagina si prova per quello che aggiunge.
vi.mock("@/components/landing/LandingNavbar", () => ({ default: () => <nav /> }));
vi.mock("@/components/landing/PlatformMockup", () => ({ default: () => <div /> }));
vi.mock("@/components/landing/StatsSection", () => ({ default: () => <section /> }));
vi.mock("@/components/landing/PainPointsSection", () => ({ default: () => <section /> }));
vi.mock("@/components/landing/SolutionSection", () => ({ default: () => <section id="come-funziona" /> }));
vi.mock("@/components/landing/ModulesSection", () => ({ default: () => <section /> }));
vi.mock("@/components/landing/TestimonialsSection", () => ({ default: () => <section /> }));
vi.mock("@/components/landing/LandingFooter", () => ({ default: () => <footer /> }));

import Offerta2MesiGratis from "@/pages/Offerta2MesiGratis";
import { DOMANDE_OFFERTA, PIANI_OFFERTA } from "@/data/offerta2MesiGratis";

/** «1.270 €» → 1270, «da 547 €» → 547, «Avvio Guidato incluso» → 0. */
const euro = (testo: string) => Number(testo.replace(/\D/g, ""));

// Un IntersectionObserver finto: il test decide che cosa è sullo schermo.
const osservati = new Map<string, (inVista: boolean) => void>();
class OsservatoreFinto {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(elemento: Element) {
    osservati.set(elemento.id, (inVista) =>
      this.callback(
        [{ isIntersecting: inVista, target: elemento } as unknown as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      ),
    );
  }
  disconnect() {
    osservati.clear();
  }
  unobserve() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}
const vede = (id: string, inVista: boolean) => act(() => osservati.get(id)?.(inVista));

function telefono(si: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: si && query === "(max-width: 767px)",
      media: query,
      onchange: null as MediaQueryList["onchange"],
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

async function apri() {
  const risultato = render(
    <MemoryRouter initialEntries={["/offerta-2-mesi-gratis"]}>
      <Offerta2MesiGratis />
    </MemoryRouter>,
  );
  // Le sezioni della home arrivano con lazy(): si aspetta che entrino.
  await act(async () => {});
  return risultato;
}

const lift = () => document.documentElement.style.getPropertyValue("--eic-chat-lift");

beforeEach(() => {
  trackPixel.mockReset();
  vi.stubGlobal("IntersectionObserver", OsservatoreFinto);
  telefono(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as { gtag?: unknown }).gtag;
  osservati.clear();
});

describe("i numeri dell'offerta", () => {
  it("tornano tra loro, piano per piano", () => {
    expect(PIANI_OFFERTA).toHaveLength(3);
    for (const p of PIANI_OFFERTA) {
      const mensile = euro(p.mensile);
      const avvio = euro(p.avvio);
      // Con l'annuale l'avvio è incluso (0) oppure a metà prezzo.
      const avvioConAnnuale = euro(p.avvioAnnuale);
      expect([0, avvio / 2]).toContain(avvioConAnnuale);

      expect(euro(p.annuale)).toBe(10 * mensile);
      expect(euro(p.primoAnnoMensile)).toBe(12 * mensile + avvio);
      expect(euro(p.risparmio)).toBe(euro(p.primoAnnoMensile) - euro(p.annuale) - avvioConAnnuale);
    }
  });

  it("un solo piano è quello consigliato: il Professionista", () => {
    expect(PIANI_OFFERTA.filter((p) => p.consigliato).map((p) => p.nome)).toEqual(["Professionista"]);
  });
});

describe("la pagina", () => {
  it("titolo, indirizzo canonico, prezzi annuali e garanzie", async () => {
    await apri();

    // Prima la promessa, poi l'offerta.
    const titolo = screen.getByRole("heading", { level: 1 });
    expect(titolo).toHaveTextContent("Aumenta i tuoi margini e i tuoi guadagni.");
    expect(titolo).toHaveTextContent("Libera tempo dalla gestione.");
    expect(screen.getByText(/^Dì addio a software sparsi, fogli Excel/)).toBeInTheDocument();
    expect(screen.getByText("2 mesi te li regaliamo noi.")).toBeInTheDocument();
    expect(document.title).toBe("Offerta 2 mesi gratis — Gestionale Edilizia in Cloud");
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://www.ediliziaincloud.com/offerta-2-mesi-gratis/",
    );

    expect(screen.getByRole("heading", { level: 2, name: "12 mesi al prezzo di 10." })).toBeInTheDocument();
    for (const p of PIANI_OFFERTA) {
      expect(screen.getByRole("heading", { level: 3, name: p.nome })).toBeInTheDocument();
      expect(screen.getByText(p.annuale)).toBeInTheDocument();
    }

    for (const garanzia of [
      "Operativo in 30 giorni, o il canone non parte",
      "I tuoi dati escono quando vuoi",
      "Il margine in due minuti",
      "60 giorni per ripensarci",
      "Prezzo bloccato finché resti",
    ]) {
      expect(screen.getByRole("heading", { level: 3, name: garanzia })).toBeInTheDocument();
    }
  });

  it("ogni «Prenota» porta al calendario, e il calendario è quello della demo", async () => {
    await apri();

    const pulsanti = screen.getAllByRole("link", { name: /prenota/i });
    expect(pulsanti.length).toBeGreaterThanOrEqual(6);
    for (const pulsante of pulsanti) expect(pulsante).toHaveAttribute("href", "#prenota");

    const calendario = document.getElementById("prenota");
    expect(calendario).not.toBeNull();
    expect(calendario?.querySelector("iframe")).toHaveAttribute("src", "/prenota/demo-edilizia-in-cloud?embed=1");
  });

  it("le domande sono anche nei dati strutturati (FAQPage)", async () => {
    await apri();

    const script = document.getElementById("jsonld-faq-offerta");
    expect(script).not.toBeNull();
    const dati = JSON.parse(script?.textContent ?? "{}") as { "@type": string; mainEntity: { name: string }[] };
    expect(dati["@type"]).toBe("FAQPage");
    expect(dati.mainEntity.map((d) => d.name)).toEqual(DOMANDE_OFFERTA.map((d) => d.q));
  });

  it("una prenotazione confermata nel calendario è una conversione", async () => {
    const gtag = vi.fn();
    (window as unknown as { gtag: typeof gtag }).gtag = gtag;
    await apri();

    const riquadro = document.querySelector("#prenota iframe") as HTMLIFrameElement;
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: window.location.origin,
          source: riquadro.contentWindow,
          data: { source: "eic-prenota", event: "prenotato", detail: { date: "2026-09-22", time: "09:30" } },
        }),
      );
    });

    expect(trackPixel).toHaveBeenCalledWith("Lead", {
      content_name: "offerta_2_mesi_gratis",
      content_category: "prenotazione_demo",
    });
    expect(gtag).toHaveBeenCalledWith("event", "prenotazione_demo", {
      pagina: "offerta-2-mesi-gratis",
      giorno: "2026-09-22",
      ora: "09:30",
    });
  });

  it("su telefono la barra «Prenota» c'è solo tra i pulsanti dell'hero e il calendario", async () => {
    telefono(true);
    await apri();
    expect([...osservati.keys()].sort()).toEqual(["prenota", "pulsanti-hero"]);

    // In cima: i pulsanti dell'hero sono lì, la barra aspetta.
    const barra = screen.getByRole("link", { name: "Prenota la demo · 2 mesi gratis", hidden: true });
    const nascosta = () => {
      expect(barra.parentElement).toHaveClass("translate-y-full");
      expect(barra.parentElement).toHaveAttribute("aria-hidden", "true");
      expect(barra).toHaveAttribute("tabindex", "-1");
      expect(lift()).toBe("0px");
    };
    const visibile = () => {
      expect(barra.parentElement).not.toHaveClass("translate-y-full");
      expect(barra.parentElement).toHaveAttribute("aria-hidden", "false");
      expect(barra).not.toHaveAttribute("tabindex");
      expect(lift()).toBe("76px");
    };
    vede("pulsanti-hero", true);
    nascosta();

    // Passati i pulsanti dell'hero, la barra sale.
    vede("pulsanti-hero", false);
    visibile();

    // Sopra il calendario coprirebbe gli orari: scende.
    vede("prenota", true);
    nascosta();

    // Oltre il calendario (domande, chiusura) torna.
    vede("prenota", false);
    visibile();
  });

  it("su desktop il pulsante WhatsApp resta dov'è, e uscendo dalla pagina torna giù", async () => {
    const { unmount } = await apri();
    expect(lift()).toBe("0px");

    telefono(true);
    unmount();
    expect(lift()).toBe("0px");
  });
});
