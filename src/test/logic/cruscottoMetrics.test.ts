import { valutaCopertura } from "@/lib/indicatoriGuida";
import { describe, expect, it } from "vitest";
import { upcomingWorkDeliveries, registeredCostAmount, classifyWorkOrders, isLateWork, recordedMonthIncome, scheduledMonthFlows, type WorkOrder } from "@/lib/cruscottoMetrics";
import { eAperto } from "@/lib/comeStiamoAndando";
const now = new Date(2026, 9, 16, 12);
const statuses = [{id:"start",position:1},{id:"done",position:2},{id:"help",position:3,is_support_phase:true}];
const order = (p: Partial<WorkOrder>): WorkOrder => ({id:"a",current_status_id:"start",status:"confermato",fulfillment_status:"partial",work_start_date:"2026-10-01",work_end_date:"2026-10-10",expected_date:"2026-10-20",order_code:null,description:null,...p});

describe("cruscotto: ciclo lavori coerente",()=>{
 it("non scambia la data di fine pianificata per completamento e non conta completati/assistenza come ritardi",()=>{
  const rows=classifyWorkOrders([order({}),order({id:"b",current_status_id:"done"}),order({id:"c",current_status_id:"help"})],statuses);
  expect(rows.map(r=>r.work_state)).toEqual(["open","completed","support"]);
  expect(rows.filter(r=>r.work_state==="open")).toHaveLength(1);
  expect(rows.filter(r=>isLateWork(r,now)).map(r=>r.id)).toEqual(["a"]);
  expect(eAperto(rows[0],now)).toBe(true);
  expect(eAperto(rows[1],now)).toBe(false);
 });
 it("usa il workflow attuale anche se il vecchio campo status è rimasto completato",()=>{
  expect(classifyWorkOrders([order({status:"completato",fulfillment_status:"completed"})],statuses)[0].work_state).toBe("open");
 });
 it("riconosce i completati legacy senza workflow e gli annullati",()=>{
  expect(classifyWorkOrders([order({current_status_id:null,fulfillment_status:"completed"}),order({current_status_id:null,status:"annullato"})],[]).map(r=>r.work_state)).toEqual(["completed","cancelled"]);
 });
 it("usa la consegna solo se manca la fine prevista e non allarma prima della scadenza",()=>{
  const rows=classifyWorkOrders([order({work_end_date:null,expected_date:"2026-10-15"}),order({work_end_date:"2026-10-16"}),order({work_end_date:null,expected_date:null})],statuses);
  expect(rows.map(r=>isLateWork(r,now))).toEqual([true,false,false]);
 });
});
describe("cruscotto: registrato e previsto",()=>{
 it("conta solo rate pagate con data pagamento nel mese, non rate attese o date di altri mesi",()=>{
  expect(recordedMonthIncome([
   {amount:645497,is_paid:false,paid_date:"2026-10-01"},
   {amount:120,is_paid:true,paid_date:"2026-10-01"},
   {amount:50,is_paid:true,paid_date:"2026-10-16"},
   {amount:999,is_paid:true,paid_date:"2026-09-30"},
   {amount:999,is_paid:true,paid_date:"2026-10-17"},
   {amount:888,is_paid:true,paid_date:"2026-11-01"},
   {amount:777,is_paid:true,paid_date:null},
  ],now)).toBe(170);
 });
 it("separa gli arretrati da entrambi i lati e ignora mesi futuri e date assenti",()=>{
  const flows=scheduledMonthFlows([
   {amount:600,expected_date:"2026-10-01"},{amount:400,expected_date:"2026-10-31"},
   {amount:300,expected_date:"2026-09-30"},{amount:900,expected_date:"2026-11-01"},{amount:999,expected_date:null},
  ],[
   {amount:200,due_date:"2026-10-01"},{amount:100,due_date:"2026-10-31"},
   {amount:500,due_date:"2026-09-30"},{amount:800,due_date:"2026-11-01"},{amount:999,due_date:null},
  ],now);
  expect(flows).toEqual({incoming:1000,outgoing:300,priorReceivables:300,priorPayables:500,net:700});
 });
 it("gestisce il cambio anno senza includere gennaio nel mese di dicembre",()=>{
  expect(scheduledMonthFlows([{amount:10,expected_date:"2026-12-31"},{amount:20,expected_date:"2027-01-01"}],[],new Date(2026,11,31,12)).incoming).toBe(10);
 });
 it("conserva gli storni dei costi senza trasformarli in uscite positive",()=>{
  expect(scheduledMonthFlows([],[{amount:100,due_date:"2026-10-10"},{amount:-20,due_date:"2026-10-10"}],now).outgoing).toBe(80);
 });
});

it("nei flussi applica l’IVA registrata per costo, rispettando esenzioni e arrotondamento",()=>{expect(registeredCostAmount({amount:100,vat_rate:22})).toBe(122);expect(registeredCostAmount({amount:100,vat_rate:0})).toBe(100);expect(registeredCostAmount({amount:100,vat_rate:null})).toBe(100);expect(scheduledMonthFlows([],[{amount:100,due_date:"2026-10-16",vat_rate:22}],now).outgoing).toBe(122);});

it("la copertura di Sintesi e Finanza non diventa negativa quando la cassa è negativa",()=>{const result=valutaCopertura(-390967,true,115791);expect(result.valore).toBe(0);expect(result.stato).toBe("allarme");expect(result.dettaglio).toContain("negativo");});

it("le consegne previste non scompaiono quando una commessa aperta ha già una fine lavori pianificata",()=>{
 const rows=classifyWorkOrders([order({expected_date:"2026-10-17",work_end_date:"2026-10-18"}),order({id:"b",current_status_id:"done",expected_date:"2026-10-17"}),order({id:"c",expected_date:"2026-10-24"})],statuses);
 expect(upcomingWorkDeliveries(rows,"2026-10-16","2026-10-23")).toBe(1);
});
