/**
 * Integrazioni: lo stato di WhatsApp è quello vero e «Disconnetti» c'è solo dove disconnette (09/10/2026).
 *
 * 1. La scheda «WhatsApp Business» guardava solo il numero «Operativo / Cantieri»: chi aveva numeri Marketing o Lead
 *    attivi vedeva «Non collegato» e «Configura» mentre i messaggi arrivavano.
 * 2. Nel menu delle schede «Disconnetti» c'era per Claude, ChatGPT, WhatsApp, Google Ads e Google Business Profile, ma
 *    mostrava solo un avviso e portava altrove: l'unica disconnessione vera è quella di Meta.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Risposta = { data: unknown; error: unknown };

const db = vi.hoisted(() => ({
  tabelle: {} as Record<string, { data: unknown; error: unknown }>,
  chiamate: [] as Array<{ tabella: string; metodo: string; argomenti: unknown[] }>,
}));
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
          return (...argomenti: unknown[]) => {
            db.chiamate.push({ tabella, metodo, argomenti });
            return proxy;
          };
        },
      },
    );
    return proxy;
  };
  return {
    supabase: {
      from: (tabella: string) => catena(tabella),
      functions: { invoke: async (): Promise<Risposta> => ({ data: null, error: null }) },
      auth: { getSession: async () => ({ data: { session: null as unknown } }) },
    },
  };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    effectiveCompany: { id: "azienda-1" },
    user: { id: "utente-1" },
    role: sessione.gestisce ? "company_admin" : "company_user",
  }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    isAdmin: sessione.gestisce,
    canEditSettingsIntegrations: sessione.gestisce,
    canViewTesoreria: false,
    isLoading: false,
  }),
}));
vi.mock("@/hooks/useStatoPiano", () => ({
  useStatoPiano: () => ({
    stato: { tuttoVisibile: true, pianoLimitato: false, moduloIncluso: () => true, livelloFunzione: () => "enabled" },
  }),
}));
vi.mock("@/hooks/useApiKeys", () => ({ useApiKeys: () => ({ data: [] as unknown[], isError: false, isLoading: false }) }));
vi.mock("@/hooks/useOAuthGrants", () => ({ useOAuthGrants: () => ({ data: [] as unknown[], isError: false, isLoading: false }) }));
vi.mock("@/components/integrations/CompanyCalendarsOverview", async (originale) => ({
  ...(await originale<object>()),
  useCalendariDelTeam: () => ({ isAdmin: false, righe: [] as unknown[] }),
}));
vi.mock("@/components/integrations/CompanyEmailsOverview", async (originale) => ({
  ...(await originale<object>()),
  useCaselleDelTeam: () => ({ isAdmin: false, righe: [] as unknown[] }),
}));
vi.mock("@/components/integrations/EmailDomainAuthPanel", async (originale) => ({
  ...(await originale<object>()),
  useAutenticazioneDomini: () => ({ daSistemare: [] as unknown[] }),
}));
vi.mock("@/components/integrations/BankConnectionsCard", async (originale) => ({
  ...(await originale<object>()),
  useConnessioniBanca: () => ({ data: [] as unknown[] }),
}));
vi.mock("@/components/integrations/StripePaymentsCard", async (originale) => ({
  ...(await originale<object>()),
  useStatoIncassiCarta: () => ({ data: undefined as unknown }),
}));

import SettingsIntegrations from "@/pages/azienda/settings/SettingsIntegrations";
import IntegrationsGrid, { type IntegrationStatusMap } from "@/components/integrations/IntegrationsGrid";
import { INTEGRATIONS_CATALOG } from "@/components/integrations/IntegrationsCatalog";

const POINTER = { button: 0, ctrlKey: false, pointerType: "mouse" } as const;

function montaPagina() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/azienda/impostazioni/integrazioni"]}>
        <SettingsIntegrations />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** La scheda di una integrazione (titolo h3 → la `Card` che lo contiene). */
function scheda(nome: string): HTMLElement {
  const titolo = screen.getByRole("heading", { level: 3, name: nome });
  return titolo.closest("div.relative") as HTMLElement;
}

beforeEach(() => {
  db.tabelle = {};
  db.chiamate.length = 0;
  sessione.gestisce = true;
});

afterEach(() => cleanup());

