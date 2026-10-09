// src/test/ui/cartelleDocumentiPagina.test.tsx
// Impostazioni → Cartelle documenti: i due interruttori si capiscono (nome delle colonne, spiegazione sempre visibile),
// la pagina non parla dell'area clienti come se funzionasse e chi può solo leggere lo vede scritto.
import { cleanup, render, screen, within } from "@testing-library/react";
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
vi.mock("@/hooks/useCartelleDocumenti", () => ({
  useCartelleDocumenti: () => ({
    cartelle: [cartella("f1", "Contratti"), cartella("f2", "Fatture", { obbligatoria: true }), cartella("f3", "Vecchia", { archiviata_at: "2026-10-01T10:00:00Z" })],
    isLoading: false, isError: false, refetch: vi.fn(),
  }),
  useSalvaCartella: () => ({ mutate: state.mutate, isPending: false }),
  useRiordinaCartelle: () => ({ mutate: state.mutate, isPending: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: async () => ({ count: 2, error: null as unknown }) }) }) },
}));

import SettingsCartelleDocumenti from "@/pages/azienda/settings/SettingsCartelleDocumenti";

const apri = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SettingsCartelleDocumenti />
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
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Cartelle dei documenti", "Archiviate"]);
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
