import { describe, expect, it, vi } from "vitest";
import { ORDER_WORKFLOW_MODELS, addWorkflowStatuses, orderWorkflowModel } from "@/lib/orders/workflowModels";
import { avvisoAlCliente, statoProposto } from "@/lib/orders/statoCommessa";
import { statusVisits } from "@/lib/orders/statusHistory";
import { COMMERCIAL_WORKFLOW_TEMPLATES } from "@/lib/orders/commercialWorkflowModels";

describe("Percorsi commessa · modello", () => {
  it("con tutte le lavorazioni finite propone lo stato che chiude, mai da solo e mai dall'assistenza", () => {
    const stati=[{id:"a",name:"Aperta",color:"#111111",position:0},{id:"b",name:"Finita",color:"#111111",position:1},{id:"h",name:"Assistenza",color:"#111111",position:2,is_support_phase:true}];
    const finite={total:2,done:2,inCorso:0,avgPct:100};
    expect(statoProposto(stati,"a",finite)?.id).toBe("b");
    expect(statoProposto(stati,null,finite)?.id).toBe("b");
    expect(statoProposto(stati,"b",finite)).toBeNull();
    expect(statoProposto(stati,"h",finite)).toBeNull();
    expect(statoProposto(stati,"a",{total:2,done:1,inCorso:1,avgPct:50})).toBeNull();
    expect(statoProposto(stati,"a",{total:0,done:0,inCorso:0,avgPct:null})).toBeNull();
    expect(statoProposto(stati,"a")).toBeNull();
  });
  it("il cambio avvisa il cliente solo se è collegato e l'azienda non l'ha spento", () => {
    expect(avvisoAlCliente("c",true)).toBe(true);
    expect(avvisoAlCliente("c",undefined)).toBe(true);
    expect(avvisoAlCliente("c",false)).toBe(false);
    expect(avvisoAlCliente(null,true)).toBe(false);
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
  it("lo storico ignora date invalide e sceglie l'ultima visita anche con righe non ordinate", () => {
    const visits = statusVisits([{status_id:"a",changed_at:"invalid"},{status_id:"a",changed_at:"2026-01-02T12:00:00Z"},{status_id:"a",changed_at:"2026-01-01T12:00:00Z"}]);
    expect(visits.get("a")?.toISOString()).toBe("2026-01-02T12:00:00.000Z");
    expect(statusVisits([{status_id:"b",changed_at:"invalid"}]).has("b")).toBe(false);
  });
});

describe("Applica flusso: serve solo se manca qualcosa", () => {
  it("confronta i titoli come applicaFlusso", async () => {
    const { passiMancanti } = await import("@/lib/orderPlaybook");
    expect(passiMancanti(["Ordine materiali", "Collaudo"], [" ordine MATERIALI "])).toEqual(["Collaudo"]);
    expect(passiMancanti(["Collaudo"], ["Collaudo", null])).toEqual([]);
    expect(passiMancanti(["Collaudo"], [])).toEqual(["Collaudo"]);
  });
});