describe("scheda «WhatsApp Business»", () => {
  it("un'azienda con un numero Marketing attivo vede «Collegato», non «Non collegato»", async () => {
    // Il caso reale: nessun numero «Operativo / Cantieri», un numero Marketing attivo e verificato.
    db.tabelle.ai_whatsapp_numbers = {
      data: [{ id: "n1", stato: "active", webhook_verified: true, numero: "+39 352 296 3510" }],
      error: null,
    };
    montaPagina();

    const whatsapp = scheda("WhatsApp Business");
    await waitFor(() => expect(within(whatsapp).getByText("Collegato")).toBeTruthy());
    expect(within(whatsapp).getByText("Numero: +39 352 296 3510")).toBeTruthy();
    expect(within(whatsapp).getByRole("button", { name: "Apri" })).toBeTruthy();
    expect(within(whatsapp).queryByText("Non collegato")).toBeNull();
  });

  it("legge i numeri di ogni scopo dell'azienda (nessun filtro sullo scopo) e solo colonne senza segreti", async () => {
    db.tabelle.ai_whatsapp_numbers = { data: [], error: null };
    montaPagina();
    await waitFor(() => expect(db.chiamate.some((c) => c.tabella === "ai_whatsapp_numbers")).toBe(true));

    const suiNumeri = db.chiamate.filter((c) => c.tabella === "ai_whatsapp_numbers");
    expect(suiNumeri.find((c) => c.metodo === "eq")?.argomenti).toEqual(["company_id", "azienda-1"]);
    expect(suiNumeri.some((c) => c.metodo === "eq" && c.argomenti[0] === "purpose")).toBe(false);
    const colonne = String(suiNumeri.find((c) => c.metodo === "select")?.argomenti[0]);
    expect(colonne).not.toContain("*");
    expect(colonne).not.toMatch(/access_token|cloud_api_pin/);
  });

  it("senza numeri resta «Non collegato» con «Configura»", async () => {
    db.tabelle.ai_whatsapp_numbers = { data: [], error: null };
    montaPagina();
    const whatsapp = scheda("WhatsApp Business");
    await waitFor(() => expect(within(whatsapp).getByRole("button", { name: "Configura" })).toBeTruthy());
    expect(within(whatsapp).getByText("Non collegato")).toBeTruthy();
  });

  it("se la lettura dei numeri non riesce NON dice «Non collegato»", async () => {
    db.tabelle.ai_whatsapp_numbers = { data: null, error: { message: "boom" } };
    montaPagina();
    const whatsapp = scheda("WhatsApp Business");
    await waitFor(() => expect(within(whatsapp).getByText("Stato non verificabile · riprova")).toBeTruthy());
    expect(within(whatsapp).queryByText("Non collegato")).toBeNull();
  });
});

describe("«Disconnetti» nel menu delle schede", () => {
  const tuttiCollegati: IntegrationStatusMap = Object.fromEntries(
    INTEGRATIONS_CATALOG.map((i) => [i.id, { status: "connected" as const, detail: null as string | null }]),
  );

  function montaGriglia(onDisconnect: (id: string) => void) {
    render(
      <MemoryRouter>
        <IntegrationsGrid
          items={INTEGRATIONS_CATALOG}
          statuses={tuttiCollegati}
          canManage
          onDisconnect={(item) => onDisconnect(item.id)}
        />
      </MemoryRouter>,
    );
  }

  it("c'è solo per Meta, l'unica integrazione che si disconnette dal menu", async () => {
    montaGriglia(() => undefined);
    const conDisconnetti: string[] = [];
    for (const item of INTEGRATIONS_CATALOG) {
      const menu = screen.queryByRole("button", { name: `Altre azioni per ${item.name}` });
      if (!menu) continue;
      fireEvent.pointerDown(menu, POINTER);
      if (await screen.findAllByRole("menuitem").then((voci) => voci.some((v) => v.textContent === "Disconnetti"))) {
        conDisconnetti.push(item.id);
      }
      fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
      await waitFor(() => expect(screen.queryAllByRole("menuitem")).toHaveLength(0));
    }
    expect(conDisconnetti).toEqual(["meta"]);
  });

  it("scegliendola per Meta, la griglia avvisa la pagina (che apre la conferma di Meta)", async () => {
    const chiamate: string[] = [];
    montaGriglia((id) => chiamate.push(id));
    fireEvent.pointerDown(screen.getByRole("button", { name: "Altre azioni per Facebook e Instagram" }), POINTER);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Disconnetti" }));
    expect(chiamate).toEqual(["meta"]);
  });
});

describe("avviso per chi non gestisce le integrazioni", () => {
  it("dice cosa serve, con il nome del permesso com'è nelle impostazioni", async () => {
    sessione.gestisce = false;
    db.tabelle.ai_whatsapp_numbers = { data: [], error: null };
    montaPagina();
    expect(await screen.findByText("Stai solo consultando")).toBeTruthy();
    expect(screen.getByText(/permesso «Integrazioni & Canali» in modifica/)).toBeTruthy();
  });
});
