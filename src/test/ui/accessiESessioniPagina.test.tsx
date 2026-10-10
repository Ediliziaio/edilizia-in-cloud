/**
 * «Accessi e sessioni» (era «Security dashboard»), 09/10/2026.
 *
 *  - «Sessioni attive» diceva 131 quando nessuno era collegato: erano sessioni
 *    rimaste aperte. Ora «Collegati adesso» conta le persone viste attive negli
 *    ultimi 10 minuti, e le sessioni rimaste aperte sono una nota.
 *  - «Audit Log» mostrava user_deleted, role_changed, user_locked… col codice
 *    inglese e i dettagli in JSON. Ora il nome è italiano e i dettagli una frase.
 *  - Titolo h2 (l'h1 lo mette la pagina), pulsanti senza testo con un nome.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const stato = vi.hoisted(() => ({
  sezioni: {} as Record<string, unknown>,
  sezioniInErrore: new Set<string>(),
  sessioniRecenti: [] as Array<Record<string, unknown>>,
  chiamateAFunzioni: [] as Array<{ nome: string; body: Record<string, unknown> }>,
  filtriSessioni: [] as Array<{ metodo: string; args: unknown[] }>,
  toasts: [] as Array<{ tipo: string; titolo: string; descrizione?: string }>,
}));

vi.mock("@/integrations/supabase/client", () => {
  const sessioni = () => {
    const b: Record<string, unknown> = {};
    for (const metodo of ["select", "eq", "gte", "limit"]) {
      b[metodo] = (...args: unknown[]) => {
        stato.filtriSessioni.push({ metodo, args });
        return b;
      };
    }
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: stato.sessioniRecenti, error: null }).then(ok);
    return b;
  };
  return {
    supabase: {
      from: (tabella: string) => (tabella === "user_sessions" ? sessioni() : sessioni()),
      functions: {
        invoke: async (nome: string, opzioni: { body: Record<string, unknown> }) => {
          stato.chiamateAFunzioni.push({ nome, body: opzioni.body });
          if (nome === "get-security-report") {
            const sezione = String(opzioni.body.section);
            if (stato.sezioniInErrore.has(sezione)) return { data: null as unknown, error: { message: "boom" } };
            return { data: stato.sezioni[sezione] ?? {}, error: null };
          }
          return { data: { revoked_count: 1 }, error: null };
        },
      },
    },
  };
});
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "admin-1" }, role: "company_admin", effectiveCompany: { id: "az-1" } }),
}));
vi.mock("sonner", () => ({
  toast: {
    success: (titolo: string, o?: { description?: string }) => stato.toasts.push({ tipo: "ok", titolo, descrizione: o?.description }),
    error: (titolo: string, o?: { description?: string }) => stato.toasts.push({ tipo: "errore", titolo, descrizione: o?.description }),
  },
}));

Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  releasePointerCapture: () => {},
  setPointerCapture: () => {},
  scrollIntoView: () => {},
});

import SettingsSecurityDashboard from "@/pages/azienda/settings/SettingsSecurityDashboard";

const adesso = Date.now();
const minutiFa = (m: number) => new Date(adesso - m * 60_000).toISOString();

function pagina() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><SettingsSecurityDashboard /></MemoryRouter>
    </QueryClientProvider>,
  );
}

function apriScheda(nome: string) {
  fireEvent.mouseDown(screen.getByRole("tab", { name: new RegExp(nome) }), { button: 0, ctrlKey: false });
}

beforeEach(() => {
  stato.sezioniInErrore = new Set();
  stato.chiamateAFunzioni = [];
  stato.filtriSessioni = [];
  stato.toasts = [];
  stato.sessioniRecenti = [
    { user_id: "mario", is_active: true, last_active_at: minutiFa(2) },
    { user_id: "mario", is_active: true, last_active_at: minutiFa(4) },
    { user_id: "anna", is_active: true, last_active_at: minutiFa(8) },
  ];
  stato.sezioni = {
    overview: { overview: { active_sessions: 131, failed_attempts_24h: 3, locked_count: 0, locked_accounts: [], total_users: 12 } },
    sessions: {
      sessions: [
        {
          id: "s-1", user_id: "mario", is_active: true, started_at: minutiFa(300), last_active_at: minutiFa(2), browser: "Chrome", ip_address: "10.0.0.1",
          profiles: { first_name: "Mario", last_name: "Rossi" },
        },
        {
          id: "s-2", user_id: "luca", is_active: false, revoked_by: "admin-1", started_at: minutiFa(9000), last_active_at: minutiFa(8000), browser: "Safari",
          profiles: { first_name: "Luca", last_name: "Neri" },
        },
      ],
    },
    login_attempts: { login_attempts: [{ id: "t-1", email: "mario@esempio.it", ip_address: "10.0.0.1", success: true, created_at: minutiFa(30) }] },
    audit_log: {
      audit_log: [
        {
          id: "a-1", action: "user_deleted", created_at: minutiFa(60), actor: { first_name: "Anna", last_name: "Bianchi" }, target: null,
          details: { target_email: "luca@esempio.it", roles: ["company_staff"], secondary_access_only: false, reassign_to_user_id: "39e05a1b-f998-48d8-aab7-9aafb25a4a2a" },
        },
        {
          id: "a-2", action: "role_changed", created_at: minutiFa(90), actor: { first_name: "Anna", last_name: "Bianchi" }, target: { first_name: "Mario", last_name: "Rossi" },
          details: { from: "call_center", to: "company_admin", multiCompanyAccess: false },
        },
        { id: "a-3", action: "user_locked", created_at: minutiFa(120), actor: { first_name: "Anna", last_name: "Bianchi" }, target: { first_name: "Luca", last_name: "Neri" }, details: { source: "scheda_utente", blocked: true } },
        { id: "a-4", action: "evento_mai_visto", created_at: minutiFa(150), actor: null, target: null, details: { chiave: "valore" } },
      ],
    },
  };
});
afterEach(cleanup);

describe("Accessi e sessioni: intestazione e numeri", () => {
  it("h2 (non h1), e rimanda alla password personale e al Controllo accessi", async () => {
    pagina();
    expect(await screen.findByRole("heading", { level: 2, name: "Accessi e sessioni" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("link", { name: "Il mio profilo → Sicurezza" })).toHaveAttribute("href", "/azienda/impostazioni/mio-profilo?tab=sicurezza");
    expect(screen.getByRole("link", { name: "Persone & Accessi → Controllo accessi" })).toHaveAttribute("href", "/azienda/impostazioni/persone?tab=sicurezza-accessi");
  });

  it("«Collegati adesso» conta le PERSONE viste di recente, non le 131 sessioni rimaste aperte", async () => {
    pagina();
    const kpi = (await screen.findByText("Collegati adesso")).closest("div")!.parentElement!;
    expect(within(kpi).getByText("2")).toBeInTheDocument();
    expect(within(kpi).getByText("131 sessioni rimaste aperte")).toBeInTheDocument();
    // La lettura è solo delle sessioni aperte e viste di recente, dell'azienda giusta.
    expect(stato.filtriSessioni).toEqual(expect.arrayContaining([
      { metodo: "eq", args: ["company_id", "az-1"] },
      { metodo: "eq", args: ["is_active", true] },
    ]));
    const soglia = stato.filtriSessioni.find((f) => f.metodo === "gte");
    expect(soglia?.args[0]).toBe("last_active_at");
    const minuti = (Date.now() - new Date(String(soglia?.args[1])).getTime()) / 60_000;
    expect(minuti).toBeGreaterThan(9.9);
    expect(minuti).toBeLessThan(10.5);
    // Gli altri numeri hanno parole da titolare.
    expect(screen.getByText("Accessi falliti nelle ultime 24 ore")).toBeInTheDocument();
    expect(screen.getByText("Accessi bloccati")).toBeInTheDocument();
    expect(screen.getByText("Persone")).toBeInTheDocument();
    expect(screen.queryByText(/Sessioni attive|Tentativi falliti \(24h\)|Utenti totali|Account bloccati/)).toBeNull();
  });

  it("con una sola sessione rimasta aperta lo dice al singolare", async () => {
    stato.sezioni.overview = { overview: { active_sessions: 1, failed_attempts_24h: 0, locked_count: 0, locked_accounts: [], total_users: 1 } };
    pagina();
    expect(await screen.findByText("1 sessione rimasta aperta")).toBeInTheDocument();
  });

  it("se una lettura fallisce lo dice e permette di riprovare", async () => {
    stato.sezioniInErrore.add("audit_log");
    pagina();
    const avviso = await screen.findByRole("alert");
    expect(avviso).toHaveTextContent("Alcuni dati non si sono caricati.");
    expect(within(avviso).getByRole("button", { name: "Riprova" })).toBeInTheDocument();
  });
});

describe("Accessi e sessioni: le schede", () => {
  it("le schede hanno nomi italiani", async () => {
    pagina();
    await screen.findByText("Collegati adesso");
    for (const nome of ["Collegati", "Tentativi di accesso", "Azioni sugli utenti"]) {
      expect(screen.getByRole("tab", { name: new RegExp(nome) })).toBeInTheDocument();
    }
    expect(screen.queryByRole("tab", { name: /Tentativi Login|Audit Log/ })).toBeNull();
  });

  it("Azioni sugli utenti: il nome italiano e una frase, non il codice né il JSON", async () => {
    const { container } = pagina();
    await screen.findByText("Collegati adesso");
    apriScheda("Azioni sugli utenti");

    expect(await screen.findByText("Utente eliminato")).toBeInTheDocument();
    expect(screen.getByText("luca@esempio.it · Operatore")).toBeInTheDocument();
    expect(screen.getByText("Ruolo cambiato")).toBeInTheDocument();
    expect(screen.getByText("Da Call Center a Amministratore")).toBeInTheDocument();
    expect(screen.getByText("Accesso bloccato")).toBeInTheDocument();
    expect(screen.getByText("Dalla scheda utente")).toBeInTheDocument();
    // Il codice inglese e l'identificativo non si vedono.
    expect(container.textContent ?? "").not.toMatch(/user_deleted|role_changed|user_locked|39e05a1b/);
    // Un'azione che non conosciamo diventa una frase, e i dati tecnici restano chiusi a disposizione.
    expect(screen.getByText("Evento mai visto")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dati tecnici/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Dati tecnici/ })).toHaveLength(1);
    for (const colonna of ["Cosa è successo", "Chi", "Su chi", "Dettagli", "Quando"]) {
      expect(screen.getByRole("columnheader", { name: colonna })).toBeInTheDocument();
    }
  });

  it("Collegati: la sessione si chiude con un pulsante che ha un nome, e il motivo è in italiano", async () => {
    pagina();
    await screen.findByText("Collegati adesso");

    expect(screen.getByText("Aperta")).toBeInTheDocument();
    expect(screen.getByText("Chiusa da un amministratore")).toBeInTheDocument();
    expect(screen.getByText(/1 sessione è rimasta aperta su 2 recenti/)).toBeInTheDocument();
    // Mario è l'amministratore stesso? No: admin-1 è un altro, quindi il pulsante c'è.
    fireEvent.click(screen.getByRole("button", { name: "Chiudi la sessione di Mario Rossi" }));
    expect(await screen.findByText("Chiudere la sessione?")).toBeInTheDocument();
    expect(screen.getByText("La sessione di Mario Rossi si chiude subito.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Chiudi la sessione" }));

    await waitFor(() => expect(stato.chiamateAFunzioni.some((c) => c.nome === "revoke-user-session")).toBe(true));
    const chiamata = stato.chiamateAFunzioni.find((c) => c.nome === "revoke-user-session")!;
    expect(chiamata.body).toEqual({ reason: "Chiusa dall'amministratore", session_id: "s-1" });
    await waitFor(() => expect(stato.toasts.some((t) => t.titolo === "Sessione chiusa")).toBe(true));
  });

  it("Tentativi di accesso: esito e colonne in italiano", async () => {
    pagina();
    await screen.findByText("Collegati adesso");
    apriScheda("Tentativi di accesso");
    expect(await screen.findByText("Riuscito")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Indirizzo (IP)" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Quando" })).toBeInTheDocument();
    expect(screen.queryByText("Successo")).toBeNull();
  });
});
