import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useState } from "react";

const stato = vi.hoisted(() => ({ modifica: true }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "demo" }, refreshAuth: vi.fn() }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: false, canViewSettingsProfile: true, canEditSettingsProfile: stato.modifica }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/settings/CompanyProfileForm", () => ({ CompanyProfileForm: () => {
  const [valore, setValore] = useState("");
  return <input aria-label="Dato in bozza" value={valore} onChange={(event) => setValore(event.target.value)} />;
} }));
vi.mock("@/components/settings/LogoUploader", () => ({ LogoUploader: () => <p>Caricamento logo</p> }));
vi.mock("@/components/settings/CustomerPortalToggle", () => ({ CustomerPortalToggle: () => <p>Opzioni portale</p> }));
vi.mock("@/components/settings/BonusFiscaliToggles", () => ({ BonusFiscaliToggles: () => <p>Opzioni bonus</p> }));
vi.mock("@/components/settings/RecensioniOnlineForm", () => ({ RecensioniOnlineForm: () => <p>Gestione recensioni</p> }));
import SettingsProfile from "@/pages/azienda/settings/SettingsProfile";

const apri = (hash = "") => render(<MemoryRouter initialEntries={[`/azienda/impostazioni/profilo${hash}`]}><SettingsProfile /></MemoryRouter>);
afterEach(() => { cleanup(); stato.modifica = true; });

describe("Profilo aziendale per argomento", () => {
  it("il cambio di sezione conserva le bozze senza rimontare il modulo", () => {
    apri();
    fireEvent.change(screen.getByLabelText("Dato in bozza"), { target: { value: "Da salvare" } });
    fireEvent.click(screen.getByRole("link", { name: "Recensioni" }));
    expect(screen.getByText("Gestione recensioni")).toBeVisible();
    expect(screen.getByLabelText("Dato in bozza")).not.toBeVisible();
    fireEvent.click(screen.getByRole("link", { name: "Dati" }));
    expect(screen.getByLabelText("Dato in bozza")).toHaveValue("Da salvare");
    expect(screen.getByLabelText("Dato in bozza")).toBeVisible();
  });
  it("i link storici aprono direttamente la sezione richiesta", () => {
    apri("#bonus");
    expect(screen.getByText("Opzioni bonus")).toBeVisible();
    expect(screen.getByLabelText("Dato in bozza")).not.toBeVisible();
  });
  it("chi consulta in sola lettura può cambiare argomento senza poter scrivere", () => {
    stato.modifica = false;
    apri();
    expect(screen.getByLabelText("Dato in bozza")).toBeDisabled();
    fireEvent.click(screen.getByRole("link", { name: "Recensioni" }));
    expect(screen.getByText("Gestione recensioni")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Bonus" })).toBeNull();
  });
});
