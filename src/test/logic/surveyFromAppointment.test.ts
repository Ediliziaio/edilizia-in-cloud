import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSurvey } from "@/lib/api/surveys";
const m=vi.hoisted(()=>({from:vi.fn(),insert:vi.fn(),filters:[] as unknown[][],appointment:{id:"a1",order_id:"o1",appointment_date:"2026-11-20",appointment_time:"09:30:00",assigned_to:"tech1"} as object|null,existing:null as object|null,failed:false}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:m.from}}));
beforeEach(()=>{
  vi.clearAllMocks();m.filters=[];m.existing=null;m.failed=false;
  m.appointment={id:"a1",order_id:"o1",appointment_date:"2026-11-20",appointment_time:"09:30:00",assigned_to:"tech1"};
  m.from.mockImplementation((table:string)=>{const q={select:()=>q,eq:(...args:unknown[])=>{m.filters.push([table,...args]);return q;},is:()=>q,limit:()=>q,
    maybeSingle:async()=>({data:table==="appointments"?m.appointment:m.existing,error:m.failed?{message:"403"}:null}),
    insert:(value:unknown)=>{m.insert(value);return q;},single:async()=>({data:{id:"s1"},error:null as null})};return q;});
});
describe("Compilare un rilievo dall'appuntamento già esistente",()=>{
  it("riusa l'appuntamento senza crearne uno nuovo e rilegge data e tecnico",async()=>{
    await createSurvey({template_id:"t1",order_id:"o1",appointment_id:"a1",scheduled_at:"2030-01-01T09:00:00Z",technician_id:"altro"},"c1");
    expect(m.filters).toEqual(expect.arrayContaining([["appointments","company_id","c1"],["appointments","id","a1"]]));
    expect(m.insert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({order_id:"o1",appointment_id:"a1",company_id:"c1",technician_id:"tech1",scheduled_at:new Date("2026-11-20T09:30:00").toISOString()}));
  });
  it("riapre il rilievo esistente invece di duplicarlo",async()=>{
    m.existing={id:"gia-creato",order_id:"o1"};
    expect((await createSurvey({template_id:"t1",order_id:"o1",appointment_id:"a1"},"c1")).id).toBe("gia-creato");expect(m.insert).not.toHaveBeenCalled();
  });
  it.each([null,{id:"a1",order_id:"altra-commessa"}])("rifiuta un appuntamento non disponibile o di un'altra commessa",async appointment=>{
    m.appointment=appointment;
    await expect(createSurvey({template_id:"t1",order_id:"o1",appointment_id:"a1"},"c1")).rejects.toThrow("Appuntamento non disponibile");expect(m.insert).not.toHaveBeenCalled();
  });
  it("un errore di lettura blocca la creazione invece di aggirare la verifica",async()=>{
    m.failed=true;await expect(createSurvey({template_id:"t1",order_id:"o1",appointment_id:"a1"},"c1")).rejects.toThrow();expect(m.insert).not.toHaveBeenCalled();
  });
});
