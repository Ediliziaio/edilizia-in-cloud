/**
 * «Esporta Clienti» comanda l'esportazione di Contatti, Opportunità e
 * Preventivi (24/09/2026).
 *
 * Il permesso c'era nella schermata dei permessi ma nessun bottone lo
 * guardava: a BeMade un operatore del call center senza «Esporta Clienti»
 * scaricava comunque tutti i contatti e tutte le opportunità dell'azienda.
 *
 * Qui gira il vero usePermissions sulla riga di staff_permissions, e il test
 * tiene fermo:
 *   · staff senza il permesso → nessun «Esporta»;
 *   · staff col permesso, e amministratore anche senza riga → «Esporta» c'è;
 *   · l'esportazione passa prima dal registro (registra_esportazione_crm con
 *     cosa, formato, righe e filtri) e solo dopo consegna il file;
 *   · se il database rifiuta, il file non parte;
 *   · da telefono non si esporta, neanche col permesso.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

interface Risposta {
  data: unknown;
  error: unknown;
  count?: number | null;
}

const stato = vi.hoisted(() => ({
  ruolo: "company_staff",
  mobile: false,
  rigaPermessi: null as Record<string, unknown> | null,
  /** L'ordine in cui avvengono registro e consegna del file. */
  sequenza: [] as string[],
  registro: [] as Array<Record<string, unknown>>,
  rispostaRegistro: { data: "riga-registro", error: null } as { data: unknown; error: unknown },
}));
const file = vi.hoisted(() => ({ csv: vi.fn(), xlsx: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), message: vi.fn() }));
const finti = vi.hoisted(() => ({
  /** Un componente che non disegna niente. */
  nulla: (): null => null,
  /** Una funzione che non fa niente. */
  niente: (): undefined => undefined,
}));

vi.mock("@/integrations/supabase/client", () => {
  const RIGHE: Record<string, unknown[]> = {
    marketing_contacts: [
      { id: "c1", first_name: "Elide", last_name: "Ruggiata", email: "elide@example.it", phone: "3331112222", tags: [], created_at: "2026-09-20T10:00:00Z" },
      { id: "c2", first_name: "Mario", last_name: "Rossi", email: "mario@example.it", phone: "", tags: ["infissi"], created_at: "2026-09-21T10:00:00Z" },
    ],
    marketing_opportunities: [
      {
        id: "o1", name: "Infissi Ruggiata", value: 4200, probability: 50, status: "open",
        stage_id: "fase-1", pipeline_id: "pipe-1", tags: [],
        created_at: "2026-09-20T10:00:00Z", updated_at: "2026-09-21T10:00:00Z",
        marketing_contacts: { id: "c1", first_name: "Elide", last_name: "Ruggiata", email: "elide@example.it", phone: "3331112222" },
      },
    ],
    quotes: [
      {
        id: "q1", quote_number: "PRV-2026-001", client_name: "Elide Ruggiata", status: "sent", total: 12000,
        salesperson_id: null, created_at: "2026-09-20T10:00:00Z", updated_at: "2026-09-21T10:00:00Z", revision_number: null,
      },
    ],
  };
  const costruttore = (risposta: () => Risposta) => {
    const b: Record<string, unknown> = {};
    for (const m of [
      "select", "eq", "neq", "or", "in", "is", "not", "gte", "gt", "lte", "lt", "ilike", "like",
      "contains", "overlaps", "order", "range", "limit", "filter", "match", "textSearch", "returns",
      "abortSignal", "maybeSingle", "single", "insert", "update", "delete", "upsert",
    ]) {
      b[m] = () => b;
    }
    b.then = (ok: (v: Risposta) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(risposta()).then(ok, ko);
    return b;
  };
  const canale: Record<string, unknown> = {};
  canale.on = () => canale;
  canale.subscribe = () => canale;
  canale.unsubscribe = finti.niente;
  return {
    supabase: {
      from: (tabella: string) => costruttore(() => {
        if (tabella === "staff_permissions") return { data: stato.rigaPermessi, error: null };
        const righe = RIGHE[tabella] ?? [];
        return { data: righe, error: null, count: righe.length };
      }),
      rpc: (nome: string, args: Record<string, unknown>) => {
        if (nome === "registra_esportazione_crm") {
          stato.sequenza.push("registro");
          stato.registro.push(args);
          return costruttore(() => stato.rispostaRegistro);
        }
        return costruttore(() => ({ data: null, error: null }));
      },
      channel: () => canale,
      removeChannel: finti.niente,
    },
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    role: stato.ruolo,
    user: { id: "utente-1" },
    effectiveCompany: { id: "azienda-1", name: "BeMade" },
    isImpersonating: false,
    isImpersonationReady: false,
    impersonatedCompanyId: null as string | null,
    impersonationToken: null as string | null,
    viewAsRole: null as string | null,
    viewAsUserId: null as string | null,
    multiCompanyAccesses: [] as unknown[],
    selectedMultiCompanyId: null as string | null,
  }),
}));

