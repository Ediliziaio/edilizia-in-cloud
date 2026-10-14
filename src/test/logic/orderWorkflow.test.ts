import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { ORDER_WORKFLOW_MODELS, addWorkflowStatuses, orderWorkflowModel, resolveWorkflowStatuses, suggestWorkflowStatus } from "@/lib/orders/workflowModels";
import { saveOrderWorkflow } from "@/lib/orders/workflowPersistence";
import { statusVisits } from "@/lib/orders/statusHistory";
import { COMMERCIAL_WORKFLOW_TEMPLATES } from "@/lib/orders/commercialWorkflowModels";

describe("Percorsi commessa · modello", () => {
  it("il lavoro propone un passaggio, mai consegna o incassi automatici, e ignora i dati sconosciuti", () => {
    const model=ORDER_WORKFLOW_MODELS[0]; const statuses=model.statuses.map((s,i)=>({id:`s${i}`,name:s.name,color:s.color}));
    const resolved=resolveWorkflowStatuses(statuses,model.key);
    expect(suggestWorkflowStatus(resolved,"s0",{total:2,done:0,inCorso:1,avgPct:20})?.status.id).toBe("s3");
    expect(suggestWorkflowStatus(resolved,"s3",{total:2,done:2,inCorso:0,avgPct:100})?.status.id).toBe("s4");
    for(const current of ["s4","s5","unknown"]) expect(suggestWorkflowStatus(resolved,current,{total:2,done:2,inCorso:0,avgPct:100})).toBeNull();
    expect(suggestWorkflowStatus(resolved,"s0",{total:0,done:0,inCorso:0,avgPct:null})).toBeNull();
    expect(suggestWorkflowStatus(resolved,"s0",{total:2,done:3,inCorso:0,avgPct:100})).toBeNull();
    expect(suggestWorkflowStatus(resolveWorkflowStatuses([],model.key),"s0",{total:2,done:2,inCorso:0,avgPct:100})).toBeNull();
  });
  it("ogni tipo ha una pipeline commerciale con gli stessi quattro esiti, senza confondere lavori e incassi", () => {
    expect(COMMERCIAL_WORKFLOW_TEMPLATES).toHaveLength(8);
    for (const template of COMMERCIAL_WORKFLOW_TEMPLATES) {
      expect(new Set(template.stages.map(s=>s.name)).size).toBe(template.stages.length);
      expect(new Set(template.stages.map(s=>s.auto_status))).toEqual(new Set(["open","won","lost","abandoned"]));
      expect(template.stages.filter(s=>s.auto_status==="won")).toEqual([{name:"Contratto Firmato",auto_status:"won"}]);
      expect(template.stages.some(s=>/Acconto|SAL |Consegnata|Installazione in Corso/i.test(s.name))).toBe(false);
    }
  });
  it("copre otto tipi di lavoro con significati comuni, senza acconti, SAL o assistenza nella sequenza", () => {
    expect(ORDER_WORKFLOW_MODELS).toHaveLength(8);
    for (const model of ORDER_WORKFLOW_MODELS) {
      expect(model.statuses.map(s => s.meaning)).toContain("delivered");
      expect(model.statuses.some(s => /acconto|pagato|saldo|SAL |assistenza/i.test(s.name))).toBe(false);
      expect(new Set(model.statuses.map(s => s.name)).size).toBe(model.statuses.length);
    }
    expect(orderWorkflowModel("unknown")).toBeUndefined();
  });
  it("l'importazione conserva tutti gli ID e campi, anche stati non usati da commesse ma usati dalle automazioni", () => {
    const existing = [{id: "legacy", name: "Acconto Pagato", color: "#123456", position: 0}, {id: "prep", name: " preparazione   cantiere ", color: "#111111", position: 1}, {id: "support", name: "Garanzia", color: "#555555", position: 2, is_support_phase: true}];
    const before = JSON.stringify(existing);
    let i = 0;
    const merged = addWorkflowStatuses(existing, ORDER_WORKFLOW_MODELS[0], () => `new-${++i}`);
    expect(merged.slice(0, existing.length)).toEqual(existing);
    expect(merged.filter(s => /preparazione/i.test(s.name))).toHaveLength(1);
    expect(merged.filter(s => s.is_support_phase)).toHaveLength(1);
    expect(JSON.stringify(existing)).toBe(before);
    expect(addWorkflowStatuses(merged, ORDER_WORKFLOW_MODELS[0], vi.fn())).toEqual(merged);
  });
  it("un percorso ordinato non cambia le posizioni aziendali e mantiene gli stati extra", () => {
    const model = ORDER_WORKFLOW_MODELS[2];
    const statuses = model.statuses.map((s, i) => ({id: `s${i}`, name: s.name, color: s.color, position: 100-i}));
    const extra = {id: "old", name: "Acconto Pagato", color: "#123456", position: 200};
    const resolved = resolveWorkflowStatuses([...statuses, extra], model.key);
    expect(resolved.complete).toBe(true);
    expect(resolved.path.map(s => s.position)).toEqual(model.statuses.map((_, i) => i));
    expect(statuses[0].position).toBe(100);
    expect(resolved.additional).toEqual([extra]);
  });
  it("non indovina stati personalizzati o duplicati e segnala modelli incompleti", () => {
    const status = {id: "1", name: "Commessa Acquisita", color: "#123456", position: 0};
    const missing = resolveWorkflowStatuses([status, {...status, id: "2"}], "generico");
    expect(missing.complete).toBe(false);
    expect(missing.missing).toContain("Commessa Acquisita");
    expect(missing.path).toHaveLength(0);
    expect(resolveWorkflowStatuses([status], "custom").path).toEqual([status]);
  });
  it("lo storico ignora date invalide e sceglie l'ultima visita anche con righe non ordinate", () => {
    const visits = statusVisits([{status_id:"a",changed_at:"invalid"},{status_id:"a",changed_at:"2026-01-02T12:00:00Z"},{status_id:"a",changed_at:"2026-01-01T12:00:00Z"}]);
    expect(visits.get("a")?.toISOString()).toBe("2026-01-02T12:00:00.000Z");
    expect(statusVisits([{status_id:"b",changed_at:"invalid"}]).has("b")).toBe(false);
  });
});

