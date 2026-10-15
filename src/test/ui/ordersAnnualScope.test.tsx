import {afterEach,describe,expect,it} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import {OrdersAnnualScope} from "@/components/orders/OrdersAnnualScope";
afterEach(cleanup);
const props={year:2026,annual:{count:80,sold:1000,collected:600,pending:400},previous:{count:14,sold:200,collected:100,pending:100},reasons:{work:10,support:5,payment:6},showAmounts:true};
describe("Distinzione annuale e pregresso",()=>{
  it("spiega conteggi distinti e motivi sovrapposti senza sommarli",()=>{
    render(<OrdersAnnualScope {...props}/>);
    const section=screen.getByRole("region",{name:"Anno corrente e precedenti da gestire"});
    expect(section).toHaveTextContent("2026: 80");expect(section).toHaveTextContent("Anni precedenti da gestire: 14");expect(section).toHaveTextContent("Totale nella vista: 94");
    expect(section).toHaveTextContent("viene contata una volta sola");expect(section).toHaveTextContent("non i movimenti di cassa avvenuti nell’anno");
  });
  it("non espone importi ai ruoli senza permesso",()=>{
    render(<OrdersAnnualScope {...props} showAmounts={false}/>);
    expect(screen.queryByText(/IVA inclusa/)).not.toBeInTheDocument();expect(screen.getByText(/Totale nella vista/)).toBeInTheDocument();
  });
});
