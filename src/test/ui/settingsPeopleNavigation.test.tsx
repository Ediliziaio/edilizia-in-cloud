import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import SettingsPeople from "@/pages/azienda/settings/SettingsPeople";

vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: true, isLoading: false }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/settings/CompanyAccessManager", () => ({ CompanyAccessManager: () => <p>Accessi azienda contenuto</p> }));
vi.mock("@/components/settings/UsersConfig", () => ({ UsersConfig: () => <p>Utenti contenuto</p> }));
vi.mock("@/components/settings/SalespeopleConfig", () => ({ SalespeopleConfig: () => <p>Venditori contenuto</p> }));
vi.mock("@/components/settings/SubappaltatoriTab", () => ({ SubappaltatoriTab: () => <p>Subappaltatori contenuto</p> }));
vi.mock("@/components/settings/AccessGovernancePanel", () => ({ AccessGovernancePanel: () => <p>Sicurezza contenuto</p> }));
vi.mock("@/components/settings/PermissionTemplatesManager", () => ({ PermissionTemplatesManager: () => <p>Template contenuto</p> }));
vi.mock("@/components/settings/AccountantAccessTab", () => ({ AccountantAccessTab: () => <p>Commercialista contenuto</p> }));
vi.mock("@/components/settings/AccountantChangeRequestsQueue", () => ({ AccountantChangeRequestsQueue: () => <p>Richieste commercialista</p> }));
vi.mock("@/pages/azienda/Employees", () => ({ default: () => <p>Dipendenti contenuto</p> }));
vi.mock("@/pages/azienda/settings/SettingsTeams", () => ({ default: () => <p>Team contenuto</p> }));
function Location() { return <output data-testid="url">{useLocation().search}</output>; }
function open(search: string) { render(<MemoryRouter initialEntries={[`/azienda/impostazioni/persone${search}`]}><SettingsPeople /><Location /></MemoryRouter>); }
afterEach(cleanup);

describe("Schede Persone & Accessi", () => {
  it("Commercialista apre davvero il contenuto, non il fallback utenti", () => {
    open("?tab=commercialista");
    expect(screen.getByText("Commercialista contenuto")).toBeVisible();
    expect(screen.queryByText("Utenti contenuto")).toBeNull();
  });
  it("il cambio scheda conserva gli altri parametri dell'indirizzo", () => {
    open("?tab=utenti&ritorno=commessa");
    fireEvent.mouseDown(screen.getByRole("tab", { name: /^Team$/ }), { button: 0, ctrlKey: false });
    expect(screen.getByText("Team contenuto")).toBeVisible();
    expect(screen.getByTestId("url")).toHaveTextContent("tab=team&ritorno=commessa");
  });
});
