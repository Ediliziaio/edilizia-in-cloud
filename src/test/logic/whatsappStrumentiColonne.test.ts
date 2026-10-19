// src/test/logic/whatsappStrumentiColonne.test.ts
/**
 * Gli strumenti del bot leggono le colonne che esistono davvero (19/10/2026).
 * Prima: chi era solo utente dell'app non riceveva risposta (profiles.full_name),
 * le scadenze davano sempre errore (invoices.total_amount), gli stipendi erano
 * sempre 0 €, le note di credito dei fornitori si sommavano ai costi, le
 * segnalazioni in sospeso risultavano sempre nessuna, il margine sempre 100%.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DbMinimo } from "../helpers/edgeFinto";
import { costiMese } from "../../../supabase/functions/whatsapp-ai-processor/tools/titolare/costi_mese";
import { scadenzeFatture } from "../../../supabase/functions/whatsapp-ai-processor/tools/titolare/scadenze_fatture";
import { listaApprovazioni } from "../../../supabase/functions/whatsapp-ai-processor/tools/titolare/lista_approvazioni";
import { approvaRichiesta } from "../../../supabase/functions/whatsapp-ai-processor/tools/titolare/approva_richiesta";
import type { ToolCtx } from "../../../supabase/functions/whatsapp-ai-processor/tools/shared/types";

const sorgente = (f: string) => readFileSync(resolve(process.cwd(), "supabase/functions/whatsapp-ai-processor", f), "utf8");
let db: DbMinimo;
let ctx: ToolCtx;

beforeEach(() => {
  db = new DbMinimo();
  ctx = { supabase: db, company_id: "company", user_id: "titolare", employee_id: null, phone: "0000", role_grants: [], locale: "it", waNumberId: "n", sessionId: null, kind: "admin" } as unknown as ToolCtx;
});

describe("colonne vere", () => {
  it("il riconoscimento dal profilo non chiede full_name", () => {
    expect(sorgente("identity.ts")).not.toMatch(/select\("[^"]*full_name/);
  });
  it("lo stato del cantiere prende il margine dalla vista della marginalità", () => {
    expect(sorgente("tools/titolare/stato_cantiere.ts")).toContain('.from("v_ordine_marginalita")');
  });
});

describe("costi del mese", () => {
  it("le note di credito dei fornitori si tolgono; gli stipendi si leggono per anno e mese", async () => {
    db.tabelle.fatture_ricevute = [
      { company_id: "company", data_fattura: "2026-09-10", cedente_ragione_sociale: "Edilmix", totale_documento: 1000, tipo_documento: "TD01" },
      { company_id: "company", data_fattura: "2026-09-12", cedente_ragione_sociale: "Edilmix", totale_documento: 200, tipo_documento: "TD04" },
      { company_id: "altra", data_fattura: "2026-09-12", cedente_ragione_sociale: "X", totale_documento: 999, tipo_documento: "TD01" },
    ];
    db.tabelle.cedolini = [
      { company_id: "company", anno: 2026, mese: 9, netto: 1500, lordo: 2000 },
      { company_id: "company", anno: 2026, mese: 8, netto: 1400, lordo: 1900 },
    ];
    const esito = await costiMese(ctx, { mese: "2026-09" });
    expect(esito).toMatchObject({ ok: true, data: { totaleFatture: 800, totaleStipendi: 1500, totale: 2300 } });
  });
});

describe("scadenze delle fatture", () => {
  it("solo fatture emesse non pagate, col residuo da total e paid_amount", async () => {
    db.tabelle.invoices = [
      { id: "a", company_id: "company", deleted_at: null, document_type: "invoice", status: "issued", due_date: "2000-01-10", total: 1000, paid_amount: 300, client_company_name: "Rossi", invoice_number: "1" },
      { id: "b", company_id: "company", deleted_at: null, document_type: "invoice", status: "paid", due_date: "2000-01-11", total: 500, paid_amount: 500, client_company_name: "Verdi", invoice_number: "2" },
      { id: "c", company_id: "company", deleted_at: null, document_type: "credit_note", status: "issued", due_date: "2000-01-12", total: 50, paid_amount: 0, client_company_name: "Bianchi", invoice_number: "3" },
    ];
    const esito = await scadenzeFatture(ctx, { solo_scadute: true });
    expect(esito.ok).toBe(true);
    expect((esito as { data: { totaleAperto: number } }).data.totaleAperto).toBe(700);
    expect(esito.user_message).toContain("Rossi");
    expect(esito.user_message).not.toContain("Verdi");
    expect(esito.user_message).not.toContain("Bianchi");
  });
});

describe("segnalazioni in sospeso", () => {
  beforeEach(() => {
    db.tabelle.tickets = [
      { id: "t1", company_id: "company", fonte: "campo", status: "aperto", priorita: "alta", subject: "ORD-7: perde un tubo", created_at: "2026-10-18T08:00:00Z", order_id: "o" },
      { id: "t2", company_id: "company", fonte: "cliente", status: "aperto", priorita: "alta", subject: "Richiesta del cliente", created_at: "2026-10-18T09:00:00Z", order_id: null },
      { id: "t3", company_id: "company", fonte: "campo", status: "risolto", priorita: "alta", subject: "già fatto", created_at: "2026-10-17T09:00:00Z", order_id: null },
    ];
  });
  it("sono i ticket dal cantiere ancora aperti", async () => {
    const esito = await listaApprovazioni(ctx);
    expect(esito.user_message).toContain("perde un tubo");
    expect(esito.user_message).not.toContain("Richiesta del cliente");
    expect(esito.user_message).not.toContain("già fatto");
  });
  it("approvare la risolve, e una già risolta resta com'è", async () => {
    const esito = await approvaRichiesta(ctx, { richiesta_id: "t1", esito: "approvata" });
    expect(esito.ok).toBe(true);
    expect(db.tabelle.tickets[0].status).toBe("risolto");
    const di_nuovo = await approvaRichiesta(ctx, { richiesta_id: "t3", esito: "rifiutata" });
    expect(di_nuovo.user_message).toContain("già risolto");
    expect(db.tabelle.tickets[2].status).toBe("risolto");
  });
});
