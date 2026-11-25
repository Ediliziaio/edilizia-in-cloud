/**
 * L'editor dei permessi della scheda utente (09/10/2026).
 *
 *  - Gli interruttori che non facevano niente (Approva Ordini, Gestione Articoli,
 *    «Modifica» di Sconti) non ci sono più, e i loro valori non si perdono con
 *    «Tutti» e «Nessuno». Interventi e Attività sono tornati il 30/10/2026: ora
 *    decidono il calendario degli interventi e i campi delle attività.
 *  - Lo stesso ruolo ha lo stesso nome: «Operatore», non «Utente».
 *  - Testi in italiano semplice; ogni interruttore ha un nome per il lettore di schermo.
 *  - Chi può solo guardare non trova interruttori accesi né «Salva permessi».
 *
 * 25/11/2026: l'editor è stato riscritto a due passi («1. Tipo di accesso»,
 * «2. Autorizzazioni effettive») con il riquadro «Dati economici» e i pulsanti
 * «Attiva/Disattiva tutti i moduli» e «Attiva il gruppo <nome>». Questi test
 * cercavano ancora i nomi di prima («Ruolo», «Cosa può fare», «Nessuno»,
 * «Tutti») ed erano rossi: aggiornati i nomi, le promesse controllate restano
 * le stesse.
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

describe("L'editor non mostra più gli interruttori che non facevano niente", () => {
  it("né Approva Ordini, né Gestione Articoli, né la «Modifica» di Sconti; Interventi e Attività sì", () => {
    render(<UserRolesPermissionsTab user={persona({ can_view_settings_scontistica: true })} onSave={vi.fn()} />);
    apriTuttiIGruppi();

    for (const nome of ["Approva Ordini", "Gestione Articoli"]) {
      expect(screen.queryByRole("switch", { name: nome }), nome).toBeNull();
    }
    // Quelli che servono ci sono ancora, compresi Interventi e Attività che ora fanno qualcosa.
    for (const nome of ["Ordini e Commesse", "Elimina Ordini", "Approva Sconti", "Appuntamenti", "Magazzino", "Interventi", "Attività"]) {
      expect(screen.getByRole("switch", { name: nome }), nome).toBeInTheDocument();
    }
    // Sconti non ha più la sua casella «Modifica»: chi lo vede lo cambia.
    expect(document.getElementById("can_view_settings_scontistica-edit")).toBeNull();
    // Le altre voci delle impostazioni la conservano.
    expect(screen.getByRole("switch", { name: "Persone & Accessi" })).toBeInTheDocument();
  }, TIMEOUT);

  // «Tutti»/«Nessuno» si chiamano «Attiva tutti i moduli» e «Disattiva tutti i moduli»
  // (riscrittura dell'editor, 2026); il gruppo ha «Attiva il gruppo <nome>».
  it("«Disattiva tutti i moduli» non azzera quello che la persona ha già: salvando, restano", () => {
    const onSave = vi.fn();
    render(
      <UserRolesPermissionsTab
        user={persona({ can_view_orders: true, can_approve_orders: true, can_manage_warehouse_items: true })}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Disattiva tutti i moduli" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva permessi" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const salvati = onSave.mock.calls[0][0] as StaffPermissions;
    expect(salvati.can_view_orders).toBe(false); // quello che si vede si spegne
    expect(salvati.can_approve_orders).toBe(true); // quello che non si vede resta
    expect(salvati.can_manage_warehouse_items).toBe(true);
  }, TIMEOUT);
});

describe("Nomi e testi", () => {
  it("il ruolo company_staff si chiama Operatore, e i due passi sono «1. Tipo di accesso» e «2. Autorizzazioni effettive» (h3: «Accesso e autorizzazioni» è l'h2)", () => {
    render(<UserRolesPermissionsTab user={persona()} onSave={vi.fn()} />);

    expect(screen.getByRole("combobox", { name: "Ruolo principale" })).toHaveTextContent("Operatore");
    expect(screen.queryByText("Utente", { selector: "span" })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Accesso e autorizzazioni" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "1. Tipo di accesso" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "2. Autorizzazioni effettive" })).toBeInTheDocument();
    expect(screen.getByText("Accesso alla piattaforma")).toBeInTheDocument();
    expect(screen.getByText("Moduli visibili")).toBeInTheDocument();
    expect(screen.getByText(/Accendi quello che deve vedere\. Dove c'è «Modifica» può anche cambiare i dati\./)).toBeInTheDocument();
    // Le vecchie diciture non ci sono più.
    expect(screen.queryByText(/Ruolo Utente|Ruolo primario|Autorizzazioni moduli|Totale attivi|Limita visibilità/)).toBeNull();
    // La restrizione del portafoglio sta nelle avanzate, col nome di adesso
    // («Solo i dati assegnati a lui» è rimasto nella finestra di creazione).
    expect(screen.getByText("Solo il portafoglio CRM assegnato")).toBeInTheDocument();
    expect(screen.getByText(/Limita contatti, opportunità e attività commerciali/)).toBeInTheDocument();
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
    // «Costi» non ha una riga fra i gruppi: sta nel riquadro «Dati economici», con
    // la spiegazione accanto al suo interruttore (non più dentro «Avanzate»).
    expect(descrizioneDi("Costi")).toMatch(/Costi aziendali e delle commesse, incluso il totale del personale/);
    expect(descrizioneDi("Costi")).toMatch(/Le tariffe individuali richiedono anche l’accesso al personale/);
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
    expect(screen.queryByRole("button", { name: "Salva permessi" })).toBeNull();
    apriTuttiIGruppi();
    fireEvent.click(screen.getByRole("switch", { name: "Magazzino" }));
    expect(screen.getByRole("button", { name: "Salva permessi" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Salva Permessi/ })).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Magazzino" }));
    expect(screen.queryByRole("button", { name: "Salva permessi" })).toBeNull();
  }, TIMEOUT);
});

describe("Sola lettura onesta: chi non è amministratore guarda e basta", () => {
  it("niente interruttori accesi, niente salvataggio, niente cambio di ruolo, ma si leggono i gruppi", () => {
    const onSave = vi.fn();
    render(<UserRolesPermissionsTab user={persona({ can_view_orders: true })} onSave={onSave} readOnly />);

    expect(screen.getByRole("combobox", { name: "Ruolo principale" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^Nessuno$|^Come /i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Salva permessi/ })).toBeNull();
    // Gli «Attiva il gruppo …» ci sono ma non si possono premere, e i due pulsanti
    // che accendono o spengono tutto non compaiono affatto.
    const perGruppo = screen.getAllByRole("button", { name: /^Attiva il gruppo / });
    expect(perGruppo.length).toBeGreaterThan(3);
    for (const bottone of perGruppo) expect(bottone, bottone.getAttribute("aria-label") ?? "").toBeDisabled();
    expect(screen.queryByRole("button", { name: /^(Attiva|Disattiva) tutti i moduli$/ })).toBeNull();

    // I gruppi si aprono comunque: serve a leggere cosa ha la persona.
    // Il nome del gruppo porta con sé il conteggio («Cantieri & Lavori1/18»): così
    // non si confonde con «Attiva il gruppo Cantieri & Lavori», che gli sta accanto.
    const gruppoCantieri = screen.getByRole("button", { name: /^Cantieri & Lavori\s*\d+\s*\/\s*\d+$/ });
    fireEvent.click(gruppoCantieri);
    const ordini = screen.getByRole("switch", { name: "Ordini e Commesse" });
    expect(ordini).toHaveAttribute("aria-checked", "true");
    expect(ordini).toBeDisabled();
    for (const i of screen.getAllByRole("switch")) expect(i, i.id).toBeDisabled();
    fireEvent.click(ordini);
    expect(ordini).toHaveAttribute("aria-checked", "true");
    expect(onSave).not.toHaveBeenCalled();
    // Il pulsante che accende il gruppo intero non c'è da usare.
    expect(within(gruppoCantieri.parentElement as HTMLElement).getByRole("button", { name: /^Attiva il gruppo / })).toBeDisabled();
  }, TIMEOUT);

  it("una bozza non c'è mai se si guarda soltanto", () => {
    const onDirtyChange = vi.fn();
    render(<UserRolesPermissionsTab user={persona()} onSave={vi.fn()} readOnly onDirtyChange={onDirtyChange} />);
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
  }, TIMEOUT);
});
