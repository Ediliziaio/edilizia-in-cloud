import {cleanup, fireEvent, render, screen, within} from "@testing-library/react";
import {useState} from "react";
import {afterEach, describe, expect, it} from "vitest";
import {FinancialSummary} from "@/components/orders/FinancialSummary";
import {calcolaIvaContratto, type QuoteIvaMista} from "@/lib/orders/ivaMista";
const net:QuoteIvaMista={mode:"net",amount10:"7.000,00",amount22:"3.000,00"};
function Prova({initial=net}:{initial?:QuoteIvaMista}){
  const [split,setSplit]=useState(initial);const [total,setTotal]=useState("10.000,00");
  const fiscal=calcolaIvaContratto(total,"mixed",split);
  return <><output data-testid="gross">{fiscal.gross}</output><output data-testid="net">{total}</output><FinancialSummary totalAmount={total} vatRate="mixed" vatSplit={split} onVatSplitChange={setSplit} onTotalAmountChange={setTotal} onVatRateChange={()=>{}} paymentType="standard" onPaymentTypeChange={()=>{}} installments={[]} onInstallmentsChange={()=>{}} numInstallments={0} onNumInstallmentsChange={()=>{}} balance={fiscal.gross}/></>;
}
afterEach(cleanup);
describe("quote IVA dentro il riepilogo del contratto",()=>{
  it("mostra entrambe le quote e converte con il selettore",()=>{
    render(<Prova/>);
    expect(screen.getByLabelText("Quota al 10% · IVA esclusa")).toHaveValue("7.000,00");
    fireEvent.mouseDown(screen.getByRole("tab",{name:"IVA Inclusa"}),{button:0,ctrlKey:false});
    expect(screen.getByLabelText("Quota al 10% · IVA inclusa")).toHaveValue("7.700,00");
    expect(screen.getByLabelText("Quota al 22% · IVA inclusa")).toHaveValue("3.660,00");
    expect(screen.getByTestId("gross")).toHaveTextContent("11360");
  });
  it("riapre la modalità IVA inclusa della bozza",()=>{
    render(<Prova initial={{mode:"gross",amount10:"7.700,00",amount22:"3.660,00"}}/>);
    expect(screen.getByRole("tab",{name:"IVA Inclusa"})).toHaveAttribute("data-state","active");
    expect(screen.getByLabelText("Quota al 22% · IVA inclusa")).toHaveValue("3.660,00");
  });
  it("segnala la differenza e consente di usare il totale delle quote",()=>{
    render(<Prova/>);
    fireEvent.change(screen.getByLabelText("Quota al 10% · IVA esclusa"),{target:{value:"6.000"}});
    const section=screen.getByRole("region",{name:"Ripartizione IVA mista"});
    expect(within(section).getByRole("alert")).toHaveTextContent("restano da assegnare");
    fireEvent.click(screen.getByRole("button",{name:/Usa la somma delle quote/}));
    expect(screen.getByTestId("net")).toHaveTextContent("9.000,00");
    expect(within(section).queryByRole("alert")).not.toBeInTheDocument();
  });
});
