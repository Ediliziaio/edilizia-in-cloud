// src/test/ui/cartelleDocumentiPagina.test.tsx
// Impostazioni → Cartelle documenti: i due interruttori si capiscono (nome delle colonne, spiegazione sempre visibile),
// la pagina non parla dell'area clienti come se funzionasse e chi può solo leggere lo vede scritto.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cartella = (id: string, nome: string, extra: Record<string, unknown> = {}) => ({
  id, nome, visibile_cliente: false, obbligatoria: false, archiviata_at: null as string | null, ...extra,
});

const state = vi.hoisted(() => ({ admin: false, modifica: true, caricamentoPermessi: false, portale: false, mutate: vi.fn() }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ isAdmin: state.admin, isLoading: state.caricamentoPermessi, canEditSettingsOrders: state.modifica }),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "company-1", customer_portal_enabled: state.portale } }),
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "company-1" }));
vi.mock("@/components/billing/SpazioArchiviazioneCard", () => ({ SpazioArchiviazioneCard: () => <div data-testid="spazio-archiviazione">spazio</div> }));
vi.mock("@/hooks/useCartelleDocumenti", async (original) => ({
  ...(await original<typeof import("@/hooks/useCartelleDocumenti")>()),
  useCartelleDocumenti: () => ({
    cartelle: [cartella("f1", "Contratti"), cartella("f2", "Fatture", { obbligatoria: true }), cartella("f3", "Vecchia", { archiviata_at: "2026-10-01T10:00:00Z" })],
    isLoading: false, isError: false, refetch: vi.fn(),
  }),
  useSalvaCartella: () => ({ mutate: state.mutate, isPending: false }),
  useRiordinaCartelle: () => ({ mutate: state.mutate, isPending: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => { const b = { select: () => b, eq: () => b, then: (ok: (r: unknown) => unknown) => Promise.resolve({ count: 2, error: null as unknown }).then(ok) }; return b; } },
}));

import SettingsCartelleDocumenti from "@/pages/azienda/settings/SettingsCartelleDocumenti";

const apri = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><SettingsCartelleDocumenti /></MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, { admin: false, modifica: true, caricamentoPermessi: false, portale: false });
});
afterEach(cleanup);

