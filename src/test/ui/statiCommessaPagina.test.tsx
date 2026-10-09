// src/test/ui/statiCommessaPagina.test.tsx
// Impostazioni → Stati commessa: la pagina dice il vero (rimando alle Automazioni, «stato» e non «fase», area clienti spenta),
// non perde le modifiche, e chi può solo leggere lo vede.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stato = (id: string, name: string, position: number, extra: Record<string, unknown> = {}) => ({
  id, company_id: "azienda-1", name, icon: "Circle", color: "#2563EB", position, is_support_phase: false, ...extra,
});

const state = vi.hoisted(() => ({
  admin: true, modifica: true, automazioni: true, portale: false,
  avvisa: true,
  letturaErrore: false, letture: 0,
  aggiornamentoRighe: [{ id: "azienda-1" }] as unknown[],
  aggiornamentoErrore: null as unknown,
  aggiornamenti: [] as Record<string, unknown>[],
  stati: [] as Record<string, unknown>[],
  rpc: vi.fn(),
  successo: vi.fn(), errore: vi.fn(), info: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: state.successo, error: state.errore, info: state.info } }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "azienda-1", customer_portal_enabled: state.portale } }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    isLoading: false, isAdmin: state.admin, canEditSettingsOrders: state.modifica, canViewAutomazioni: state.automazioni,
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...argomenti: unknown[]) => state.rpc(...argomenti),
    from: (tabella: string) => {
      if (tabella === "order_statuses") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => {
                state.letture += 1;
                return state.letturaErrore
                  ? { data: null as unknown, error: { message: "permission denied for table order_statuses" } }
                  : { data: state.stati, error: null as unknown };
              },
            }),
          }),
        };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { avvisa_cliente_cambio_fase: state.avvisa }, error: null as unknown }) }) }),
        update: (valori: Record<string, unknown>) => {
          state.aggiornamenti.push(valori);
          return { eq: () => ({ select: async () => ({ data: state.aggiornamentoRighe, error: state.aggiornamentoErrore }) }) };
        },
      };
    },
  },
}));

import SettingsOrderStatus from "@/pages/azienda/settings/SettingsOrderStatus";
import { confermaNavigazioneImpostazioni } from "@/hooks/useSettingsDraftGuard";

function apri() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SettingsOrderStatus />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, {
    admin: true, modifica: true, automazioni: true, portale: false, avvisa: true, letturaErrore: false, letture: 0,
    aggiornamentoRighe: [{ id: "azienda-1" }], aggiornamentoErrore: null, aggiornamenti: [],
    stati: [
      stato("s1", "Contratto Firmato", 0),
      stato("s2", "Posa", 1),
      stato("s3", "Assistenza", 2, { is_support_phase: true }),
    ],
  });
  state.rpc.mockResolvedValue({ data: null as unknown, error: null as unknown });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Stati commessa: la pagina dice il vero", () => {
  it("per far partire un'azione al cambio di stato rimanda alle Automazioni, non alle scadenze di pagamento", async () => {
    apri();
    await screen.findByDisplayValue("Posa");
    const link = screen.getByRole("link", { name: "Automazioni" });
    expect(link).toHaveAttribute("href", "/azienda/automazioni");
    expect(document.body.innerHTML).not.toContain("automazioni-finanza");
  });

  it("il rimando alle Automazioni c'è solo per chi le può aprire", async () => {
    state.admin = false; state.automazioni = false;
    apri();
    await screen.findByDisplayValue("Posa");
    expect(screen.queryByRole("link", { name: "Automazioni" })).toBeNull();
  });

  it("il titolo lo mette il layout: nella pagina nessun titolo di primo livello, i riquadri sono titoli di secondo livello", async () => {
    apri();
    await screen.findByDisplayValue("Posa");
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    const titoli = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titoli).toEqual(["I tuoi stati", "Cosa vede il cliente", "Parti da un elenco pronto"]);
  });

  it("parla di stati, non di fasi: lo stato Assistenza, niente «Progress Tracker» né «pipeline»", async () => {
    apri();
    await screen.findByDisplayValue("Posa");
    const testo = document.body.textContent ?? "";
    expect(screen.getByText("Stato Assistenza")).toBeInTheDocument();
    expect(testo).not.toMatch(/Fase Assistenza/i);
    expect(testo).not.toMatch(/cambio di fase/i);
    expect(testo).not.toMatch(/Progress Tracker/i);
    expect(testo).not.toMatch(/pipeline/i);
    expect(screen.getByRole("switch", { name: "Avvisa il cliente a ogni cambio di stato" })).toBeInTheDocument();
  });

  it("l'area clienti è spenta: lo dice dove si parla del cliente; accesa, non dice niente", async () => {
    const { unmount } = apri();
    await screen.findByDisplayValue("Posa");
    expect(screen.getByRole("note")).toHaveTextContent("L'area clienti non è attiva per la tua azienda");
    unmount();
    state.portale = true;
    apri();
    await screen.findByDisplayValue("Posa");
    expect(screen.queryByText(/L'area clienti non è attiva/)).toBeNull();
  });
});

