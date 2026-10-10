import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TriggerFilters } from "@/types/automationBuilder";

const memory = vi.hoisted(() => ({ calls: [] as Array<{ table: string; steps: any[][] }>, rows: {} as Record<string, any[]> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from(table: string) {
    const call = { table, steps: [] as any[][] }; memory.calls.push(call);
    const chain: any = new Proxy({}, { get(_, method) {
      if (method === "then") return (resolve: any) => Promise.resolve({ data: memory.rows[table] ?? [], error: null }).then(resolve);
      if (!["select", "eq", "is", "order", "limit", "or", "in"].includes(String(method))) throw new Error(`Write/network forbidden: ${String(method)}`);
      return (...args: any[]) => { call.steps.push([method, ...args]); return chain; };
    } }); return chain;
  },
  functions: { invoke() { throw new Error("Execution forbidden in preview"); } },
} }));
vi.mock("@/hooks/useCompanyStaffUsers", () => ({ useCompanyStaffUsers: () => ({ data: [] as any[], isLoading: false }) }));

import { ConditionValueInput } from "@/components/marketing/automations/ConditionValueInput";
import { TriggerConditionBuilder } from "@/components/marketing/automations/TriggerConditionBuilder";
import { TestFlowDialog } from "@/components/flow-builder/TestFlowDialog";

const wrap = (element: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{element}</QueryClientProvider>);
beforeEach(() => { memory.calls = []; memory.rows = {}; });
afterEach(cleanup);
describe("automation filters: usable, read-only UI", () => {
  it("number range preserves zero and legacy ranges", () => {
    const onChange = vi.fn();
    wrap(<ConditionValueInput field={{ key: "value", label: "Valore", type: "number", group: "Test" }} operator="between" value="0,10" onChange={onChange} />);
    expect(screen.getByPlaceholderText("Da")).toHaveValue(0);
    fireEvent.change(screen.getByPlaceholderText("A"), { target: { value: "20" } });
    expect(onChange).toHaveBeenCalledWith({ from: "0", to: "20" });
  });
  it("relative days allow today (zero)", () => {
    const onChange = vi.fn();
    wrap(<ConditionValueInput field={{ key: "created_at", label: "Data", type: "date", group: "Test" }} operator="in_next_x_days" value={0} onChange={onChange} />);
    expect(screen.getByRole("spinbutton")).toHaveValue(0);
    expect(screen.getByRole("spinbutton")).toHaveAttribute("min", "0");
  });
  it("malformed date does not crash the editor", () => {
    wrap(<ConditionValueInput field={{ key: "date", label: "Data", type: "date", group: "Test" }} operator="on" value="invalid" onChange={() => {}} />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
  it("AND / OR is described in plain language and incomplete conditions are visible", () => {
    function Harness() {
      const [filters, setFilters] = useState<TriggerFilters>({ logic: "AND", conditions: [] });
      return <TriggerConditionBuilder triggerCategory="contact" filters={filters} onChange={setFilters} />;
    }
    wrap(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi Filtro" }));
    expect(screen.getByText("Scegli il campo da controllare.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi Filtro" }));
    fireEvent.click(screen.getByRole("button", { name: "Almeno una (O)" }));
    expect(screen.getByText(/almeno una condizione/i)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Rimuovi condizione" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi condizione" }));
    expect(screen.queryByText("Scegli il campo da controllare.")).not.toBeInTheDocument();
  });
  it("pipeline picker displays a name and scopes the query to the company", async () => {
    memory.rows.marketing_pipelines = [{ id: "pipeline", name: "Pipeline Servizi" }];
    wrap(<ConditionValueInput field={{ key: "pipeline", label: "Pipeline", type: "select", group: "Test" }} operator="equals" value="pipeline" onChange={() => {}} companyId="company" />);
    expect(await screen.findByText("Pipeline Servizi")).toBeInTheDocument();
    expect(memory.calls[0].steps).toContainEqual(["eq", "company_id", "company"]);
  });
  it("stage picker queries only the company's pipeline IDs", async () => {
    memory.rows.marketing_pipelines = [{ id: "pipeline", name: "Servizi" }];
    memory.rows.marketing_pipeline_stages = [{ id: "stage", name: "Preventivo", pipeline_id: "pipeline" }];
    wrap(<ConditionValueInput field={{ key: "stage", label: "Fase", type: "select", group: "Test" }} operator="equals" value="stage" onChange={() => {}} companyId="company" />);
    expect(await screen.findByText("Servizi · Preventivo")).toBeInTheDocument();
    expect(memory.calls.find(c => c.table === "marketing_pipeline_stages")!.steps).toContainEqual(["in", "pipeline_id", ["pipeline"]]);
  });
  it("preview evaluates the open draft and never calls an action or mutation", async () => {
    memory.rows.marketing_contacts = [{ id: "contact", first_name: "Test", last_name: "Locale", email: "test@example.invalid", city: "Roma" }];
    wrap(<TestFlowDialog open onClose={() => {}} flow={null} companyId="company" nodes={[{ id: "trigger", type: "trigger", data: { itemId: "contatto_creato", trigger_filters: { conditions: [{ field: "city", operator: "equals", value: "Roma" }] } } }]} />);
    fireEvent.click(await screen.findByRole("button", { name: /Test Locale/ }));
    fireEvent.click(screen.getByRole("button", { name: "Verifica percorso e testi" }));
    expect(screen.getByText("Il contatto soddisfa i filtri di questo trigger.")).toBeInTheDocument();
    expect(memory.calls.every(c => c.table === "marketing_contacts")).toBe(true);
  });
  it("preview does not pretend a contact proves an invoice trigger", async () => {
    memory.rows.marketing_contacts = [{ id: "contact", first_name: "Test", last_name: "Locale" }];
    wrap(<TestFlowDialog open onClose={() => {}} flow={null} companyId="company" nodes={[{ id: "trigger", type: "trigger", data: { itemId: "fattura_scaduta" } }]} />);
    fireEvent.click(await screen.findByRole("button", { name: /Test Locale/ }));
    fireEvent.click(screen.getByRole("button", { name: "Verifica percorso e testi" }));
    expect(screen.getByText(/Serve il record e il contesto/)).toBeInTheDocument();
  });
});
