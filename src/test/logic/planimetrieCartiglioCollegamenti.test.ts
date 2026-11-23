import { beforeEach, describe, expect, it, vi } from "vitest";

const righe: Record<string, Record<string, unknown> | null> = {};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabella: string) => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: righe[tabella] ?? null, error: null as null }) };
      return q;
    },
  },
}));

import { datiCartiglioDaCollegamenti } from "@/lib/planimetrie/collegamenti";

describe("cartiglio del fascicolo dalle schede collegate", () => {
  beforeEach(() => { for (const k of Object.keys(righe)) delete righe[k]; });

  it("prende il committente dal cliente e il cantiere dalla commessa", async () => {
    righe.planimetrie = { customer_id: "c1", contact_id: "k1", order_id: "o1" };
    righe.profiles = { first_name: "Giuseppe", last_name: "Rossi", business_name: "" };
    righe.marketing_contacts = { first_name: "Altro", last_name: "Nome" };
    righe.orders = { work_address: " Via Garibaldi 26, 21100 Varese " };
    expect(await datiCartiglioDaCollegamenti("az", "p")).toEqual({ committente: "Giuseppe Rossi", cantiere: "Via Garibaldi 26, 21100 Varese" });
  });

  it("senza cliente usa il contatto (anche la ragione sociale); senza commessa niente cantiere", async () => {
    righe.planimetrie = { customer_id: null, contact_id: "k1", order_id: null };
    righe.marketing_contacts = { first_name: "", last_name: "", company_name: "Edil Rossi Srl" };
    expect(await datiCartiglioDaCollegamenti("az", "p")).toEqual({ committente: "Edil Rossi Srl" });
  });

  it("pianta non leggibile o senza collegamenti: niente", async () => {
    expect(await datiCartiglioDaCollegamenti("az", "p")).toEqual({});
    righe.planimetrie = { customer_id: null, contact_id: null, order_id: null };
    expect(await datiCartiglioDaCollegamenti("az", "p")).toEqual({});
  });
});
