/**
 * Persone & Accessi: schede, nomi e sola lettura onesta, 10/10/2026.
 *
 *  - Le schede sono nell'ordine in cui le usa un titolare: Utenti · Dipendenti ·
 *    Venditori · Subappaltatori · Team · Commercialista, e in «Altro» le tre meno
 *    usate («Da altre aziende», «Controllo accessi», «Modelli di permessi»).
 *    Gli indirizzi ?tab=… non cambiano.
 *  - Utenti, venditori, dipendenti, subappaltatori, deleghe e modelli li scrive
 *    solo l'amministratore (lo impone il server): gli altri vedono le schede in
 *    sola lettura, con un avviso in cima. «Team & Utenti — Modifica» serve ai
 *    team, non a queste schede. Le squadre esterne le modifica anche chi ha
 *    «Configurazione Ordini — Modifica».
 *  - «Modelli di permessi» compare solo all'amministratore.
 *  - Su telefono, chi non vede gli utenti ha comunque la barra delle schede.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

const permessi = vi.hoisted(() => ({
  valori: {} as Record<string, unknown>,
  mobile: false,
}));

vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => permessi.valori }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => permessi.mobile }));
vi.mock("@/components/settings/CompanyAccessManager", () => ({
  CompanyAccessManager: (p: { soloLettura?: boolean }) => <p>Da altre aziende contenuto · sola lettura: {String(p.soloLettura)}</p>,
}));
vi.mock("@/components/settings/UsersConfig", () => ({ UsersConfig: () => <p>Utenti contenuto</p> }));
vi.mock("@/components/settings/SalespeopleConfig", () => ({
  SalespeopleConfig: (p: { soloLettura?: boolean }) => <p>Venditori contenuto · sola lettura: {String(p.soloLettura)}</p>,
}));
vi.mock("@/components/settings/SubappaltatoriTab", () => ({
  SubappaltatoriTab: (p: { soloLettura?: boolean }) => <p>Subappaltatori contenuto · sola lettura: {String(p.soloLettura)}</p>,
}));
vi.mock("@/components/settings/AccessGovernancePanel", () => ({
  AccessGovernancePanel: (p: { puoAprireScheda?: boolean }) => <p>Controllo accessi contenuto · scheda apribile: {String(p.puoAprireScheda)}</p>,
}));
vi.mock("@/components/settings/PermissionTemplatesManager", () => ({ PermissionTemplatesManager: () => <p>Modelli contenuto</p> }));
vi.mock("@/components/settings/AccountantAccessTab", () => ({
  AccountantAccessTab: (p: { soloLettura?: boolean }) => <p>Commercialista contenuto · sola lettura: {String(p.soloLettura)}</p>,
}));
vi.mock("@/components/settings/AccountantChangeRequestsQueue", () => ({ AccountantChangeRequestsQueue: () => <p>Richieste commercialista</p> }));
vi.mock("@/pages/azienda/Employees", () => ({
  default: (p: { soloLettura?: boolean; soloLetturaSquadre?: boolean }) => (
    <p>Dipendenti contenuto · sola lettura: {String(p.soloLettura)} · squadre: {String(p.soloLetturaSquadre)}</p>
  ),
}));
vi.mock("@/pages/azienda/settings/SettingsTeams", () => ({ default: () => <p>Team contenuto</p> }));

import SettingsPeople from "@/pages/azienda/settings/SettingsPeople";

function Posizione() {
  return <output data-testid="url">{useLocation().search}</output>;
}
function apri(search = "") {
  return render(
    <MemoryRouter initialEntries={[`/azienda/impostazioni/persone${search}`]}>
      <SettingsPeople />
      <Posizione />
    </MemoryRouter>,
  );
}
const AVVISO = /Stai guardando\. Utenti, ruoli, permessi, venditori e dipendenti li cambia solo l'amministratore\./;

beforeEach(() => {
  permessi.mobile = false;
  permessi.valori = { isAdmin: true, isLoading: false };
});
afterEach(cleanup);

describe("Schede di Persone & Accessi", () => {
  it("l'amministratore vede sei schede in riga, nell'ordine giusto, e tre voci in «Altro»", async () => {
    apri();
    const nomi = screen.getAllByRole("tab").map((t) => t.textContent);
    // Le tre di «Altro» ci sono ma nascoste: Radix deve conoscere la scheda attiva.
    expect(nomi).toEqual(["Utenti", "Dipendenti", "Venditori", "Subappaltatori", "Team", "Commercialista", "Da altre aziende", "Controllo accessi", "Modelli di permessi"]);
    fireEvent.keyDown(screen.getByRole("button", { name: /^Altro/ }), { key: "Enter" });
    const voci = (await screen.findAllByRole("menuitem")).map((v) => v.textContent);
    expect(voci).toEqual(["Da altre aziende", "Controllo accessi", "Modelli di permessi"]);
  });

  it("gli indirizzi non cambiano: le tre schede di «Altro» si aprono con i vecchi ?tab=", () => {
    apri("?tab=accessi-azienda");
    expect(screen.getByText(/Da altre aziende contenuto/)).toBeVisible();
    cleanup();
    apri("?tab=sicurezza-accessi");
    expect(screen.getByText(/Controllo accessi contenuto/)).toBeVisible();
    cleanup();
    apri("?tab=template-permessi");
    expect(screen.getByText("Modelli contenuto")).toBeVisible();
  });

  it("«Altro» prende il nome della scheda aperta", () => {
    apri("?tab=sicurezza-accessi");
    expect(screen.getByRole("button", { name: /Controllo accessi/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Altro/ })).toBeNull();
  });

  it("i vecchi nomi della scheda (?tab=staff, ?tab=templates) portano ancora dove portavano", () => {
    apri("?tab=staff");
    expect(screen.getByText(/Dipendenti contenuto/)).toBeVisible();
    cleanup();
    apri("?tab=templates");
    expect(screen.getByText("Modelli contenuto")).toBeVisible();
  });

  it("la riga «Una persona può avere più ruoli» è chiusa e la apre solo l'amministratore", () => {
    apri();
    const dettagli = screen.getByText("Una persona può avere più ruoli").closest("details")!;
    expect(dettagli).not.toHaveAttribute("open");
    expect(dettagli).toHaveTextContent("Aggiungi ruolo Venditore");
  });
});

describe("Sola lettura onesta", () => {
  beforeEach(() => {
    permessi.valori = {
      isAdmin: false,
      isLoading: false,
      canViewUsers: true,
      canViewSettingsPeople: true,
      canEditSettingsPeople: true,
      canViewSettingsSecurity: false,
      canEditSettingsOrders: false,
    };
  });

  it("chi non è amministratore trova l'avviso in cima alle schede che non può scrivere", () => {
    for (const scheda of ["utenti", "dipendenti", "venditori", "subappaltatori", "commercialista", "accessi-azienda"]) {
      apri(`?tab=${scheda}`);
      expect(screen.getByText(AVVISO), scheda).toBeVisible();
      cleanup();
    }
  });

  it("nella scheda Team non c'è l'avviso: lì «Team & Utenti — Modifica» scrive davvero", () => {
    apri("?tab=team");
    expect(screen.getByText("Team contenuto")).toBeVisible();
    expect(screen.queryByText(AVVISO)).toBeNull();
  });

  it("l'amministratore non vede nessun avviso", () => {
    permessi.valori = { isAdmin: true, isLoading: false };
    apri("?tab=venditori");
    expect(screen.getByText(/Venditori contenuto/)).toBeVisible();
    expect(screen.queryByText(AVVISO)).toBeNull();
  });

  it("le schede ricevono la sola lettura; le squadre esterne la tolgono a chi ha «Configurazione Ordini — Modifica»", () => {
    apri("?tab=venditori");
    expect(screen.getByText(/Venditori contenuto · sola lettura: true/)).toBeVisible();
    cleanup();
    apri("?tab=subappaltatori");
    expect(screen.getByText(/Subappaltatori contenuto · sola lettura: true/)).toBeVisible();
    cleanup();
    apri("?tab=commercialista");
    expect(screen.getByText(/Commercialista contenuto · sola lettura: true/)).toBeVisible();
    cleanup();
    apri("?tab=dipendenti");
    expect(screen.getByText("Dipendenti contenuto · sola lettura: true · squadre: true")).toBeVisible();
    cleanup();
    permessi.valori = { ...permessi.valori, canEditSettingsOrders: true };
    apri("?tab=dipendenti");
    expect(screen.getByText("Dipendenti contenuto · sola lettura: true · squadre: false")).toBeVisible();
  });

  it("l'amministratore non ha niente in sola lettura", () => {
    permessi.valori = { isAdmin: true, isLoading: false };
    apri("?tab=dipendenti");
    expect(screen.getByText("Dipendenti contenuto · sola lettura: false · squadre: false")).toBeVisible();
  });

  it("«Modelli di permessi» non c'è per chi non è amministratore, nemmeno con «Modifica»", () => {
    apri("?tab=template-permessi");
    expect(screen.queryByText("Modelli contenuto")).toBeNull();
    expect(screen.queryByRole("tab", { name: "Modelli di permessi" })).toBeNull();
    // Si ripiega sulla prima scheda visibile.
    expect(screen.getByText("Utenti contenuto")).toBeVisible();
  });

  it("«Controllo accessi» offre «Apri la scheda» a chi può vedere le persone", () => {
    apri("?tab=sicurezza-accessi");
    expect(screen.getByText(/scheda apribile: true/)).toBeVisible();
    cleanup();
    permessi.valori = { ...permessi.valori, canViewSettingsPeople: false };
    apri("?tab=sicurezza-accessi");
    expect(screen.getByText(/scheda apribile: false/)).toBeVisible();
  });
});

describe("Telefono", () => {
  it("chi vede gli utenti ha solo l'elenco, senza barra di schede", () => {
    permessi.mobile = true;
    permessi.valori = { isAdmin: true, isLoading: false };
    apri("?tab=venditori");
    expect(screen.getByText("Utenti contenuto")).toBeVisible();
    expect(screen.getByRole("tablist", { hidden: true })).toHaveClass("max-sm:hidden");
  });

  it("chi non vede gli utenti ma vede i dipendenti ha la barra per cambiare scheda (prima restava bloccato)", () => {
    permessi.mobile = true;
    permessi.valori = { isAdmin: false, isLoading: false, canViewUsers: false, canViewSettingsPeople: true, canViewSettingsSecurity: false };
    apri();
    expect(screen.getByText(/Dipendenti contenuto/)).toBeVisible();
    expect(screen.getByRole("tablist")).not.toHaveClass("max-sm:hidden");
    expect(screen.getByRole("tab", { name: "Venditori" })).toBeVisible();
  });
});

describe("Altri casi", () => {
  it("senza nessun permesso: «Non hai accesso a questa sezione.»", () => {
    permessi.valori = { isAdmin: false, isLoading: false, canViewUsers: false, canViewSettingsPeople: false, canViewSettingsSecurity: false };
    apri();
    expect(screen.getByText("Non hai accesso a questa sezione.")).toBeVisible();
  });

  it("mentre i permessi si caricano lo annuncia", () => {
    permessi.valori = { isAdmin: false, isLoading: true };
    apri();
    // (L'<output> dell'indirizzo ha anch'esso il ruolo «status»: si cerca per testo.)
    expect(screen.getByText("Caricamento dei permessi…").closest('[role="status"]')).not.toBeNull();
  });

  it("il cambio scheda conserva gli altri parametri dell'indirizzo", () => {
    apri("?tab=utenti&ritorno=commessa");
    fireEvent.mouseDown(screen.getByRole("tab", { name: /^Team$/ }), { button: 0, ctrlKey: false });
    expect(screen.getByText("Team contenuto")).toBeVisible();
    expect(screen.getByTestId("url")).toHaveTextContent("tab=team&ritorno=commessa");
  });
});
