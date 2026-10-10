/**
 * Assistente AI → scheda «Memoria» (AIMemoryPage, incorporata nel hub).
 *
 * - Parole di chi legge: «Abitudine» (non «Pattern»), «Ricordi per assistente», «Poco sicure», «usi», «Sicurezza»,
 *   «ricordi» (non «entries»): niente memory/persona/hits/confidence nel testo.
 * - Gli errori dicono il motivo (prima `String(e)`), e un ricordo che le regole di accesso non lasciano toccare lo dice:
 *   prima la pagina rispondeva «Memory eliminata» e non era successo niente.
 * - Le cinque scritte fissate dai test del progetto sono rimaste.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const stato = vi.hoisted(() => ({
  memorie: [] as Record<string, unknown>[],
  esitoModifica: { data: [{ id: "m1" }] as unknown, error: null as unknown },
  esitoElimina: { data: [{ id: "m1" }] as unknown, error: null as unknown },
  esitoCrea: null as unknown,
  chiamateRpc: [] as { nome: string; args: Record<string, unknown> }[],
  success: vi.fn(), error: vi.fn(),
  azienda: { id: "company-1", name: "Rossi Costruzioni" },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: stato.azienda }) }));
vi.mock("sonner", () => ({ toast: { success: stato.success, error: stato.error } }));
vi.mock("@/integrations/supabase/client", () => {
  /** Una catena che si può aspettare in qualunque punto: cosa risponde dipende dal verbo (select, update, delete). */
  const catena = (tabella: string) => {
    let verbo: "select" | "update" | "delete" = "select";
    const b: Record<string, unknown> = {};
    const metodo = (nome: string) => (..._args: unknown[]) => {
      if (nome === "update" || nome === "delete") verbo = nome;
      return b;
    };
    for (const nome of ["select", "eq", "order", "limit", "update", "delete", "in"]) b[nome] = metodo(nome);
    b.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => {
      const risposta = tabella === "ai_personas_public" ? { data: [], error: null }
        : verbo === "update" ? stato.esitoModifica
        : verbo === "delete" ? stato.esitoElimina
        : { data: stato.memorie, error: null };
      return Promise.resolve(risposta).then(ok, ko);
    };
    return b;
  };
  return {
    supabase: {
      from: (tabella: string) => catena(tabella),
      rpc: async (nome: string, args: Record<string, unknown>) => { stato.chiamateRpc.push({ nome, args }); return { data: null as unknown, error: stato.esitoCrea }; },
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
      removeChannel: () => {},
    },
  };
});

import AIMemoryPage from "@/pages/azienda/AIMemoryPage";

const RICORDO = {
  id: "m1", company_id: "company-1", user_id: null as string | null, persona_key: "cfo", memory_type: "pattern",
  content: "Bianchi paga sempre a 45 giorni", source: "ai_feedback", confidence: 0.9, enabled: true, hits_count: 4,
  last_used_at: null as string | null, created_at: new Date().toISOString(),
};

function apri() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><AIMemoryPage embedded /></QueryClientProvider>);
}
const attendi = () => screen.findByText("Bianchi paga sempre a 45 giorni");

beforeEach(() => {
  stato.memorie = [RICORDO];
  stato.esitoModifica = { data: [{ id: "m1" }], error: null };
  stato.esitoElimina = { data: [{ id: "m1" }], error: null };
  stato.esitoCrea = null;
  stato.chiamateRpc.length = 0;
  stato.success.mockClear(); stato.error.mockClear();
  window.confirm = () => true;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});
afterEach(cleanup);

describe("Memoria dell'Assistente AI: le parole di chi legge", () => {
  it("«Abitudine», «Ricordi per assistente», «Poco sicure», «usi», «Sicurezza», «1 ricordo»", async () => {
    apri();
    await attendi();
    expect(screen.getByText("Abitudine")).toBeInTheDocument();
    expect(screen.getByText("Ricordi per assistente")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Poco sicure" })).toBeInTheDocument();
    expect(screen.getByText(/4 usi · creata il/)).toBeInTheDocument();
    expect(screen.getByText(/Sicurezza: 90%/)).toBeInTheDocument();
    expect(screen.getByText("1 ricordo")).toBeInTheDocument();
    expect(screen.getByText("Tutti gli assistenti")).toBeInTheDocument();
    expect(screen.getByLabelText("Cerca tra i ricordi")).toBeInTheDocument();
  });

  it("nessuna parola del codice: Pattern, hits, entries, Confidence, memory, bassa fiducia, QA, «Aggiornamento live»", async () => {
    apri();
    await attendi();
    const testo = document.body.textContent ?? "";
    expect(testo).not.toMatch(/\bpattern\b/i);
    expect(testo).not.toMatch(/\bhits\b/i);
    expect(testo).not.toMatch(/\bentries\b/i);
    expect(testo).not.toMatch(/confidence/i);
    expect(testo).not.toMatch(/\bmemory\b/i);
    expect(testo).not.toMatch(/bassa fiducia/i);
    expect(testo).not.toMatch(/\bQA\b/);
    expect(testo).not.toMatch(/aggiornamento live/i);
    expect(testo).not.toMatch(/user_id/);
  });

  it("le scritte fissate dai test del progetto restano", async () => {
    apri();
    await attendi();
    expect(screen.getByText("Centro controllo memoria")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Includi disabilitate/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Completa personas/ })).toBeInTheDocument();
    expect(screen.getByTitle("Vedi nel Cervello")).toBeInTheDocument();
  });
});

