import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AutomationNode, AutomationConnection } from "@/types/automationBuilder";

const state = vi.hoisted(() => ({ builder: {} as any, saved: null as any }));
vi.mock("@/hooks/useAutomationBuilder", () => ({ useAutomationBuilder: () => state.builder }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const chain: any = { select: () => chain, eq: () => chain, then: (resolve: any) => Promise.resolve({ data: [], count: 0, error: null }).then(resolve) }; return chain;
} } }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/flow-builder/FlowBuilderHeader", () => ({ FlowBuilderHeader: (p: any) => <button onClick={p.onSave}>Salva</button> }));
vi.mock("@/components/flow-builder/FlowBuilderSidebar", () => ({ FlowBuilderSidebar: () => null }));
vi.mock("@/components/flow-builder/TestFlowDialog", () => ({ TestFlowDialog: () => null }));
vi.mock("@/components/flow-builder/NodeMeasureFix", () => ({ NodeMeasureFix: () => null }));
vi.mock("@/components/flow-builder/FlowAutoLayout", () => ({ FlowAutoLayout: () => null }));
vi.mock("@/components/flow-builder/WorkflowRightPanel", () => ({ WorkflowRightPanel: (p: any) => p.mode === "config"
  ? <button onClick={() => p.onDelete(p.selectedNode.id)}>Elimina dal pannello</button>
  : <><button onClick={() => p.onSelectItem({ id: "contatto_creato", label: "Nuovo contatto", kind: "trigger" })}>Scegli trigger</button><button onClick={() => p.onSelectItem({ id: "rimuovi_tag", label: "Rimuovi tag", kind: "action" })}>Scegli azione</button></> }));
vi.mock("@xyflow/react", async importOriginal => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  return { ...actual, Background: () => null, Controls: () => null, MiniMap: () => null, Panel: ({ children }: any) => <div>{children}</div>,
    ReactFlow: (p: any) => <div>{p.nodes.map((n: any) => <div key={n.id}>
      <button onClick={e => n.data.isEmpty ? n.data.onOpenCatalog() : p.onNodeClick(e, n)}>{n.data.isEmpty ? "Aggiungi il primo trigger" : n.data.label}</button>
      {n.type === "trigger" && !n.data.isEmpty && <button aria-label={`Tastiera elimina ${n.id}`} onClick={() => { p.onNodesChange([{ type: "remove", id: n.id }]); p.onNodesDelete([n]); p.onEdgesChange(p.edges.filter((e: any) => e.source === n.id || e.target === n.id).map((e: any) => ({ type: "remove", id: e.id }))); }}>Cancella</button>}
    </div>)}{p.edges.map((e:any) => <button key={e.id} aria-label={`Inserisci su ${e.source}-${e.target}`} onClick={()=>e.data.onAddStep(e.id)}>+</button>)}<output data-testid="edges">{JSON.stringify(p.edges.map((e: any) => [e.source,e.target,e.label]))}</output>{p.children}</div> };
});
import { FlowBuilderPage } from "@/components/flow-builder/FlowBuilderPage";