describe("Percorso · confine di salvataggio", () => {
  const input = {orderId:"order",companyId:"company",version:3,modelKey:"fotovoltaico"};
  function client(data: unknown, error: unknown = null) {
    const q = {update:vi.fn(),eq:vi.fn(),select:vi.fn(),maybeSingle:vi.fn().mockResolvedValue({data,error})};
    q.update.mockReturnValue(q); q.eq.mockReturnValue(q); q.select.mockReturnValue(q);
    const from = vi.fn().mockReturnValue(q);
    return {q,from,db:{from} as unknown as SupabaseClient<Database>};
  }
  it("scrive solo il tipo di lavoro, nella singola azienda, ordine e versione", async () => {
    const c = client({id:"order",tipo_lavoro:"fotovoltaico",version:4});
    await expect(saveOrderWorkflow(c.db,input)).resolves.toMatchObject({version:4});
    expect(c.from).toHaveBeenCalledWith("orders");
    expect(c.q.update).toHaveBeenCalledExactlyOnceWith({tipo_lavoro:"fotovoltaico"});
    expect(c.q.eq.mock.calls).toEqual([["id","order"],["company_id","company"],["version",3]]);
  });
  it.each([null,{id:"other",tipo_lavoro:"fotovoltaico",version:4},{id:"order",tipo_lavoro:"generico",version:4},{id:"order",tipo_lavoro:"fotovoltaico",version:3}])("zero righe o ricevuta incoerente non diventano successi", async data => {
    const c = client(data); await expect(saveOrderWorkflow(c.db,input)).rejects.toThrow(/non confermato/);
  });
  it.each([{version:0},{version:NaN},{modelKey:"custom"},{companyId:""}])("rifiuta input %j senza contattare il database", async patch => {
    const c=client(null); await expect(saveOrderWorkflow(c.db,{...input,...patch})).rejects.toThrow(/non validi/); expect(c.from).not.toHaveBeenCalled();
  });
  it("un errore di accesso non diventa un salvataggio confermato", async () => {
    const c=client(null,{message:"permission denied"}); await expect(saveOrderWorkflow(c.db,input)).rejects.toThrow(/non salvato/);
  });
});
