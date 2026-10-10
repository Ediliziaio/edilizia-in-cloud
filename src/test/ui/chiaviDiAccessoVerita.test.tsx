/**
 * Impostazioni → API (chiavi di accesso): dice la verità (09/10/2026).
 *
 *   · Il limite di richieste era scritto a mano («100 richieste/minuto per chiave») ma quello vero è 60: ora il numero
 *     si legge da ogni chiave (`rate_limit_per_minute`), e nel testo non ce n'è nessuno.
 *   · La scheda «Utilizzo» legge un conteggio che nessuno compila (resta vuota anche se le chiavi lavorano) e la scheda
 *     «Documentazione» descrive un'API REST su un indirizzo che non esiste: entrambe lo dicono in cima, senza sparire.
 *   · Un solo h1 (lo mette la testata delle Impostazioni), permessi con un nome per chi usa il lettore di schermo.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Risposta = { data: unknown; error: unknown };

const db = vi.hoisted(() => ({ tabelle: {} as Record<string, { data: unknown; error: unknown }> }));
const sessione = vi.hoisted(() => ({ gestisce: true }));

vi.mock("@/integrations/supabase/client", () => {
  const catena = (tabella: string): unknown => {
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, metodo: string) {
          if (metodo === "then") {
            const risposta = db.tabelle[tabella] ?? { data: null, error: null };
            return (ok: (v: Risposta) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(risposta).then(ok, ko);
          }
          return () => proxy;
        },
      },
    );
    return proxy;
  };
  return {
    supabase: {
      from: (tabella: string) => catena(tabella),
      functions: { invoke: async (): Promise<Risposta> => ({ data: null as unknown, error: null as unknown }) },
      auth: { getUser: async () => ({ data: { user: { id: "utente-1" } } }) },
    },
  };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    effectiveCompany: { id: "azienda-1" },
    role: sessione.gestisce ? "company_admin" : "company_user",
  }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canEditSettingsIntegrations: sessione.gestisce }),
}));
// Il grafico non serve a queste prove: il suo contenuto lo sceglie il database di produzione.
vi.mock("@/components/api/ApiUsageChart", () => ({ ApiUsageChart: () => <div>grafico</div> }));

import SettingsApiKeys from "@/pages/azienda/settings/SettingsApiKeys";

const chiave = (extra: Record<string, unknown> = {}) => ({
  id: "k1",
  company_id: "azienda-1",
  name: "Claude Code di Marco",
  key_prefix: "sk_live_ab12",
  scopes: ["contacts:read", "stats:read"],
  is_active: true,
  last_used_at: "2026-10-08T10:00:00Z",
  expires_at: null as string | null,
  created_by: "utente-1",
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-01T10:00:00Z",
  revoked_at: null as string | null,
  rate_limit_per_minute: 60,
  rate_limit_per_day: 10000,
  sensitive_actions_per_day: 100,
  ...extra,
});

function monta() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SettingsApiKeys />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const apriScheda = (nome: RegExp) => fireEvent.mouseDown(screen.getByRole("tab", { name: nome }), { button: 0, ctrlKey: false });

beforeEach(() => {
  db.tabelle = { api_keys: { data: [chiave()], error: null } };
  sessione.gestisce = true;
});

afterEach(() => cleanup());

describe("il limite di richieste", () => {
  it("si legge da ogni chiave: 60 al minuto, non 100", async () => {
    monta();
    expect(await screen.findByText(/Limite: 60 richieste al minuto, 10\.000 al giorno/)).toBeTruthy();
    expect(screen.queryByText(/100 richieste/)).toBeNull();
  });

  it("segue la chiave: una chiave con un limite diverso lo mostra", async () => {
    db.tabelle.api_keys = { data: [chiave({ rate_limit_per_minute: 30, rate_limit_per_day: 2000 })], error: null };
    monta();
    expect(await screen.findByText(/Limite: 30 richieste al minuto, 2000 al giorno/)).toBeTruthy();
  });

  it("l'introduzione non scrive nessun numero a mano", async () => {
    monta();
    const intro = (await screen.findByText(/Una chiave permette a Claude Code/)).closest("div") as HTMLElement;
    expect(intro.textContent).not.toMatch(/\d+ richieste/);
  });

  it("dice che Claude sul sito e ChatGPT non usano le chiavi", async () => {
    monta();
    expect(await screen.findByText(/Claude sul sito e ChatGPT non usano le chiavi/)).toBeTruthy();
  });
});

describe("le schede che non funzionano lo dicono", () => {
  it("«Utilizzo»: il grafico non è ancora collegato", async () => {
    monta();
    await screen.findByText("Claude Code di Marco");
    apriScheda(/Utilizzo/);
    expect(await screen.findByText("Questo grafico non è ancora collegato.")).toBeTruthy();
    expect(screen.getByText("grafico")).toBeTruthy();
  });

  it("«Documentazione»: non è attiva, e la bozza dell'API sta chiusa", async () => {
    monta();
    await screen.findByText("Claude Code di Marco");
    apriScheda(/Documentazione/);
    expect(await screen.findByText("Questa documentazione non è attiva.")).toBeTruthy();
    const bozza = screen.getByText("Bozza dell'API REST (non ancora attiva)").closest("details") as HTMLDetailsElement;
    expect(bozza.open).toBe(false);
    // L'indirizzo che non esiste c'è solo dichiarato tale: nell'avviso e dentro la bozza chiusa.
    expect(within(bozza).getAllByText(/api\.ediliziaincloud\.com/).length).toBeGreaterThan(0);
  });
});

describe("titolo e accessibilità", () => {
  it("la pagina non scrive un suo h1 (c'è già quello della testata)", async () => {
    monta();
    await screen.findByText("Claude Code di Marco");
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
  });

  it("nella finestra della nuova chiave nome e permessi hanno un nome", async () => {
    monta();
    fireEvent.click(await screen.findByRole("button", { name: /Nuova chiave/ }));
    expect(await screen.findByLabelText("Nome della chiave *")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "CRM: Leggi contatti" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "CRM: tutto" })).toBeTruthy();
  });

  it("i permessi della chiave si leggono in italiano, non come contacts:read", async () => {
    monta();
    expect(await screen.findByText("Leggi contatti")).toBeTruthy();
    expect(screen.queryByText("contacts:read")).toBeNull();
  });
});

describe("chi può solo consultare", () => {
  it("non crea, e legge cosa serve", async () => {
    sessione.gestisce = false;
    monta();
    expect(await screen.findByText(/serve il permesso «Integrazioni & Canali» in modifica/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Nuova chiave/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
