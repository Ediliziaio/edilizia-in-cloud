/**
 * Numeri WhatsApp: token e PIN non arrivano al browser, e i numeri li cambia
 * solo chi amministra l'azienda (25/09/2026).
 *
 * Il 24/09 il dettaglio del numero faceva select("*"): il PIN della verifica in
 * due passaggi e il token di Meta finivano nel browser di chiunque lavorasse
 * nell'azienda, e chiunque poteva modificare o togliere il numero. Ora il
 * database non dà token e PIN al ruolo authenticated (un select("*") fallisce)
 * e modifica e cancellazione passano solo a chi amministra.
 *
 * Tiene fermo:
 *   · il dettaglio legge le colonne elencate, mai «*» né token o PIN;
 *   · «Rimuovi» c'è solo per chi amministra;
 *   · se il database non cambia nessuna riga l'app lo dice, invece di
 *     «Numero rimosso» o «Impostazioni salvate»;
 *   · nel dettaglio «Salva impostazioni» è spento per chi non amministra, con
 *     il motivo scritto accanto.
 */
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Risposta = { data: unknown; error: unknown };

const db = vi.hoisted(() => ({
  chiamate: [] as Array<{ metodo: string; argomenti: unknown[] }>,
  risposta: { data: null, error: null } as { data: unknown; error: unknown },
}));
const permessi = vi.hoisted(() => ({ admin: true }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => {
  // Ogni metodo della query si registra e restituisce la stessa catena; alla
  // fine la catena si risolve con la risposta preparata dal test.
  const catena = (): unknown => {
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, metodo: string) {
          if (metodo === "then") {
            return (ok: (v: Risposta) => unknown, ko: (e: unknown) => unknown) =>
              Promise.resolve(db.risposta).then(ok, ko);
          }
          return (...argomenti: unknown[]) => {
            db.chiamate.push({ metodo, argomenti });
            return proxy;
          };
        },
      },
    );
    return proxy;
  };
  return {
    supabase: {
      from: (tabella: string) => {
        db.chiamate.push({ metodo: "from", argomenti: [tabella] });
        return catena();
      },
      functions: { invoke: async (): Promise<Risposta> => ({ data: null, error: null }) },
    },
  };
});
vi.mock("sonner", () => ({ toast }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: permessi.admin }) }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "azienda-1" }));

import {
  SOLO_AMMINISTRATORI_WA,
  WA_NUMBER_COLUMNS,
  useDeleteWANumber,
  useUpdateWANumberSettings,
  useWhatsAppNumber,
  type WANumber,
} from "@/hooks/whatsapp/useWhatsAppNumbers";
import { WhatsAppNumberCard } from "@/components/whatsapp-multi/WhatsAppNumberCard";
import WANumberDetailPage from "@/pages/azienda/whatsapp/WANumberDetailPage";

const numero = {
  id: "numero-1",
  company_id: "azienda-1",
  purpose: "marketing",
  display_name: "Fotovoltaico per la Tua Casa",
  nome_account: null,
  numero: "+39 352 296 3510",
  phone_number_id: null,
  waba_id: null,
  stato: "active",
  webhook_verified: true,
  daily_budget_eur: 10,
  current_day_spend_eur: 0,
  operational_settings: {},
  messaggio_benvenuto: null,
  messaggio_fuori_orario: null,
} as unknown as WANumber;

function conClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const selezioni = () => db.chiamate.filter((c) => c.metodo === "select").map((c) => c.argomenti[0]);

beforeEach(() => {
  db.chiamate.length = 0;
  db.risposta = { data: null, error: null };
  permessi.admin = true;
  Object.values(toast).forEach((f) => f.mockReset());
});

afterEach(() => cleanup());

