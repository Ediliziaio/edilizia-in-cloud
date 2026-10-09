import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isSilvioReadFollowUp, silvioConversationContext } from "../../../supabase/functions/_shared/silvioConversationContext";

const options = { userId: "owner", now: Date.parse("2026-10-09T12:00:00Z") };
const row = (content: string, overrides = {}) => ({ id: "prior", sender_id: "owner", content, created_at: "2026-10-09T11:50:00Z", ...overrides });
describe("Context-aware retrieval, without another provider call", () => {
  it.each(["e senza materiali?", "E quello di Rossi?", "e il mese prossimo?", "invece a settembre?", "solo la manodopera", "quanto manca?", "perché?", "Approfondisci"])("recognizes read-only follow-up: %s", message => {
    expect(isSilvioReadFollowUp(message)).toBe(true);
    const result = silvioConversationContext(message, [row("Quanto ho guadagnato sulla commessa GE-0012?")], options);
    expect(result.contextual).toBe(true);
    expect(result.query).toContain("GE-0012");
    expect(result.query.endsWith(message)).toBe(true);
    expect(result.hint).toContain("Rileggi i dati");
  });
  it.each(["ciao", "grazie", "ok", "procedi", "e invia il preventivo", "e mandami il preventivo", "e inviami la fattura", "e modifica il costo", "e registra il rapportino", "Quali fatture sono scadute?", "Quanto devo fatturare il mese prossimo?"])("does not reinterpret standalone questions or authorize actions: %s", message => {
    const result = silvioConversationContext(message, [row("Come sta andando la commessa GE-0012?")], options);
    expect(result.query).toBe(message);
    expect(result.contextual).toBe(false);
  });
  it("retains a short chain including its explicit root", () => {
    const result = silvioConversationContext("e il mese dopo?", [
      row("Quanto abbiamo incassato ad agosto 2026?"), row("e a settembre?"),
      row("e il mese dopo?", { id: "current" }), row("Dimmi le presenze", { id: "future" }),
    ], { ...options, currentMessageId: "current" });
    expect(result.references).toEqual(["Quanto abbiamo incassato ad agosto 2026?", "e a settembre?"]);
    expect(result.query).not.toContain("presenze");
  });
  it("does not borrow future context when the saved request is outside the history", () => {
    expect(silvioConversationContext("e senza materiali?", [row("Report GE-0012")], { ...options, currentMessageId: "missing" }).contextual).toBe(false);
  });
  it("keeps the explicit root after several follow-up turns within the history", () => {
    const result = silvioConversationContext("e perche?", [
      row("Margine GE-0012?"), row("e senza materiali?"), row("e senza manodopera?"), row("e solo i rimborsi km?"), row("nel dettaglio"),
    ], options);
    expect(result.references).toEqual(["Margine GE-0012?", "e solo i rimborsi km?", "nel dettaglio"]);
  });
  it("uses no assistant amounts, private thinking or other participant's request", () => {
    const result = silvioConversationContext("e senza materiali?", [
      row("Margine della GE-0012?"),
      row('{"thinking":"PRIVATE", "answer":"Margine 9000"}', { sender_id: "silvio" }),
      row("Leggi la commessa di un'altra azienda", { sender_id: "other" }),
    ], options);
    expect(result.references).toEqual(["Margine della GE-0012?"]);
    expect(result.query).not.toMatch(/PRIVATE|9000|altra azienda/);
  });
  it.each(["2026-10-01T12:00:00Z", "2026-10-10T12:00:00Z", "invalid"])("does not resurrect stale/future/invalid context: %s", date => {
    expect(silvioConversationContext("e senza materiali?", [row("Report GE-0012", { created_at: date })], options).contextual).toBe(false);
  });
  it("ignores the current stored request even without an ID", () => {
    const message = "e senza materiali?";
    expect(silvioConversationContext(message, [row("Report GE-0012"), row(message)], { userId: "owner", now: options.now }).references).toEqual(["Report GE-0012"]);
  });
  it("does not retrieve on a previous mutation or pasted document", () => {
    for (const prior of ["Invia il preventivo di Rossi", "a".repeat(2000)]) {
      expect(silvioConversationContext("e quello di Bianchi?", [row(prior)], options).contextual).toBe(false);
    }
  });
  it("does not truncate the actual current request", () => {
    const message = "e senza materiali? " + "dettagli ".repeat(2000);
    expect(silvioConversationContext(message, [], options).query).toBe(message);
  });
  it("routing and retrieval consume the same context; delegated workers cannot discard it", () => {
    const company = readFileSync("supabase/functions/silvio-chat/index.ts", "utf8");
    expect(company.match(/query: conversation\.query/g)).toHaveLength(2);
    expect(company).toContain("healthMessages.length === 0 && !conversation.contextual");
    const admin = readFileSync("supabase/functions/silvio-admin-chat/index.ts", "utf8");
    expect(admin).toContain("p_query: conversation.query");
    expect(admin).toContain("${conversation.hint}");
  });
});