vi.mock("sonner", () => ({ toast }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => stato.mobile }));
// Il file: si guarda che parta (e quando), non si scarica niente.
vi.mock("@/lib/csvExport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/csvExport")>()),
  exportToCSV: (...args: unknown[]) => { stato.sequenza.push("file"); file.csv(...args); },
  exportToXLSX: async (...args: unknown[]) => { stato.sequenza.push("file"); file.xlsx(...args); },
}));

// Contatti: la tabella e i pannelli non c'entrano con l'esportazione.
vi.mock("@/components/marketing/ContactsTable", () => ({
  ContactsTable: finti.nulla,
  loadVisibleColumns: () => new Set<string>(),
  saveVisibleColumns: finti.niente,
  getStorageKey: () => "colonne-contatti",
}));
vi.mock("@/components/marketing/ContactDialog", () => ({ ContactDialog: finti.nulla }));
vi.mock("@/components/marketing/DeleteContactsDialog", () => ({ DeleteContactsDialog: finti.nulla }));
vi.mock("@/components/marketing/ContactListsView", () => ({ ContactListsView: finti.nulla }));
vi.mock("@/components/marketing/AddToListDropdown", () => ({ AddToListDropdown: finti.nulla }));
vi.mock("@/components/contacts/BulkContactActions", () => ({ BulkTagsDialog: finti.nulla, BulkCreateOpportunitiesDialog: finti.nulla }));
vi.mock("@/components/marketing/BulkEnrollAutomationDropdown", () => ({ BulkEnrollAutomationDropdown: finti.nulla }));
vi.mock("@/components/shared/ImportWizard", () => ({ ImportWizard: finti.nulla }));
vi.mock("@/components/marketing/ContactFieldsSheet", () => ({ ContactFieldsSheet: finti.nulla }));
vi.mock("@/components/marketing/ContactFiltersSheet", () => ({
  ContactFiltersSheet: finti.nulla,
  EMPTY_CONTACT_FILTERS: { groups: [] as unknown[] },
  countActiveContactFilters: () => 0,
}));
vi.mock("@/hooks/useOpportunityDetailData", () => ({
  useContactCustomFields: () => ({ data: [] as unknown[] }),
  useOpportunityCustomFields: () => ({ data: [] as unknown[] }),
}));
vi.mock("@/hooks/useTagSync", () => ({ syncTagsToOpportunities: vi.fn(), removeTagFromOpportunities: vi.fn() }));

