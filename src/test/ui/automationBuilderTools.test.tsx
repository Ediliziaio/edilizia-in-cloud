import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ActionCatalogList } from "@/components/flow-builder/catalog/ActionCatalogList";
import { WorkflowNodeSearch } from "@/components/flow-builder/panels/WorkflowNodeSearch";
import { WorkflowStatsPanel } from "@/components/flow-builder/panels/WorkflowStatsPanel";
const db = vi.hoisted(() => ({ calls: [] as unknown[][], fail: false }));
vi.mock("@/integrations/supabase/client", () => ({ supabase:{from: (table: string) => {
  const filters: Record<string,string> = {}; const chain = {select: (...args: unknown[]) => {db.calls.push([table,...args]);return chain;},eq: (key:string,val:string) => {filters[key]=val;return chain;},then: (resolve: (value:unknown)=>unknown) => {db.calls.push(["filters",{...filters}]);return Promise.resolve(db.fail?{error:new Error("denied")}: {count:filters.status==="completed"?1501:0,error:null}).then(resolve);}};return chain;
}}}));
afterEach(() => {cleanup();db.calls=[];db.fail=false;});
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>{ui}</QueryClientProvider>);
describe("automation builder navigation and truthful stats", () => {
  it("conditions tab excludes email/actions and platform-only items", () => {
    render(<ActionCatalogList search="" onlyConditions onSelect={vi.fn()} onDragStart={vi.fn()}/>);
    fireEvent.click(screen.getByRole("button",{name:/Logica & Flusso/}));
    expect(screen.getByRole("button",{name:/SE condizione /})).toBeInTheDocument();
    expect(screen.queryByRole("button",{name:/Invia email/})).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{name:/Piattaforma/})).not.toBeInTheDocument();
  });
  it("finds steps by catalog label or ID, excludes scaffolding and focuses the actual node", () => {
    const focus=vi.fn();render(<WorkflowNodeSearch nodes={[{id:"real-id",type:"action",position:{x:0,y:0},data:{label:"Appuntamento",itemId:"crea_task"}},{id:"end",type:"end",position:{x:0,y:0},data:{}},{id:"placeholder",type:"trigger",position:{x:0,y:0},data:{isEmpty:true}}]} onFocusNode={focus}/>);
    fireEvent.change(screen.getByRole("textbox"),{target:{value:"attività"}});
    fireEvent.click(screen.getByRole("button",{name:/Appuntamento/}));expect(focus).toHaveBeenCalledWith("real-id");
    fireEvent.change(screen.getByRole("textbox"),{target:{value:"real-id"}});expect(screen.getByText("1 passi trovati")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox"),{target:{value:"inesistente"}});expect(screen.getByText(/Nessun passo corrisponde/)).toBeInTheDocument();
  });
  it("counts more than a page of enrollments and scopes every count to company and flow", async () => {
    wrap(<WorkflowStatsPanel flowId="flow" companyId="company"/>);
    expect(await screen.findByText("1501")).toBeInTheDocument();
    expect(db.calls.filter(row=>row[0]==="filters")).toHaveLength(7);
    expect(db.calls.filter(row=>row[0]==="filters").every(row=>(row[1] as any).company_id==="company"&&(row[1] as any).flow_id==="flow")).toBe(true);
    expect(db.calls.find(row=>row[0]==="automation_enrollments")).toEqual(["automation_enrollments","id",{count:"exact",head:true}]);
  });
  it("does not hide a permission/query failure behind invented zero statistics", async () => {
    db.fail=true;wrap(<WorkflowStatsPanel flowId="flow" companyId="company"/>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Statistiche non disponibili");
    expect(screen.queryByText("Nessuna iscrizione registrata.")).not.toBeInTheDocument();
  });
});
