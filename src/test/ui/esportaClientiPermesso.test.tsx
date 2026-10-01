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
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cloneElement, isValidElement, type ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryKeys } from "@/lib/queryKeys";
import { refreshCrmContacts } from "@/lib/refreshCrmContacts";

interface Risposta {
  data: unknown;
  error: unknown;
  count?: number | null;
}

const stato = vi.hoisted(() => ({
  ruolo: "company_staff",
  mobile: false,
  pipelineVuote: false,
  fasiVuote: false,
  contattiTotali: null as number | null,
  listeTotali: 0,
  companyId: "azienda-1",
  contattiInAttesa: null as Promise<void> | null,
  emailContatto: "elide@example.it",
  mostraRighe: false,
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
  const costruttore = (risposta: () => Risposta | Promise<Risposta>) => {
    const b: Record<string, unknown> = {};
    let singola = false;
    for (const m of [
      "select", "eq", "neq", "or", "in", "is", "not", "gte", "gt", "lte", "lt", "ilike", "like",
      "contains", "overlaps", "order", "range", "limit", "filter", "match", "textSearch", "returns",
      "abortSignal", "maybeSingle", "single", "insert", "update", "delete", "upsert",
    ]) {
      b[m] = () => b;
    }
    b.maybeSingle = b.single = () => { singola = true; return b; };
    b.then = (ok: (v: Risposta) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(risposta())
      .then((r) => singola && Array.isArray(r.data) ? { ...r, data: r.data[0] ?? null } : r).then(ok, ko);
    return b;
  };
  const canale: Record<string, unknown> = {};
  canale.on = () => canale;
  canale.subscribe = () => canale;
  canale.unsubscribe = finti.niente;
  return {
    supabase: {
      from: (tabella: string) => costruttore(async () => {
        if (tabella === "staff_permissions") return { data: stato.rigaPermessi, error: null };
        if (tabella === "marketing_contacts" && stato.contattiInAttesa) await stato.contattiInAttesa;
        const righe = (RIGHE[tabella] ?? []).map((r) => {
          const row = r as Record<string, unknown>;
          if (tabella === "marketing_contacts" && row.id === "c1") return { ...row, email: stato.emailContatto };
          if (tabella === "marketing_opportunities") return { ...row, marketing_contacts: { ...(row.marketing_contacts as object), email: stato.emailContatto } };
          return row;
        });
        return { data: righe, error: null, count: tabella === "marketing_contacts" ? stato.contattiTotali ?? righe.length : tabella === "marketing_contact_lists" ? stato.listeTotali : righe.length };
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
    effectiveCompany: { id: stato.companyId, name: "BeMade" },
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
  ContactsTable: ({ contacts, onOpenPreview, onPageChange }: {
    contacts: Array<{ id: string; email: string }>;
    onOpenPreview: (contact: unknown) => void;
    onPageChange: (page: number) => void;
  }) => stato.mostraRighe ? <div data-testid="righe-contatti">
    {contacts.map((c) => <button key={c.id} onClick={() => onOpenPreview(c)}>{c.email}</button>)}
    <button onClick={() => onPageChange(2)}>Pagina successiva test</button>
  </div> : null,
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
    data: stato.pipelineVuote ? [] : [{ id: "pipe-1", name: "Nuovo", marketing_pipeline_stages: stato.fasiVuote ? [] : [{ id: "fase-1", name: "Da chiamare", position: 0 }] }],
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
vi.mock("@/components/opportunities/OpportunityDetailDialog", () => ({
  OpportunityDetailDialog: ({ opportunity }: { opportunity: { marketing_contacts?: { email: string } } }) =>
    <output data-testid="opportunita-da-link">{opportunity.marketing_contacts?.email}</output>,
}));
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
  return montaConRerender(pagina, percorso).client;
}

function montaConRerender(pagina: ReactNode, percorso: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const contenuto = () => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[percorso]}>
        <TooltipProvider>{isValidElement(pagina) ? cloneElement(pagina) : pagina}</TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const vista = render(contenuto());
  return { client, rerender: () => vista.rerender(contenuto()) };
}

const apriMenu = (bottone: HTMLElement) =>
  fireEvent.pointerDown(bottone, { button: 0, ctrlKey: false, pointerType: "mouse" });

const NEGATO = { data: null as unknown, error: { message: "Non hai il permesso «Esporta Clienti» in questa azienda", code: "42501" } };

/** Il bottone si può premere (niente jest-dom qui: i suoi tipi non sono nel tsconfig). */
const abilitato = (el: HTMLElement) => expect((el as HTMLButtonElement).disabled).toBe(false);

beforeEach(() => {
  stato.ruolo = "company_staff";
  stato.mobile = false;
  stato.pipelineVuote = false;
  stato.fasiVuote = false;
  stato.contattiTotali = null;
  stato.listeTotali = 0;
  stato.companyId = "azienda-1";
  stato.contattiInAttesa = null;
  stato.emailContatto = "elide@example.it";
  stato.mostraRighe = false;
  stato.rigaPermessi = null;
  stato.sequenza.length = 0;
  stato.registro.length = 0;
  stato.rispostaRegistro = { data: "riga-registro", error: null };
  file.csv.mockReset();
  file.xlsx.mockReset();
  Object.values(toast).forEach((f) => f.mockReset());
});

afterEach(() => cleanup());

describe("CRM: isolamento e aggiornamento dei pannelli aperti", () => {
  const sospendiContatti = () => {
    let riprendi!: () => void;
    stato.contattiInAttesa = new Promise<void>((resolve) => { riprendi = resolve; });
    return riprendi;
  };
  const righe = () => screen.queryByTestId("righe-contatti")?.textContent ?? "";

  it("cambio azienda lento: spariscono subito righe e anteprima dell'azienda precedente", async () => {
    stato.ruolo = "company_admin";
    stato.mostraRighe = true;
    const vista = montaConRerender(<MarketingContacts />, "/azienda/marketing/contatti");
    await waitFor(() => expect(righe()).toContain("elide@example.it"));
    fireEvent.click(within(screen.getByTestId("righe-contatti")).getByText("elide@example.it"));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    const riprendi = sospendiContatti();
    try {
      stato.companyId = "azienda-2";
      vista.rerender();
      expect(righe()).not.toContain("elide@example.it");
      expect(screen.queryByRole("dialog")).toBeNull();
    } finally { await act(async () => riprendi()); }
  });

  it("passando a «solo i propri» non riusa le righe né l'anteprima del perimetro completo", async () => {
    stato.rigaPermessi = staff(false);
    stato.mostraRighe = true;
    const client = monta(<MarketingContacts />, "/azienda/marketing/contatti");
    await waitFor(() => expect(righe()).toContain("elide@example.it"));
    fireEvent.click(within(screen.getByTestId("righe-contatti")).getByText("elide@example.it"));
    await screen.findByRole("dialog");
    const riprendi = sospendiContatti();
    try {
      await act(async () => {
        client.setQueryData(["staff-permissions", "utente-1", "azienda-1"], { ...staff(false), only_assigned: true });
      });
      expect(righe()).not.toContain("elide@example.it");
      expect(screen.queryByRole("dialog")).toBeNull();
    } finally { await act(async () => riprendi()); }
  });

  it("mantiene le righe durante la paginazione nello stesso perimetro", async () => {
    stato.ruolo = "company_admin";
    stato.mostraRighe = true;
    monta(<MarketingContacts />, "/azienda/marketing/contatti");
    await waitFor(() => expect(righe()).toContain("elide@example.it"));
    const riprendi = sospendiContatti();
    try {
      fireEvent.click(screen.getByText("Pagina successiva test"));
      expect(righe()).toContain("elide@example.it");
    } finally { await act(async () => riprendi()); }
  });

  it.each(["company_admin", "super_admin"])("%s: l'anteprima aperta segue i dati aggiornati della lista", async (ruolo) => {
    stato.ruolo = ruolo;
    stato.mostraRighe = true;
    const client = monta(<MarketingContacts />, `/${ruolo === "super_admin" ? "admin" : "azienda"}/marketing/contatti`);
    await waitFor(() => expect(righe()).toContain("elide@example.it"));
    fireEvent.click(within(screen.getByTestId("righe-contatti")).getByText("elide@example.it"));
    expect((await screen.findByRole("dialog")).textContent).toContain("elide@example.it");
    stato.emailContatto = "aggiornata@example.it";
    await act(async () => { await refreshCrmContacts(client, "azienda-1", "c1"); });
    await waitFor(() => expect(screen.getByRole("dialog").textContent).toContain("aggiornata@example.it"));
    expect(screen.getByRole("dialog").textContent).not.toContain("elide@example.it");
  });

  it.each(["company_admin", "super_admin"])("%s: opportunità aperta da link segue modifiche a contatto e opportunità", async (ruolo) => {
    stato.ruolo = ruolo;
    const client = monta(<MarketingOpportunities />, `/${ruolo === "super_admin" ? "admin" : "azienda"}/marketing/opportunita?pipeline=pipe-1&apri=o1`);
    await waitFor(() => expect(screen.getByTestId("opportunita-da-link").textContent).toBe("elide@example.it"));
    stato.emailContatto = "aggiornata@example.it";
    await act(async () => { await refreshCrmContacts(client, "azienda-1", "c1"); });
    await waitFor(() => expect(screen.getByTestId("opportunita-da-link").textContent).toBe("aggiornata@example.it"));
    stato.emailContatto = "ultima@example.it";
    await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.opportunities.all }); });
    await waitFor(() => expect(screen.getByTestId("opportunita-da-link").textContent).toBe("ultima@example.it"));
  });

  it("chiude l'anteprima se il contatto esce dai risultati e non la riapre quando rientra", async () => {
    stato.ruolo = "company_admin";
    stato.mostraRighe = true;
    const client = monta(<MarketingContacts />, "/azienda/marketing/contatti");
    await waitFor(() => expect(righe()).toContain("elide@example.it"));
    fireEvent.click(within(screen.getByTestId("righe-contatti")).getByText("elide@example.it"));
    await screen.findByRole("dialog");
    const lista = client.getQueryCache().findAll({ queryKey: ["marketing-contacts", "azienda-1"] })[0];
    const prima = lista.state.data;
    await act(async () => { client.setQueryData(lista.queryKey, { contacts: [], count: 0 }); });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await act(async () => { client.setQueryData(lista.queryKey, prima); });
    await waitFor(() => expect(righe()).toContain("elide@example.it"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Contatti: aggiornamento delle viste dopo un salvataggio", () => {
  // jsdom non applica i breakpoint Tailwind: i chip desktop hanno un
  // antenato `hidden lg:block`. Controlliamo i valori renderizzati, mentre la
  // visibilità responsive viene verificata nel browser.
  const chip = (testo: RegExp) => screen.getAllByRole("button", { hidden: true })
    .find((button) => testo.test(button.textContent?.replace(/\s+/g, " ") ?? ""));
  it.each(["company_admin", "super_admin"])("%s: lista e contattabilità si aggiornano insieme senza ricaricare la pagina", async (ruolo) => {
    stato.ruolo = ruolo;
    const client = monta(<MarketingContacts />, `/${ruolo === "super_admin" ? "admin" : "azienda"}/marketing/contatti`);
    await waitFor(() => expect(chip(/Con email\s*2/)).toBeTruthy());
    stato.contattiTotali = 3;
    await act(async () => { await refreshCrmContacts(client, "azienda-1"); });
    await waitFor(() => expect(chip(/Con email\s*3/)).toBeTruthy());
    expect(chip(/3 contattabili su 3/)).toBeTruthy();
  });

  it("la prima lista creata compare anche nel tab mobile, senza lasciare la pagina", async () => {
    stato.ruolo = "company_admin";
    stato.mobile = true;
    const client = monta(<MarketingContacts />, "/azienda/marketing/contatti");
    await screen.findByRole("heading", { name: "Contatti" });
    await waitFor(() => expect(client.getQueryData(queryKeys.contactLists.count("azienda-1"))).toBe(0));
    await waitFor(() => expect(screen.getByRole("tab", { name: /Liste/ }).closest('[dir="ltr"]')?.classList.contains("hidden")).toBe(true));
    stato.listeTotali = 1;
    await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.contactLists.list("azienda-1") }); });
    const tab = await screen.findByRole("tab", { name: /Liste 1/ });
    expect(tab.closest('[dir="ltr"]')?.classList.contains("hidden")).toBe(false);
  });
});

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

function PercorsoAttuale() {
  return <output data-testid="percorso">{useLocation().pathname}</output>;
}

describe("Opportunità: impostazioni pipeline nel contesto corretto", () => {
  it.each([
    ["super_admin", "/admin/marketing/opportunita", "/admin/impostazioni/sequenze"],
    ["company_admin", "/azienda/marketing/opportunita", "/azienda/impostazioni/sequenze"],
  ])("%s: pulsante e menu aprono le impostazioni del proprio contesto", async (ruolo, origine, destinazione) => {
    stato.ruolo = ruolo;
    monta(<><MarketingOpportunities /><PercorsoAttuale /></>, origine);
    const impostazioni = await screen.findByRole("button", { name: "Impostazioni pipeline" });
    apriMenu(screen.getByRole("button", { name: "Altre azioni" }));
    expect(await screen.findByRole("menuitem", { name: "Impostazioni pipeline" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    fireEvent.click(impostazioni);
    await waitFor(() => expect(screen.getByTestId("percorso").textContent).toBe(destinazione));
  });

  it.each(["platform_marketing", "company_staff"])("%s non ottiene accesso alle impostazioni del superadmin", async (ruolo) => {
    stato.ruolo = ruolo;
    stato.rigaPermessi = { ...staff(false), can_view_settings_customization: true };
    monta(<MarketingOpportunities />, "/admin/marketing/opportunita");
    apriMenu(await screen.findByRole("button", { name: "Altre azioni" }));
    expect(screen.queryByRole("button", { name: "Impostazioni pipeline" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Impostazioni pipeline" })).toBeNull();
  });

  it("lo staff senza Personalizzazione non riceve un collegamento non autorizzato", async () => {
    stato.rigaPermessi = staff(false);
    monta(<MarketingOpportunities />, "/azienda/marketing/opportunita");
    await waitFor(() => abilitato(screen.getByRole("button", { name: "Aggiungi opportunità" })));
    expect(screen.queryByRole("button", { name: "Impostazioni pipeline" })).toBeNull();
  });

  it.each([
    ["pipeline", "Vai alle Impostazioni"],
    ["fasi", "Configura fasi"],
  ])("superadmin senza %s: il recupero apre le impostazioni interne", async (vuoto, pulsante) => {
    stato.ruolo = "super_admin";
    stato.pipelineVuote = vuoto === "pipeline";
    stato.fasiVuote = vuoto === "fasi";
    monta(<><MarketingOpportunities /><PercorsoAttuale /></>, "/admin/marketing/opportunita");
    fireEvent.click(await screen.findByRole("button", { name: pulsante }));
    await waitFor(() => expect(screen.getByTestId("percorso").textContent).toBe("/admin/impostazioni/sequenze"));
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
