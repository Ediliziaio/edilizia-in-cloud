/**
 * Listino → pagina del prodotto: chi la apre e come (10/10/2026).
 *
 * Per vedere i prodotti basta «Listino & Prezzi» in visualizzazione; per cambiarli serve la modifica (gli amministratori
 * hanno tutto). Chi non ha nemmeno la visualizzazione trova una frase che dice cosa chiedere e a chi, non un editor
 * vuoto. Chi può solo vedere apre il prodotto in sola lettura.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const permessi = vi.hoisted(() => ({ ruolo: "staff", modifica: false, vista: false }));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: permessi.ruolo }) }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canEditSettingsPricing: permessi.modifica, canViewSettingsPricing: permessi.vista }),
}));
vi.mock("@/components/listino/FamilyEditor", () => ({
  FamilyEditor: ({ soloLettura }: { soloLettura?: boolean }) => (
    <p>{soloLettura ? "Editor in sola lettura" : "Editor con le modifiche"}</p>
  ),
}));

import SettingsFamilyEditor from "@/pages/azienda/settings/SettingsFamilyEditor";

function apri() {
  render(
    <MemoryRouter>
      <SettingsFamilyEditor />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  permessi.ruolo = "staff";
  permessi.modifica = false;
  permessi.vista = false;
});
afterEach(() => cleanup());

describe("Pagina del prodotto: chi può aprirla", () => {
  it("senza «Listino & Prezzi» dice che cosa serve e a chi chiederlo, con la strada per tornare al listino", () => {
    apri();
    expect(screen.getByRole("alert")).toHaveTextContent("Per aprire i prodotti serve il permesso «Listino & Prezzi». Chiedilo al titolare.");
    expect(screen.getByRole("link", { name: "Torna al listino" })).toHaveAttribute("href", "/azienda/impostazioni/listino");
    expect(screen.queryByText(/^Editor/)).toBeNull();
  });

  it("con la sola visualizzazione apre il prodotto in sola lettura", () => {
    permessi.vista = true;
    apri();
    expect(screen.getByText("Editor in sola lettura")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("con il permesso di modifica lo apre con le modifiche, anche senza il permesso di visualizzazione scritto a parte", () => {
    permessi.modifica = true;
    apri();
    expect(screen.getByText("Editor con le modifiche")).toBeInTheDocument();
  });

  it.each(["company_admin", "super_admin"])("l'amministratore (%s) lo apre sempre con le modifiche", (ruolo) => {
    permessi.ruolo = ruolo;
    apri();
    expect(screen.getByText("Editor con le modifiche")).toBeInTheDocument();
  });
});