const node = (id: string, type: "trigger" | "action", item: string): AutomationNode => ({ id, node_type: type, config_json: { item_id: item }, label: id, flow_id: "flow", company_id: "company", position_x: 300, position_y: type === "trigger" ? 80 : 300, created_at: "", updated_at: "" });
const conn = (source: string, target: string): AutomationConnection => ({ id: `${source}-${target}`, from_node_id: source, to_node_id: target, flow_id: "flow", company_id: "company", label: null, created_at: "" });
function setup(nodes = [node("trigger", "trigger", "contatto_creato"),node("azione", "action", "aggiungi_tag")], connections = [conn("trigger","azione")]) {
  const b: any = { dbNodes: nodes, dbConnections: connections, nodes: [...nodes], connections: [...connections], remoteEmpty: !nodes.length,
    flow: { id: "flow", company_id: "company", status: "draft", name: "QA", updated_at: "" }, isLoading: false, revision: 0, canPersist: true,
    effectiveCompany: { id: "company" }, user: { id: "user" }, createFlowMutation: {}, updateFlowMutation: { mutate: vi.fn() },
    updateNode: vi.fn(), updateNodePositions: vi.fn(), undo: vi.fn(), redo: vi.fn(), togglePublish: vi.fn(),
    addNode: vi.fn((n: any) => b.nodes.push(n)), addConnection: vi.fn((c: any) => b.connections.push(c)),
    removeNode: vi.fn((id: string) => { b.nodes = b.nodes.filter((n: any) => n.id !== id); b.connections = b.connections.filter((c: any) => c.from_node_id !== id && c.to_node_id !== id); }),
    removeConnection: vi.fn((id: string) => { b.connections = b.connections.filter((c: any) => c.id !== id); }),
    saveImmediate: vi.fn(() => { state.saved = structuredClone({ nodes: b.nodes, connections: b.connections }); return Promise.resolve(true); }),
  };
  state.builder = b;
}
function mount() { return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter initialEntries={["/azienda/marketing/automazioni/flow"]}><Routes><Route path="/azienda/marketing/automazioni/:id" element={<FlowBuilderPage/>}/></Routes></MemoryRouter></QueryClientProvider>); }
beforeEach(() => { state.saved = null; setup(); }); afterEach(cleanup);
describe("builder trigger recovery and persisted entry", () => {
  it("delete from panel → reinsert → save → reopen keeps the action connected", async () => {
    let view = mount();
    fireEvent.click(await screen.findByRole("button", { name: "trigger", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Elimina dal pannello" }));
    fireEvent.click(await screen.findByRole("button", { name: "Aggiungi il primo trigger" }));
    fireEvent.click(screen.getByRole("button", { name: "Scegli trigger" }));
    const created = state.builder.addNode.mock.calls[0][0];
    expect(created.node_type).toBe("trigger");
    expect(state.builder.addConnection).toHaveBeenCalledWith(expect.objectContaining({from_node_id:created.id,to_node_id:"azione"}));
    fireEvent.click(screen.getByRole("button",{name:"Salva",exact:true}));
    expect(state.saved.nodes).toHaveLength(2);
    expect(state.saved.connections).toHaveLength(1);
    view.unmount(); setup(state.saved.nodes,state.saved.connections); view = mount();
    expect(await screen.findByRole("button", {name:"Nuovo contatto",exact:true})).toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"Aggiungi il primo trigger"})).not.toBeInTheDocument();
    expect(screen.getByTestId("edges").textContent).toContain(JSON.stringify([created.id,"azione",null]));
  });
  it("keyboard deletion also restores the entry card", async () => {
    mount();fireEvent.click(await screen.findByRole("button",{name:"Tastiera elimina trigger"}));
    expect(await screen.findByRole("button",{name:"Aggiungi il primo trigger"})).toBeInTheDocument();
    expect(screen.getByTestId("edges").textContent).toContain('"placeholder-trigger","azione"');
  });
  it("deleting one parallel trigger leaves the other intact", async () => {
    setup([node("trigger","trigger","contatto_creato"),node("secondo","trigger","tag_aggiunto"),node("azione","action","aggiungi_tag")],[conn("trigger","azione"),conn("secondo","azione")]);
    mount(); fireEvent.click(await screen.findByRole("button",{name:"Tastiera elimina trigger"}));
    await waitFor(() => expect(screen.queryByRole("button",{name:"trigger",exact:true})).not.toBeInTheDocument());
    expect(screen.getByRole("button",{name:"secondo",exact:true})).toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"Aggiungi il primo trigger"})).not.toBeInTheDocument();
  });
  it("removing a linear step preserves the incoming decision branch", async () => {
    const decision = { ...node("decisione","action","condition_se"), node_type:"condition" as const, config_json:{item_id:"condition_se",condizioni:[{campo:"email",operatore:"contiene",valore:"@"}]} };
    setup([node("trigger","trigger","contatto_creato"),decision,node("azione","action","aggiungi_tag"),node("successivo","action","rimuovi_tag")],[conn("trigger","decisione"),{...conn("decisione","azione"),label:"Sì"},conn("azione","successivo")]);
    mount();fireEvent.click(await screen.findByRole("button",{name:"azione",exact:true}));fireEvent.click(screen.getByRole("button",{name:"Elimina dal pannello"}));
    expect(state.builder.addConnection).toHaveBeenCalledWith(expect.objectContaining({from_node_id:"decisione",to_node_id:"successivo",label:"Sì"}));
    expect(screen.getByTestId("edges").textContent).toContain('"decisione","successivo","Sì"');
  });
  it("removing a decision never flattens Yes and No into parallel execution", async () => {
    const decision = { ...node("decisione","action","condition_se"), node_type:"condition" as const, config_json:{item_id:"condition_se",condizioni:[{campo:"email",operatore:"contiene",valore:"@"}]} };
    setup([node("trigger","trigger","contatto_creato"),decision,node("yes","action","aggiungi_tag"),node("no","action","rimuovi_tag")],[conn("trigger","decisione"),{...conn("decisione","yes"),label:"Sì"},{...conn("decisione","no"),label:"No"}]);
    mount();fireEvent.click(await screen.findByRole("button",{name:"decisione",exact:true}));fireEvent.click(screen.getByRole("button",{name:"Elimina dal pannello"}));
    expect(state.builder.addConnection).not.toHaveBeenCalled();
    expect(state.builder.connections).toEqual([]);
  });

  it("can add a parallel trigger without losing its persisted entry", async () => {
    mount();fireEvent.click(await screen.findByRole("button",{name:"+ Trigger",exact:true}));fireEvent.click(screen.getByRole("button",{name:"Scegli trigger"}));
    const created=state.builder.addNode.mock.calls[0][0];
    expect(created.node_type).toBe("trigger");
    expect(state.builder.addConnection).toHaveBeenCalledWith(expect.objectContaining({from_node_id:created.id,to_node_id:"azione",label:null}));
  });
  it("inserts an action between the trigger and the original action, persisting both edges", async () => {
    mount();fireEvent.click(await screen.findByRole("button",{name:"Inserisci su trigger-azione"}));fireEvent.click(screen.getByRole("button",{name:"Scegli azione"}));
    const created=state.builder.addNode.mock.calls[0][0];
    expect(created.node_type).toBe("action");
    expect(state.builder.addConnection).toHaveBeenCalledWith(expect.objectContaining({from_node_id:"trigger",to_node_id:created.id,label:null}));
    expect(state.builder.addConnection).toHaveBeenCalledWith(expect.objectContaining({from_node_id:created.id,to_node_id:"azione",label:null}));
  });

});
