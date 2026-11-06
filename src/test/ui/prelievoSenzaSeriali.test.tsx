import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company" }, user: { id: "u1" } }) }));
vi.mock("@/contexts/BillingModeContext", () => ({ useBillingMode: () => ({ isNative: true }) }));
vi.mock("@/hooks/useShipmentDDTPDF", () => ({ useShipmentDDTPDF: () => ({ generate: vi.fn() }) }));
vi.mock("@/hooks/useMaterialProcurement", () => ({ useMaterialProcurement: () => ({ isPending: true, isError: false, data: undefined as unknown }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "is", "or", "order", "limit", "range", "neq", "not", "ilike", "gt", "filter"]) q[m] = () => q;
    q.maybeSingle = q.single = () => Promise.resolve({ data: null as unknown, error: null as unknown });
    q.then = (si: (r: unknown) => unknown, no: (e: unknown) => unknown) => Promise.resolve({ data: table === "warehouse_stock" ? [{ id: "stock", name: "Campione serializzato", quantity: 2, unit_cost: 0, tracking_mode: "serialized" }] : [], error: null as unknown }).then(si, no);
    return q;
  },
  storage: { from: () => ({}) },
} }));

import { OrderItemsList } from "@/components/orders/OrderItemsList";
afterEach(() => {cleanup(); vi.unstubAllGlobals();});
it("impedisce un prelievo senza matricole e indica l’uscita merce", async () => {
 vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
 Element.prototype.scrollIntoView = vi.fn();
 const change = vi.fn();
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter><OrderItemsList items={[]} onItemsChange={change} soloFinestra richiesta={{tipo:"nuovo",phaseId:null,nonce:1}} /></MemoryRouter></QueryClientProvider>);
 const tab = await screen.findByRole("tab", { name: "Da Magazzino" });
 fireEvent.mouseDown(tab, {button:0}); fireEvent.keyDown(tab, {key:"Enter"});
 const combo = await screen.findByRole("combobox");
 fireEvent.click(combo);
 fireEvent.click(await screen.findByText("Campione serializzato"));
 expect(await screen.findByRole("alert")).toHaveTextContent("matricole");
 expect(screen.getByRole("button", {name:"Preleva"})).toBeDisabled();
 expect(change).not.toHaveBeenCalled();
});

it("accompagna al flusso di uscita senza aggiungere una riga consegnata", async () => {
 vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
 Element.prototype.scrollIntoView = vi.fn();
 const change=vi.fn(), open=vi.fn();
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter><OrderItemsList items={[]} onItemsChange={change} stockPickBlockedReason="Usa il flusso completo con matricole" onOpenWarehouseExit={open} soloFinestra richiesta={{tipo:"nuovo",phaseId:null,nonce:1}} /></MemoryRouter></QueryClientProvider>);
 const tab=await screen.findByRole("tab",{name:"Da Magazzino"});fireEvent.mouseDown(tab,{button:0});fireEvent.keyDown(tab,{key:"Enter"});
 fireEvent.click(await screen.findByRole("button",{name:"Apri uscita merce per questa commessa"}));
 expect(open).toHaveBeenCalledTimes(1);expect(change).not.toHaveBeenCalled();
});
