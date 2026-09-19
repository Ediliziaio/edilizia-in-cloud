/**
 * /offerta-2-mesi-gratis — la pagina di vendita dell'annuale (19/09/2026).
 *
 * Tiene fermo:
 *   · in cima per chi è (aziende edili, serramentisti, fotovoltaico…), poi la
 *     promessa, poi la promo: 2 mesi gratis, solo per 8 aziende;
 *   · l'annuale non c'è più (tolto da Florin la sera stessa): né prezzi, né
 *     «12 mesi al prezzo di 10», né le due garanzie che ne parlavano;
 *   · ogni «Prenota» porta al calendario in fondo alla pagina, e il calendario
 *     è quello della demo di Edilizia in Cloud;
 *   · una prenotazione confermata nel calendario è la conversione della pagina
 *     (Pixel «Lead» + evento GA4);
 *   · su telefono la barra «Prenota» c'è solo quando nessun altro pulsante è a
 *     portata: non accanto a quelli dell'hero, non sopra il calendario; e il
 *     pulsante WhatsApp sale e scende con lei.
 */
import { act, render, screen, within } from "@testing-library/react";
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
import { DOMANDE_OFFERTA, POSTI_PROMO, SETTORI } from "@/data/offerta2MesiGratis";

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

describe("la pagina", () => {
  it("in cima i settori, poi la promessa, poi la promo per 8 aziende", async () => {
    await apri();

    expect(POSTI_PROMO).toBe(8);
    // I settori in cima: tutti nella pagina, i primi tre anche su telefono.
    const riga = screen.getByText("aziende edili").closest("span.inline-flex") as HTMLElement;
    expect(riga).toHaveTextContent("Per aziende edili · serramentisti · fotovoltaico · impiantisti · ristrutturazioni");
    const settore = (nome: string) => within(riga).getByText(new RegExp(`^(· )?${nome}$`));
    for (const nome of SETTORI.slice(3)) expect(settore(nome)).toHaveClass("hidden", "md:inline");
    for (const nome of SETTORI.slice(0, 3)) expect(settore(nome)).not.toHaveClass("hidden");

    const titolo = screen.getByRole("heading", { level: 1 });
    expect(titolo).toHaveTextContent("Aumenta i tuoi margini e i tuoi guadagni di +50.000 €.");
    expect(titolo).toHaveTextContent("Liberati dalla gestione. Delega con efficienza. Controlla i margini in tempo reale.");
    expect(screen.getByText(/^Dì addio a software sparsi, fogli Excel/)).toBeInTheDocument();
    expect(screen.getByText("solo per 8 aziende.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "2 mesi gratis. Solo per 8 aziende." })).toBeInTheDocument();
    expect(document.title).toBe("Offerta 2 mesi gratis — Gestionale Edilizia in Cloud");
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://www.ediliziaincloud.com/offerta-2-mesi-gratis/",
    );

    for (const garanzia of [
      "Operativo in 30 giorni, o il canone non parte",
      "I tuoi dati escono quando vuoi",
      "Il margine in due minuti",
    ]) {
      expect(screen.getByRole("heading", { level: 3, name: garanzia })).toBeInTheDocument();
    }
  });

  it("l'annuale non c'è più: né prezzi, né «12 mesi al prezzo di 10», né le sue garanzie", async () => {
    const { container } = await apri();
    const testo = container.textContent ?? "";

    expect(testo).not.toMatch(/annual/i);
    expect(testo).not.toMatch(/12 mesi al prezzo di 10|60 giorni per ripensarci|prezzo bloccato|primi cento/i);
    expect(testo).not.toMatch(/1\.270|2\.470|5\.470/);
    for (const { q, a } of DOMANDE_OFFERTA) expect(`${q} ${a}`).not.toMatch(/annual|prezzo bloccato/i);
  });

  it("ogni «Prenota» porta al calendario, e il calendario è quello della demo", async () => {
    await apri();

    // Hero, promo, garanzie, chiusura (la barra del telefono in cima è nascosta).
    const pulsanti = screen.getAllByRole("link", { name: /prenota/i });
    expect(pulsanti.length).toBeGreaterThanOrEqual(4);
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
