/**
 * La scheda committente (09/11/2026): stessa impostazione della scheda cliente,
 * con contratti, listino, commesse e rendiconti nella colonna destra. I prezzi
 * del committente restano a chi ha il permesso sugli importi.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import CommittenteDetail from "@/pages/azienda/CommittenteDetail";
import CompanyCustomerDetail from "@/pages/azienda/CompanyCustomerDetail";

const stato = vi.hoisted(() => ({
  importi: true,
  modulo: true,
  tabelle: {} as Record<string, unknown[]>,
  scheda: {} as Record<string, unknown>,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "company", name: "Demo" }, user: { id: "titolare" }, userRoles: ["company_admin"], role: "company_admin" }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ isAdmin: false, canEditCustomers: true, canViewOrderAmounts: stato.importi, isLoading: false }),
}));
vi.mock("@/hooks/useFeatureFlags", () => ({
  useFeatureFlags: () => ({ isFeatureEnabled: () => stato.modulo, isLoading: false }),
}));
vi.mock("@/hooks/useCompanyBase", () => ({ useCompanyBase: (): null => null }));
vi.mock("@/hooks/useCondizioniDocumento", () => ({ useCondizioniDocumento: () => ({ clausole: [] as unknown[] }) }));
vi.mock("@/components/silvio/ChiediASilvio", () => ({ ChiediASilvio: () => <button type="button">Chiedi a Silvio</button> }));
vi.mock("@/components/telephony/ContactCallHistory", () => ({ ContactCallHistory: (): null => null }));
vi.mock("@/components/telephony/WebCallButton", () => ({ WebCallButton: () => <button type="button">Chiama</button> }));
vi.mock("@/components/telephony/AiCallButton", () => ({ AiCallButton: (): null => null }));
vi.mock("@/components/orders/SalAppalto", () => ({ SalAppalto: () => <p>Elenco rendiconti</p> }));
vi.mock("@/integrations/supabase/client", () => {
  const query = (tabella: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "in", "is", "not", "or", "order", "limit", "range", "gte", "lte", "lt", "gt", "ilike", "contains", "filter", "match"]) q[m] = () => q;
    const risultato = () => ({ data: stato.tabelle[tabella] ?? [], error: null as unknown });
    q.maybeSingle = async () => ({ data: (stato.tabelle[tabella] ?? [])[0] ?? null, error: null as unknown });
    q.single = q.maybeSingle;
    q.then = (si: (r: unknown) => unknown, no: (e: unknown) => unknown) => Promise.resolve(risultato()).then(si, no);
    return q;
  };
  const rpc = (nome: string) => {
    const dati: unknown = nome === "scheda_cliente" ? stato.scheda : [];
    return Promise.resolve({ data: dati, error: null as unknown });
  };
  return { supabase: {
    from: query, rpc,
    auth: { getUser: async () => ({ data: { user: { id: "titolare" } } }), getSession: async () => ({ data: { session: null as unknown } }) },
    channel: () => {
      const canale: { on: () => unknown; subscribe: () => unknown } = { on: () => canale, subscribe: () => ({}) };
      return canale;
    },
    removeChannel: (): void => undefined,
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null as unknown, error: null as unknown }), createSignedUrls: async () => ({ data: [] as unknown[], error: null as unknown }) }) },
    functions: { invoke: async () => ({ data: null as unknown, error: null as unknown }) },
  } };
});

const committente: Record<string, unknown> = {
  id: "k", business_name: "Edil Rossi S.r.l.", first_name: "Mario", last_name: "Bianchi", email: "ufficio@edilrossi.invalid", phone: "0212345678",
  fiscal_code: null, vat_number: "00123456782", address: "Via Roma 1", city: "Milano", postal_code: "20100", province: "MI", country: "IT",
  site_address: null, site_city: null, site_postal_code: null, site_province: null, notes: null, created_at: "2026-01-10T09:00:00Z",
  salesperson_id: null, marketing_contact_id: null, is_business: true, customer_type: "appaltatore", company_id: "company",
};
const contratto = {
  id: "t1", nome: "Accordo 2026", valido_dal: "2026-01-01", valido_al: null as string | null, giorni_pagamento: 60, ritenuta_pct: 5,
  maggiorazione_straordinario_pct: 25, maggiorazione_festivo_pct: 50, modo_fatturazione: "mensile_cumulativa", regime_iva: "ordinaria",
  include_fornitura: false, riferimento_committente: null as string | null, condizioni: null as string | null, note: null as string | null, attivo: true,
};
const tariffa = {
  id: "r1", contratto_id: "t1", tipo: "manodopera", codice: null as string | null, descrizione: "Giornata uomo", unita_misura: "uomo_giorno",
  prezzo_unitario: 180, maggiorazione_straordinario_pct: null as number | null, maggiorazione_festivo_pct: null as number | null,
  qualifica: null as string | null, note: null as string | null, ordine: 0, attivo: true,
};
const lavoro = {
  id: "o1", order_code: "APP-2026-001", description: "Posa cappotto", total_amount: 0, created_at: "2026-03-01T09:00:00Z",
  work_start_date: "2026-03-02", work_end_date: null as string | null, valorizzazione: "a_misura", tetto_importo: null as number | null,
  fase: { name: "In corso", color: "#16a34a" },
};

beforeEach(() => {
  stato.importi = true;
  stato.modulo = true;
  stato.tabelle = { profiles: [committente], appalto_contratti: [contratto], appalto_tariffe: [tariffa], orders: [lavoro] };
  stato.scheda = {
    ordini: [], anagrafica: null, preventivi: [], ticket: [], interventi: [], appuntamenti: [], rate: [], da_incassare: [],
    fatture: [{ id: "f1", tipo: "fattura", numero: "12/2026", data_emissione: "2026-04-01", stato: "emessa", totale_documento: 4321 }],
  };
  Object.defineProperty(window, "matchMedia", { configurable: true, value: (q: string) => ({ matches: q.includes("1280"), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} }) });
});
afterEach(cleanup);

const mostra = (indirizzo = "/azienda/committenti/k") => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <TooltipProvider>
      <MemoryRouter initialEntries={[indirizzo]}>
        <Routes>
          <Route path="/azienda/committenti/:id" element={<CommittenteDetail />} />
          <Route path="/azienda/clienti/:id" element={<CompanyCustomerDetail />} />
        </Routes>
      </MemoryRouter>
    </TooltipProvider>
  </QueryClientProvider>,
);
const apri = async (nome: string) => fireEvent.click(await screen.findByRole("button", { name: nome }));

it("ha la testata, il diario e la barra per scrivere della scheda cliente", async () => {
  mostra();
  expect(await screen.findByRole("heading", { level: 1, name: "Edil Rossi S.r.l." })).toBeInTheDocument();
  expect(screen.getByText("Committente dal")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /Email/ }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole("button", { name: /Appuntamento/ }).length).toBeGreaterThan(0);
  expect(screen.getByText("Chiedi a Silvio")).toBeInTheDocument();
  expect(await screen.findByText("Committente registrato")).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/nota interna/i)).toBeInTheDocument();
  // Un'impresa non ha un cantiere suo né si sceglie se è una persona.
  expect(screen.queryByText("Indirizzo cantiere")).not.toBeInTheDocument();
  expect(screen.queryByText("Tipo cliente")).not.toBeInTheDocument();
});

it("apre sul contratto in corso e sulle sue condizioni", async () => {
  mostra();
  expect((await screen.findAllByText("Accordo 2026")).length).toBeGreaterThan(0);
  expect((await screen.findAllByText("60 gg")).length).toBeGreaterThan(0);
  expect(screen.getByText("Mensile, tutte le commesse")).toBeVisible();
  expect(screen.getByText("Sola manodopera")).toBeVisible();
});

it("il listino si vede con il permesso sugli importi", async () => {
  mostra();
  await apri("Listino concordato");
  expect(await screen.findByText("Giornata uomo")).toBeVisible();
  expect(screen.getByText("€ 180,00")).toBeVisible();
});

it("senza il permesso sugli importi non compaiono né prezzi né euro delle fatture", async () => {
  stato.importi = false;
  mostra();
  expect((await screen.findAllByText("60 gg")).length).toBeGreaterThan(0);
  expect(await screen.findByText(/Fattura 12\/2026/)).toBeInTheDocument();
  expect(screen.queryByText(/4\.321/)).not.toBeInTheDocument();
  await apri("Listino concordato");
  expect(await screen.findByText(/Importi delle commesse/)).toBeVisible();
  expect(screen.queryByText("€ 180,00")).not.toBeInTheDocument();
  expect(screen.queryByText("Giornata uomo")).not.toBeInTheDocument();
  await apri("Documenti / Fatture");
  expect(await screen.findByText("Fatture e note di credito")).toBeVisible();
  expect(screen.queryByText(/4\.321/)).not.toBeInTheDocument();
});

it("una commessa a misura non vale zero, e i rendiconti stanno nel loro pannello", async () => {
  mostra();
  await apri("Commesse");
  expect(await screen.findByText("APP-2026-001")).toBeVisible();
  expect(screen.getByText("a misura")).toBeVisible();
  await apri("Rendiconti");
  expect(await screen.findByText("Elenco rendiconti")).toBeVisible();
});

it("i documenti sono quelli di un'impresa, non quelli di una persona", async () => {
  mostra();
  await apri("Documenti / Fatture");
  expect(await screen.findByText("Documenti dell'impresa")).toBeVisible();
  expect(screen.queryByText(/Documento d'identità/)).not.toBeInTheDocument();
});

it("un cliente privato aperto come committente non mostra contratto e listino", async () => {
  stato.tabelle.profiles = [{ ...committente, customer_type: "privato" }];
  mostra();
  expect(await screen.findByText(/è un cliente, non un committente/)).toBeVisible();
  expect(screen.queryByText("Accordo 2026")).not.toBeInTheDocument();
  expect(screen.queryByText("€ 180,00")).not.toBeInTheDocument();
});

it("da ricerca e fatture si arriva alla scheda del committente", async () => {
  mostra("/azienda/clienti/k");
  expect(await screen.findByText("Committente dal")).toBeInTheDocument();
  expect(screen.queryByText("Cliente dal")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Edil Rossi S.r.l." })).toBeInTheDocument());
});

it("col modulo spento resta la scheda cliente, perché quella del committente non si aprirebbe", async () => {
  stato.modulo = false;
  mostra("/azienda/clienti/k");
  expect(await screen.findByText("Cliente dal")).toBeInTheDocument();
  expect(screen.queryByText("Committente dal")).not.toBeInTheDocument();
});

it("senza il permesso sugli importi i rendiconti dicono perché non si vedono", async () => {
  stato.importi = false;
  mostra();
  await apri("Rendiconti");
  expect(await screen.findByText(/I rendiconti al committente li vede chi ha il permesso/)).toBeVisible();
  expect(screen.queryByText("Elenco rendiconti")).not.toBeInTheDocument();
});
