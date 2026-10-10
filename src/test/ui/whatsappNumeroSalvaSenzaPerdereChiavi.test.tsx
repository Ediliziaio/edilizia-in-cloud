/**
 * Pagina di un numero WhatsApp: salvare non cancella le chiavi che la pagina non mostra (09/10/2026).
 *
 * `operational_settings` è un unico JSON. La pagina del numero Operativo ne conosce dodici chiavi; nello stesso JSON
 * ci sono anche `bot_enabled` e `ai_auto_process` (le legge il bot) e, su altri numeri, `classifica_risposte`.
 * Prima il salvataggio mandava al database SOLO le dodici chiavi: le altre sparivano in silenzio, e un bot spento a
 * mano nel database si sarebbe riacceso al primo «Salva impostazioni».
 *
 * Tiene fermo:
 *   · salvando un numero Operativo le chiavi sconosciute restano, e quelle modificate nella pagina cambiano;
 *   · un numero senza impostazioni salva comunque le dodici chiavi della pagina (nessun errore);
 *   · un numero non Operativo non viene toccato: il JSON torna com'era;
 *   · il blocco delle chiavi è fatto dall'unione, non da un caso particolare: un JSON che non è un oggetto non rompe.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Risposta = { data: unknown; error: unknown };

const db = vi.hoisted(() => ({
  chiamate: [] as Array<{ metodo: string; argomenti: unknown[] }>,
  lettura: { data: null, error: null } as { data: unknown; error: unknown },
  scrittura: { data: [{ id: "numero-1" }], error: null } as { data: unknown; error: unknown },
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => {
  // Ogni metodo della query si registra e restituisce la stessa catena. Alla fine la catena si risolve con la
  // risposta di scrittura se tra i metodi c'è stato `update`, altrimenti con quella di lettura.
  const catena = (): unknown => {
    let scrive = false;
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, metodo: string) {
          if (metodo === "then") {
            return (ok: (v: Risposta) => unknown, ko: (e: unknown) => unknown) =>
              Promise.resolve(scrive ? db.scrittura : db.lettura).then(ok, ko);
          }
          return (...argomenti: unknown[]) => {
            if (metodo === "update") scrive = true;
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
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: true }) }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "azienda-1" }));

import {
  DEFAULT_OPERATIONAL_SETTINGS,
  unisciImpostazioniOperative,
  type WANumber,
} from "@/hooks/whatsapp/useWhatsAppNumbers";
import WANumberDetailPage from "@/pages/azienda/whatsapp/WANumberDetailPage";

function numero(purpose: string, operationalSettings: unknown): WANumber {
  return {
    id: "numero-1",
    company_id: "azienda-1",
    purpose,
    display_name: "Cantieri",
    nome_account: null,
    numero: "+39 351 000 0000",
    phone_number_id: null,
    waba_id: null,
    stato: "active",
    webhook_verified: true,
    daily_budget_eur: 10,
    current_day_spend_eur: 0,
    operational_settings: operationalSettings,
    messaggio_benvenuto: null,
    messaggio_fuori_orario: null,
  } as unknown as WANumber;
}

function apriDettaglio() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/azienda/whatsapp/numeri/numero-1"]}>
        <Routes>
          <Route path="/azienda/whatsapp/numeri/:id" element={<WANumberDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Cosa è stato mandato al database con l'ultimo `update`. */
const ultimoAggiornamento = () =>
  db.chiamate.filter((c) => c.metodo === "update").at(-1)?.argomenti[0] as Record<string, unknown> | undefined;

beforeEach(() => {
  db.chiamate.length = 0;
  db.lettura = { data: null, error: null };
  db.scrittura = { data: [{ id: "numero-1" }], error: null };
  Object.values(toast).forEach((f) => f.mockReset());
});

afterEach(() => cleanup());

describe("salvare la pagina di un numero Operativo", () => {
  it("tiene le chiavi che la pagina non mostra e cambia quelle modificate", async () => {
    db.lettura = {
      data: numero("bot_operativo", {
        bot_enabled: false, // spento a mano nel database: nessuna schermata lo imposta
        ai_auto_process: true,
        classifica_risposte: { tag: "levante-serata" },
        daily_rapportino_enabled: false,
        unknown_worker_mode: "block",
      }),
      error: null,
    };
    apriDettaglio();

    const promemoria = await screen.findByRole("switch", { name: "Manda il promemoria ogni giorno" });
    fireEvent.click(promemoria); // spento → acceso
    fireEvent.click(screen.getByRole("button", { name: /Salva impostazioni/ }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Impostazioni salvate."));
    const salvato = ultimoAggiornamento()?.operational_settings as Record<string, unknown>;

    // Le chiavi che la pagina non conosce sono ancora lì, con il valore che avevano…
    expect(salvato.bot_enabled).toBe(false);
    expect(salvato.ai_auto_process).toBe(true);
    expect(salvato.classifica_risposte).toEqual({ tag: "levante-serata" });
    // …e quella che l'utente ha cambiato è cambiata.
    expect(salvato.daily_rapportino_enabled).toBe(true);
    // Le altre chiavi della pagina ci sono tutte (prima era l'unico contenuto).
    for (const chiave of Object.keys(DEFAULT_OPERATIONAL_SETTINGS)) expect(salvato).toHaveProperty(chiave);
  });

  it("un numero senza impostazioni salva le dodici chiavi della pagina, senza errori", async () => {
    db.lettura = { data: numero("bot_operativo", null), error: null };
    apriDettaglio();

    fireEvent.click(await screen.findByRole("button", { name: /Salva impostazioni/ }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Impostazioni salvate."));
    expect(ultimoAggiornamento()?.operational_settings).toEqual(DEFAULT_OPERATIONAL_SETTINGS);
  });
});

describe("salvare la pagina di un numero che non è Operativo", () => {
  it("rimanda al database il JSON com'era, senza aggiungere le chiavi dei cantieri", async () => {
    const come = { classifica_risposte: { tag: "levante-serata" }, bot_enabled: true };
    db.lettura = { data: numero("marketing", come), error: null };
    apriDettaglio();

    fireEvent.click(await screen.findByRole("button", { name: /Salva impostazioni/ }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Impostazioni salvate."));
    expect(ultimoAggiornamento()?.operational_settings).toEqual(come);
  });
});

describe("unisciImpostazioniOperative", () => {
  it("le chiavi della pagina vincono, le altre restano", () => {
    const unito = unisciImpostazioniOperative(
      { bot_enabled: true, ai_mode: "draft_only", handoff_note: "vecchia" },
      { ...DEFAULT_OPERATIONAL_SETTINGS, ai_mode: "auto_with_review", handoff_note: "nuova" },
    ) as Record<string, unknown>;
    expect(unito.bot_enabled).toBe(true);
    expect(unito.ai_mode).toBe("auto_with_review");
    expect(unito.handoff_note).toBe("nuova");
  });

  it("un JSON che non è un oggetto (vuoto, lista, testo) non rompe e non si sparge in chiavi numeriche", () => {
    for (const strano of [null, undefined, [1, 2], "testo", 5, true]) {
      const unito = unisciImpostazioniOperative(strano as never, DEFAULT_OPERATIONAL_SETTINGS);
      expect(unito).toEqual(DEFAULT_OPERATIONAL_SETTINGS);
    }
  });
});