describe("Stati commessa: modifiche e bozza", () => {
  it("cambiare un nome accende «Salva modifiche» e «Annulla le modifiche» riporta com'era", async () => {
    apri();
    const campo = await screen.findByLabelText("Nome dello stato 2");
    expect(screen.getByRole("button", { name: "Salva modifiche" })).toBeDisabled();
    fireEvent.change(campo, { target: { value: "Posa in opera" } });
    expect(screen.getByRole("button", { name: "Salva modifiche" })).toBeEnabled();
    expect(screen.getByText("Modifiche non salvate")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Annulla le modifiche" }));
    expect(screen.getByLabelText("Nome dello stato 2")).toHaveValue("Posa");
    expect(screen.getByRole("button", { name: "Salva modifiche" })).toBeDisabled();
  });

  it("con modifiche non salvate uscire dalla pagina chiede conferma; senza no", async () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    apri();
    const campo = await screen.findByLabelText("Nome dello stato 2");
    expect(confermaNavigazioneImpostazioni()).toBe(true);
    expect(conferma).not.toHaveBeenCalled();
    fireEvent.change(campo, { target: { value: "Posa in opera" } });
    expect(confermaNavigazioneImpostazioni()).toBe(false);
    expect(conferma).toHaveBeenCalledOnce();
  });

  it("«Salva modifiche» manda la lista alla funzione del database e dice «Stati salvati»", async () => {
    apri();
    fireEvent.change(await screen.findByLabelText("Nome dello stato 2"), { target: { value: "Posa in opera" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(state.successo).toHaveBeenCalledWith("Stati salvati"));
    expect(state.rpc).toHaveBeenCalledWith("save_order_statuses", {
      p_company_id: "azienda-1",
      p_statuses: [
        expect.objectContaining({ id: "s1", name: "Contratto Firmato", position: 0 }),
        expect.objectContaining({ id: "s2", name: "Posa in opera", position: 1 }),
        expect.objectContaining({ id: "s3", name: "Assistenza", position: 2, is_support_phase: true }),
      ],
    });
  });

  it("se il database rifiuta lo dice in italiano, senza il testo tecnico, e tiene la bozza", async () => {
    state.rpc.mockResolvedValue({ data: null as unknown, error: { message: 'status_in_use: lo stato "Posa" è associato a 3 ordine/i' } });
    apri();
    fireEvent.change(await screen.findByLabelText("Nome dello stato 2"), { target: { value: "Posa in opera" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(state.errore).toHaveBeenCalled());
    expect(state.errore.mock.calls[0][0]).toBe(
      "Non posso eliminare lo stato «Posa»: ci sono 3 commesse in questo stato. Sposta prima le commesse su un altro stato.",
    );
    expect(screen.getByLabelText("Nome dello stato 2")).toHaveValue("Posa in opera");
    expect(state.successo).not.toHaveBeenCalled();
  });

  it("un errore qualunque del database non arriva al titolare con il suo testo", async () => {
    state.rpc.mockResolvedValue({ data: null as unknown, error: { message: "invalid_payload: duplicate key value violates unique constraint" } });
    apri();
    fireEvent.change(await screen.findByLabelText("Nome dello stato 2"), { target: { value: "Posa in opera" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(state.errore).toHaveBeenCalledWith("Non sono riuscito a salvare. Riprova tra poco."));
  });

  it("un elenco pronto sostituisce la lista solo nella bozza: niente si scrive finché non si preme «Salva modifiche»", async () => {
    apri();
    await screen.findByLabelText("Nome dello stato 2");
    fireEvent.click(screen.getByText("Parti da un elenco pronto"));
    fireEvent.click(screen.getByRole("button", { name: "Impianti" }));
    expect(state.info).toHaveBeenCalledWith("Elenco «Impianti» caricato: controlla la lista e premi «Salva modifiche».");
    expect(screen.getByDisplayValue("Collaudo e Certificazione")).toBeInTheDocument();
    expect(state.rpc).not.toHaveBeenCalled();
    // Lo stato Assistenza e quelli con lo stesso nome restano collegati alle commesse: tengono il loro id.
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(state.rpc).toHaveBeenCalled());
    const inviati = (state.rpc.mock.calls[0][1] as { p_statuses: { id?: string; name: string }[] }).p_statuses;
    expect(inviati.find((s) => s.name === "Assistenza")?.id).toBe("s3");
  });

  it("lo stato Assistenza non si elimina", async () => {
    apri();
    await screen.findByLabelText("Nome dello stato 3");
    expect(screen.getByRole("button", { name: "Lo stato Assistenza non si può eliminare" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Elimina lo stato Posa" })).toBeEnabled();
  });

  it("«Aggiungi stato» aggiunge «Nuovo stato» in fondo, nella bozza", async () => {
    apri();
    await screen.findByLabelText("Nome dello stato 3");
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi stato" }));
    expect(screen.getByLabelText("Nome dello stato 4")).toHaveValue("Nuovo stato");
    expect(screen.getByText("Modifiche non salvate")).toBeInTheDocument();
  });
});

describe("Stati commessa: l'avviso al cliente", () => {
  it("si salva subito e dice cosa succede", async () => {
    apri();
    const interruttore = await screen.findByRole("switch", { name: "Avvisa il cliente a ogni cambio di stato" });
    expect(interruttore).toBeChecked();
    fireEvent.click(interruttore);
    await waitFor(() => expect(state.successo).toHaveBeenCalledWith("Niente più email al cliente sui cambi di stato."));
    expect(state.aggiornamenti).toEqual([{ avvisa_cliente_cambio_fase: false }]);
    expect(interruttore).not.toBeChecked();
  });

  it("se la regola del database non lascia salvare (nessuna riga toccata) non finge: lo dice e torna com'era", async () => {
    state.aggiornamentoRighe = [];
    apri();
    const interruttore = await screen.findByRole("switch", { name: "Avvisa il cliente a ogni cambio di stato" });
    fireEvent.click(interruttore);
    await waitFor(() =>
      expect(state.errore).toHaveBeenCalledWith("Non hai il permesso di cambiare questa scelta: la cambia l'amministratore."),
    );
    expect(state.successo).not.toHaveBeenCalled();
    await waitFor(() => expect(interruttore).toBeChecked());
  });

  it("se il salvataggio dà errore torna com'era, con una frase italiana", async () => {
    state.aggiornamentoRighe = null as unknown as unknown[];
    state.aggiornamentoErrore = { message: "new row violates row-level security policy" };
    apri();
    const interruttore = await screen.findByRole("switch", { name: "Avvisa il cliente a ogni cambio di stato" });
    fireEvent.click(interruttore);
    await waitFor(() => expect(state.errore).toHaveBeenCalledWith("Non sono riuscito a salvare la scelta. Riprova tra poco."));
    await waitFor(() => expect(interruttore).toBeChecked());
  });
});

describe("Stati commessa: sola lettura onesta", () => {
  beforeEach(() => { state.admin = false; state.modifica = false; });

  it("chi non può modificare vede la frase giusta e tutti i comandi spenti", async () => {
    apri();
    await screen.findByDisplayValue("Posa");
    expect(screen.getByText(/Stai consultando queste impostazioni: le cambia chi ha «Configurazione Ordini» in modifica\./)).toBeInTheDocument();
    expect(screen.getByLabelText("Nome dello stato 2")).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Avvisa il cliente a ogni cambio di stato" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Aggiungi stato" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Salva modifiche" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Impianti" })).toBeDisabled();
  });

  it("e un tocco sul nome non cambia niente", async () => {
    apri();
    const campo = await screen.findByLabelText("Nome dello stato 2");
    fireEvent.change(campo, { target: { value: "Altro" } });
    expect(screen.getByLabelText("Nome dello stato 2")).toHaveValue("Posa");
    expect(within(document.body).queryByRole("button", { name: "Annulla le modifiche" })).toBeNull();
  });
});

describe("Stati commessa: la lettura che fallisce", () => {
  it("non diventa «nessuno stato»: dice che non riesce a leggere e offre «Riprova», senza il testo tecnico del database", async () => {
    state.letturaErrore = true;
    apri();
    const avviso = await screen.findByRole("alert");
    expect(avviso).toHaveTextContent("Stati non disponibili");
    expect(avviso).toHaveTextContent("Non riesco a leggere gli stati");
    expect(document.body.textContent).not.toMatch(/permission denied|Errore sconosciuto/);
    expect(screen.queryByRole("button", { name: "Salva modifiche" })).toBeNull();
    const lette = state.letture;
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    await waitFor(() => expect(state.letture).toBeGreaterThan(lette));
  });
});