// Opportunità: una pipeline con una fase; kanban, dialoghi e striscia spenti.
vi.mock("@/hooks/useOpportunitiesData", () => ({
  filtroSoloMiei: (id: string) => `assigned_to.eq.${id}`,
  usePipelines: () => ({
    data: [{ id: "pipe-1", name: "Nuovo", marketing_pipeline_stages: [{ id: "fase-1", name: "Da chiamare", position: 0 }] }],
    isLoading: false,
    error: null as unknown,
    refetch: finti.niente,
  }),
  useCompanyStaff: () => ({ data: [] as unknown[] }),
  useBulkDeleteOpportunities: () => ({ mutate: finti.niente, mutateAsync: async (): Promise<void> => undefined, isPending: false }),
  enrichPage: async (righe: unknown[]) => righe,
  useOpportunitySummary: () => ({ data: { totale: 1, per_fase: {} }, error: null as unknown, isFetching: false }),
  useOpportunityList: () => ({
    data: undefined as unknown,
    fetchNextPage: finti.niente,
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoading: false,
    error: null as unknown,
  }),
  useOpportunityTags: () => ({ data: [] as string[] }),
  useOpportunitiesLive: finti.niente,
  idsOpportunita: async (): Promise<string[]> => [],
  MASSIMO_ELIMINAZIONE: 500,
}));
vi.mock("@/hooks/useCardFieldPreferences", () => ({
  CardFieldPreferencesProvider: ({ children }: { children: ReactNode }) => children,
  useCardFieldPreferences: () => ({ activeFields: [] as string[], layout: "default", setActiveFields: finti.niente, setLayout: finti.niente }),
}));
vi.mock("@/components/opportunities/CardCustomizeSheet", () => ({ CardCustomizeSheet: finti.nulla }));
vi.mock("@/components/opportunities/PipelineSelector", () => ({ PipelineSelector: finti.nulla }));
vi.mock("@/components/opportunities/OpportunityKanbanView", () => ({ OpportunityKanbanView: finti.nulla }));
vi.mock("@/components/opportunities/OpportunityListView", () => ({ OpportunityListView: finti.nulla }));
vi.mock("@/components/opportunities/OpportunityDialog", () => ({ OpportunityDialog: finti.nulla }));
vi.mock("@/components/opportunities/OpportunityFiltersSheet", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/opportunities/OpportunityFiltersSheet")>()),
  OpportunityFiltersSheet: finti.nulla,
}));
vi.mock("@/components/opportunities/BulkEditSheet", () => ({ BulkEditSheet: finti.nulla }));
vi.mock("@/components/opportunities/OpportunityDetailDialog", () => ({ OpportunityDetailDialog: finti.nulla }));
vi.mock("@/components/opportunities/OpportunitaCestinoDialog", () => ({ OpportunitaCestinoDialog: finti.nulla }));
vi.mock("@/components/opportunities/OpportunityStatsStrip", () => ({ OpportunityStatsStrip: finti.nulla }));
vi.mock("@/components/marketing/CreateListDialog", () => ({ CreateListDialog: finti.nulla }));

// Preventivi: nessun modulo di settore acceso, solo i preventivi classici.
vi.mock("@/lib/moduli-vendita", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/moduli-vendita")>()),
  useModuliVendita: () => ({ moduli: [] as unknown[] }),
}));
vi.mock("@/components/marketing/preventivi/UnifiedFiltersSheet", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/marketing/preventivi/UnifiedFiltersSheet")>()),
  UnifiedFiltersSheet: finti.nulla,
}));
vi.mock("@/components/marketing/preventivi/UnifiedBulkToolbar", () => ({ UnifiedBulkToolbar: finti.nulla }));
vi.mock("@/components/marketing/preventivi/PreventiviCestinoDialog", () => ({ PreventiviCestinoDialog: finti.nulla }));

import MarketingContacts from "@/pages/azienda/marketing/MarketingContacts";
import MarketingOpportunities from "@/pages/azienda/marketing/MarketingOpportunities";
import { UnifiedPreventiviList } from "@/components/marketing/preventivi/UnifiedPreventiviList";

/** La riga di staff_permissions di chi lavora sul CRM, con o senza «Esporta Clienti». */
const staff = (esportaClienti: boolean) => ({
  can_view_marketing_contacts: true,
  can_edit_marketing_contacts: true,
  can_view_marketing_opportunities: true,
  can_edit_marketing_opportunities: true,
  can_export_clients: esportaClienti,
  only_assigned: false,
});

function monta(pagina: ReactNode, percorso: string) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[percorso]}>
        <TooltipProvider>{pagina}</TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const apriMenu = (bottone: HTMLElement) =>
  fireEvent.pointerDown(bottone, { button: 0, ctrlKey: false, pointerType: "mouse" });

const NEGATO = { data: null as unknown, error: { message: "Non hai il permesso «Esporta Clienti» in questa azienda", code: "42501" } };

/** Il bottone si può premere (niente jest-dom qui: i suoi tipi non sono nel tsconfig). */
const abilitato = (el: HTMLElement) => expect((el as HTMLButtonElement).disabled).toBe(false);

beforeEach(() => {
  stato.ruolo = "company_staff";
  stato.mobile = false;
  stato.rigaPermessi = null;
  stato.sequenza.length = 0;
  stato.registro.length = 0;
  stato.rispostaRegistro = { data: "riga-registro", error: null };
  file.csv.mockReset();
  file.xlsx.mockReset();
  Object.values(toast).forEach((f) => f.mockReset());
});

afterEach(() => cleanup());

