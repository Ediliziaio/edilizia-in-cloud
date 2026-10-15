import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {OrdersActiveFilters} from "@/components/orders/OrdersActiveFilters";
afterEach(cleanup);
describe("Filtri attivi delle commesse",()=>{
  it("rimuove il filtro scelto e permette di azzerare tutti i filtri",()=>{
    const margin=vi.fn(),customer=vi.fn(),reset=vi.fn();
    render(<OrdersActiveFilters filters={[{key:"margin",label:"Margine negativo",remove:margin},{key:"customer",label:"Cliente Rossi",remove:customer}]} onReset={reset}/>);
    fireEvent.click(screen.getByRole("button",{name:"Rimuovi filtro Margine negativo"}));expect(margin).toHaveBeenCalledOnce();expect(customer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Azzera filtri"}));expect(reset).toHaveBeenCalledOnce();
  });
  it("non mostra una barra vuota senza filtri",()=>{render(<OrdersActiveFilters filters={[]} onReset={vi.fn()}/>);expect(screen.queryByLabelText("Filtri attivi")).not.toBeInTheDocument();});
});
