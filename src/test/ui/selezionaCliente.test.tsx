/**
 * «Seleziona cliente» nei preventivatori (07/11/2026).
 *
 * Florin: «si deve aprire un popup in cui scelgo tra i contatti del CRM oppure, se ho la sezione sbloccata,
 * anche dai clienti, e devo vedere i dati principali. Il venditore che ha solo i dati assegnati a lui vede
 * ovviamente solo quelli».
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({
  permessi: {} as Record<string, unknown>,
  contatti: [] as unknown[],
  clienti: [] as unknown[],
  chiamateClienti: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => stato.permessi }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "az-1" }));
vi.mock("@/hooks/useDebounce", () => ({ useDebounce: (v: string) => v }));
vi.mock("@/integrations/supabase/client", () => {
  const catena = (dati: () => unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "limit", "or"]) c[m] = () => c;
    c.order = async () => ({ data: dati(), error: null as unknown });
    return c;
  };
  return {
    supabase: {
      from: (t: string) => catena(() => (t === "marketing_contacts" ? stato.contatti : [])),
      rpc: async (_n: string, p: Record<string, unknown>) => { stato.chiamateClienti.push(p); return { data: { rows: stato.clienti }, error: null as unknown }; },
    },
  };
});

import { SelezionaCliente } from "@/components/preventivatore/SelezionaCliente";
import { fontiVisibili } from "@/lib/preventivatore/selezionaCliente";

const contatto = { id: "c1", first_name: "Mario", last_name: "Rossi", email: "mario@esempio.it", phone: "333 111", city: "Torino", province: "TO", company_name: null as string | null, fiscal_code: "RSSMRA80A01L219X", vat_number: null as string | null };
const cliente = { id: "p1", first_name: "Laura", last_name: "Bianchi", is_business: true, business_name: "Bianchi Costruzioni", email: "laura@esempio.it", phone: "335 222", city: "Milano", province: "MI", fiscal_code: "01234567890" };

function apri(onScegli = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SelezionaCliente collegatoId={null} onScegli={onScegli} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Seleziona cliente/ }));
  return onScegli;
}

beforeEach(() => {
  stato.permessi = { isAdmin: false, canViewMarketingContacts: true, canViewCustomers: true, onlyAssigned: false };
  stato.contatti = [contatto]; stato.clienti = [cliente]; stato.chiamateClienti = [];
});

describe("Chi vede cosa", () => {
  it("le linguette seguono i permessi", () => {
    expect(fontiVisibili({ canViewMarketingContacts: true, canViewCustomers: false })).toMatchObject({ contatti: true, clienti: false });
    expect(fontiVisibili({ canViewMarketingContacts: false, canViewCustomers: true })).toMatchObject({ contatti: false, clienti: true });
    expect(fontiVisibili({ canViewMarketingContacts: false, canViewOrders: true })).toMatchObject({ contatti: false, clienti: true });
    expect(fontiVisibili({ isAdmin: true, onlyAssigned: true })).toEqual({ contatti: true, clienti: true, soloMieiClienti: false });
    expect(fontiVisibili({ canViewCustomers: true, onlyAssigned: true }).soloMieiClienti).toBe(true);
    expect(fontiVisibili({ isLoading: true, isAdmin: true })).toMatchObject({ contatti: false, clienti: false });
  });

  it("senza la sezione Clienti c'è solo la ricerca nei contatti", async () => {
    stato.permessi = { canViewMarketingContacts: true, canViewCustomers: false };
    apri();
    expect(screen.queryByRole("tab", { name: /Clienti/ })).toBeNull();
    expect(await screen.findByText("Mario Rossi")).toBeInTheDocument();
  });

  it("con «solo i propri» il limite lo applica il database, e il popup lo dice", async () => {
    stato.permessi = { canViewMarketingContacts: true, canViewOrders: true, onlyAssigned: true };
    apri();
    fireEvent.click(screen.getByRole("tab", { name: /Clienti/ }));
    expect(await screen.findByText("Laura Bianchi")).toBeInTheDocument();
    expect(stato.chiamateClienti.at(-1)).toMatchObject({ p_company_id: "az-1" });
    expect(stato.chiamateClienti.at(-1)).not.toHaveProperty("p_salesperson_id");
    expect(screen.getByText(/Vedi solo i clienti assegnati a te/)).toBeInTheDocument();
  });

  it("con «solo i propri» e nessun cliente assegnato lo dice", async () => {
    stato.permessi = { canViewMarketingContacts: true, canViewCustomers: true, onlyAssigned: true };
    stato.clienti = [];
    apri();
    fireEvent.click(screen.getByRole("tab", { name: /Clienti/ }));
    expect(await screen.findByText(/Non hai clienti assegnati/)).toBeInTheDocument();
  });
});

describe("I dati principali, e cosa arriva al preventivo", () => {
  it("ogni contatto è una riga con telefono, email e città in colonna, e il codice fiscale sotto il nome", async () => {
    apri();
    await screen.findByText("Mario Rossi");
    expect(screen.getAllByRole("columnheader").map((c) => c.textContent)).toEqual(["Nome", "Telefono", "Email", "Città"]);
    const celle = within(screen.getByText("Mario Rossi").closest("button")!).getAllByRole("cell").map((c) => c.textContent);
    expect(celle[0]).toContain("CF RSSMRA80A01L219X");
    expect(celle.slice(1)).toEqual(["Tel. 333 111", "mario@esempio.it", "Torino (TO)"]);
  });

  it("dove manca un dato c'è «—», non un buco", async () => {
    stato.contatti = [{ ...contatto, phone: null, email: "x@demo.invalid" }];
    apri();
    const celle = within((await screen.findByText("Mario Rossi")).closest("button")!).getAllByRole("cell").map((c) => c.textContent);
    expect(celle.slice(1, 3)).toEqual(["Tel. —", "—"]);
  });

  it("scegliendo un cliente arrivano azienda e dati, come cliente e non come contatto", async () => {
    const onScegli = apri();
    fireEvent.click(screen.getByRole("tab", { name: /Clienti/ }));
    fireEvent.click((await screen.findByText("Laura Bianchi")).closest("button")!);
    await waitFor(() => expect(onScegli).toHaveBeenCalled());
    expect(onScegli.mock.calls[0][0]).toMatchObject({ origine: "cliente", ragioneSociale: "Bianchi Costruzioni", telefono: "335 222" });
  });

  it("le email tecniche dei clienti senza email non si mostrano e non arrivano al preventivo; l'azienda non si ripete", async () => {
    stato.clienti = [{ ...cliente, first_name: "Costruzioni Alpine S.r.l.", last_name: null, business_name: "Costruzioni Alpine S.r.l.", email: "cliente-1@no-email.ediliziaincloud.local" }];
    const onScegli = apri();
    fireEvent.click(screen.getByRole("tab", { name: /Clienti/ }));
    const riga = (await screen.findByText("Costruzioni Alpine S.r.l.")).closest("button")!;
    expect(riga.textContent).not.toMatch(/no-email|Costruzioni Alpine S\.r\.l\..*Costruzioni Alpine/);
    fireEvent.click(riga);
    await waitFor(() => expect(onScegli).toHaveBeenCalled());
    expect(onScegli.mock.calls[0][0].email).toBeNull();
  });

  it("senza accesso né ai contatti né ai clienti, il popup lo dice", () => {
    stato.permessi = { canViewMarketingContacts: false, canViewCustomers: false };
    apri();
    expect(within(screen.getByRole("dialog")).getByText(/Non hai accesso né ai contatti del CRM né ai clienti/)).toBeInTheDocument();
  });
});