describe("Contatti: «Esporta» segue «Esporta Clienti»", () => {
  /** La pagina è pronta quando i permessi sono letti: «Importa» si accende. */
  const pronta = async () => {
    await screen.findByRole("heading", { name: "Contatti" });
    await waitFor(() => abilitato(screen.getByRole("button", { name: /Importa/ })));
  };

  it("staff senza il permesso: nessun bottone Esporta", async () => {
    stato.rigaPermessi = staff(false);
    monta(<MarketingContacts />, "/azienda/marketing/contatti");
    await pronta();
    expect(screen.queryByRole("button", { name: /Esporta/ })).toBeNull();
  });

  it("staff col permesso: prima il registro, poi il file", async () => {
    stato.rigaPermessi = staff(true);
    monta(<MarketingContacts />, "/azienda/marketing/contatti");
    await pronta();

    const esporta = screen.getByRole("button", { name: /Esporta/ });
    await waitFor(() => abilitato(esporta));
    apriMenu(esporta);
    fireEvent.click(await screen.findByRole("menuitem", { name: /Esporta CSV/ }));

    await waitFor(() => expect(file.csv).toHaveBeenCalledTimes(1));
    expect(stato.sequenza).toEqual(["registro", "file"]);
    expect(stato.registro).toEqual([{
      p_company_id: "azienda-1",
      p_oggetto: "contatti",
      p_formato: "csv",
      p_righe: 2,
      p_filtri: { perimetro: "tutta l'azienda" },
    }]);
    expect(file.csv.mock.calls[0][0]).toHaveLength(2);
  });

  it("l'amministratore esporta anche senza riga di permessi", async () => {
    stato.ruolo = "company_admin";
    monta(<MarketingContacts />, "/azienda/marketing/contatti");
    await pronta();
    const esporta = screen.getByRole("button", { name: /Esporta/ });
    await waitFor(() => abilitato(esporta));
    apriMenu(esporta);
    fireEvent.click(await screen.findByRole("menuitem", { name: /Esporta XLSX/ }));

    await waitFor(() => expect(file.xlsx).toHaveBeenCalledTimes(1));
    expect(stato.registro[0]).toMatchObject({ p_oggetto: "contatti", p_formato: "xlsx", p_righe: 2 });
  });

  it("se il database rifiuta, il file non parte e si dice perché", async () => {
    stato.rigaPermessi = staff(true);
    stato.rispostaRegistro = NEGATO;
    monta(<MarketingContacts />, "/azienda/marketing/contatti");
    await pronta();
    const esporta = screen.getByRole("button", { name: /Esporta/ });
    await waitFor(() => abilitato(esporta));
    apriMenu(esporta);
    fireEvent.click(await screen.findByRole("menuitem", { name: /Esporta CSV/ }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Non hai il permesso «Esporta Clienti»: chiedilo a un amministratore."));
    expect(stato.sequenza).toEqual(["registro"]);
    expect(file.csv).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("Opportunità: «Esporta CSV» segue «Esporta Clienti»", () => {
  /** Apre «Altre azioni» quando i permessi sono letti (c'è «Cestino»). */
  const apriAltreAzioni = async () => {
    apriMenu(await screen.findByRole("button", { name: "Altre azioni" }));
    await screen.findByRole("menuitem", { name: /Cestino/ });
  };

  it("staff senza il permesso: la voce non c'è", async () => {
    stato.rigaPermessi = staff(false);
    monta(<MarketingOpportunities />, "/azienda/marketing/opportunita");
    await waitFor(() => abilitato(screen.getByRole("button", { name: "Aggiungi opportunità" })));
    await apriAltreAzioni();
    expect(screen.queryByRole("menuitem", { name: /Esporta/ })).toBeNull();
  });

  it("staff col permesso: la voce c'è, e l'esportazione passa prima dal registro", async () => {
    stato.rigaPermessi = staff(true);
    monta(<MarketingOpportunities />, "/azienda/marketing/opportunita");
    await waitFor(() => abilitato(screen.getByRole("button", { name: "Aggiungi opportunità" })));
    await apriAltreAzioni();
    fireEvent.click(screen.getByRole("menuitem", { name: /Esporta CSV/ }));

    await waitFor(() => expect(file.csv).toHaveBeenCalledTimes(1));
    expect(stato.sequenza).toEqual(["registro", "file"]);
    expect(stato.registro).toEqual([{
      p_company_id: "azienda-1",
      p_oggetto: "opportunita",
      p_formato: "csv",
      p_righe: 1,
      p_filtri: { pipeline: "Nuovo", perimetro: "tutta l'azienda" },
    }]);
  });

  it("l'amministratore la vede anche senza riga di permessi", async () => {
    stato.ruolo = "company_admin";
    monta(<MarketingOpportunities />, "/azienda/marketing/opportunita");
    await apriAltreAzioni();
    expect(screen.getByRole("menuitem", { name: /Esporta CSV/ })).toBeTruthy();
  });

  it("se il database rifiuta, il file non parte", async () => {
    stato.rigaPermessi = staff(true);
    stato.rispostaRegistro = NEGATO;
    monta(<MarketingOpportunities />, "/azienda/marketing/opportunita");
    await waitFor(() => abilitato(screen.getByRole("button", { name: "Aggiungi opportunità" })));
    await apriAltreAzioni();
    fireEvent.click(screen.getByRole("menuitem", { name: /Esporta CSV/ }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Non hai il permesso «Esporta Clienti»: chiedilo a un amministratore."));
    expect(file.csv).not.toHaveBeenCalled();
  });

  it("da telefono la voce non c'è, anche col permesso", async () => {
    stato.mobile = true;
    stato.rigaPermessi = staff(true);
    monta(<MarketingOpportunities />, "/azienda/marketing/opportunita");
    await waitFor(() => abilitato(screen.getByRole("button", { name: "Aggiungi opportunità" })));
    await apriAltreAzioni();
    expect(screen.queryByRole("menuitem", { name: /Esporta/ })).toBeNull();
  });
});

describe("Preventivi: «Excel» segue «Esporta Clienti»", () => {
  // Il file lo consegna un link creato al volo: si guarda il suo clic.
  let clic: { mockRestore: () => void };
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:finto");
    URL.revokeObjectURL = vi.fn();
    clic = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      stato.sequenza.push("file");
    });
  });
  afterEach(() => clic.mockRestore());

  const conPreventivi = (esportaClienti: boolean) => ({ ...staff(esportaClienti), can_view_preventivi: true });
  const caricato = () => screen.findAllByText(/Elide Ruggiata/);

  it("staff senza il permesso: nessun bottone Excel", async () => {
    stato.rigaPermessi = conPreventivi(false);
    monta(<UnifiedPreventiviList />, "/azienda/marketing/preventivi");
    await caricato();
    await expect(screen.findByRole("button", { name: "Esporta Excel" }, { timeout: 300 })).rejects.toThrow();
  });

  it("staff col permesso: prima il registro, poi il file", async () => {
    stato.rigaPermessi = conPreventivi(true);
    monta(<UnifiedPreventiviList />, "/azienda/marketing/preventivi");
    await caricato();
    const excel = await screen.findByRole("button", { name: "Esporta Excel" });
    await waitFor(() => abilitato(excel));
    fireEvent.click(excel);

    await waitFor(() => expect(stato.sequenza).toEqual(["registro", "file"]), { timeout: 15000 });
    expect(stato.registro).toEqual([{
      p_company_id: "azienda-1",
      p_oggetto: "preventivi",
      p_formato: "xlsx",
      p_righe: 1,
      p_filtri: { perimetro: "tutta l'azienda" },
    }]);
  }, 30000);

  it("da telefono il bottone non c'è, anche col permesso", async () => {
    stato.mobile = true;
    stato.rigaPermessi = conPreventivi(true);
    monta(<UnifiedPreventiviList />, "/azienda/marketing/preventivi");
    await caricato();
    await expect(screen.findByRole("button", { name: "Esporta Excel" }, { timeout: 300 })).rejects.toThrow();
  });

  it("se il database rifiuta, il file non parte", async () => {
    stato.rigaPermessi = conPreventivi(true);
    stato.rispostaRegistro = NEGATO;
    monta(<UnifiedPreventiviList />, "/azienda/marketing/preventivi");
    await caricato();
    const excel = await screen.findByRole("button", { name: "Esporta Excel" });
    await waitFor(() => abilitato(excel));
    fireEvent.click(excel);

    await waitFor(
      () => expect(toast.error).toHaveBeenCalledWith("Non hai il permesso «Esporta Clienti»: chiedilo a un amministratore."),
      { timeout: 15000 },
    );
    expect(stato.sequenza).toEqual(["registro"]);
  }, 30000);
});
