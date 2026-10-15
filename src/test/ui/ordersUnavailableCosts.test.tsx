import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import {MemoryRouter} from "react-router-dom";
vi.mock("@/integrations/supabase/client",()=>({supabase:{}}));
import {OrdersTable} from "@/components/orders/OrdersTable";
import type {OrderWithDetails} from "@/lib/orderUtils";
afterEach(cleanup);
describe("Margini non disponibili nella tabella commesse",()=>{
  it("un errore di lettura non si presenta come costi mancanti o margine zero",()=>{
    const row={id:"o",order_code:"ORD-1",description:"Lavoro",created_at:"2026-10-15",total_amount:100,vat_rate:0,deposit_amount:0,balance_amount:100,deposit_paid:false,balance_paid:false} as OrderWithDetails;
    render(<MemoryRouter><OrdersTable orders={[row]} onDelete={vi.fn()} isDeleting={false} orderCosts={new Map()} costsState="error" visibleColumns={new Set(["margin"])}/></MemoryRouter>);
    expect(screen.getByText("Margine non disponibile")).toBeInTheDocument();expect(screen.queryByText("Costi da completare")).not.toBeInTheDocument();
  });
});
