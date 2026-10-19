// src/test/logic/whatsappFasiEClienti.test.ts
/**
 * Da WhatsApp, come dall'app (18/10/2026):
 *  - «finito il massetto» segna la fase completata sul cantiere confermato,
 *    con la foto; una fase con sottofasi si chiude spuntandole dall'app;
 *  - il cliente che chiede a che punto è il lavoro sente fasi fatte, la
 *    prossima fase e il prossimo appuntamento, mai importi;
 *  - F24, LIPE e CU non si generano da WhatsApp.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { DbMinimo } from "../helpers/edgeFinto";
import { segnaFase, faseNominata } from "../../../supabase/functions/whatsapp-ai-processor/tools/operaio/segna_fase";
import { statoConsegna } from "../../../supabase/functions/_shared/ediliziaCustomerTools";
import { SILVIO_TOOLS } from "../../../supabase/functions/_shared/silvioTools";
import type { ToolCtx } from "../../../supabase/functions/whatsapp-ai-processor/tools/shared/types";

let db: DbMinimo;
let ctx: ToolCtx;
beforeEach(() => {
  db = new DbMinimo();
  db.tabelle.orders = [{ id: "o1", company_id: "company", order_code: "ORD-7", description: "Villa Rossi", percentuale_avanzamento: 60, status: "in_corso", deleted_at: null, client_phone: "393331234567", tipo_lavoro: "ristrutturazione", created_at: "2026-09-01" }];
  db.tabelle.order_work_phases = [
    { id: "f1", company_id: "company", order_id: "o1", name: "Demolizioni", status: "completata", position: 1, foto_urls: [] },
    { id: "f2", company_id: "company", order_id: "o1", name: "Massetto piano terra", status: "in_corso", position: 2, foto_urls: [] },
    { id: "f3", company_id: "company", order_id: "o1", name: "Massetto primo piano", status: "da_fare", position: 3, foto_urls: [] },
    { id: "f4", company_id: "company", order_id: "o1", name: "Impianto elettrico", status: "da_fare", position: 4, foto_urls: [] },
  ];
  db.tabelle.order_work_subphases = [{ id: "s1", phase_id: "f4", fatta: false }];
  ctx = { supabase: db, company_id: "company", user_id: "u1", employee_id: "e1", kind: "operaio", mediaCorrente: null } as unknown as ToolCtx;
});

describe("«finito il massetto»", () => {
  it("trova la fase per nome e chiede quale se sono due", () => {
    const fasi = db.tabelle.order_work_phases as never[];
    expect(faseNominata(fasi, "massetto piano terra").fase).toMatchObject({ id: "f2" });
    expect(faseNominata(fasi, "massetto").candidate).toHaveLength(2);
    expect(faseNominata(fasi, "impianto").fase).toMatchObject({ id: "f4" });
  });

  it("segna la fase completata sul cantiere confermato", async () => {
    const esito = await segnaFase(ctx, { fase: "massetto piano terra", order_id: "o1" });
    expect(esito.ok).toBe(true);
    expect(db.tabelle.order_work_phases[1]).toMatchObject({ status: "completata", percentuale: 100, completata_da: "u1" });
    expect(esito.user_message).toContain("«Massetto piano terra» completata su ORD-7 · Villa Rossi");
  });

  it("con due fasi simili chiede quale, senza segnare niente", async () => {
    const esito = await segnaFase(ctx, { fase: "massetto", order_id: "o1" });
    expect(esito).toMatchObject({ ok: false, error: "fase_ambigua" });
    expect(esito.ok === false && esito.user_message).toContain("• Massetto piano terra");
    expect(db.scritture).toHaveLength(0);
  });

  it("una fase con sottofasi si chiude spuntandole dall'app", async () => {
    const esito = await segnaFase(ctx, { fase: "impianto elettrico", order_id: "o1" });
    expect(esito).toMatchObject({ ok: false, error: "fase_con_sottofasi" });
    expect(db.scritture).toHaveLength(0);
  });
});

describe("«a che punto è il mio cantiere?»", () => {
  it("dice le fasi fatte e la prossima, senza importi", async () => {
    db.tabelle.appointments = [];
    const r = await statoConsegna(db as never, "company", { rawPhone: "393331234567", suffix: "331234567", fallbackCreatedBy: null });
    expect(r.risposta).toContain("1 fasi su 4 sono completate (l'ultima: Demolizioni)");
    expect(r.risposta).toContain("Adesso stiamo lavorando a: Massetto piano terra");
    expect(r.risposta).not.toMatch(/€|euro/i);
  });
});

describe("adempimenti fiscali", () => {
  it("F24, LIPE e CU non si generano da WhatsApp", () => {
    for (const t of ["genera_f24_mese", "genera_lipe_trimestrale", "genera_cu_anno"] as const) {
      expect(SILVIO_TOOLS[t].allowedChannels, t).not.toContain("whatsapp");
    }
  });
});
