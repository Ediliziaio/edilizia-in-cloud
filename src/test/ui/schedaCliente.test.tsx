/**
 * La scheda cliente (23/10/2026): i numeri che dicono come sta il cliente,
 * cliccabili; il diario senza ore finte; il codice della commessa intero;
 * i documenti personali che non si sovrappongono nel pannello.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { TooltipProvider } from "@/components/ui/tooltip";
import CompanyCustomerDetail from "@/pages/azienda/CompanyCustomerDetail";
import { formatDistanceText } from "@/lib/routing";

const stato = vi.hoisted(() => ({
  tabelle: {} as Record<string, unknown[]>,
  rpc: {} as Record<string, unknown[]>,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "company", name: "Demo" }, user: { id: "titolare" }, userRoles: ["company_admin"], role: "company_admin" }),
}));
vi.mock("@/hooks/useCompanyBase", () => ({ useCompanyBase: (): null => null }));
vi.mock("@/components/silvio/ChiediASilvio", () => ({ ChiediASilvio: () => <button type="button">Chiedi a Silvio</button> }));
vi.mock("@/components/telephony/ContactCallHistory", () => ({ ContactCallHistory: (): null => null }));
vi.mock("@/components/telephony/WebCallButton", () => ({ WebCallButton: (): null => null }));
vi.mock("@/components/telephony/AiCallButton", () => ({ AiCallButton: (): null => null }));
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
    const q: Record<string, unknown> = {};
    for (const m of ["order", "range", "limit"]) q[m] = () => q;
    q.then = (si: (r: unknown) => unknown, no: (e: unknown) => unknown) => Promise.resolve({ data: stato.rpc[nome] ?? [], error: null }).then(si, no);
    return q;
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

const cliente: Record<string, unknown> = {
  id: "cliente", first_name: "Condominio DEMO 2023 10", last_name: "", email: "cliente-2023-9@demo.invalid", phone: null,
  address: "Via dei Tigli 19, Monza", city: "Monza", province: "MB", fiscal_code: null, vat_number: null, site_address: null, notes: null,
  company_id: "company", created_at: "2023-03-28T14:00:00Z", salesperson_id: null, marketing_contact_id: null, is_business: false,
  business_name: null, postal_code: null, country: "IT", site_city: null, site_postal_code: null, site_province: null,
};

beforeEach(() => {
  stato.tabelle = { profiles: [cliente] };
  stato.rpc = {
    scheda_cliente: {
      ordini: [{ id: "o1", order_code: "DEMO-2023-H010", description: "Residenza DEMO 2023 10", total_amount: 114795.01, created_at: "2023-03-28T14:00:00Z", current_status_id: "s", order_statuses: { name: "Assistenza", color: "#f59e0b" } }],
      anagrafica: { id: "ana", ragione_sociale: "Condominio DEMO 2023 10", partita_iva: null },
      fatture: [
        { id: "f3", tipo: "fattura", numero: "DEM2023-010-3/2023", data_emissione: "2023-06-08", stato: "pagata", totale_documento: 37882.36 },
        { id: "f2", tipo: "fattura", numero: "DEM2023-010-2/2023", data_emissione: "2023-05-10", stato: "pagata", totale_documento: 50509.8 },
      ],
      preventivi: [{ id: "q1", quote_number: "OFF-2026-004", title: null, total: 8200, status: "in_corso", created_at: "2026-09-01T09:00:00Z" }],
      ticket: [
        { id: "t1", title: "Perdita dal bagno", status: "aperto", priority: "alta", created_at: "2026-10-01T08:00:00Z" },
        { id: "t2", title: "Vecchia richiesta", status: "risolto", priority: null, created_at: "2025-01-01T08:00:00Z" },
      ],
      interventi: [],
      appuntamenti: [],
      rate: [
        { id: "r1", order_id: "o1", label: "Acconto", tipo: "standard", importo: 10000, is_paid: false, paid_date: null, expected_date: "2026-09-01" },
        { id: "r2", order_id: "o1", label: "Saldo", tipo: "standard", importo: 5000, is_paid: false, paid_date: null, expected_date: "2099-01-01" },
      ],
      da_incassare: [
        { id: "r1", order_id: "o1", residuo: 10000, expected_date: "2026-09-01", finanziamento: false },
        { id: "r2", order_id: "o1", residuo: 5000, expected_date: "2099-01-01", finanziamento: false },
      ],
    },
  } as unknown as Record<string, unknown[]>;
  Object.defineProperty(window, "matchMedia", { configurable: true, value: (q: string) => ({ matches: q.includes("1536"), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} }) });
});
afterEach(cleanup);

const mostra = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <TooltipProvider>
      <MemoryRouter initialEntries={["/azienda/clienti/cliente"]}>
        <Routes><Route path="/azienda/clienti/:id" element={<CompanyCustomerDetail />} /></Routes>
      </MemoryRouter>
    </TooltipProvider>
  </QueryClientProvider>,
);

describe("la scheda cliente", () => {
  it("dice quanto c'è da incassare e quanto è scaduto", async () => {
    mostra();
    const daIncassare = (await screen.findByText("Da incassare", { selector: "span" })).closest("button")!;
    await waitFor(() => expect(daIncassare).toHaveTextContent("€ 15.000"));
    expect(daIncassare).toHaveTextContent("di cui € 10.000 scaduti");
  });

  it("conta l'assistenza aperta con gli stati veri dei ticket", async () => {
    mostra();
    const assistenza = (await screen.findByText("Assistenza aperta")).closest("button")!;
    expect(assistenza).toHaveTextContent("1");
    expect(assistenza).toHaveTextContent("su 2 richieste");
  });

  it("nel diario le fatture hanno il giorno e non un'ora inventata", async () => {
    mostra();
    const fattura = await screen.findByText("Fattura DEM2023-010-3/2023");
    const riga = fattura.closest("button")!;
    expect(riga).not.toHaveTextContent("02:00");
    expect(screen.getByText("8 giugno 2023")).toBeInTheDocument();
  });

  it("il pannello delle commesse mostra il codice intero, e un numero apre il suo pannello", async () => {
    mostra();
    // Una volta nel pannello laterale, una nella vista del telefono (nascosta sul computer).
    expect((await screen.findAllByText("DEMO-2023-H010")).length).toBeGreaterThan(0);
    fireEvent.click((await screen.findByText("Assistenza aperta")).closest("button")!);
    await waitFor(() => expect(screen.getAllByRole("heading", { level: 3 }).some((h) => /Assistenza/.test(h.textContent ?? ""))).toBe(true));
  });


  it("dice cosa fare adesso: sollecito già scritto, preventivo da richiamare, assistenza da guardare", async () => {
    mostra();
    expect(await screen.findByText("Cosa fare adesso")).toBeInTheDocument();
    expect(screen.getByText("€ 10.000 scaduti")).toBeInTheDocument();
    expect(screen.getByText(/Preventivo OFF-2026-004/)).toBeInTheDocument();
    expect(screen.getByText(/Assistenza aperta da/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sollecito per email/ })).toBeInTheDocument();
  });

  it("propone di segnare come azienda un condominio salvato come persona, e dice cosa manca", async () => {
    mostra();
    expect(await screen.findByText(/sembra un condominio o un'azienda/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Telefono" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Codice fiscale" })).toBeInTheDocument();
  });

  it("il pannello delle rate mostra lo scaduto per commessa", async () => {
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Rate / Scadenzario" }));
    expect(await screen.findByText(/Scaduta il/)).toBeInTheDocument();
    expect(screen.getAllByText("€ 10.000,00 scaduti").length).toBeGreaterThan(0);
  });

  it("la distanza si scrive all'italiana", () => {
    expect(formatDistanceText(58_500)).toBe("59 km");
    expect(formatDistanceText(7_450)).toBe("7,5 km");
  });

  it("anteprima", async () => {
    if (!process.env.ANTEPRIMA_SCHEDA) return;
    mostra();
    await screen.findAllByText("DEMO-2023-H010");
    await waitFor(() => expect(within(document.body).getByText(/di cui/)).toBeInTheDocument());
    writeFileSync(process.env.ANTEPRIMA_SCHEDA, document.body.innerHTML);
    fireEvent.click(screen.getByRole("button", { name: "Rate / Scadenzario" }));
    await screen.findByText(/Scaduta il/);
    writeFileSync(process.env.ANTEPRIMA_SCHEDA.replace(".html", "-rate.html"), document.body.innerHTML);
    fireEvent.click(screen.getByRole("button", { name: "Documenti / Fatture" }));
    await screen.findAllByText("Documenti personali");
    writeFileSync(process.env.ANTEPRIMA_SCHEDA.replace(".html", "-documenti.html"), document.body.innerHTML);
  });
});
