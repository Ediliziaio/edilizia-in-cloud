import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { FinanzaCashFlow } from "@/components/cruscotto/FinanzaCashFlow";
import { OperationsDelivery } from "@/components/cruscotto/OperationsDelivery";
import { TodayFocus } from "@/components/cruscotto/TodayFocus";
import { BillingKPIWidget } from "@/components/cruscotto/BillingKPIWidget";
const mocks = vi.hoisted(()=>({saldo:{saldo:1000,entry_count:1} as {saldo:number;entry_count:number}|undefined,navigate:vi.fn()}));
vi.mock("react-router-dom",async importOriginal=>({...await importOriginal<typeof import("react-router-dom")>(),useNavigate:()=>mocks.navigate}));
vi.mock("@/hooks/usePrimaNota",()=>({usePrimaNota:()=>({saldo:mocks.saldo,isSaldoLoading:false,saldoError:null})}));
vi.mock("@/hooks/useMarginData",()=>({useMarginData:()=>({totalFixedCostsMonthly:3000,isLoading:false,isError:false})}));
vi.mock("@/contexts/BillingModeContext",()=>({useBillingMode:()=>({isNative:true})}));
vi.mock("@/hooks/useEffectiveCompanyId",()=>({useEffectiveCompanyId:()=>"demo"}));
vi.mock("@/hooks/billing/useDashboardBillingKPI",()=>({useDashboardBillingKPI:()=>({isLoading:false,isError:false,data:{fatturato_mese:1000,fatture_emesse_mese:1,incassato_mese:100,da_incassare_totale:500,scaduto:300,fatture_scadute_count:2,fatture_in_bozza:3,fatture_importate_incassi_da_verificare:0}})}));
vi.mock("recharts",()=>({ResponsiveContainer:({children}:{children:ReactNode})=><div>{children}</div>,BarChart:()=>null,Bar:()=>null,XAxis:()=>null,YAxis:()=>null,Tooltip:()=>null,Cell:()=>null}));
afterEach(cleanup);
beforeEach(()=>{mocks.saldo={saldo:1000,entry_count:1};mocks.navigate.mockClear();});
const finance={revenueThisMonth:1000,revenuePrevMonth:900,marginThisMonth:20,marginPrevMonth:18,cashFlowNet:300,thisMonthIncome:600,thisMonthOutflow:300,pendingRevenue:1100,supplierDebt:800,collectedThisMonth:100,priorReceivables:500,priorPayables:500};
const weekly={incomingPayments:100,incomingPaymentsCount:1,dueCosts:70,dueCostsCount:7,deliveries:2,appointments:3};
const renderUI=(ui:ReactNode)=>render(<MemoryRouter>{ui}</MemoryRouter>);

describe("Cruscotto: Finanza e Operations",()=>{
 it("distingue incassi registrati, rate attese e arretrati senza usare la previsione come saldo",()=>{
  renderUI(<FinanzaCashFlow finance={finance} isLoading={false}/>);
  expect(screen.getByText("Incassi commesse registrati nel mese").parentElement).toHaveTextContent("100");
  expect(screen.getByText("Rate commesse da incassare").parentElement).toHaveTextContent("600");
  expect(screen.getByText("Arretrati precedenti · da pagare").parentElement).toHaveTextContent("500");
  expect(screen.getByText("Copertura dal saldo registrato").parentElement).toHaveTextContent("10 giorni");
 });
 it("un saldo negativo non genera falsi giorni di autonomia positivi",()=>{
  mocks.saldo={saldo:-1000,entry_count:5};
  renderUI(<FinanzaCashFlow finance={finance} isLoading={false}/>);
  expect(screen.getByText("Nessuna copertura")).toBeInTheDocument();
 });
 it("senza movimenti di cassa non inventa una copertura",()=>{
  mocks.saldo=undefined;
  renderUI(<FinanzaCashFlow finance={finance} isLoading={false}/>);
  expect(screen.getByText("Non disponibile")).toBeInTheDocument();
 });
 it("un errore finanziario non appare come una previsione a zero",()=>{
  renderUI(<FinanzaCashFlow finance={finance} isLoading={false} dataError={new Error("offline")}/>);
  expect(screen.getByRole("alert")).toHaveTextContent("non disponibili");
  expect(screen.queryByText("Differenza prevista")).not.toBeInTheDocument();
 });
 it("mantiene numero e importo degli scaduti nella stessa scheda",()=>{
  renderUI(<OperationsDelivery operations={{activeOrders:35,lateOrders:16,openTickets:1,overduePayments:75,overdueAmount:1558837}} weeklyAgenda={weekly} isLoading={false}/>);
  const overdue=screen.getByRole("link",{name:/Rate commesse scadute/});
  expect(overdue).toHaveTextContent("75");expect(overdue).toHaveTextContent("1.558.837");
  expect(screen.queryByText("Importo Pagamenti Scaduti")).not.toBeInTheDocument();
  expect(screen.getByText("Commesse in ritardo").parentElement?.parentElement).toHaveTextContent("16");
 });
 it("il Focus compatto conserva tutte le scadenze fornitore e i cinque indicatori giornalieri",()=>{
  renderUI(<TodayFocus compactOperations todayData={{leadsToday:2,appointmentsToday:3,overdueAmount:100,overdueCount:1,suppliersDueAmount:70,suppliersDue:Array.from({length:7},(_,i)=>({id:String(i),name:`Fornitore ${i+1}`,amount:10,due_date:"2026-10-17"})),revenueInRange:100,collectedInRange:50,costsPaidInRange:20}} dateFrom="2026-10-16" dateTo="2026-10-16" onDateRangeChange={()=>{}} isLoading={false}/>);
  expect(screen.getByText("Fornitore 7")).toBeInTheDocument();
  expect(screen.getByText("Incassato commesse")).toBeInTheDocument();
  expect(screen.queryByText("Crediti scaduti")).not.toBeInTheDocument();
 });
 it("mantiene Gestisci scadute ed Emetti bozze dopo la compattazione",()=>{
  renderUI(<BillingKPIWidget/>);
  const late=screen.getByRole("button",{name:/Scaduto/});
  expect(within(late).getByText(/2 fatture scadute/)).toBeInTheDocument();
  fireEvent.keyDown(late,{key:"Enter"});expect(mocks.navigate).toHaveBeenLastCalledWith("/azienda/documenti?tab=incassi");
  fireEvent.click(screen.getByRole("button",{name:/3 bozze/}));expect(mocks.navigate).toHaveBeenLastCalledWith("/azienda/documenti?stato=bozza");
 });
});
