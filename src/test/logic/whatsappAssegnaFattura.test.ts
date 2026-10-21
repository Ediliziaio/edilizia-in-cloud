// src/test/logic/whatsappAssegnaFattura.test.ts
/**
 * «Assegna questa fattura al cliente Rossi» da WhatsApp (19/10/2026): il bot
 * trova la fattura, cerca le commesse di Rossi fra tutte quelle dell'azienda
 * (anche chiuse, anche per nome del cliente in anagrafica), propone quella
 * giusta o mostra l'elenco coi nomi. La fattura nel riepilogo la descrive il
 * database. Scrive solo l'amministratore, dopo il Sì.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DbMinimo } from "../helpers/edgeFinto";
import { assegnaFattura, cercaFattura } from "../../../supabase/functions/whatsapp-ai-processor/tools/ufficio/assegna_fattura";
import { freezeConfirmation, ConfirmationReviewError, rispostaCantiere } from "../../../supabase/functions/whatsapp-ai-processor/frozenConfirmation";
import type { ToolCtx } from "../../../supabase/functions/whatsapp-ai-processor/tools/shared/types";

const ADESSO = new Date("2026-10-19T09:00:00Z");
let db: DbMinimo;
let ctx: ToolCtx;

const ordine = (id: string, extra: Record<string, unknown>) => ({
  id, company_id: "company", order_code: `ORD-${id}`, description: "Ristrutturazione", client_name: null as string | null,
  client_company: null as string | null, indirizzo_lavori: null as string | null, status: "confermato", customer_id: null as string | null,
  work_start_date: null as string | null, work_end_date: null as string | null, updated_at: "2026-10-01T10:00:00Z", deleted_at: null as string | null, ...extra,
});

beforeEach(() => {
  db = new DbMinimo();
  db.tabelle.orders = [
    ordine("1", { client_name: "Mario Rossi", indirizzo_lavori: "Via Roma 1" }),
    ordine("2", { client_name: "Anna Rossi", indirizzo_lavori: "Via Po 3", status: "completato" }),
    ordine("3", { client_name: "Luca Verdi", customer_id: "cliente-bianchi" }),
    ordine("4", { client_name: "Paolo Rossi", deleted_at: "2026-09-01T00:00:00Z" }),
    { ...ordine("5", { client_name: "Mario Rossi" }), company_id: "altra" },
  ];
  db.tabelle.profiles = [{ id: "cliente-bianchi", company_id: "company", first_name: "Giulia", last_name: "Bianchi" }];
  db.tabelle.fatture_ricevute = [
    { id: "fr-1", company_id: "company", numero_fattura: "123/A", data_fattura: "2026-10-10", cedente_ragione_sociale: "Edilmix Srl", totale_documento: 1220, company_cost_id: null },
    { id: "fr-2", company_id: "altra", numero_fattura: "123/A", data_fattura: "2026-10-10", cedente_ragione_sociale: "Edilmix Srl", totale_documento: 99, company_cost_id: null },
  ];
  db.tabelle.invoices = [
    { id: "inv-1", company_id: "company", invoice_number: "45", issue_date: "2026-10-05", client_company_name: "Mario Rossi", total: 5000, order_id: "3", status: "issued", deleted_at: null },
    { id: "inv-2", company_id: "company", invoice_number: "46", issue_date: "2026-10-06", client_company_name: "Mario Rossi", total: 10, order_id: null, status: "cancelled", deleted_at: null },
  ];
  db.tabelle.company_costs = [];
  db.tabelle.order_employees = [];
  db.tabelle.order_campo_assignments = [];
  db.tabelle.campo_timbrature = [];
  db.tabelle.campo_rapportini = [];
  db.rpcs.fattura_assegna_commessa = (a) => ({ tipo: a.p_tipo, order_id: a.p_order_id, commessa: "ORD-1 · Mario Rossi", era_su: null });
  ctx = {
    supabase: db, company_id: "company", user_id: "titolare", employee_id: null, phone: "0000", role_grants: ["fatture.assegna"],
    locale: "it", waNumberId: "number", sessionId: null, kind: "admin", mediaCorrente: null,
  } as unknown as ToolCtx;
});

describe("trovare la fattura", () => {
  it("per numero o fornitore, solo nell'azienda, con cosa è e dove sta ora", async () => {
    const esito = await cercaFattura(ctx, { testo: "edilmix" });
    expect(esito.ok).toBe(true);
    const fatture = (esito as { data: { fatture: Array<{ fattura_id: string; tipo: string; descrizione: string }> } }).data.fatture;
    expect(fatture).toHaveLength(1);
    expect(fatture[0]).toMatchObject({ fattura_id: "fr-1", tipo: "ricevuta" });
    expect(fatture[0].descrizione).toMatch(/Fattura ricevuta n\. 123\/A del 10\/10\/2026 · Edilmix Srl · 1\.?220,00\s€ · su nessuna commessa/);
  });

  it("le fatture emesse annullate non escono; quelle su una commessa lo dicono", async () => {
    const fatture = ((await cercaFattura(ctx, { testo: "rossi" })) as { data: { fatture: Array<{ fattura_id: string; descrizione: string }> } }).data.fatture;
    expect(fatture.map((f) => f.fattura_id)).toEqual(["inv-1"]);
    expect(fatture[0].descrizione).toContain("ora su Luca Verdi · ORD-3");
  });

  it("se non trova niente lo dice e chiede un altro dettaglio", async () => {
    const esito = await cercaFattura(ctx, { testo: "nessuno" });
    expect(esito.user_message).toContain("Dimmi il numero esatto");
  });
});

describe("trovare la commessa di Rossi", () => {
  it("con più commesse di Rossi mostra l'elenco coi nomi, anche quella chiusa, mai cancellate o di altre aziende", async () => {
    const { pending, interactive } = await freezeConfirmation(ctx, "assegna_fattura", { fattura_id: "fr-1", tipo: "ricevuta", cantiere_hint: "Rossi" }, "msg", ADESSO);
    expect(pending.parametri?.order_id).toBeUndefined();
    expect(pending.cantieri?.map((c) => c.id).sort()).toEqual(["1", "2"]);
    expect(interactive.body.text).toContain("Fattura ricevuta n. 123/A");
    expect(interactive.body.text).toContain("Mario Rossi");
    expect(interactive.body.text).toContain("Anna Rossi");
    expect(rispostaCantiere(pending, null, "text", "2")).toEqual({ tipo: "cantiere", order_id: pending.cantieri![1].id });
  });

  it("con una sola commessa la propone con Sì / Altro / No; trova anche il cliente in anagrafica", async () => {
    const { pending, interactive } = await freezeConfirmation(ctx, "assegna_fattura", { fattura_id: "inv-1", tipo: "emessa", cantiere_hint: "Bianchi" }, "msg", ADESSO);
    expect(pending.parametri?.order_id).toBe("3");
    expect(interactive.body.text).toContain("Commessa: Luca Verdi · ORD-3 (come mi hai scritto)");
    expect(interactive.body.text).toContain("Fattura emessa n. 45");
  });

  it("la descrizione della fattura viene dal database, non dal modello", async () => {
    const { pending } = await freezeConfirmation(ctx, "assegna_fattura", { fattura_id: "fr-1", tipo: "ricevuta", cantiere_hint: "Verdi", fattura: "Fattura inventata da 1 €" }, "msg", ADESSO);
    expect(pending.parametri?.fattura).toContain("Edilmix Srl");
  });

  it("senza commessa o senza risultati chiede un dettaglio, senza errori tecnici", async () => {
    const senza = await freezeConfirmation(ctx, "assegna_fattura", { fattura_id: "fr-1", tipo: "ricevuta" }, "msg", ADESSO).catch((e) => e);
    expect(senza).toBeInstanceOf(ConfirmationReviewError);
    expect(senza.message).toContain("Scrivimi il cliente, l'indirizzo o il codice");
    const nessuna = await freezeConfirmation(ctx, "assegna_fattura", { fattura_id: "fr-1", tipo: "ricevuta", cantiere_hint: "Neri" }, "msg", ADESSO).catch((e) => e);
    expect(nessuna.message).toContain("Non trovo commesse per «Neri»");
    const altrui = await freezeConfirmation(ctx, "assegna_fattura", { fattura_id: "fr-2", tipo: "ricevuta", cantiere_hint: "Rossi" }, "msg", ADESSO).catch((e) => e);
    expect(altrui.message).toContain("Non trovo questa fattura");
  });
});

describe("assegnare", () => {
  it("chiama la funzione del database con azienda, persona, fattura e commessa", async () => {
    const esito = await assegnaFattura(ctx, { fattura_id: "fr-1", tipo: "ricevuta", order_id: "1" });
    expect(esito.ok).toBe(true);
    expect(db.rpcChiamate.at(-1)).toEqual({ nome: "fattura_assegna_commessa", args: {
      p_company_id: "company", p_user_id: "titolare", p_tipo: "ricevuta", p_fattura_id: "fr-1", p_order_id: "1",
    } });
    expect(esito.user_message).toBe("✅ Il costo è sulla commessa ORD-1 · Mario Rossi.");
  });

  it("solo l'amministratore", async () => {
    const esito = await assegnaFattura({ ...ctx, kind: "ufficio" } as ToolCtx, { fattura_id: "fr-1", tipo: "ricevuta", order_id: "1" });
    expect(esito).toMatchObject({ ok: false, error: "non_ammesso" });
    expect(db.rpcChiamate).toHaveLength(0);
  });

  it("riporta il motivo scritto dal database", async () => {
    db.rpc = (async () => ({ data: null as null, error: { code: "P0001", message: "Questa fattura è ripartita su più commesse: cambiala dall'app." } })) as unknown as DbMinimo["rpc"];
    const esito = await assegnaFattura(ctx, { fattura_id: "fr-1", tipo: "ricevuta", order_id: "1" });
    expect(esito.user_message).toBe("Questa fattura è ripartita su più commesse: cambiala dall'app.");
  });
});

describe("la migrazione", () => {
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20281019234500_fattura_assegna_commessa.sql"), "utf8");
  it("è aperta solo al service role e controlla azienda e amministratore", () => {
    expect(sql).toContain("revoke all on function public.fattura_assegna_commessa(uuid, uuid, text, uuid, uuid) from public, anon, authenticated;");
    expect(sql).toContain("grant execute on function public.fattura_assegna_commessa(uuid, uuid, text, uuid, uuid) to service_role;");
    expect(sql).toContain("role in ('company_admin', 'super_admin')");
    expect(sql).toContain("where id = p_order_id and company_id = p_company_id and deleted_at is null");
  });
  it("sposta la ripartizione al 100% insieme alla commessa e rifiuta quelle su più commesse", () => {
    expect(sql).toContain("jsonb_build_array(jsonb_build_object('order_id', p_order_id, 'pct', 100))");
    expect(sql).toContain("ripartita su più commesse");
  });
});
