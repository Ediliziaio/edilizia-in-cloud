/**
 * Pagina «Bot WhatsApp» (versione classica): dice per prima che non è più in uso (09/10/2026).
 *
 * La tabella `messaging_whatsapp_config` ha 0 righe in tutto il database e il bot di cantiere non guarda le sue
 * impostazioni: legge quelle del numero (`ai_whatsapp_numbers.operational_settings`). La pagina resta raggiungibile
 * (la voce non si toglie), ma non deve far credere che comandi il bot, né promettere un collegamento che non c'è.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Risposta = { data: unknown; error: unknown; count?: number };

const db = vi.hoisted(() => ({ tabelle: {} as Record<string, { data: unknown; error: unknown }> }));

vi.mock("@/integrations/supabase/client", () => {
  const catena = (tabella: string): unknown => {
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, metodo: string) {
          if (metodo === "then") {
            const risposta: Risposta = { ...(db.tabelle[tabella] ?? { data: null, error: null }), count: 0 };
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
      auth: { getSession: async () => ({ data: { session: null as unknown } }) },
    },
  };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda-1" } }) }));

import SettingsWhatsAppBot from "@/pages/azienda/settings/SettingsWhatsAppBot";

function monta() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SettingsWhatsAppBot />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  db.tabelle = {};
});

afterEach(() => cleanup());

describe("Bot WhatsApp classico", () => {
  it("senza righe (oggi in tutto il database) dice che non è più in uso e manda a WhatsApp → Numeri", async () => {
    db.tabelle.messaging_whatsapp_config = { data: null, error: null };
    monta();
    expect(await screen.findByText("Questa pagina non è più in uso")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Apri WhatsApp" }).getAttribute("href")).toBe("/azienda/whatsapp");
    // Non promette più «connetti WhatsApp dalla pagina Integrazioni, il bot usa la stessa connessione».
    expect(screen.queryByText(/WhatsApp non connesso/)).toBeNull();
    expect(screen.queryByText(/Il bot utilizza la stessa connessione/)).toBeNull();
  });

  it("non scrive un suo titolo (c'è già quello della testata)", async () => {
    monta();
    await screen.findByText("Questa pagina non è più in uso");
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
  });

  it("se esistesse una riga, l'avviso resta il primo elemento e le impostazioni sono in italiano", async () => {
    db.tabelle.messaging_whatsapp_config = {
      data: { id: "c1", is_connected: true, bot_enabled: true, ai_auto_process: true, phone_number_id: "123" },
      error: null,
    };
    monta();
    expect(await screen.findByText("Questa pagina non è più in uso")).toBeTruthy();
    expect(screen.getByLabelText("Elaborazione automatica con l'AI")).toBeTruthy();
    expect(screen.queryByText(/Processing AI/)).toBeNull();
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
  });

  it("se la lettura non riesce, lo dice senza far credere che sia tutto spento", async () => {
    db.tabelle.messaging_whatsapp_config = { data: null, error: { message: "boom" } };
    monta();
    expect(await screen.findByText("Non riesco a leggere i dati")).toBeTruthy();
    expect(screen.getByText("Questa pagina non è più in uso")).toBeTruthy();
  });
});
