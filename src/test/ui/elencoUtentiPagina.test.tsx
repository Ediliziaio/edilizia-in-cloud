/**
 * Persone & Accessi → Utenti (l'elenco), 10/10/2026.
 *
 *  - «Online» diceva 76 persone quando nessuno lo era: contava le sessioni rimaste
 *    aperte. Ora «Collegato adesso» vuole un segno di vita negli ultimi 10 minuti.
 *  - Il blocco per password sbagliate dice fino a quando; non si confonde con
 *    l'accesso bloccato dall'amministratore.
 *  - I ruoli hanno gli stessi nomi di tutte le altre schermate.
 *  - Creare, importare, bloccare, cambiare i ruoli ed eliminare le persone è
 *    dell'amministratore: gli altri vedono l'elenco e aprono la scheda in sola
 *    lettura, ma non trovano pulsanti che poi rispondono con un rifiuto.
 *  - L'importazione dice quali colonne vuole, e un ruolo scritto male non diventa
 *    «Operatore» di nascosto.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";

const adesso = Date.now();
const minutiFa = (m: number) => new Date(adesso - m * 60_000).toISOString();
const giorniFa = (g: number) => new Date(adesso - g * 86_400_000).toISOString();
const traMinuti = (m: number) => new Date(adesso + m * 60_000).toISOString();

const stato = vi.hoisted(() => ({
  mobile: false,
  isAdmin: true,
  canEditSettingsPeople: false,
  canViewSettingsPeople: true,
  persone: [] as Array<Record<string, unknown>>,
  profili: [] as Array<Record<string, unknown>>,
  sessioni: [] as Array<Record<string, unknown>>,
  chiamateFunzioni: [] as Array<{ nome: string; body: Record<string, unknown> }>,
  rispostaFunzione: { data: { success: true } as unknown, error: null as unknown },
  toasts: [] as Array<{ tipo: string; testo: string; descrizione?: string }>,
}));

vi.mock("@/integrations/supabase/client", () => {
  const catena = (tabella: string) => {
    const b: Record<string, unknown> = {};
    for (const metodo of ["select", "eq", "in", "order", "limit"]) b[metodo] = () => b;
    b.insert = () => Promise.resolve({ data: null as unknown, error: null as unknown });
    b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
      let data: unknown[] = [];
      if (tabella === "profiles") data = stato.profili;
      else if (tabella === "user_sessions") data = stato.sessioni;
      return Promise.resolve({ data, error: null as unknown }).then(ok, ko);
    };
    return b;
  };
  return {
    supabase: {
      from: (tabella: string) => catena(tabella),
      rpc: () => ({ then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: stato.persone, error: null as unknown }).then(ok) }),
      functions: {
        invoke: async (nome: string, opzioni: { body: Record<string, unknown> }) => {
          stato.chiamateFunzioni.push({ nome, body: opzioni.body });
          return stato.rispostaFunzione;
        },
      },
    },
  };
});
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u-admin", email: "anna@x.it" },
    effectiveCompany: { id: "c1" },
    profile: { id: "u-admin", first_name: "Anna", last_name: "Neri", email: "anna@x.it", phone: null as unknown, last_login_at: null as unknown, locked_until: null as unknown, failed_login_count: 0 },
    role: "company_admin",
  }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    isAdmin: stato.isAdmin,
    canEditSettingsPeople: stato.canEditSettingsPeople,
    canViewSettingsPeople: stato.canViewSettingsPeople,
  }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => stato.mobile }));
vi.mock("@/components/users/CreateUserWizard", () => ({ CreateUserWizard: (): null => null }));
vi.mock("sonner", () => ({
  toast: Object.assign(
    (testo: string) => stato.toasts.push({ tipo: "neutro", testo }),
    {
      success: (testo: string, o?: { description?: string }) => stato.toasts.push({ tipo: "ok", testo, descrizione: o?.description }),
      error: (testo: string, o?: { description?: string }) => stato.toasts.push({ tipo: "errore", testo, descrizione: o?.description }),
      warning: (testo: string) => stato.toasts.push({ tipo: "avviso", testo }),
    },
  ),
}));

Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  releasePointerCapture: () => {},
  setPointerCapture: () => {},
  scrollIntoView: () => {},
});

import { UsersConfig } from "@/components/settings/UsersConfig";

function Posizione() {
  return <output data-testid="url">{useLocation().pathname + useLocation().search}</output>;
}

function elenco() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <UsersConfig />
        <Posizione />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function riga(nome: string) {
  return screen.getByText(nome).closest("tr")!;
}

beforeEach(() => {
  stato.mobile = false;
  stato.isAdmin = true;
  stato.canEditSettingsPeople = false;
  stato.canViewSettingsPeople = true;
  stato.persone = [
    { id: "u-admin", first_name: "Anna", last_name: "Neri", email: "anna@x.it", roles: ["company_admin"] },
    { id: "u-paolo", first_name: "Paolo", last_name: "Gialli", email: "paolo@x.it", roles: ["employee"] },
    { id: "u-maria", first_name: "Maria", last_name: "Rossi", email: "maria@x.it", roles: ["company_staff"] },
    { id: "u-luca", first_name: "Luca", last_name: "Verdi", email: "luca@x.it", roles: ["salesperson"] },
  ];
  stato.profili = [
    { id: "u-admin", first_name: "Anna", last_name: "Neri", email: "anna@x.it", phone: null as unknown, company_id: "c1", last_login_at: giorniFa(2), locked_until: null as unknown, failed_login_count: 0, is_blocked: false },
    { id: "u-paolo", first_name: "Paolo", last_name: "Gialli", email: "paolo@x.it", phone: null as unknown, company_id: "c1", last_login_at: giorniFa(60), locked_until: null as unknown, failed_login_count: 0, is_blocked: false },
    { id: "u-maria", first_name: "Maria", last_name: "Rossi", email: "maria@x.it", phone: null as unknown, company_id: "c1", last_login_at: giorniFa(1), locked_until: traMinuti(30), failed_login_count: 5, is_blocked: false },
    { id: "u-luca", first_name: "Luca", last_name: "Verdi", email: "luca@x.it", phone: null as unknown, company_id: "c1", last_login_at: null as unknown, locked_until: null as unknown, failed_login_count: 0, is_blocked: false },
  ];
  // Paolo ha una sessione rimasta aperta da 20 giorni; Anna è attiva da 3 minuti.
  stato.sessioni = [
    { user_id: "u-paolo", last_active_at: giorniFa(20) },
    { user_id: "u-admin", last_active_at: minutiFa(3) },
  ];
  stato.chiamateFunzioni = [];
  stato.rispostaFunzione = { data: { success: true }, error: null as unknown };
  stato.toasts = [];
});
afterEach(cleanup);

describe("Elenco utenti: stato e ruoli", () => {
  it("«Collegato adesso» solo con un segno di vita recente; la sessione dimenticata aperta non conta", async () => {
    elenco();
    await screen.findByText("Paolo Gialli");
    expect(within(riga("Anna Neri")).getByText("Collegato adesso")).toBeVisible();
    expect(within(riga("Paolo Gialli")).queryByText(/Collegato adesso|Online/)).toBeNull();
    expect(within(riga("Paolo Gialli")).getByText(/^Visto /)).toBeVisible();
    expect(within(riga("Luca Verdi")).getByText("Mai connesso")).toBeVisible();
    expect(screen.queryByText("Online")).toBeNull();
    // Il riepilogo conta una sola persona, non due.
    expect(screen.getByRole("button", { name: /1 collegato adesso/ })).toBeVisible();
  });

  it("chi usa l'app ogni giorno con la sessione aperta non risulta fermo all'ultimo accesso", async () => {
    // Paolo non fa il login da 60 giorni, ma la sua sessione è stata vista 20 giorni fa: «Visto 20 giorni fa».
    elenco();
    await screen.findByText("Paolo Gialli");
    expect(within(riga("Paolo Gialli")).getByText(/Visto .*(20 giorni|circa 1 mese)/)).toBeVisible();
  });

  it("il blocco per password sbagliate dice fino a quando e perché", async () => {
    elenco();
    await screen.findByText("Maria Rossi");
    expect(within(riga("Maria Rossi")).getByText(/Bloccato fino alle \d\d:\d\d \(password sbagliate\)|Bloccato fino al \d\d\/\d\d alle \d\d:\d\d \(password sbagliate\)/)).toBeVisible();
    expect(screen.queryByText(/Bloccato temporaneo/)).toBeNull();
  });

  it("su telefono il blocco ha la frase corta, così il nome della persona resta leggibile", async () => {
    stato.mobile = true;
    elenco();
    expect(await screen.findByText("Maria Rossi")).toBeVisible();
    expect(screen.getByText(/^Bloccato fino (alle|al) /)).toBeVisible();
    expect(screen.queryByText(/password sbagliate/)).toBeNull();
    expect(screen.getByText("Collegato adesso")).toBeVisible();
  });

  it("i ruoli hanno i nomi di tutte le altre schermate", async () => {
    elenco();
    await screen.findByText("Paolo Gialli");
    expect(within(riga("Anna Neri")).getByText("Amministratore")).toBeVisible();
    expect(within(riga("Paolo Gialli")).getByText("Operaio / Tecnico")).toBeVisible();
    expect(within(riga("Maria Rossi")).getByText("Operatore")).toBeVisible();
    expect(within(riga("Luca Verdi")).getByText("Venditore")).toBeVisible();
    expect(screen.queryByText("Admin")).toBeNull();
  });
});

describe("Elenco utenti: chi può fare cosa", () => {
  it("l'amministratore ha creazione, importazione, selezione e azioni", async () => {
    elenco();
    await screen.findByText("Paolo Gialli");
    // Due pulsanti con lo stesso nome: il «+» del telefono e quello con la scritta.
    expect(screen.getAllByRole("button", { name: "Nuovo utente" }).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/Importa persone da un file CSV \(colonne: Nome, Cognome, Email, Telefono, Ruolo\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Esporta \(CSV\)/ })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Seleziona Paolo Gialli" })).toBeVisible();
    expect(screen.getByText(/Per importare: un file CSV con le colonne Nome, Cognome, Email, Telefono, Ruolo/)).toBeVisible();
    fireEvent.keyDown(screen.getByRole("button", { name: "Azioni per Paolo Gialli" }), { key: "Enter" });
    expect(await screen.findByRole("menuitem", { name: /Blocca accesso/ })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: /Elimina/ })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: /Aggiungi ruolo Venditore/ })).toBeVisible();
  });

  it("«Team & Utenti — Modifica» non basta: il server rifiuta, quindi i pulsanti non ci sono", async () => {
    stato.isAdmin = false;
    stato.canEditSettingsPeople = true;
    elenco();
    await screen.findByText("Paolo Gialli");
    expect(screen.queryByRole("button", { name: "Nuovo utente" })).toBeNull();
    expect(screen.queryByLabelText(/Importa persone da un file CSV/)).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("chi può solo guardare apre la scheda dalla riga, ma non trova azioni da amministratore", async () => {
    stato.isAdmin = false;
    elenco();
    await screen.findByText("Paolo Gialli");
    expect(screen.queryByRole("button", { name: "Nuovo utente" })).toBeNull();
    fireEvent.keyDown(screen.getByRole("button", { name: "Azioni per Paolo Gialli" }), { key: "Enter" });
    expect(await screen.findByRole("menuitem", { name: /Apri la scheda/ })).toBeVisible();
    expect(screen.queryByRole("menuitem", { name: /Blocca accesso|Elimina|Aggiungi ruolo/ })).toBeNull();
    fireEvent.keyDown(document.body, { key: "Escape" });
    fireEvent.click(riga("Paolo Gialli"));
    expect(screen.getByTestId("url")).toHaveTextContent("/azienda/impostazioni/utenti/u-paolo");
  });

  it("senza il permesso di vedere le persone la riga non si apre", async () => {
    stato.isAdmin = false;
    stato.canViewSettingsPeople = false;
    elenco();
    await screen.findByText("Paolo Gialli");
    expect(screen.queryByRole("button", { name: "Azioni per Paolo Gialli" })).toBeNull();
    fireEvent.click(riga("Paolo Gialli"));
    expect(screen.getByTestId("url")).toHaveTextContent("/");
    expect(screen.getByTestId("url")).not.toHaveTextContent("utenti/u-paolo");
  });
});

describe("Elenco utenti: importazione e eliminazione", () => {
  function scegliFile(testo: string) {
    const input = screen.getByLabelText(/Importa persone da un file CSV/) as HTMLInputElement;
    const file = { name: "persone.csv", text: async () => testo } as unknown as File;
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);
  }

  it("importa le righe buone, scarta le altre dicendo perché, e un ruolo scritto male non diventa Operatore", async () => {
    elenco();
    await screen.findByText("Paolo Gialli");
    scegliFile([
      "Nome,Cognome,Email,Telefono,Ruolo,Ultimo accesso",
      "Giulia,Bianchi,giulia@x.it,,Operaio / Tecnico,Mai",
      "Marco,Blu,marco@x.it,,Vendtore,Mai",
      "Ada,Neri,ada@x.it,,Amministratore,Mai",
    ].join("\n"));
    await waitFor(() => expect(stato.toasts.some((t) => t.tipo === "errore")).toBe(true));
    const creazioni = stato.chiamateFunzioni.filter((c) => c.nome === "create-company-staff");
    expect(creazioni).toHaveLength(1);
    expect(creazioni[0].body).toMatchObject({ first_name: "Giulia", email: "giulia@x.it", role_type: "employee" });
    expect(stato.toasts.some((t) => t.tipo === "ok" && t.testo === "1 persona importata")).toBe(true);
    const errore = stato.toasts.find((t) => t.tipo === "errore")!;
    expect(errore.testo).toBe("2 righe non importate");
    expect(errore.descrizione).toMatch(/Riga 3: marco@x\.it — Ruolo non riconosciuto/);
    expect(errore.descrizione).toMatch(/Riga 4: ada@x\.it — Gli amministratori si creano a mano/);
  });

  it("un file vuoto dice quali colonne servono", async () => {
    elenco();
    await screen.findByText("Paolo Gialli");
    scegliFile("Nome,Cognome,Email,Telefono,Ruolo");
    await waitFor(() => expect(stato.toasts.length).toBeGreaterThan(0));
    expect(stato.toasts[0].testo).toBe("Il file è vuoto o non ha le colonne giuste. Servono: Nome, Cognome, Email, Telefono, Ruolo.");
    expect(stato.chiamateFunzioni).toHaveLength(0);
  });

  it("se l'eliminazione non riesce, il motivo arriva in italiano", async () => {
    stato.rispostaFunzione = {
      data: null as unknown,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: { json: async () => ({ error: "Only company admins can create staff users" }) },
      },
    };
    elenco();
    await screen.findByText("Paolo Gialli");
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona Paolo Gialli" }));
    fireEvent.click(await screen.findByRole("button", { name: "Elimina" }));
    expect(await screen.findByText("Eliminare 1 persona?")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Elimina i selezionati" }));
    await waitFor(() => expect(stato.toasts.some((t) => t.tipo === "errore")).toBe(true));
    const errore = stato.toasts.find((t) => t.tipo === "errore")!;
    expect(errore.testo).toBe("1 persona non eliminata: Solo un amministratore può creare nuovi utenti.");
    expect(errore.testo).not.toMatch(/non-2xx/);
  });
});
