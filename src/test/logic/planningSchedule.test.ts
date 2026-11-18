import { describe, expect, it } from "vitest";
import { planningSchedule, type PlanningPhase } from "@/lib/orders/planningSchedule";
import type { OrderPlanningDates } from "@/lib/orders/planning";
const dates: OrderPlanningDates = {work_start_date:"2026-10-10",work_end_date:"2026-10-20",work_start_time:null,work_end_time:null,expected_date:null,warehouse_arrival_date:null};
const phase = (start_date: string | null, end_date: string | null): PlanningPhase => ({id:"f",name:"Fase",start_date,end_date});
describe("Periodo del popup dalle date previste del cronoprogramma", () => {
  it("usa il minimo inizio e la massima fine salvati, indipendentemente dall'ordine", () => {
    const r = planningSchedule([phase("2026-10-15","2026-10-20"),phase("2026-10-10","2026-10-12")], dates);
    expect(r).toMatchObject({start:"2026-10-10",end:"2026-10-20",canAlign:true,samePeriod:true,outside:0});
  });
  it("senza fasi non inventa date", () => {
    expect(planningSchedule([], dates)).toMatchObject({start:null,end:null,canAlign:false,samePeriod:false});
  });
  it.each([[null,null],["2026-10-10",null],[null,"2026-10-20"]])("una fase incompleta %s–%s impedisce l'allineamento", (start,end) => {
    const r = planningSchedule([phase("2026-10-10","2026-10-20"),phase(start,end)],dates);
    expect(r.missing).toBe(1); expect(r.canAlign).toBe(false);
  });
  it.each([["2026-02-30","2026-10-20"],["2026-10-20","2026-10-10"]])("date non valide %s–%s non entrano nel periodo suggerito", (start,end) => {
    expect(planningSchedule([phase(start,end)],dates)).toMatchObject({start:null,end:null,invalid:1,canAlign:false});
  });
  it("indica le fasi fuori periodo senza confonderle con i ritardi reali", () => {
    const r = planningSchedule([phase("2026-10-09","2026-10-12"),phase("2026-10-15","2026-10-21")], dates);
    expect(r.outside).toBe(2); expect(r.canAlign).toBe(true);
  });
  it("distingue il periodo generale più ampio da quello esatto delle fasi", () => {
    const r = planningSchedule([phase("2026-10-12","2026-10-18")],dates);
    expect(r.outside).toBe(0); expect(r.samePeriod).toBe(false);
  });
  it("segnala traguardi incoerenti senza cambiarli", () => {
    const input = {...dates,expected_date:"2027-03-15",warehouse_arrival_date:"2026-10-25"};
    expect(planningSchedule([],input).warnings).toHaveLength(2);
    expect(input.expected_date).toBe("2027-03-15");
  });
});
