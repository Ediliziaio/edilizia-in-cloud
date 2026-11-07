import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const m=vi.hoisted(()=>({tables:{} as Record<string,Record<string,unknown>[]>,calls:[] as {table:string,method:string,args:unknown[]}[],fail: null as string|null,cap:1000}));
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>({effectiveCompany:{id:"azienda-a"}})}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:(table:string)=>{
 let start=0,end=999,columns="*";
 const builder:Record<string,unknown>={};
 for(const method of ["select","eq","is","or","order","range"]){builder[method]=(...args:unknown[])=>{
  m.calls.push({table,method,args});
  if(method==="select") columns=String(args[0]);
  if(method==="range"){start=Number(args[0]);end=Number(args[1]);}return builder;
 };}
 builder.then=(resolve:(v:unknown)=>unknown)=>{
  if(m.fail===table && start>0)return Promise.resolve(resolve({data:null,error:{message:"Seconda pagina non disponibile"}}));
  const all=m.tables[table]??[];
  const data=all.slice(start,Math.min(end+1,start+m.cap)).map(row=>Object.fromEntries(Object.entries(row).filter(([k])=>columns.split(",").map(c=>c.trim()).includes(k))));
  return Promise.resolve(resolve({data,error:null,count:all.length}));
 };
 return builder;
}}}));
import {useCompanyStructure} from "@/hooks/controlloGestione/useCompanyStructure";
function open(){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});return renderHook(()=>useCompanyStructure(),{wrapper:({children})=><QueryClientProvider client={client}>{children}</QueryClientProvider>});}
beforeEach(()=>{m.tables={company_costs:[],employees:[],order_employees:[],orders:[{status:"in_corso",percentuale_avanzamento:25}],costo_personale_parametri:[]};m.calls=[];m.fail=null;m.cap=1000;});afterEach(cleanup);
describe("Caricamento completo struttura aziendale",()=>{
 it("porta al calcolo la quota di merce rimasta in magazzino",async()=>{
  m.tables.company_costs=[{amount:1000,recurrence:"monthly",allocations:[],quota_magazzino:300}];
  const {result}=open();await waitFor(()=>expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.monthlyStructure).toBe(700);
  expect(result.current.data?.monthlyPerActiveOrder).toBe(700);
 });
 it("include costi e commesse oltre le prime mille righe",async()=>{
  m.tables.company_costs=Array.from({length:1001},()=>({amount:100,recurrence:"monthly",quota_magazzino:0}));
  m.tables.orders=Array.from({length:1002},()=>({status:"in_corso",percentuale_avanzamento:25}));
  const {result}=open();await waitFor(()=>expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.monthlyStructure).toBe(100100);
  expect(result.current.data?.activeOrders).toBe(1002);
  expect(result.current.data?.monthlyPerActiveOrder).toBeCloseTo(100100/1002);
  for(const table of ["company_costs","orders"])expect(m.calls.some(c=>c.table===table&&c.method==="range"&&c.args[0]===1000)).toBe(true);
  expect(m.calls.filter(c=>c.method==="eq"&&c.args[0]==="company_id").every(c=>c.args[1]==="azienda-a")).toBe(true);
 });
 it("rispetta anche un limite del server inferiore a mille",async()=>{
  m.cap=2;m.tables.company_costs=Array.from({length:5},()=>({amount:100,recurrence:"monthly"}));
  const {result}=open();await waitFor(()=>expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.monthlyStructure).toBe(500);
 });
 it("una pagina fallita produce errore e non un totale parziale",async()=>{
  m.fail="company_costs";m.cap=2;m.tables.company_costs=Array.from({length:3},()=>({amount:100,recurrence:"monthly"}));
  const {result}=open();await waitFor(()=>expect(result.current.isError).toBe(true));
  expect(result.current.data).toBeUndefined();
 });
});
