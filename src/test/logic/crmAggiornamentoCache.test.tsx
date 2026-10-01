import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "az1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditMarketingContacts: true }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => {
  const builder: any = { then: (ok: any) => Promise.resolve({ data: [], error: null }).then(ok) };
  for (const method of ["update", "eq", "select", "in", "insert"]) builder[method] = () => builder;
  return { supabase: { from: () => builder } };
});

import { useUpdateContact, useUpsertContactFieldValues } from "@/hooks/useOpportunityDetailData";
import { refreshCrmContacts } from "@/lib/refreshCrmContacts";
import { queryKeys } from "@/lib/queryKeys";

afterEach(cleanup);

describe("salvataggio contatto: viste collegate", () => {
  it.each(["azienda-cliente", "azienda-piattaforma"])("in %s rilegge elenco, KPI, filtri, campi e opportunità, senza cambiare filtri e ordinamento", async (companyId) => {
    const client = new QueryClient();
    const keys = [
      ["marketing-contacts", companyId, "Mario", 2, 25, "created_at", "desc"],
      queryKeys.marketingContacts.reachability(companyId, "agente-1"),
      queryKeys.marketingContacts.fieldValues(companyId, ["c1"]),
      queryKeys.marketingContacts.filterValues(companyId, "tags"),
      queryKeys.opportunities.riepilogo(companyId, "p1", { search: "Mario" }),
      queryKeys.opportunities.deepLink(companyId, "o1"),
      queryKeys.marketing.dashboard(companyId),
      ["marketing_contact", "c1"],
      ["marketing_contact_ids", companyId],
      ["marketing_contacts_search_detail", companyId, "Mario"],
    ];
    keys.forEach((key) => client.setQueryData(key, { before: true }));
    const unrelated = ["order-items", companyId];
    client.setQueryData(unrelated, []);
    await refreshCrmContacts(client, companyId, "c1");
    keys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true));
    expect(client.getQueryState(unrelated)?.isInvalidated).toBe(false);
    client.clear();
  });

  it("il conteggio liste segue la stessa invalidazione delle liste, senza collisioni di dati", async () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.contactLists.list("az1"), [{ id: "l1" }]);
    client.setQueryData(queryKeys.contactLists.count("az1"), 1);
    await client.invalidateQueries({ queryKey: queryKeys.contactLists.list("az1") });
    expect(client.getQueryData(queryKeys.contactLists.list("az1"))).toEqual([{ id: "l1" }]);
    expect(client.getQueryData(queryKeys.contactLists.count("az1"))).toBe(1);
    expect(client.getQueryState(queryKeys.contactLists.count("az1"))?.isInvalidated).toBe(true);
    client.clear();
  });
  it("le opportunità aperte da link mantengono cache distinte per azienda e per id", () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.opportunities.deepLink("az1", "o1"), { name: "Azienda uno" });
    client.setQueryData(queryKeys.opportunities.deepLink("az2", "o1"), { name: "Azienda due" });
    client.setQueryData(queryKeys.opportunities.deepLink("az1", "o2"), { name: "Seconda opportunità" });
    expect(client.getQueryData(queryKeys.opportunities.deepLink("az1", "o1"))).toEqual({ name: "Azienda uno" });
    expect(client.getQueryData(queryKeys.opportunities.deepLink("az2", "o1"))).toEqual({ name: "Azienda due" });
    expect(client.getQueryData(queryKeys.opportunities.deepLink("az1", "o2"))).toEqual({ name: "Seconda opportunità" });
    client.clear();
  });
  it("aggiorna anche la scheda contatto già visitata dopo una modifica dal popup opportunità", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const detail = ["marketing_contact", "c1"];
    client.setQueryData(detail, { id: "c1", company_id: "az1", email: "vecchia@example.it" });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useUpdateContact(), { wrapper });
    await act(async () => { await result.current.mutateAsync({ id: "c1", email: "nuova@example.it" }); });
    expect(client.getQueryState(detail)?.isInvalidated).toBe(true);
    client.clear();
  });

  it("aggiorna i valori personalizzati anche nella scheda contatto separata", async () => {
    const client = new QueryClient();
    const detailFields = ["marketing_contact_field_values", "c1"];
    client.setQueryData(detailFields, [{ field_id: "f1", value: "prima" }]);
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useUpsertContactFieldValues(), { wrapper });
    await act(async () => { await result.current.mutateAsync([{ contact_id: "c1", field_id: "f1", value: "dopo" }]); });
    expect(client.getQueryState(detailFields)?.isInvalidated).toBe(true);
    client.clear();
  });
});
