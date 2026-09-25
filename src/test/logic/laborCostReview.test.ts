import {describe,expect,it} from "vitest";
import {laborLineCost,reviewHourlyCost,reviewLaborReport,reportParticipants,summarizeLaborBudget,type LaborEmployee,type LaborReport} from "@/lib/campo/laborCostReview";

const e: LaborEmployee = {id:"employee",user_id:"worker",first_name:"Mario",last_name:"Rossi",costo_orario:25};
const report: LaborReport = {id:"report",company_id:"company",order_id:"A",user_id:"worker",data_lavoro:"2026-09-24",stato:"inviato",updated_at:"2026-09-24T18:00:00Z",ore_lavorate:4,ore_straordinario:0};
const review=(target:Partial<LaborReport>={},others:LaborReport[]=[],employees=[e],costs=true)=>reviewLaborReport({...report,...target},others,employees,costs);

describe("Contratto del costo orario usato nell'approvazione",()=>{
  it("dà precedenza alla tariffa manuale positiva",()=>expect(reviewHourlyCost({...e,costo_orario:25.75,gross_salary:2000,monthly_hours:160}).amount).toBe(25.75));
  it("con aliquota zero non applica 28% per errore",()=>expect(reviewHourlyCost({...e,costo_orario:null,gross_salary:2000,monthly_hours:160,inps_rate:0}).amount).toBe(12.5));
  it("applica il default solo all'aliquota nulla",()=>expect(reviewHourlyCost({...e,costo_orario:null,gross_salary:2000,monthly_hours:160,inps_rate:null}).amount).toBe(16));
  it("non inventa 173 ore mensili mancanti",()=>expect(reviewHourlyCost({...e,costo_orario:null,gross_salary:2000,monthly_hours:null}).amount).toBeNull());
  it("distingue tariffa mancante da costo zero confermato",()=>expect(reviewHourlyCost({...e,costo_orario:0}).source).toBe("mancante"));
  it("mantiene la regola storica zero manuale → formula se completa",()=>expect(reviewHourlyCost({...e,costo_orario:0,gross_salary:1600,monthly_hours:160,inps_rate:0}).amount).toBe(10));
  it.each([NaN,Infinity,-1])("non trasforma una tariffa errata in un importo valido: %s",value=>expect(reviewHourlyCost({...e,costo_orario:value}).amount).toBeNull());
  it("accetta stringhe numeriche dal database",()=>expect(reviewHourlyCost({...e,costo_orario:null,gross_salary:"2000",monthly_hours:"160",inps_rate:"0"}).amount).toBe(12.5));
  it("arrotonda come numeric PostgreSQL, anche sui mezzi centesimi",()=>{
    expect(laborLineCost(1,1.005)).toBe(1.01);
    expect(laborLineCost(0.1,99.95)).toBe(10);
    expect(laborLineCost(1e-7,1e7)).toBe(1);
  });
  it("non calcola importi da ore negative",()=>expect(()=>laborLineCost(-1,20)).toThrow());
  it("rifiuta importi che non può rappresentare con precisione al centesimo",()=>expect(()=>laborLineCost(24,Number.MAX_SAFE_INTEGER)).toThrow("fuori intervallo"));
  it("non converte booleani o stringhe esadecimali in ore",()=>{
    expect(review({presenze:[{employee_id:e.id,ore:true}]}).blockers).not.toHaveLength(0);
    expect(review({ore_lavorate:"0x10"}).blockers).not.toHaveLength(0);
  });
});

