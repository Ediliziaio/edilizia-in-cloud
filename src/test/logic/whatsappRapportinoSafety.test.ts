import { beforeEach, describe, expect, it } from "vitest";
import { DbMinimo } from "../helpers/edgeFinto";
import { creaRapportino } from "../../../supabase/functions/whatsapp-ai-processor/tools/operaio/crea_rapportino";
import { aggiungiAttivitaRapportino } from "../../../supabase/functions/whatsapp-ai-processor/tools/operaio/aggiungi_attivita_rapportino";
import type { ToolCtx } from "../../../supabase/functions/whatsapp-ai-processor/tools/shared/types";
let db: DbMinimo; let ctx: ToolCtx;
const input = { order_id: "order", data_lavoro: "2026-10-07", ore_lavorate: 7.25, attivita: ["Posa pavimento"] };
const row = () => ({ id: "report", company_id: "company", user_id: "user", order_id: "order", data_lavoro: input.data_lavoro,
  stato: "bozza", updated_at: "2026-10-07T10:00:00Z", ore_lavorate: 7.25, ore_straordinario: 0, descrizione_lavori: "Preparazione", materiali_usati: [], note: null });
beforeEach(() => {
  db = new DbMinimo();
  db.tabelle.orders = [{ id: "order", company_id: "company", order_code: "TEST-01", description: "Cantiere test" }];
  db.tabelle.order_campo_assignments = [{ order_id: "order", company_id: "company", user_id: "user" }];
  ctx = { supabase: db, company_id: "company", user_id: "user", employee_id: null, phone: "0000", waNumberId: "number", sessionId: null, kind: "operaio", role_grants: ["rapportino.write"], locale: "it" } as unknown as ToolCtx;
});
describe("WhatsApp report persistence is scoped and truthful", () => {
  it("saves exact hours as a draft, without claiming submission or warehouse consumption", async () => {
    const result = await creaRapportino(ctx, { ...input, materiali_usati: [{ descrizione: "Cemento", quantita: 2, unita_misura: "sacchi" }] });
    expect(result.ok).toBe(true);
    expect(db.tabelle.campo_rapportini[0]).toMatchObject({ ore_lavorate: 7.25, stato: "bozza", company_id: "company" });
    expect(result.user_message).toContain("Non ancora inviata");
    expect(result.user_message).toContain("nessuno scarico");
  });
  it.each(["inviato", "approvato", "rifiutato"])("cannot change a report already %s", async stato => {
    db.tabelle.campo_rapportini = [{ ...row(), stato }];
    expect(await creaRapportino(ctx, input)).toMatchObject({ ok: false, error: "rapportino_locked" });
    expect(await aggiungiAttivitaRapportino(ctx, input)).toMatchObject({ ok: false, error: "rapportino_locked" });
    expect(db.scritture).toHaveLength(0);
  });
  it("does not report success on a concurrent version change", async () => {
    db.tabelle.campo_rapportini = [row()];
    const original = db.from.bind(db); let reads = 0;
    db.from = ((table: string) => {
      if (table === "campo_rapportini" && ++reads === 2) db.tabelle.campo_rapportini[0].updated_at = "2026-10-07T11:00:00Z";
      return original(table);
    }) as typeof db.from;
    expect(await aggiungiAttivitaRapportino(ctx, input)).toMatchObject({ ok: false, error: "rapportino_update_unconfirmed" });
    expect(db.tabelle.campo_rapportini[0].descrizione_lavori).toBe("Preparazione");
  });
  it("never inserts a second report after lookup failure", async () => {
    const original = db.from.bind(db);
    const q = new Proxy({}, { get: (_, key) => key === "then" ? (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, error: { message: "offline" } }).then(resolve) : () => q });
    db.from = ((table: string) => table === "campo_rapportini" ? q : original(table)) as typeof db.from;
    expect(await creaRapportino(ctx, input)).toMatchObject({ ok: false, error: "rapportino_lookup_failed" });
    expect(db.scritture).toHaveLength(0);
  });
  it("cannot write to another company's or an unassigned site", async () => {
    db.tabelle.order_campo_assignments = [];
    expect((await creaRapportino(ctx, input)).ok).toBe(false);
    expect(db.scritture).toHaveLength(0);
  });
  it.each([{ ore_lavorate: -1 }, { data_lavoro: "2026-02-30" }, { attivita: [""] }, { ore_straordinario: Infinity }])("rejects invalid input %j before writes", async patch => {
    expect((await creaRapportino(ctx, { ...input, ...patch })).ok).toBe(false);
    expect(db.scritture).toHaveLength(0);
  });
  it("updates only the same company's worker draft and retains precise hours", async () => {
    db.tabelle.campo_rapportini = [row(), { ...row(), id: "other", company_id: "other-company" }];
    expect((await creaRapportino(ctx, { ...input, ore_lavorate: 6.75 })).ok).toBe(true);
    expect(db.tabelle.campo_rapportini.map(r => r.ore_lavorate)).toEqual([6.75, 7.25]);
  });
});
