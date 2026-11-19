import {cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {afterEach,describe,expect,it,vi} from "vitest";
import {SceltaPianoPagamento} from "@/components/orders/ScegliPianoPagamento";
import {FinancialSummary} from "@/components/orders/FinancialSummary";
import {MODELLI_PAGAMENTO_DI_PARTENZA,modelloPagamentoDiPartenza} from "@/lib/orders/modelliPagamento";
import {preparaPianoSal,leggiPianoSal,verificaPianoSal} from "@/lib/orders/pianoSalAperto";
import type {Installment} from "@/lib/orderUtils";
afterEach(cleanup);
const modelli=MODELLI_PAGAMENTO_DI_PARTENZA.map(modelloPagamentoDiPartenza);
function apri(){const onScegli=vi.fn();render(<SceltaPianoPagamento aperto totaleLordo={11600} sostituisce modelli={modelli} onChiudi={()=>{}} onScegli={onScegli}/>);return onScegli;}
describe("piani di pagamento a SAL aperti",()=>{
 it("Solo SAL non chiede numero, percentuali, importi o date e non crea rate future",()=>{
  const choose=apri();fireEvent.click(screen.getByRole("radio",{name:"Solo SAL"}));
  expect(screen.queryByLabelText("Acconto iniziale · IVA inclusa")).toBeNull();
  expect(screen.queryByRole("list",{name:"Anteprima delle rate"})).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Usa questo piano"}));
  expect(choose).toHaveBeenCalledWith([],{version:1,mode:"sal"});
 });
 it("Acconto + SAL definisce solo l’acconto e lascia aperti i SAL successivi",()=>{
  const choose=apri();fireEvent.click(screen.getByRole("radio",{name:"Acconto + SAL"}));
  fireEvent.change(screen.getByLabelText("Acconto iniziale · IVA inclusa"),{target:{value:"30"}});
  expect(within(screen.getByRole("list",{name:"Anteprima delle rate"})).getAllByRole("listitem")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button",{name:"Usa questo piano"}));
  const [rows,policy]=choose.mock.calls[0];expect(rows).toEqual([expect.objectContaining({type:"deposit",amount:3480,percent:30,trigger_evento:"firma_contratto"})]);
  expect(policy).toEqual({version:1,mode:"advance_sal"});expect(rows.some((r:Installment)=>r.type==="balance")).toBe(false);
 });
 it("permette l’acconto in euro",()=>{
  const choose=apri();fireEvent.click(screen.getByRole("radio",{name:"Acconto + SAL"}));
  fireEvent.change(screen.getByLabelText("Inserisci acconto in"),{target:{value:"amount"}});
  fireEvent.change(screen.getByLabelText("Acconto iniziale · IVA inclusa"),{target:{value:"2.500,50"}});
  fireEvent.click(screen.getByRole("button",{name:"Usa questo piano"}));expect(choose.mock.calls[0][0][0].amount).toBe(2500.50);
 });
 it("mantiene i modelli con percentuali concordate",()=>{
  const choose=apri();fireEvent.click(screen.getByRole("radio",{name:/Acconto e saldo \(30\/70\)/}));
  fireEvent.click(screen.getByRole("button",{name:"Usa questo piano"}));expect(choose.mock.calls[0][0].map((r:Installment)=>r.amount)).toEqual([3480,8120]);expect(choose.mock.calls[0][1]).toBeNull();
 });
 it.each(["0","100","101","-20","abc","20,001"])("non accetta un acconto incoerente: %s",value=>{expect(preparaPianoSal("advance_sal",11600,value).error).toBeTruthy();});
 it("recupera la modalità salvata e rifiuta un saldo fittizio",()=>{
  expect(leggiPianoSal({version:1,mode:"sal"})).toEqual({version:1,mode:"sal"});expect(leggiPianoSal({version:1,mode:"inventato"})).toBeNull();
  expect(verificaPianoSal({version:1,mode:"sal"},[{position:0,type:"balance",label:"Saldo",amount:11600,is_paid:false}],11600)).toBeTruthy();
 });
 it("il riepilogo Solo SAL mostra un residuo, senza il controllo di pagamento di un saldo futuro",()=>{
  render(<FinancialSummary totalAmount="10.000" vatRate="22" salPayment={{version:1,mode:"sal"}} installments={[]} numInstallments={0} onNumInstallmentsChange={()=>{}} onInstallmentsChange={()=>{}} onTotalAmountChange={()=>{}} onVatRateChange={()=>{}} paymentType="standard" onPaymentTypeChange={()=>{}} balance={12200}/>);
  expect(screen.getByText("Da maturare con i lavori")).toBeInTheDocument();
  expect(screen.queryByText("Saldo da Pagare")).toBeNull();expect(screen.queryByRole("button",{name:"Aggiungi una rata"})).toBeNull();expect(screen.queryByText("Pagamenti da confermare.",{exact:false})).toBeNull();
 });
});