describe("Controllo personale e squadra",()=>{
  it("separa budget mancante, zero registrato e importi noti",()=>{
    expect(summarizeLaborBudget([])).toEqual({planned:null,registered:0});
    expect(summarizeLaborBudget([{cost_preventivo:0,total_cost:0}])).toEqual({planned:0,registered:0});
    expect(summarizeLaborBudget([{cost_preventivo:null,total_cost:10}])).toEqual({planned:null,registered:10});
    expect(summarizeLaborBudget([{cost_preventivo:100,total_cost:null}])).toEqual({planned:100,registered:null});
  });
  it("stima il rapporto personale sommando solo ore ordinarie e extra",()=>{
    const r=review({ore_straordinario:1});
    expect(r.knownCost).toBe(125);expect(r.complete).toBe(true);expect(r.warnings).toEqual([]);
  });
  it("le presenze sostituiscono l'autore senza sommarlo una seconda volta",()=>{
    const r=review({ore_lavorate:8,presenze:[{employee_id:e.id,ore:3},{subappaltatore_id:"sub",nome:"Ditta",ore:4}]});
    expect(r.knownCost).toBe(75);expect(r.rows).toHaveLength(2);expect(r.rows[1].kind).toBe("external");
  });
  it("identifica lo stesso dipendente nel rapporto personale e in quello del capo",()=>{
    const crew={...report,id:"crew",user_id:"capo",stato:"approvato",presenze:[{employee_id:e.id,ore:4}]};
    const r=review({},[crew]);expect(r.overlaps).toEqual([{reportId:"crew",participant:"Mario Rossi",hours:4,status:"approvato"}]);
    expect(r.warnings).toHaveLength(1);expect(r.blockers).toEqual([]);
  });
  it("più cantieri nello stesso giorno non sono automaticamente doppioni",()=>{
    const r=review({},[{...report,id:"other",order_id:"B",ore_lavorate:4}]);
    expect(r.overlaps).toEqual([]);expect(r.rows[0].otherHours).toBe(4);expect(r.warnings).toEqual([]);
  });
  it("blocca totali impossibili della singola persona, non della squadra intera",()=>{
    expect(review({ore_lavorate:16},[{...report,id:"b",order_id:"B",ore_lavorate:9}]).blockers[0]).toContain("24 ore");
    const employees=[e,{...e,id:"e2",user_id:"w2"},{...e,id:"e3",user_id:"w3"},{...e,id:"e4",user_id:"w4"}];
    expect(review({presenze:employees.map(e=>({employee_id:e.id,ore:8}))},[],employees).blockers).toEqual([]);
  });
  it("ignora altri giorni, aziende, bozze, rifiutati e il report corrente",()=>{
    const rows=[report,{...report,id:"2",company_id:"else"},{...report,id:"3",data_lavoro:"2026-09-23"},{...report,id:"4",stato:"bozza"},{...report,id:"5",stato:"rifiutato"}];
    expect(review({},rows).overlaps).toEqual([]);expect(review({},rows).rows[0].otherHours).toBe(0);
  });
  it("non abbina persone diverse in base al solo nome",()=>{
    expect(review({presenze:[{nome:"Mario Rossi",ore:4}]},[{...report,id:"other"}]).overlaps).toEqual([]);
  });
  it("segnala una presenza duplicata nello stesso rapporto",()=>{
    expect(review({presenze:[{employee_id:e.id,ore:4},{employee_id:e.id,ore:4}]}).blockers[0]).toContain("Presenza ripetuta");
  });
  it("foto senza ore non crea falsa sovrapposizione né costo mancante",()=>{
    const r=review({ore_lavorate:0},[{...report,id:"b"}],[]);
    expect(r.overlaps).toEqual([]);expect(r.warnings).toEqual([]);expect(r.knownCost).toBe(0);
  });
  it("un dipendente senza tariffa lascia il totale parziale e un avviso",()=>{
    const r=review({},[],[{...e,costo_orario:null}]);
    expect(r.complete).toBe(false);expect(r.rows[0].cost).toBeNull();expect(r.warnings[0]).toContain("costo orario non determinabile");
  });
  it("non mostra importi a chi non ha visibilità costi",()=>{
    const r=review({},[],[e],false);
    expect(r.complete).toBe(false);expect(r.rows[0].rate).toBeNull();expect(r.rows[0].cost).toBeNull();
  });
  it("due anagrafiche per l'autore non vengono scelte arbitrariamente",()=>{
    expect(reportParticipants(report,[e,{...e,id:"e2"}])[0].kind).toBe("unresolved");
  });
  it("blocca invalidi e rapporti già approvati",()=>{
    expect(review({ore_lavorate:-1}).blockers).not.toHaveLength(0);
    expect(review({stato:"approvato"}).blockers[0]).toContain("non è più");
  });
});
