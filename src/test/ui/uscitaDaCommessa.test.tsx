import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ allowed: true, company: "azienda-demo", result: {} as { data?: unknown; error?: unknown }, eq: vi.fn(), from: vi.fn(), sheet: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: mocks.company } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewWarehouse: true, canEditWarehouse: mocks.allowed }) }));
vi.mock("@/components/warehouse/UscitaMerceSheet", () => ({ UscitaMerceSheet: (props: unknown) => { mocks.sheet(props); return <div>Flusso uscita pronto</div>; } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (...args: unknown[]) => {
 mocks.from(...args);
 const q = { select: () => q, eq: (...v: unknown[]) => { mocks.eq(...v); return q; }, is: () => q, abortSignal: () => q, maybeSingle: async () => mocks.result };
 return q;
} } }));
import UscitaCommessaDialog from "@/components/warehouse/UscitaCommessaDialog";
const show = () => render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><UscitaCommessaDialog orderId="commessa-demo" onClose={vi.fn()} /></QueryClientProvider>);
beforeEach(() => { vi.clearAllMocks(); mocks.allowed = true; mocks.company = "azienda-demo"; mocks.result = {data:{ id:"commessa-demo",order_code:"DEMO-1",client_name:"Cliente demo",customer:null,destination_warehouse_id:"magazzino-demo",work_address:"Via del cantiere",status:"open" },error:null}; });
afterEach(cleanup);
it("prepara commessa, cliente e magazzino nel flusso esistente senza scritture", async () => {
 show(); await screen.findByText("Flusso uscita pronto");
 expect(mocks.eq).toHaveBeenCalledWith("company_id","azienda-demo");
 expect(mocks.eq).toHaveBeenCalledWith("id","commessa-demo");
 expect(mocks.sheet).toHaveBeenCalledWith(expect.objectContaining({initialOrder:expect.objectContaining({id:"commessa-demo",customer_name:"Cliente demo",default_warehouse_id:"magazzino-demo",indirizzo_lavori:"Via del cantiere"})}));
 expect(mocks.from).toHaveBeenCalledTimes(1); expect(mocks.from).toHaveBeenCalledWith("orders");
});
it("non apre il flusso né legge la commessa senza permesso magazzino", () => {
 mocks.allowed=false; show(); expect(screen.getByRole("alert")).toHaveTextContent("permesso"); expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.sheet).not.toHaveBeenCalled();
});
it("non usa una commessa assente nell’azienda corrente", async () => {
 mocks.result={data:null,error:null}; show(); await screen.findByText("Commessa non disponibile nell’azienda selezionata."); expect(mocks.sheet).not.toHaveBeenCalled();
});
it("mostra errore e riprova senza aprire una consegna con destinatario incompleto", async () => {
 mocks.result={data:null,error:new Error("offline")}; show(); await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent("Non riesco")); expect(screen.getByRole("button",{name:"Riprova"})).toBeEnabled(); expect(mocks.sheet).not.toHaveBeenCalled();
});
