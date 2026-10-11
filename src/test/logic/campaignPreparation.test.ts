import { describe, expect, it } from "vitest";
import { campaignPreparation } from "../../../supabase/functions/_shared/campaignPreparation";
import { normalizeVoicePhone, prepareVoiceRecipients, voiceContactExclusion } from "../../../supabase/functions/_shared/contactVoice";
import { campaignPermission } from "../../../supabase/functions/_shared/campaignPermission";

const company = "11111111-2222-4333-8444-555555555555";
const campaignId = "22222222-2222-4333-8444-555555555555";
const contactId = "33333333-2222-4333-8444-555555555555";
const secondId = "44444444-2222-4333-8444-555555555555";
const agentId = "55555555-2222-4333-8444-555555555555";
const updated = "2026-10-11T08:00:00+00:00";
const campaign = { id: campaignId, company_id: company, stato: "bozza", chiamate_effettuate: 0, aggiornato_il: updated, metadata: { unrelated: true } };
const contact = { id: contactId, first_name: "Demo", last_name: "Contatto", phone: "+39 333-1234567", marketing_consent: true };
type Query = { table: string; steps: any[][] };
function database(resolve: (q: Query) => any) {
  const calls: Query[] = [];
  return { calls, from(table: string) {
    const q: Query = { table, steps: [] };
    const chain: any = new Proxy({}, { get(_, key) {
      if (key === "then") return (ok: any, bad: any) => { calls.push(q); return Promise.resolve(resolve(q)).then(ok, bad); };
      return (...args: any[]) => { q.steps.push([String(key), ...args]); return chain; };
    } }); return chain;
  } };
}
function dbFor(options: { campaign?: any; contacts?: any[]; save?: any; attempted?: any[]; errorTable?: string } = {}) {
  return database(q => {
    if (q.table === options.errorTable) return { data: null, error: new Error("database down") };
    return { data: q.table === "marketing_contacts" ? options.contacts ?? [contact]
      : q.table === "ai_campaign_contacts" ? options.attempted ?? []
      : q.table === "ai_agents_v2" ? { id: agentId, tipo: "vocale" }
      : q.steps.some(s => ["update", "delete", "insert"].includes(s[0])) ? options.save === undefined ? { id: campaignId, aggiornato_il: updated } : options.save
      : options.campaign === undefined ? campaign : options.campaign, error: null };
  });
}
const payload = { campaign_id: campaignId, updated_at: updated, contact_ids: [contactId] };
const writes = (db: ReturnType<typeof database>) => db.calls.filter(q => q.steps.some(s => ["insert", "update", "delete"].includes(s[0])));