describe("cosa legge il browser", () => {
  it("le colonne elencate non comprendono token e PIN", () => {
    expect(WA_NUMBER_COLUMNS).not.toContain("*");
    expect(WA_NUMBER_COLUMNS).not.toMatch(/access_token|cloud_api_pin/);
  });

  it("il dettaglio del numero legge le colonne elencate, non «*»", async () => {
    db.risposta = { data: numero, error: null };
    const { result } = renderHook(() => useWhatsAppNumber("numero-1"), { wrapper: conClient() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(db.chiamate[0]).toEqual({ metodo: "from", argomenti: ["ai_whatsapp_numbers"] });
    expect(selezioni()).toEqual([WA_NUMBER_COLUMNS]);
    expect(result.current.data?.numero).toBe("+39 352 296 3510");
  });
});

describe("modificare e togliere un numero", () => {
  it("se il database non toglie niente, lo dice invece di «Numero rimosso»", async () => {
    db.risposta = { data: [], error: null };
    const { result } = renderHook(() => useDeleteWANumber(), { wrapper: conClient() });
    await act(async () => {
      await expect(result.current.mutateAsync("numero-1")).rejects.toThrow(SOLO_AMMINISTRATORI_WA);
    });
    expect(toast.error).toHaveBeenCalledWith(`Errore: ${SOLO_AMMINISTRATORI_WA}`);
    expect(toast.success).not.toHaveBeenCalled();
    // Il numero tolto si chiede indietro: è così che si sa se è cambiato davvero.
    expect(selezioni()).toEqual(["id"]);
  });

  it("chi amministra toglie il numero", async () => {
    db.risposta = { data: [{ id: "numero-1" }], error: null };
    const { result } = renderHook(() => useDeleteWANumber(), { wrapper: conClient() });
    await act(async () => {
      await result.current.mutateAsync("numero-1");
    });
    expect(toast.success).toHaveBeenCalledWith("Numero rimosso.");
    const aggiornamento = db.chiamate.find((c) => c.metodo === "update")?.argomenti[0] as Record<string, unknown>;
    expect(Object.keys(aggiornamento).sort()).toEqual(["deleted_at", "stato"]);
    expect(aggiornamento.stato).toBe("removed");
  });

  it("se il database non salva le impostazioni, lo dice invece di «Impostazioni salvate»", async () => {
    db.risposta = { data: [], error: null };
    const { result } = renderHook(() => useUpdateWANumberSettings(), { wrapper: conClient() });
    await act(async () => {
      await expect(result.current.mutateAsync({ id: "numero-1", display_name: "Nuovo nome" })).rejects.toThrow(
        SOLO_AMMINISTRATORI_WA,
      );
    });
    expect(toast.error).toHaveBeenCalledWith(`Errore: ${SOLO_AMMINISTRATORI_WA}`);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("chi amministra salva le impostazioni, e solo quelle", async () => {
    db.risposta = { data: [{ id: "numero-1" }], error: null };
    const { result } = renderHook(() => useUpdateWANumberSettings(), { wrapper: conClient() });
    await act(async () => {
      await result.current.mutateAsync({ id: "numero-1", display_name: "Nuovo nome", daily_budget_eur: 12 });
    });
    expect(toast.success).toHaveBeenCalledWith("Impostazioni salvate.");
    expect(db.chiamate.find((c) => c.metodo === "update")?.argomenti[0]).toEqual({
      display_name: "Nuovo nome",
      daily_budget_eur: 12,
    });
    expect(db.chiamate.find((c) => c.metodo === "eq")?.argomenti).toEqual(["id", "numero-1"]);
  });
});

describe("i pulsanti", () => {
  const monta = (elemento: ReactNode) => {
    const Wrapper = conClient();
    render(<Wrapper>{elemento}</Wrapper>);
  };

  it("«Rimuovi» c'è solo per chi amministra", () => {
    permessi.admin = false;
    monta(<WhatsAppNumberCard number={numero} />);
    expect(screen.queryByRole("button", { name: "Rimuovi numero" })).toBeNull();
    cleanup();

    permessi.admin = true;
    monta(<WhatsAppNumberCard number={numero} />);
    expect(screen.getByRole("button", { name: "Rimuovi numero" })).toBeTruthy();
  });

  const dettaglio = () =>
    monta(
      <MemoryRouter initialEntries={["/azienda/whatsapp/numeri/numero-1"]}>
        <Routes>
          <Route path="/azienda/whatsapp/numeri/:id" element={<WANumberDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

  it("nel dettaglio chi non amministra non salva, e legge perché", async () => {
    permessi.admin = false;
    db.risposta = { data: numero, error: null };
    dettaglio();
    const salva = (await screen.findByRole("button", { name: /Salva impostazioni/ })) as HTMLButtonElement;
    expect(salva.disabled).toBe(true);
    expect(screen.getByText(SOLO_AMMINISTRATORI_WA)).toBeTruthy();
  });

  it("nel dettaglio chi amministra salva", async () => {
    db.risposta = { data: numero, error: null };
    dettaglio();
    const salva = (await screen.findByRole("button", { name: /Salva impostazioni/ })) as HTMLButtonElement;
    expect(salva.disabled).toBe(false);
    expect(screen.queryByText(SOLO_AMMINISTRATORI_WA)).toBeNull();
  });
});
