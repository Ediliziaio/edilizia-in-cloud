/// <reference types="node" />
/**
 * Il riquadro «Bagno accessibile» del passo Immobile dei Bagni (06/10/2026) non promette più il «Bonus Barriere 75%»:
 * il bonus è scaduto a fine 2025 senza proroga (lo dice lib/preventivi/incentivi, che non lo ha più fra i preset) e il
 * testo mandava a «impostarlo dai chip incentivi nello step Economia», dove quel chip non esiste. Resta il suggerimento
 * utile (maniglioni, piatto doccia a filo pavimento, sanitari ergonomici), senza nessuna promessa fiscale.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

import StepImmobile from "@/pages/azienda/bagni/BagniWizard/StepImmobile";

afterEach(() => cleanup());

describe("Bagni, passo Immobile: il riquadro del bagno accessibile", () => {
  it("con «Bagno accessibile» acceso suggerisce maniglioni, piatto doccia a filo e sanitari ergonomici", () => {
    render(<StepImmobile form={{ accessibile: true }} onChange={vi.fn()} />);
    const riquadro = screen.getAllByText(/maniglioni/i)[0].closest("p");
    expect(riquadro).not.toBeNull();
    const testo = riquadro?.textContent ?? "";
    expect(testo).toMatch(/maniglioni/i);
    expect(testo).toMatch(/piatto doccia a filo/i);
    expect(testo).toMatch(/sanitari ergonomici/i);
  });

  it("non parla del Bonus Barriere 75% né di un chip da impostare, né nella versione da scrivania né in quella da telefono", () => {
    render(<StepImmobile form={{ accessibile: true }} onChange={vi.fn()} />);
    // Le due versioni (max-sm:hidden e sm:hidden) stanno entrambe nel DOM: jsdom non applica le classi.
    const testo = screen.getAllByText(/maniglioni/i).map((e) => e.closest("p")?.textContent ?? "").join(" | ");
    expect(testo).not.toMatch(/barriere/i);
    expect(testo).not.toContain("75%");
    expect(testo).not.toMatch(/chip/i);
  });

  it("con «Bagno accessibile» spento il riquadro non c'è", () => {
    render(<StepImmobile form={{ accessibile: false }} onChange={vi.fn()} />);
    expect(screen.queryByText(/maniglioni/i)).toBeNull();
  });
});

/** Tutti i file .ts/.tsx sotto una cartella. */
function sorgenti(cartella: string): string[] {
  return readdirSync(cartella).flatMap((nome) => {
    const percorso = join(cartella, nome);
    if (statSync(percorso).isDirectory()) return sorgenti(percorso);
    return /\.(ts|tsx)$/.test(nome) ? [percorso] : [];
  });
}

describe("nei passi dei preventivatori edili nessuna frase promette il Bonus Barriere 75% (scaduto a fine 2025)", () => {
  const MODULI = ["bagni", "tetti", "climatizzazione", "elettrico", "termoidraulico", "pavimenti", "piscine", "ristrutturazione"];
  it.each(MODULI)("%s", (modulo) => {
    const colpevoli = sorgenti(join(process.cwd(), "src/pages/azienda", modulo))
      .filter((file) => /Barriere\s*(?:Architettoniche\s*)?(?:al\s*)?75\s*%/i.test(readFileSync(file, "utf8")));
    expect(colpevoli).toEqual([]);
  });
});
