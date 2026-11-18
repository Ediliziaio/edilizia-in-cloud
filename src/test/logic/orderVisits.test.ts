import { describe, expect, it } from "vitest";
import { orderVisits } from "@/lib/surveys/orderVisits";
import { makeSurveyDetail } from "../fixtures/surveyDetail";
import type { AppointmentData } from "@/components/appointments/AppointmentDialog";
const a:AppointmentData={id:"a1",title:"Visita cantiere",description:null,appointment_date:"2026-11-20",appointment_time:"09:30:00",appointment_type:"rilievo_tecnico",assigned_to:"tecnico",order_id:"order1",is_completed:false};
describe("Agenda e rilievi della commessa",()=>{
  it("mostra anche visite fissate in agenda senza rilievo tecnico",()=>{
    expect(orderVisits([],[a])[0]).toMatchObject({id:"appointment:a1",group:"fissati",technicianId:"tecnico"});
  });
  it("appuntamento e rilievo collegati formano una sola riga",()=>{
    const s={...makeSurveyDetail().survey,appointment_id:"a1",status:"draft" as const};
    const rows=orderVisits([s],[a]);
    expect(rows).toHaveLength(1); expect(rows[0].appointment?.id).toBe("a1"); expect(rows[0].when).toBe("2026-11-20T09:30:00");
  });
  it("non classifica come effettuata una visita solo perché la data è passata",()=>{
    expect(orderVisits([],[{...a,appointment_date:"2020-01-01"}])[0].group).toBe("fissati");
  });
  it.each(["completed","reviewed","signed","converted"] as const)("stato %s è effettuato anche se collegato a una commessa",status=>{
    expect(orderVisits([{...makeSurveyDetail().survey,status}],[])[0].group).toBe("effettuati");
  });
  it("conserva annullati, archiviati e bozze senza data",()=>{
    const s=makeSurveyDetail().survey;
    expect(orderVisits([{...s,id:"c",status:"cancelled"},{...s,id:"b",status:"draft",scheduled_at:null},{...s,id:"x",status:"archived"}],[]).map(v=>v.group).sort()).toEqual(["annullati","archiviati","da_fissare"]);
  });
  it("distingue lo stato dell'appuntamento dal completamento del rilievo",()=>{
    expect(orderVisits([],[{...a,is_completed:true}])[0].group).toBe("effettuati");
    expect(orderVisits([],[{...a,status:"annullato"}])[0].group).toBe("annullati");
    expect(orderVisits([{...makeSurveyDetail().survey,status:"signed",appointment_id:"a1"}],[{...a,status:"annullato"}])[0].group).toBe("effettuati");
  });
  it("non inserisce riunioni o assistenze nell'elenco dei sopralluoghi",()=>{
    expect(orderVisits([],[{...a,appointment_type:"riunione"},{...a,id:"a2",appointment_type:"assistenza"}])).toEqual([]);
  });
  it("non inventa l'ora né ripristina un tecnico rimosso dall'appuntamento",()=>{
    const s={...makeSurveyDetail().survey,appointment_id:"a1",technician_id:"vecchio-tecnico"};
    const r=orderVisits([s],[{...a,appointment_time:null,assigned_to:null}])[0];
    expect(r.when).toBe("2026-11-20");expect(r.technicianId).toBeNull();
  });
});
