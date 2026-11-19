import { beforeEach, describe, expect, it, vi } from "vitest";
import { datiComputoDaCliente, leggiContestoNuovoComputo } from "@/lib/computo/contestoNuovoComputo";
import { daCliente } from "@/lib/preventivatore/selezionaCliente";

const db = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), eq: vi.fn(), risposte: {} as Record<string, unknown> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: db }));
const company = "11111111-1111-4111-8111-111111111111", contact = "22222222-2222-4222-8222-222222222222", customer = "33333333-3333-4333-8333-333333333333", opportunity = "44444444-4444-4444-8444-444444444444";
beforeEach(() => {
  vi.clearAllMocks(); db.risposte = {};
  db.from.mockImplementation((table: string) => {
    const chain = { select: () => chain, eq: db.eq.mockImplementation(() => chain), is: () => chain, maybeSingle: async () => ({ data: db.risposte[table] ?? null, error: null }) };
    return chain;
  });
});
describe("contesto CRM nel preventivo / computo", () => {
  it("non legge dati senza contesto e rifiuta identificativi malformati", async () => {
    expect(await leggiContestoNuovoComputo(company, new URLSearchParams(), {})).toEqual({});
    await expect(leggiContestoNuovoComputo(company, new URLSearchParams("contact_id=errato"), { isAdmin: true })).rejects.toThrow("non è valido");
    expect(db.from).not.toHaveBeenCalled();
  });
  it("mantiene contatto e opportunità della stessa azienda", async () => {
    db.risposte.marketing_opportunities = { id: opportunity, contact_id: contact };
    db.risposte.marketing_contacts = { id: contact, first_name: "Mario", last_name: "Rossi", email: "demo@demo.invalid", phone: "", address: "Via Demo 12", city: "Milano", fiscal_code: "RSSMRA80A01H501U" };
    expect(await leggiContestoNuovoComputo(company, new URLSearchParams({ opportunity_id: opportunity }), { isAdmin: true })).toMatchObject({ opportunitaId: opportunity, clienteId: contact, committente: "Mario Rossi", clienteEmail: "", cantiere_indirizzo: "Via Demo 12" });
    expect(db.eq).toHaveBeenCalledWith("company_id", company);
  });
  it("non usa un'opportunità con contatto diverso", async () => {
    db.risposte.marketing_opportunities = { id: opportunity, contact_id: customer };
    await expect(leggiContestoNuovoComputo(company, new URLSearchParams({ opportunity_id: opportunity, contact_id: contact }), { isAdmin: true })).rejects.toThrow("non corrisponde");
    expect(db.from).toHaveBeenCalledTimes(1);
  });
  it("conserva il cliente azienda e i dati fiscali", () => {
    expect(datiComputoDaCliente(daCliente({ id: customer, first_name: "Mario", last_name: "Rossi", business_name: "Impresa DEMO", email: null, phone: null, vat_number: "01234567890" }))).toMatchObject({ clienteAnagraficaId: customer, clienteId: "", committente: "Impresa DEMO", clienteTipo: "azienda", clientePartitaIva: "01234567890" });
  });
  it("senza permessi non interroga il contatto né il cliente", async () => {
    for (const params of [{ contact_id: contact }, { customer_id: customer }, { opportunity_id: opportunity }]) await expect(leggiContestoNuovoComputo(company, new URLSearchParams(params), {})).rejects.toThrow("Non hai accesso");
    expect(db.from).not.toHaveBeenCalled();
  });
  it("con solo assegnati conferma il cliente usando la RPC protetta del selettore", async () => {
    db.risposte.profiles = { id: customer, first_name: "Demo", last_name: "Cliente", email: "demo@demo.invalid", phone: "" };
    db.rpc.mockResolvedValue({ data: { rows: [] }, error: null });
    const params = new URLSearchParams({ customer_id: customer });
    const permessi = { canViewCustomers: true, onlyAssigned: true };
    await expect(leggiContestoNuovoComputo(company, params, permessi)).rejects.toThrow("assegnati");
    db.rpc.mockResolvedValue({ data: { rows: [db.risposte.profiles] }, error: null });
    expect(await leggiContestoNuovoComputo(company, params, permessi)).toMatchObject({ clienteAnagraficaId: customer });
    expect(db.rpc).toHaveBeenCalledWith("get_customers_paginated", expect.objectContaining({ p_company_id: company }));
  });
});