describe("Memoria dell'Assistente AI: gli errori dicono il motivo", () => {
  it("eliminare: un ricordo eliminato lo dice", async () => {
    apri();
    await attendi();
    fireEvent.click(screen.getByTitle("Elimina"));
    await waitFor(() => expect(stato.success).toHaveBeenCalledWith("Ricordo eliminato"));
    expect(stato.error).not.toHaveBeenCalled();
  });

  it("eliminare: se le regole di accesso non eliminano niente, non dice «eliminato»", async () => {
    stato.esitoElimina = { data: [], error: null };
    apri();
    await attendi();
    fireEvent.click(screen.getByTitle("Elimina"));
    await waitFor(() => expect(stato.error).toHaveBeenCalledOnce());
    expect(stato.error).toHaveBeenCalledWith("Non sono riuscito a eliminare il ricordo", { description: "Non hai il permesso di eliminare questo ricordo." });
    expect(stato.success).not.toHaveBeenCalled();
  });

  it("eliminare: un rifiuto del database si traduce (niente «[object Object]»)", async () => {
    stato.esitoElimina = { data: null, error: { code: "42501", message: "permission denied for table ai_persona_memory" } };
    apri();
    await attendi();
    fireEvent.click(screen.getByTitle("Elimina"));
    await waitFor(() => expect(stato.error).toHaveBeenCalledOnce());
    expect(stato.error).toHaveBeenCalledWith("Non sono riuscito a eliminare il ricordo", { description: "Non hai i permessi per questa operazione. Contatta l'amministratore." });
  });

  it("disattivare: zero righe toccate lo dice", async () => {
    stato.esitoModifica = { data: [], error: null };
    apri();
    await attendi();
    fireEvent.click(screen.getByTitle("Disabilita"));
    await waitFor(() => expect(stato.error).toHaveBeenCalledOnce());
    expect(stato.error).toHaveBeenCalledWith("Non sono riuscito ad aggiornare il ricordo", { description: "Non hai il permesso di modificare questo ricordo." });
  });

  it("aggiungere: la finestra ha le etichette collegate e «Ricordo salvato» arriva dopo il salvataggio", async () => {
    apri();
    await attendi();
    fireEvent.click(screen.getByRole("button", { name: /Aggiungi memoria/ }));
    const finestra = await screen.findByRole("dialog");
    expect(within(finestra).getByLabelText("Assistente")).toBeInTheDocument();
    expect(within(finestra).getByLabelText("Tipo")).toBeInTheDocument();
    expect(within(finestra).getByLabelText("Sicurezza (100%)")).toBeInTheDocument();
    expect(finestra).toHaveTextContent("Un ricordo che l'assistente terrà presente nelle prossime conversazioni.");
    fireEvent.change(within(finestra).getByLabelText("Contenuto"), { target: { value: "Rossi vuole il preventivo entro venerdì" } });
    fireEvent.click(within(finestra).getByRole("button", { name: "Crea memoria" }));
    await waitFor(() => expect(stato.success).toHaveBeenCalledWith("Ricordo salvato"));
    expect(stato.chiamateRpc).toHaveLength(1);
    expect(stato.chiamateRpc[0].nome).toBe("record_persona_memory");
    expect(stato.chiamateRpc[0].args).toMatchObject({ p_content: "Rossi vuole il preventivo entro venerdì", p_company_id: "company-1" });
  });

  it("modificare: salva il testo nuovo; se le regole di accesso non toccano niente, lo dice", async () => {
    apri();
    await attendi();
    fireEvent.click(screen.getByTitle("Modifica"));
    let finestra = await screen.findByRole("dialog");
    expect(finestra).toHaveTextContent("Modifica memoria");
    fireEvent.change(within(finestra).getByLabelText("Contenuto"), { target: { value: "Bianchi paga a 60 giorni" } });
    fireEvent.click(within(finestra).getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(stato.success).toHaveBeenCalledWith("Ricordo salvato"));
    cleanup();

    stato.esitoModifica = { data: [], error: null };
    stato.success.mockClear();
    apri();
    await attendi();
    fireEvent.click(screen.getByTitle("Modifica"));
    finestra = await screen.findByRole("dialog");
    fireEvent.change(within(finestra).getByLabelText("Contenuto"), { target: { value: "Bianchi paga a 60 giorni" } });
    fireEvent.click(within(finestra).getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(stato.error).toHaveBeenCalledOnce());
    expect(stato.error).toHaveBeenCalledWith("Non sono riuscito a salvare il ricordo", { description: "Non hai il permesso di modificare questo ricordo." });
    expect(stato.success).not.toHaveBeenCalled();
  });

  it("aggiungere: un rifiuto dice il motivo e la finestra resta aperta", async () => {
    stato.esitoCrea = { code: "23505", message: "duplicate key value violates unique constraint" };
    apri();
    await attendi();
    fireEvent.click(screen.getByRole("button", { name: /Aggiungi memoria/ }));
    const finestra = await screen.findByRole("dialog");
    fireEvent.change(within(finestra).getByLabelText("Contenuto"), { target: { value: "Rossi vuole il preventivo entro venerdì" } });
    fireEvent.click(within(finestra).getByRole("button", { name: "Crea memoria" }));
    await waitFor(() => expect(stato.error).toHaveBeenCalledOnce());
    expect(stato.error).toHaveBeenCalledWith("Non sono riuscito a salvare il ricordo", { description: "Esiste già un elemento con questi dati. Controlla e riprova." });
    expect(stato.success).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
