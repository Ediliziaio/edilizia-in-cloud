import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import {OrdersFilterSidebar,INITIAL_FILTER_STATE} from "@/components/orders/OrdersFilterSidebar";
afterEach(cleanup);
describe("Conteggio dei risultati nel pannello filtri",()=>{
  it("mostra il totale filtrato, non le venti righe caricate",()=>{
    const props={filters:INITIAL_FILTER_STATE,onFiltersChange:vi.fn(),statuses:[] as Array<{id:string;name:string;color:string}>,isOpen:true,onClose:vi.fn()};
    const view=render(<OrdersFilterSidebar {...props} ordersCount={56}/>);
    expect(screen.getByText("56 commesse")).toBeInTheDocument();expect(screen.queryByText("20 ordini")).not.toBeInTheDocument();
    view.rerender(<OrdersFilterSidebar {...props} ordersCount={null}/>);expect(screen.getByText("Aggiornamento…")).toBeInTheDocument();
    view.rerender(<OrdersFilterSidebar {...props} ordersCount={1}/>);expect(screen.getByText("1 commessa")).toBeInTheDocument();
  });
});
