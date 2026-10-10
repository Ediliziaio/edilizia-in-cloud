/**
 * L'editor dei permessi della scheda utente (09/10/2026).
 *
 *  - Cinque interruttori che non facevano niente (Approva Ordini, Gestione Articoli,
 *    Interventi, Attività, «Modifica» di Sconti) non ci sono più, e i loro valori
 *    non si perdono con «Tutti» e «Nessuno».
 *  - Lo stesso ruolo ha lo stesso nome: «Operatore», non «Utente».
 *  - Testi in italiano semplice; ogni interruttore ha un nome per il lettore di schermo.
 *  - Chi può solo guardare non trova interruttori accesi né «Salva permessi».
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@/hooks/useOpportunitiesData", () => ({ usePipelines: () => ({ data: [] as { id: string; name: string }[] }) }));

Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  releasePointerCapture: () => {},
  setPointerCapture: () => {},
  scrollIntoView: () => {},
});

import { UserRolesPermissionsTab } from "@/components/users/UserRolesPermissionsTab";
import { DEFAULT_PERMISSIONS } from "@/components/users/permissionsDefaults";
import type { StaffPermissions } from "@/components/users/PermissionsDialog";

const TIMEOUT = 30_000;

const persona = (permessi: Partial<StaffPermissions> = {}, ruolo: "company_staff" | "salesperson" = "company_staff") => ({
  id: "u-1",
  first_name: "Elena",
  last_name: "Rossi",
  role: ruolo,
  additionalRoles: [] as ("salesperson" | "call_center" | "employee")[],
  permissions: { ...DEFAULT_PERMISSIONS, ...permessi },
});

function apriTuttiIGruppi() {
  // La ricerca apre i gruppi: una lettera che c'è quasi dappertutto.
  fireEvent.change(screen.getByRole("searchbox", { name: "Cerca un permesso" }), { target: { value: "a" } });
}

afterEach(cleanup);

describe("L'editor non mostra più i cinque interruttori che non facevano niente", () => {
  it("né Approva Ordini, né Gestione Articoli, né Interventi, né Attività, né la «Modifica» di Sconti", () => {
    render(<UserRolesPermissionsTab user={persona({ can_view_settings_scontistica: true })} onSave={vi.fn()} />);
    apriTuttiIGruppi();

    for (const nome of ["Approva Ordini", "Gestione Articoli", "Interventi", "Attività"]) {
      expect(screen.queryByRole("switch", { name: nome }), nome).toBeNull();
    }
    // Quelli che servono ci sono ancora (anche «Appuntamenti» e «Attività del team», che non sono l'«Attività» tolta).
    for (const nome of ["Ordini e Commesse", "Elimina Ordini", "Approva Sconti", "Appuntamenti", "Magazzino"]) {
      expect(screen.getByRole("switch", { name: nome }), nome).toBeInTheDocument();
    }
    // Sconti non ha più la sua casella «Modifica»: chi lo vede lo cambia.
    expect(document.getElementById("can_view_settings_scontistica-edit")).toBeNull();
    // Le altre voci delle impostazioni la conservano.
    expect(screen.getByRole("switch", { name: "Persone & Accessi" })).toBeInTheDocument();
  }, TIMEOUT);

  it("«Nessuno» non azzera quello che la persona ha già: salvando, restano", () => {
    const onSave = vi.fn();
    render(
      <UserRolesPermissionsTab
        user={persona({ can_view_orders: true, can_approve_orders: true, can_manage_warehouse_items: true, can_view_interventi: true, can_view_marketing_activities: true })}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Nessuno$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Salva permessi" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const salvati = onSave.mock.calls[0][0] as StaffPermissions;
    expect(salvati.can_view_orders).toBe(false); // quello che si vede si spegne
    expect(salvati.can_approve_orders).toBe(true); // quello che non si vede resta
    expect(salvati.can_manage_warehouse_items).toBe(true);
    expect(salvati.can_view_interventi).toBe(true);
    expect(salvati.can_view_marketing_activities).toBe(true);
  }, TIMEOUT);
});

describe("Nomi e testi", () => {
  it("il ruolo company_staff si chiama Operatore, e i titoli sono «Ruolo» e «Cosa può fare» (h3: il nome della persona è l'h2)", () => {
    render(<UserRolesPermissionsTab user={persona()} onSave={vi.fn()} />);

    expect(screen.getByRole("combobox", { name: "Ruolo principale" })).toHaveTextContent("Operatore");
    expect(screen.queryByText("Utente", { selector: "span" })).toBeNull();
    expect(screen.getByRole("heading", { level: 3, name: "Ruolo" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Cosa può fare" })).toBeInTheDocument();
    expect(screen.getByText("Ruolo principale")).toBeInTheDocument();
    expect(screen.getByText("Permessi accesi")).toBeInTheDocument();
    expect(screen.getByText(/Accendi quello che deve vedere\. Dove c'è «Modifica» può anche cambiare i dati\./)).toBeInTheDocument();
    // Le vecchie diciture non ci sono più.
    expect(screen.queryByText(/Ruolo Utente|Ruolo primario|Autorizzazioni moduli|Totale attivi|Limita visibilità/)).toBeNull();
    expect(screen.getByText("Solo i dati assegnati a lui")).toBeInTheDocument();
    expect(screen.getByText("Vede solo commesse, attività e appuntamenti assegnati a lui.")).toBeInTheDocument();
  }, TIMEOUT);

  it("le descrizioni delle voci che promettevano il falso sono corrette", () => {
    render(<UserRolesPermissionsTab user={persona()} onSave={vi.fn()} />);
    apriTuttiIGruppi();

    const descrizioneDi = (nome: string) => {
      const interruttore = screen.getByRole("switch", { name: nome });
      return document.getElementById(interruttore.getAttribute("aria-describedby") ?? "")?.textContent ?? "";
    };
    expect(descrizioneDi("Listino & Prezzi (tutto)")).toMatch(/modelli di preventivo/);
    expect(descrizioneDi("Listino & Prezzi (tutto)")).not.toMatch(/template offerte/);
    expect(descrizioneDi("Listino & Prezzi (tutto)")).toMatch(/Per «Prezzo e margini» serve anche «Costi»/);
    expect(descrizioneDi("Configurazione Ordini")).toMatch(/Stati della commessa/);
    expect(descrizioneDi("Configurazione Ordini")).not.toMatch(/numerazioni/);
    expect(descrizioneDi("Controllo di Gestione")).toMatch(/spegnere solo questo non basta/);
    expect(descrizioneDi("Persone & Accessi")).toMatch(/utenti, ruoli, permessi, venditori e dipendenti li cambia solo l'amministratore/);
    expect(descrizioneDi("Sicurezza & Privacy")).toMatch(/Accessi, registro attività e regole di sicurezza li vede solo l'amministratore/);
    expect(descrizioneDi("Esporta Clienti")).toMatch(/L'archivio completo \(Esporta i dati\) chiede anche «Sicurezza & Privacy»/);
    expect(screen.queryByRole("switch", { name: /Team & Utenti|Utenti & Team|Gestione Dipendenti/ })).toBeNull();
    // «Costi» non ha una riga fra i gruppi: la sua spiegazione sta nelle avanzate, vicino al suo interruttore.
    fireEvent.click(screen.getByRole("button", { name: /Avanzate/ }));
    expect(screen.getByText(/In Impostazioni apre anche Prezzo e margini, Approvazioni, Categorie costi e Automazioni finanza/)).toBeInTheDocument();
  }, TIMEOUT);

  it("ogni interruttore ha un nome e il nome si può toccare per muoverlo", () => {
    render(<UserRolesPermissionsTab user={persona()} onSave={vi.fn()} />);
    apriTuttiIGruppi();

    const interruttori = screen.getAllByRole("switch");
    expect(interruttori.length).toBeGreaterThan(40);
    for (const i of interruttori) expect(i, i.id).toHaveAccessibleName();

    const ordini = screen.getByRole("switch", { name: "Ordini e Commesse" });
    expect(ordini).toHaveAttribute("aria-checked", "false");
    fireEvent.click(screen.getByText("Ordini e Commesse", { selector: "label" }));
    expect(screen.getByRole("switch", { name: "Ordini e Commesse" })).toHaveAttribute("aria-checked", "true");
  }, TIMEOUT);
});

describe("Salvataggio e bozza", () => {
  it("la pagina sa quando ci sono modifiche non salvate, e quando non ci sono più", () => {
    const onDirtyChange = vi.fn();
    const { unmount } = render(<UserRolesPermissionsTab user={persona()} onSave={vi.fn()} onDirtyChange={onDirtyChange} />);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    apriTuttiIGruppi();
    fireEvent.click(screen.getByRole("switch", { name: "Magazzino" }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole("switch", { name: "Magazzino" }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    fireEvent.click(screen.getByRole("switch", { name: "Magazzino" }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    unmount();
    // Cambiare scheda smonta la scheda: la pagina non deve restare con una bozza che non c'è più.
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  }, TIMEOUT);

  it("il pulsante dice «Salva permessi» e c'è solo con modifiche", () => {
    render(<UserRolesPermissionsTab user={persona()} onSave={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Salva permessi" })).toBeDisabled();
    apriTuttiIGruppi();
    fireEvent.click(screen.getByRole("switch", { name: "Magazzino" }));
    expect(screen.getByRole("button", { name: "Salva permessi" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Salva Permessi/ })).toBeNull();
  }, TIMEOUT);
});

describe("Sola lettura onesta: chi non è amministratore guarda e basta", () => {
  it("niente interruttori accesi, niente salvataggio, niente cambio di ruolo, ma si leggono i gruppi", () => {
    const onSave = vi.fn();
    render(<UserRolesPermissionsTab user={persona({ can_view_orders: true })} onSave={onSave} readOnly />);

    expect(screen.getByRole("combobox", { name: "Ruolo principale" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^Nessuno$|^Come /i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Salva permessi/ })).toBeNull();
    // I «Tutti» dei gruppi ci sono ma non si possono premere.
    for (const tutti of screen.getAllByRole("button", { name: /^Tutti$/ })) expect(tutti).toBeDisabled();

    // I gruppi si aprono comunque: serve a leggere cosa ha la persona.
    const gruppoCantieri = screen.getByRole("button", { name: /Cantieri & Lavori/ });
    fireEvent.click(gruppoCantieri);
    const ordini = screen.getByRole("switch", { name: "Ordini e Commesse" });
    expect(ordini).toHaveAttribute("aria-checked", "true");
    expect(ordini).toBeDisabled();
    for (const i of screen.getAllByRole("switch")) expect(i, i.id).toBeDisabled();
    fireEvent.click(ordini);
    expect(ordini).toHaveAttribute("aria-checked", "true");
    expect(onSave).not.toHaveBeenCalled();
    // Il pulsante «Spegni/Tutti» del gruppo non c'è da usare.
    expect(within(gruppoCantieri.parentElement as HTMLElement).getByRole("button", { name: /Tutti|Spegni/ })).toBeDisabled();
  }, TIMEOUT);

  it("una bozza non c'è mai se si guarda soltanto", () => {
    const onDirtyChange = vi.fn();
    render(<UserRolesPermissionsTab user={persona()} onSave={vi.fn()} readOnly onDirtyChange={onDirtyChange} />);
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
  }, TIMEOUT);
});
