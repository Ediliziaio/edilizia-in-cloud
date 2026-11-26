/**
 * Fase 0.1 del piano campo completo (26/11/2026): il subappaltatore non entra nelle pagine del personale
 * interno scrivendo l'indirizzo a mano.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const ruolo = vi.hoisted(() => ({ sub: false }));
vi.mock("@/hooks/useIsCampo", () => ({ useIsCampo: () => ({ isSubappaltatore: ruolo.sub, isOperaio: !ruolo.sub }) }));

import { SoloPersonaleInterno } from "@/components/campo/SoloPersonaleInterno";

function apri(percorso: string) {
  render(
    <MemoryRouter initialEntries={[percorso]}>
      <Routes>
        <Route path="/campo" element={<p>Home</p>} />
        <Route element={<SoloPersonaleInterno />}>
          <Route path="/campo/spese" element={<p>Spese</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("pagine riservate al personale interno", () => {
  it("il subappaltatore torna alla Home", () => {
    ruolo.sub = true;
    apri("/campo/spese");
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.queryByText("Spese")).toBeNull();
  });

  it("l'operaio entra", () => {
    ruolo.sub = false;
    apri("/campo/spese");
    expect(screen.getByText("Spese")).toBeInTheDocument();
  });

  it("le pagine del personale stanno tutte dentro la guardia", () => {
    const rotte = readFileSync("src/routes/campoRoutes.tsx", "utf8");
    const inizio = rotte.indexOf("<Route element={<SoloPersonaleInterno />}>");
    expect(inizio).toBeGreaterThan(0);
    const blocco = rotte.slice(inizio, rotte.indexOf("</Route>", inizio));
    for (const p of ["timbratura", "presenze", "ferie", "spese", "cedolini", "buoni-pasto", "magazzino", "merce", "mezzi", "squadra/:orderId"]) {
      expect(blocco, p).toContain(`path="${p}"`);
      // E non c'è una seconda rotta uguale fuori dalla guardia.
      expect(rotte.split(`path="${p}"`).length - 1, p).toBe(1);
    }
  });
});
