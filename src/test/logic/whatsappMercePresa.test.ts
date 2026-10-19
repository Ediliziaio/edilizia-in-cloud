// src/test/logic/whatsappMercePresa.test.ts
/**
 * Bolla e scontrino mandati dall'operaio su WhatsApp fanno la stessa strada
 * dell'app Campo (18/10/2026): finiscono in «Merce presa» sul cantiere
 * confermato, l'ufficio li verifica e diventano costo della commessa e, se ha
 * pagato l'operaio, il suo rimborso. La foto passa nel deposito dei documenti
 * di cantiere. Ufficio e amministratore restano sui percorsi di prima.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DbMinimo } from "../helpers/edgeFinto";
import { caricaDDT } from "../../../supabase/functions/whatsapp-ai-processor/tools/operaio/carica_ddt";
import { caricaScontrino } from "../../../supabase/functions/whatsapp-ai-processor/tools/operaio/carica_scontrino";
import { freezeConfirmation, ConfirmationReviewError } from "../../../supabase/functions/whatsapp-ai-processor/frozenConfirmation";
import type { ToolCtx } from "../../../supabase/functions/whatsapp-ai-processor/tools/shared/types";

let db: DbMinimo;
let ctx: ToolCtx;
let caricati: string[];

beforeEach(() => {
  db = new DbMinimo();
  caricati = [];
  db.tabelle.orders = [{ id: "ordine", company_id: "company", order_code: "ORD-7", description: "Villa Rossi", status: "confermato", deleted_at: null }];
  db.tabelle.order_employees = [{ order_id: "ordine", employee_id: "emp" }];
  db.rpcs.campo_acquisto_registra_whatsapp = () => "acquisto-1";
  (db as unknown as { storage: unknown }).storage = {
    from: (bucket: string) => ({
      download: async () => ({ data: new Blob(["foto"], { type: "image/jpeg" }), error: null as null }),
      upload: async (path: string) => { caricati.push(`${bucket}:${path}`); return { data: { path }, error: null as null }; },
    }),
  };
  ctx = {
    supabase: db, company_id: "company", user_id: null, employee_id: "emp", phone: "0000", role_grants: ["ddt.write", "spese.write"],
    locale: "it", waNumberId: "number", sessionId: null, kind: "operaio", requestId: "messaggio-1",
    mediaCorrente: { storagePath: "company/2026-10/foto.jpg", url: "https://invalid.test/foto.jpg", tipo: "image" },
  } as unknown as ToolCtx;
});

const chiamata = () => db.rpcChiamate.find((c) => c.nome === "campo_acquisto_registra_whatsapp")!.args;

describe("la bolla dell'operaio", () => {
  it("va in Merce presa sul cantiere confermato, a nome del dipendente, con la foto", async () => {
    const esito = await caricaDDT(ctx, {
      numero_ddt: "123", fornitore: "Fornitore Demo", data_ddt: "18/10/2026", order_id: "ordine",
      righe: [{ descrizione: "Cemento", quantita: 10, unita_misura: "sacchi" }], riferimento_ordine: "ODA-9",
    });
    expect(esito.ok).toBe(true);
    expect(chiamata()).toMatchObject({
      p_company_id: "company", p_user_id: null, p_employee_id: "emp", p_order_id: "ordine",
      p_modalita: "ritiro_ordine", p_tipo_documento: "bolla", p_numero: "123", p_data: "2026-10-18",
      p_righe: [{ descrizione: "Cemento", quantita: 10, unita: "sacchi" }],
    });
    expect(chiamata().p_lettura).toMatchObject({ fonte: "whatsapp", messaggio: "messaggio-1", riferimento_ordine: "ODA-9" });
    expect(caricati).toHaveLength(1);
    expect(caricati[0]).toMatch(/^campo-rapportini:company\/ordine\/acquisti\/.+\.jpg$/);
    expect(chiamata().p_foto_path).toBe(caricati[0].split(":")[1]);
    expect(esito.user_message).toContain("messa su ORD-7 · Villa Rossi");
    expect(esito.user_message).toContain("diventa costo della commessa");
    // Il carico di magazzino resta per l'ufficio: dall'operaio non parte.
    expect(db.scritture.filter((w) => w.tabella === "email_ddt_carico" || w.tabella === "email_documento_estratto")).toHaveLength(0);
  });

  it("senza cantiere non registra niente e dice cosa fare", async () => {
    const esito = await caricaDDT(ctx, { numero_ddt: "123", fornitore: "Fornitore Demo" });
    expect(esito).toMatchObject({ ok: false, error: "site_missing" });
    expect(db.rpcChiamate).toHaveLength(0);
  });

  it("riporta all'operaio il motivo scritto dal database («già caricato da…»)", async () => {
    db.rpc = (async () => ({ data: null as null, error: { code: "P0001", message: "Questo documento è già stato caricato da Luca il 17/10: non serve rimandarlo." } })) as unknown as DbMinimo["rpc"];
    const esito = await caricaDDT(ctx, { numero_ddt: "123", fornitore: "Fornitore Demo", order_id: "ordine" });
    expect(esito).toMatchObject({ ok: false, user_message: "Questo documento è già stato caricato da Luca il 17/10: non serve rimandarlo." });
  });
});

describe("lo scontrino dell'operaio", () => {
  it("pagato da lui: Merce presa con rimborso", async () => {
    const esito = await caricaScontrino(ctx, { importo: 45.5, esercente: "Ferramenta Demo", data: "2026-10-18", order_id: "ordine", pagato_da: "operaio" });
    expect(esito.ok).toBe(true);
    expect(chiamata()).toMatchObject({ p_modalita: "pagato_da_me", p_tipo_documento: "scontrino", p_totale: 45.5, p_fornitore: "Ferramenta Demo" });
    expect(esito.user_message).toContain("ti viene rimborsato");
    expect(db.scritture.filter((w) => w.tabella === "prima_nota_entries")).toHaveLength(0);
  });

  it("pagato dall'azienda: Merce presa sul conto dell'azienda", async () => {
    await caricaScontrino(ctx, { importo: 12, order_id: "ordine", pagato_da: "azienda" });
    expect(chiamata()).toMatchObject({ p_modalita: "conto_azienda" });
  });

  it("chiede chi l'ha pagato prima ancora della conferma", async () => {
    const errore = await freezeConfirmation(ctx, "carica_scontrino", { importo: 12, esercente: "Ferramenta Demo" }, "messaggio").catch((e) => e);
    expect(errore).toBeInstanceOf(ConfirmationReviewError);
    expect(errore.message).toContain("chi l'ha pagato");
    const conferma = await freezeConfirmation(ctx, "carica_scontrino", { importo: 12, esercente: "Ferramenta Demo", pagato_da: "operaio" }, "messaggio");
    expect(conferma.interactive.body.text).toContain("Pagato da te: te lo rimborsano dopo la verifica");
    expect(conferma.pending.parametri?.order_id).toBe("ordine");
  });

  it("ufficio e amministratore restano sulla Prima Nota", async () => {
    const esito = await caricaScontrino({ ...ctx, kind: "ufficio", user_id: "user" } as ToolCtx, { importo: 20, esercente: "Bar" });
    expect(esito.ok).toBe(true);
    expect(db.scritture.filter((w) => w.tabella === "prima_nota_entries")).toHaveLength(1);
    expect(db.rpcChiamate).toHaveLength(0);
  });
});

describe("la migrazione di Merce presa da WhatsApp", () => {
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20281018120000_campo_acquisti_da_whatsapp.sql"), "utf8");

  it("apre la registrazione solo al service role", () => {
    expect(sql).toMatch(/revoke all on function public\.campo_acquisto_registra_whatsapp\([^)]*\) from public, anon, authenticated;/);
    expect(sql).toMatch(/grant execute on function public\.campo_acquisto_registra_whatsapp\([^)]*\) to service_role;/);
  });

  it("controlla che la persona sia dell'azienda e che il cantiere sia suo, come l'app", () => {
    expect(sql).toContain("from public.profiles where id = p_user_id and company_id = p_company_id");
    expect(sql).toContain("from public.employees where id = p_employee_id and company_id = p_company_id and is_active");
    expect(sql).toContain("from public.order_employees oe");
    expect(sql).toContain("Non puoi segnare merce per un cantiere che non ti è assegnato.");
    expect(sql).toContain("Questo documento è già stato caricato da");
    // La bolla fotografata senza articoli letti passa: li completa l'ufficio.
    expect(sql).toContain("and not (v_tipo = 'bolla' and nullif(btrim(coalesce(p_foto_path, '')), '') is not null)");
  });

  it("tocca la verifica dell'ufficio solo dal corpo censito, con lock_timeout", () => {
    expect(sql).toContain("set local lock_timeout = '3s';");
    expect(sql).toContain("il punto da aggiornare non è unico");
    expect(sql).toContain("position('from public.employees where id = a.employee_id' in v_def) > 0");
    expect(sql).toContain("from public.employees where id = a.employee_id;");
  });
});
