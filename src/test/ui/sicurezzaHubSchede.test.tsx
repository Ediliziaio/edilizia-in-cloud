/**
 * Sicurezza & Privacy: tre schede, e ognuno apre quella che gli serve (09/10/2026).
 *
 * Prima il hub si apriva sempre su «Privacy & GDPR», la pagina meno utile a un
 * amministratore, e le altre due si chiamavano «Security dashboard» e «Registro
 * attività». Gli identificativi delle schede (?tab=privacy|dashboard|attivita)
 * non cambiano: i rimandi e la ricerca li usano.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

const stato = vi.hoisted(() => ({ ruolo: "company_admin" as string, mobile: false, vedeSicurezza: false }));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: stato.ruolo }) }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ isLoading: false, canViewSettingsSecurity: stato.vedeSicurezza }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => stato.mobile }));
vi.mock("@/pages/azienda/settings/SettingsPrivacy", () => ({ default: () => <p>Contenuto privacy</p> }));
vi.mock("@/pages/azienda/settings/SettingsSecurityDashboard", () => ({ default: () => <p>Contenuto accessi</p> }));
vi.mock("@/pages/azienda/settings/SettingsActivityLog", () => ({ default: () => <p>Contenuto registro</p> }));

import SettingsSecurityHub from "@/pages/azienda/settings/SettingsSecurityHub";

function Indirizzo() { return <output data-testid="url">{useLocation().search}</output>; }
function apri(search = "") {
  render(
    <MemoryRouter initialEntries={[`/azienda/impostazioni/sicurezza-privacy${search}`]}>
      <SettingsSecurityHub /><Indirizzo />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  stato.ruolo = "company_admin";
  stato.mobile = false;
  stato.vedeSicurezza = false;
});

describe("Sicurezza & Privacy", () => {
  it("l'amministratore apre «Accessi»; le schede sono Accessi · Registro attività · Privacy", () => {
    apri();
    expect(screen.getByText("Contenuto accessi")).toBeVisible();
    const schede = screen.getAllByRole("tab").map((s) => s.textContent);
    expect(schede).toEqual(["Accessi", "Registro attività", "Privacy"]);
    expect(screen.queryByRole("tab", { name: /Security dashboard|Privacy & GDPR/ })).toBeNull();
  });

  it("chi non è amministratore ha solo la Privacy, e ?tab=dashboard lo rimanda lì", () => {
    stato.ruolo = "company_staff";
    stato.vedeSicurezza = true;
    apri("?tab=dashboard");
    expect(screen.getByText("Contenuto privacy")).toBeVisible();
    expect(screen.getAllByRole("tab").map((s) => s.textContent)).toEqual(["Privacy"]);
  });

  it("su telefono resta solo la Privacy, anche per l'amministratore", () => {
    stato.mobile = true;
    apri();
    expect(screen.getByText("Contenuto privacy")).toBeVisible();
    apri("?tab=attivita");
    expect(screen.getAllByText("Contenuto privacy").length).toBeGreaterThan(0);
    expect(screen.queryByText("Contenuto registro")).toBeNull();
  });

  it("gli indirizzi delle schede non cambiano", () => {
    apri("?tab=attivita");
    expect(screen.getByText("Contenuto registro")).toBeVisible();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Privacy" }), { button: 0, ctrlKey: false });
    expect(screen.getByTestId("url")).toHaveTextContent("?tab=privacy");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Accessi" }), { button: 0, ctrlKey: false });
    expect(screen.getByTestId("url")).toHaveTextContent("?tab=dashboard");
  });
});