describe("Cartelle documenti: si capisce cosa fanno i due interruttori", () => {
  it("le colonne si chiamano «Visibile al cliente» e «Obbligatoria», non solo «Cliente»", () => {
    apri();
    const intestazioni = screen.getAllByRole("columnheader", { hidden: true }).map((th) => th.textContent?.trim());
    expect(intestazioni).toEqual(["Cartella", "Documenti", "Visibile al cliente", "Obbligatoria", "Azioni"]);
  });

  it("la spiegazione dei due interruttori si legge subito: non è chiusa in un «dettaglio»", () => {
    apri();
    const spiegazione = screen.getByText(/i file nuovi di quella cartella si vedono/);
    expect(spiegazione.closest("details")).toBeNull();
    expect(spiegazione).toHaveTextContent("la commessa segnala «Mancano» finché la cartella è vuota");
  });

  it("resta chiuso solo il dettaglio su come si sceglie la cartella di un file", () => {
    apri();
    const dettaglio = screen.getByText("Come si sceglie la cartella di un file").closest("details");
    expect(dettaglio).not.toBeNull();
    expect(dettaglio).not.toHaveAttribute("open");
    expect(within(dettaglio as HTMLElement).getByText(/viene proposta dal nome/)).toBeInTheDocument();
  });

  it("l'esempio per una cartella nuova è di tutti i giorni, non una pratica del fotovoltaico", () => {
    apri();
    expect(screen.getByLabelText("Nuova cartella")).toHaveAttribute("placeholder", "Nuova cartella, es. Foto cantiere");
    expect(document.body.innerHTML).not.toContain("Enel");
  });

  it("nessun titolo di primo livello; i riquadri sono titoli di secondo livello", () => {
    apri();
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Cartelle dei documenti", "Archiviate", "Nelle commesse"]);
  });

  it("lo spazio di archiviazione è del piano, non delle cartelle: sta in fondo, dopo le archiviate", () => {
    apri();
    const archiviate = screen.getByRole("heading", { level: 2, name: "Archiviate" });
    const spazio = screen.getByTestId("spazio-archiviazione");
    expect(archiviate.compareDocumentPosition(spazio) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("Cartelle documenti: l'area clienti", () => {
  it("se è spenta lo dice, una volta, sotto la spiegazione", () => {
    apri();
    expect(screen.getAllByRole("note")).toHaveLength(1);
    expect(screen.getByRole("note")).toHaveTextContent("L'area clienti non è attiva per la tua azienda: questa scelta avrà effetto quando la attiviamo.");
  });

  it("se è accesa non dice niente", () => {
    state.portale = true;
    apri();
    expect(screen.queryByText(/L'area clienti non è attiva/)).toBeNull();
  });
});

describe("Cartelle documenti: sola lettura onesta", () => {
  it("chi non può modificare trova scritto chi può farlo e non ha comandi di scrittura", () => {
    state.modifica = false;
    apri();
    expect(screen.getByText(/Stai consultando queste impostazioni: le cambia chi ha «Configurazione Ordini» in modifica\./)).toBeInTheDocument();
    expect(screen.queryByLabelText("Nuova cartella")).toBeNull();
    expect(screen.queryByRole("button", { name: "Archivia «Contratti»" })).toBeNull();
    for (const interruttore of screen.getAllByRole("switch")) expect(interruttore).toBeDisabled();
  });

  it("chi può modificare non trova la frase", () => {
    apri();
    expect(screen.queryByText(/Stai consultando queste impostazioni/)).toBeNull();
    expect(screen.getByRole("button", { name: "Archivia «Contratti»" })).toBeInTheDocument();
  });

  it("mentre i permessi si caricano non dice niente (non sa ancora)", () => {
    state.modifica = false; state.caricamentoPermessi = true;
    apri();
    expect(screen.queryByText(/Stai consultando queste impostazioni/)).toBeNull();
  });
});


describe("Cartelle configurate e cartelle nelle commesse", () => {
  it("l’anteprima usa solo le cartelle attive, negli stessi nomi e nello stesso ordine", () => {
    apri();
    const nav = screen.getByRole("navigation", { name: "Cartelle documenti" });
    expect(within(nav).getAllByRole("button").map(b => b.getAttribute("aria-label"))).toEqual([
      "Tutti: 0 documenti", "Contratti: 0 documenti", "Fatture: 0 documenti",
    ]);
    expect(within(nav).queryByText("Vecchia")).toBeNull();
    expect(screen.getByText(/«Tutti» e «Senza cartella» sono filtri/)).toBeInTheDocument();
  });
  it("esplorare una cartella nella prova non modifica la configurazione", () => {
    apri();
    fireEvent.click(screen.getByRole("button", { name: "Fatture: 0 documenti" }));
    expect(screen.getByRole("button", { name: "Fatture: 0 documenti" })).toHaveAttribute("aria-current", "true");
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it("archiviare mantiene i documenti nella cartella originale, senza promettere uno spostamento", () => {
    apri();
    fireEvent.click(screen.getByRole("button", { name: "Archivia «Contratti»" }));
    const conferma = screen.getByRole("alertdialog");
    expect(conferma).toHaveTextContent("I documenti già presenti restano nella cartella originale");
    expect(conferma).not.toHaveTextContent("Senza cartella");
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it("non permette di salvare un nome vuoto o identico e limita la lunghezza a quella ammessa", () => {
    apri();
    fireEvent.click(screen.getByRole("button", { name: "Rinomina «Contratti»" }));
    expect(screen.getByRole("button", { name: "Salva nome" })).toBeDisabled();
    const nome = screen.getByRole("textbox", { name: "Nome cartella Contratti" });
    expect(nome).toHaveAttribute("maxlength", "80");
    fireEvent.change(nome, { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Salva nome" })).toBeDisabled();
    fireEvent.keyDown(nome, { key: "Enter" });
    expect(state.mutate).not.toHaveBeenCalled();
  });
});
