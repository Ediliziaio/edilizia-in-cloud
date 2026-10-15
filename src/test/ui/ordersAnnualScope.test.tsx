import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {OrdersAnnualScope,OrdersCarryoverSummary} from "@/components/orders/OrdersAnnualScope";
afterEach(cleanup);
const previous={count:15,sold:200,collected:100,pending:100};
describe("Navigazione annuale senza riepiloghi duplicati",()=>{
  it("seleziona anno, pregresso e totale con stato accessibile",()=>{
    const onChange=vi.fn();render(<OrdersAnnualScope year={2026} annualCount={82} previousCount={15} selected="all" onChange={onChange}/>);
    expect(screen.getByRole("button",{name:"Totale 97"})).toHaveAttribute("aria-pressed","true");
    fireEvent.click(screen.getByRole("button",{name:"2026 82"}));expect(onChange).toHaveBeenLastCalledWith("annual");
    fireEvent.click(screen.getByRole("button",{name:"Pregresso 15"}));expect(onChange).toHaveBeenLastCalledWith("previous");
    fireEvent.click(screen.getByRole("button",{name:"Totale 97"}));expect(onChange).toHaveBeenLastCalledWith("all");
    expect(screen.queryByText(/Venduto/)).not.toBeInTheDocument();
  });
  it("non presenta uno zero cliccabile quando i conteggi non sono disponibili",()=>{
    render(<OrdersAnnualScope year={2026} annualCount={0} previousCount={0} selected="all" onChange={vi.fn()} failed/>);
    expect(screen.getByRole("button",{name:"2026 —"})).toBeDisabled();expect(screen.getByRole("button",{name:"Pregresso —"})).toBeDisabled();
  });
  it("mantiene i dettagli economici del pregresso nel pannello espandibile",()=>{
    render(<OrdersCarryoverSummary previous={previous} reasons={{work:0,support:12,payment:3}} showAmounts/>);
    const summary=screen.getByText(/Pregresso da gestire/).closest("summary")!;
    expect(summary).toHaveTextContent("15 commesse");expect(summary).toHaveTextContent("12 assistenze");expect(summary).toHaveTextContent("Da incassare");
    expect(summary.parentElement).not.toHaveAttribute("open");fireEvent.click(summary);expect(summary.parentElement).toHaveAttribute("open");
    expect(screen.getByText(/Venduto/)).toBeVisible();
  });
  it("non espone importi nel pregresso ai ruoli senza permesso",()=>{
    render(<OrdersCarryoverSummary previous={previous} reasons={{work:0,support:12,payment:3}} showAmounts={false}/>);
    expect(screen.queryByText(/Da incassare/)).not.toBeInTheDocument();expect(screen.queryByText(/Venduto/)).not.toBeInTheDocument();
  });
});
