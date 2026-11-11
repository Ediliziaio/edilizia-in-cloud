import { describe, expect, it } from "vitest";
import { previewAutomationConfiguration, previewAutomationPath, type PreviewNode } from "@/lib/automationPreview";
const contact = { id: "contact", first_name: "Mario", last_name: "Rossi", email: "mario@azienda.it" };
const trigger: PreviewNode = { id: "trigger", type: "trigger", data: { itemId: "contatto_creato" } };
const email: PreviewNode = { id: "email", type: "action", data: { itemId: "invia_email", destinatario: "{{contatto.email}}", oggetto: "Prova", corpo: "Ciao {{contatto.full_name}}" } };
describe("safe automation path preview", () => {
  it("checks every configured step, even when the event cannot be simulated", () => {
    const checklist = previewAutomationConfiguration([trigger, email, { ...email, id: "bad", data: { itemId: "invia_email" } }]);
    expect(checklist).toHaveLength(3);
    expect(checklist[1].errors).toEqual([]);
    expect(checklist[2].errors.length).toBeGreaterThan(0);
  });
  it("previews text but never claims that an email was sent or verified", () => {
    const before = JSON.stringify([contact, trigger, email]);
    const path = previewAutomationPath([trigger, email], [{ source: "trigger", target: "email" }], contact);
    expect(path[1]).toMatchObject({ status: "unverified", text: "Ciao Mario Rossi" });
    expect(path[1].detail).toContain("NON verificati");
    expect(JSON.stringify([contact, trigger, email])).toBe(before);
  });
  it("a non-matching trigger cannot preview downstream sends", () => {
    const restricted = { ...trigger, data: { ...trigger.data, trigger_filters: { conditions: [{ field: "email", operator: "equals", value: "someone@else.it" }] } } };
    expect(previewAutomationPath([restricted, email], [{ source: "trigger", target: "email" }], contact)).toHaveLength(1);
  });
  it("invoice triggers require the real invoice rather than a contact-only false success", () => {
    const path = previewAutomationPath([{ ...trigger, data: { itemId: "fattura_creata" } }, email], [{ source: "trigger", target: "email" }], contact);
    expect(path).toHaveLength(1);
    expect(path[0].status).toBe("unverified");
  });
  it("conditions use the same ends-with operator and follow only the chosen label", () => {
    const condition: PreviewNode = { id: "condition", type: "condition", data: { condizioni: [{ campo: "contatto.email", operatore: "finisce_con", valore: "@azienda.it" }] } };
    const path = previewAutomationPath([trigger, condition, email, { ...email, id: "no" }], [{ source: "trigger", target: "condition" }, { source: "condition", target: "email", label: "Sì" }, { source: "condition", target: "no", label: "No" }], contact);
    expect(path.map(step => step.nodeId)).toEqual(["trigger", "condition", "email"]);
  });
  it("empty conditions block the preview before actions", () => {
    const path = previewAutomationPath([{ id: "condition", type: "condition", data: {} }, email], [{ source: "condition", target: "email" }], contact);
    expect(path).toHaveLength(1); expect(path[0].status).toBe("blocked");
  });
  it("missing required email fields block the preview", () => {
    const path = previewAutomationPath([{ ...email, data: { itemId: "invia_email", oggetto: "Prova" } }], [], contact);
    expect(path[0].status).toBe("blocked");
  });
  it("cycles are bounded and blocked", () => {
    expect(previewAutomationPath([trigger, email], [{ source: "trigger", target: "email" }, { source: "email", target: "trigger" }], contact)[0].status).toBe("blocked");
  });
  it("unresolved variables stay visible instead of becoming blank fake data", () => {
    const path = previewAutomationPath([{ ...email, data: { ...email.data, corpo: "{{appuntamento.date}}" } }], [], contact);
    expect(path[0].text).toBe("{{appuntamento.date}}"); expect(path[0].detail).toContain("variabili");
  });
});

describe("preview distinguishes missing data from an explicitly empty owner", () => {
  const condition: PreviewNode = { id: "condition", type: "condition", data: { condizioni: [{ campo: "contatto.assigned_to", operatore: "vuoto" }] } };
  const edges = [{ source: "condition", target: "yes", label: "Sì" }, { source: "condition", target: "no", label: "No" }];
  const nodes = [condition, { ...email, id: "yes" }, { ...email, id: "no" }];
  it("does not pretend an unloaded owner is empty", () => {
    const path = previewAutomationPath(nodes, edges, contact);
    expect(path).toHaveLength(1); expect(path[0].status).toBe("unverified");
  });
  it("follows Yes for a known null owner", () => {
    const path = previewAutomationPath(nodes, edges, { ...contact, assigned_to: null });
    expect(path.map(s => s.nodeId)).toEqual(["condition", "yes"]);
  });
  it("follows No for an assigned contact", () => {
    const path = previewAutomationPath(nodes, edges, { ...contact, assigned_to: "seller-id" });
    expect(path.map(s => s.nodeId)).toEqual(["condition", "no"]);
  });
});
