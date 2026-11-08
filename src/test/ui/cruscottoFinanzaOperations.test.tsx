import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { FinanzaCashFlow } from "@/components/cruscotto/FinanzaCashFlow";
vi.mock("recharts",()=>({ResponsiveContainer:({children}:{children:ReactNode})=><div>{children}</div>,BarChart:():null=>null,Bar:():null=>null,XAxis:():null=>null,YAxis:():null=>null,Tooltip:():null=>null,Cell:():null=>null}));
afterEach(cleanup);
const finance={revenueThisMonth:1000,revenuePrevMonth:900,marginThisMonth:20,marginPrevMonth:18,cashFlowNet:300,thisMonthIncome:600,thisMonthOutflow:300,pendingRevenue:1100,supplierDebt:800,collectedThisMonth:100,priorReceivables:500,priorPayables:500};
const renderUI=(ui:ReactNode)=>render(<MemoryRouter>{ui}</MemoryRouter>);

describe("Cruscotto: scadenze del mese",()=>{
 it("tre voci: rate da incassare, costi da pagare, differenza",()=>{
  renderUI(<FinanzaCashFlow finance={finance} isLoading={false}/>);
  expect(screen.getByText("Rate commesse da incassare").parentElement).toHaveTextContent("600");
  expect(screen.getByText("Costi da pagare").parentElement).toHaveTextContent("300");
  expect(screen.getByText("Differenza prevista").parentElement).toHaveTextContent("300");
 });
 it("non ripete i numeri che il Cruscotto mostra già altrove",()=>{
  renderUI(<FinanzaCashFlow finance={finance} isLoading={false}/>);
  for (const doppione of ["Incassi commesse registrati nel mese","Arretrati precedenti · da incassare","Residuo commesse · tutte le scadenze","Copertura dal saldo registrato",/Margine commesse nel periodo/]) {
   expect(screen.queryByText(doppione)).not.toBeInTheDocument();
  }
 });
 it("dice che la differenza non è il saldo di cassa",()=>{
  renderUI(<FinanzaCashFlow finance={finance} isLoading={false}/>);
  expect(screen.getByText(/La differenza non è il saldo di cassa/)).toBeInTheDocument();
 });
 it("un errore finanziario non appare come una previsione a zero",()=>{
  renderUI(<FinanzaCashFlow finance={finance} isLoading={false} dataError={new Error("offline")}/>);
  expect(screen.getByRole("alert")).toHaveTextContent("non disponibili");
  expect(screen.queryByText("Differenza prevista")).not.toBeInTheDocument();
 });
});