describe("voice recipient normalization and exclusion", () => {
  it.each(["+39 333-1234567", "0039 (333) 1234567", "+393331234567"])("normalizes presentation only: %s", number => {
    expect(normalizeVoicePhone(number)).toBe("+393331234567");
  });
  it.each(["3331234567", "+393331234567 ext 2", "+003931234567", "+39/3331234567", "++393331234567", "9".repeat(81), null])("rejects ambiguous phone: %s", number => {
    expect(normalizeVoicePhone(number)).toBeNull();
  });
  it.each([
    { optout_call: true }, { opt_out: true }, { deleted_at: updated }, { ricontatta_dopo: "2099-01-01" },
    { ricontatta_dopo: "broken" }, { marketing_consent: false }, { marketing_consent: null },
  ])("excludes unavailable marketing contacts: %j", override => {
    expect(voiceContactExclusion({ ...contact, ...override }, true)).toBeTruthy();
  });
  it("does not impose marketing consent on an individual service call", () => {
    expect(voiceContactExclusion({ ...contact, marketing_consent: null })).toBeNull();
  });
  it("a past callback date is allowed", () => {
    expect(voiceContactExclusion({ ...contact, ricontatta_dopo: "2020-01-01" }, true)).toBeNull();
  });
  it("deduplicates formatting variants deterministically regardless of selection order", () => {
    const second = { ...contact, id: secondId, phone: "0039 (333) 1234567" };
    const result = prepareVoiceRecipients([second, contact]);
    expect(result.recipients).toHaveLength(1);
    expect(result.recipients[0]).toMatchObject({ contact_id: contactId, telefono: "+393331234567" });
    expect(result.excluded[0]).toMatchObject({ contact_id: secondId, reason: "Numero duplicato nella selezione" });
    expect(prepareVoiceRecipients([contact, second])).toEqual(result);
  });
});
describe("campaign preparation (no dispatcher and no provider calls)", () => {
  it("checks and atomically replaces prepared snapshots, retaining unrelated metadata", async () => {
    const db = dbFor();
    const result = await campaignPreparation(db, company, "prepare_campaign", payload);
    expect(result).toMatchObject({ prepared: 1 });
    expect(writes(db)).toHaveLength(1);
    const write = writes(db)[0];
    expect(write.steps).toContainEqual(["update", { metadata: { unrelated: true, preparazione_destinatari: expect.objectContaining({ versione: 1, recipients: [expect.objectContaining({ contact_id: contactId })] }) } }]);
    expect(write.steps).toContainEqual(["eq", "company_id", company]);
    expect(write.steps).toContainEqual(["eq", "aggiornato_il", updated]);
    expect(write.steps).toContainEqual(["eq", "stato", "bozza"]);
    expect(db.calls.some(q => q.table === "ai_campaign_contacts")).toBe(false);
  });
  it("rejects contacts outside the selected company or missing, with no partial write", async () => {
    const db = dbFor({ contacts: [] });
    await expect(campaignPreparation(db, company, "prepare_campaign", payload)).rejects.toMatchObject({ status: 409 });
    expect(writes(db)).toHaveLength(0);
    expect(db.calls.find(q => q.table === "marketing_contacts")?.steps).toContainEqual(["eq", "company_id", company]);
  });
  it("removes duplicate IDs before resolving the selection", async () => {
    const db = dbFor();
    expect(await campaignPreparation(db, company, "prepare_campaign", { ...payload, contact_ids: [contactId, contactId] })).toMatchObject({ prepared: 1 });
    expect(db.calls.find(q => q.table === "marketing_contacts")?.steps).toContainEqual(["in", "id", [contactId]]);
  });
  it("rechecks an opt-out changed since the selection was opened", async () => {
    const db = dbFor({ contacts: [{ ...contact, optout_call: true }] });
    await expect(campaignPreparation(db, company, "prepare_campaign", payload)).rejects.toMatchObject({ status: 400 });
    expect(writes(db)).toHaveLength(0);
  });
  it("reports excluded contacts while saving valid ones", async () => {
    const db = dbFor({ contacts: [contact, { ...contact, id: secondId, optout_call: true }] });
    expect(await campaignPreparation(db, company, "prepare_campaign", { ...payload, contact_ids: [contactId, secondId] }))
      .toMatchObject({ prepared: 1, excluded: [{ contact_id: secondId, reason: "Contatto escluso dalle chiamate" }] });
  });
  it("an empty selection clears the prepared list without claiming a dispatch", async () => {
    const db = dbFor();
    expect(await campaignPreparation(db, company, "prepare_campaign", { ...payload, contact_ids: [] })).toMatchObject({ prepared: 0 });
    expect(db.calls.some(q => q.table === "marketing_contacts")).toBe(false);
  });
  it.each(["in_corso", "pausa", "archiviata", "completata"])("cannot replace recipients of a %s campaign", async stato => {
    const db = dbFor({ campaign: { ...campaign, stato } });
    await expect(campaignPreparation(db, company, "prepare_campaign", payload)).rejects.toMatchObject({ status: 409 });
    expect(writes(db)).toHaveLength(0);
  });
  it("a campaign in another company is unavailable", async () => {
    const db = dbFor({ campaign: null });
    await expect(campaignPreparation(db, company, "prepare_campaign", payload)).rejects.toMatchObject({ status: 404 });
    expect(writes(db)).toHaveLength(0);
  });
  it("rejects a stale draft before reading contacts", async () => {
    const db = dbFor();
    await expect(campaignPreparation(db, company, "prepare_campaign", { ...payload, updated_at: "yesterday" })).rejects.toMatchObject({ status: 409 });
    expect(db.calls).toHaveLength(1);
  });
  it("a concurrent edit lost at compare-and-swap is not reported as saved", async () => {
    const db = dbFor({ save: null });
    await expect(campaignPreparation(db, company, "prepare_campaign", payload)).rejects.toMatchObject({ status: 409 });
  });
  it("database errors cannot become an empty successful contact list", async () => {
    const db = dbFor({ errorTable: "marketing_contacts" });
    await expect(campaignPreparation(db, company, "campaign_contacts")).rejects.toMatchObject({ status: 500 });
  });
  it("paginates deterministically and sanitizes filter syntax", async () => {
    const db = dbFor({ contacts: Array.from({ length: 51 }, () => contact) });
    const result = await campaignPreparation(db, company, "campaign_contacts", { search: "Demo),company_id.eq.other", page: 2 });
    expect(result).toMatchObject({ has_more: true });
    expect((result as any).contacts).toHaveLength(50);
    expect(db.calls[0].steps).toContainEqual(["range", 100, 150]);
    const filter = db.calls[0].steps.find(s => s[0] === "or")[1];
    expect(filter).not.toContain("company_id.eq.other");
    expect(db.calls[0].steps).toContainEqual(["eq", "company_id", company]);
  });
  it.each([-1, 1.5, 2001, "broken"])("rejects invalid page %s", async page => {
    await expect(campaignPreparation(dbFor(), company, "campaign_contacts", { page })).rejects.toMatchObject({ status: 400 });
  });
  it("enforces the selection cap", async () => {
    const db = dbFor();
    await expect(campaignPreparation(db, company, "prepare_campaign", { ...payload, contact_ids: Array(501).fill(contactId) })).rejects.toMatchObject({ status: 400 });
    expect(writes(db)).toHaveLength(0);
  });
  it("an existing UUID recovers the draft instead of creating another one", async () => {
    const db = dbFor();
    expect(await campaignPreparation(db, company, "create_campaign", { id: campaignId })).toMatchObject({ campaign: { id: campaignId } });
    expect(writes(db)).toHaveLength(0);
  });
  it("creation verifies the vocal agent belongs to the same company and forces draft status", async () => {
    const db = dbFor({ campaign: null });
    await campaignPreparation(db, company, "create_campaign", { id: campaignId, agent_id: agentId, nome: " Demo ", stato: "in_corso" });
    expect(db.calls.find(q => q.table === "ai_agents_v2")?.steps).toContainEqual(["eq", "company_id", company]);
    expect(writes(db)[0].steps).toContainEqual(["insert", expect.objectContaining({ company_id: company, nome: "Demo", stato: "bozza", tipo: "chiamata" })]);
  });
  it("deletion preserves a campaign with call attempts even if its counter says zero", async () => {
    const db = dbFor({ attempted: [{ id: "attempt" }] });
    await expect(campaignPreparation(db, company, "delete_campaign", payload)).rejects.toMatchObject({ status: 409 });
    expect(writes(db)).toHaveLength(0);
  });
  it("deletion is scoped and rejects concurrent edits", async () => {
    const db = dbFor({ save: null });
    await expect(campaignPreparation(db, company, "delete_campaign", payload)).rejects.toMatchObject({ status: 409 });
    expect(writes(db)[0].steps).toContainEqual(["eq", "company_id", company]);
    expect(writes(db)[0].steps).toContainEqual(["eq", "aggiornato_il", updated]);
  });
});
describe("campaign permission checks", () => {
  it("denies company members without the AI permission", async () => {
    await expect(campaignPermission({ rpc: async () => ({ data: false }) }, "user", company, false, "list_campaigns", {})).rejects.toMatchObject({ status: 403 });
  });
  it("fails closed when permission lookup is unavailable", async () => {
    await expect(campaignPermission({ rpc: async () => ({ data: true, error: new Error("down") }) }, "user", company, false, "create_campaign", {})).rejects.toMatchObject({ status: 403 });
  });
  it("requires the CRM permission as well when resolving recipients", async () => {
    const permissions: string[] = [];
    const db = { rpc: async (_fn: string, args: any) => { permissions.push(args._permission); return { data: args._permission === "can_view_marketing_ai_agent" }; } };
    await expect(campaignPermission(db, "user", company, false, "prepare_campaign", {})).rejects.toMatchObject({ status: 403 });
    expect(permissions).toEqual(["can_view_marketing_ai_agent", "can_view_marketing_contacts"]);
  });
  it("a superadmin verified by the caller needs no company permission override", async () => {
    await campaignPermission({}, "user", company, true, "prepare_campaign", {});
  });
});
