import { describe, expect, it } from "vitest";
import { taskAssignment } from "@/lib/attivita/taskAssignment";
const base = { userId: "me", offices: [{ id: "office", membri: ["anna", "me"] }], canAssignOthers: true };
describe("Assegnazione condivisa tra Attività e commessa", () => {
  it("l’attività individuale parte in carico al suo autore", () => {
    expect(taskAssignment(base)).toEqual({ ufficio_id: null, assigned_to: "me" });
  });
  it("l’area senza persona resta disponibile per la presa in carico", () => {
    expect(taskAssignment({ ...base, officeId: "office" })).toEqual({ ufficio_id: "office", assigned_to: null });
  });
  it("conserva sia l’area sia il membro scelto", () => {
    expect(taskAssignment({ ...base, officeId: "office", assigneeId: "anna" })).toEqual({ ufficio_id: "office", assigned_to: "anna" });
  });
  it("rifiuta aree eliminate, esterne all’azienda o non accessibili", () => {
    expect(() => taskAssignment({ ...base, officeId: "missing" })).toThrow(/non è più disponibile/);
  });
  it("rifiuta persone esterne all’area", () => {
    expect(() => taskAssignment({ ...base, officeId: "office", assigneeId: "outside" })).toThrow(/non appartiene/);
  });
  it("non amplia il permesso di assegnare attività ad altri", () => {
    expect(() => taskAssignment({ ...base, officeId: "office", assigneeId: "anna", canAssignOthers: false })).toThrow(/Non puoi/);
    expect(taskAssignment({ ...base, officeId: "office", assigneeId: "me", canAssignOthers: false }).assigned_to).toBe("me");
  });
});
