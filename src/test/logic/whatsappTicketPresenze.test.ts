// src/test/logic/whatsappTicketPresenze.test.ts
/**
 * Su WhatsApp, come dall'app Campo (18/10/2026):
 *  - un problema in cantiere diventa un ticket e l'ufficio riceve la notifica
 *    sul telefono (chi ha l'app e non è in silenzio);
 *  - entrata e uscita valgono anche per chi non ha l'account, e l'entrata va
 *    sul cantiere quando è chiaro quale;
 *  - la foto va sul cantiere più probabile, o il bot chiede da un elenco.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { DbMinimo } from "../helpers/edgeFinto";
import { creaSegnalazione } from "../../../supabase/functions/whatsapp-ai-processor/tools/operaio/crea_segnalazione";
import { registraPresenza } from "../../../supabase/functions/whatsapp-ai-processor/tools/operaio/registra_presenza";
import { caricaFotoCantiere } from "../../../supabase/functions/whatsapp-ai-processor/tools/operaio/carica_foto_cantiere";
import { freezeConfirmation } from "../../../supabase/functions/whatsapp-ai-processor/frozenConfirmation";
import type { ToolCtx } from "../../../supabase/functions/whatsapp-ai-processor/tools/shared/types";

let db: DbMinimo;
let ctx: ToolCtx;
const ADESSO = new Date("2026-10-18T06:00:00Z");

beforeEach(() => {
  db = new DbMinimo();
  db.tabelle.orders = [
    { id: "rossi", company_id: "company", order_code: "ORD-7", description: "Villa Rossi", status: "confermato", deleted_at: null, indirizzo_lavori: "Via Roma 1" },
    { id: "verdi", company_id: "company", order_code: "ORD-8", description: "Casa Verdi", status: "in_corso", deleted_at: null, indirizzo_lavori: "Via Po 3" },
  ];
  db.tabelle.order_employees = [{ order_id: "rossi", employee_id: "emp" }];
  db.tabelle.employees = [{ id: "emp", company_id: "company", first_name: "Mario", last_name: "Bianchi" }];
  db.tabelle.user_roles = [{ user_id: "ufficio-1", role: "company_admin" }, { user_id: "ufficio-2", role: "company_staff" }, { user_id: "altrove", role: "company_admin" }];
  db.tabelle.profiles = [{ id: "ufficio-1", company_id: "company" }, { id: "ufficio-2", company_id: "company" }, { id: "altrove", company_id: "altra" }];
  db.tabelle.hr_profili = [{ id: "profilo-emp", company_id: "company", employee_id: "emp", attivo: true }];
  db.rpcs.utente_ha_dispositivi = (a) => a.p_user !== "ufficio-2";
  db.rpcs.utente_in_silenzio = () => false;
  db.rpcs.link_notifica_per_utente = (a) => `https://app.local${a.p_url}`;
  db.rpcs.campo_push_invia = () => null;
  ctx = {
    supabase: db, company_id: "company", user_id: null, employee_id: "emp", phone: "393330000000", role_grants: [],
    locale: "it", waNumberId: "number", sessionId: null, kind: "operaio", mediaCorrente: null,
  } as unknown as ToolCtx;
});

describe("un problema in cantiere", () => {
  it("diventa un ticket dal campo sul cantiere dell'operaio, e l'ufficio lo riceve sul telefono", async () => {
    const esito = await creaSegnalazione(ctx, { descrizione: "Perde un tubo al piano terra", urgenza: "alta" });
    expect(esito.ok).toBe(true);
    expect(db.tabelle.tickets[0]).toMatchObject({
      company_id: "company", order_id: "rossi", customer_id: null, fonte: "campo", status: "aperto",
      priorita: "alta", priority: "alta", subject: "ORD-7: Perde un tubo al piano terra",
    });
    expect(db.tabelle.tickets[0].internal_notes).toContain("Arrivato su WhatsApp da Mario Bianchi");
    const push = db.rpcChiamate.filter((c) => c.nome === "campo_push_invia");
    // Solo chi è di questa azienda e ha l'app sul telefono.
    expect(push.map((c) => c.args.p_user_ids)).toEqual([["ufficio-1"]]);
    expect(push[0].args).toMatchObject({ p_title: "Urgente: problema dal cantiere", p_url: `https://app.local/azienda/assistenza/${db.tabelle.tickets[0].id}` });
    expect(esito.user_message).toContain("L'ufficio l'ha ricevuta adesso");
    expect(db.tabelle.cantiere_segnalazioni ?? []).toHaveLength(0);
  });

  it("senza un cantiere chiaro il ticket arriva lo stesso all'ufficio", async () => {
    db.tabelle.order_employees = [{ order_id: "rossi", employee_id: "emp" }, { order_id: "verdi", employee_id: "emp" }];
    const esito = await creaSegnalazione(ctx, { descrizione: "Manca il ponteggio" });
    expect(esito.ok).toBe(true);
    expect(db.tabelle.tickets[0]).toMatchObject({ order_id: null, priorita: "media", priority: "normale" });
  });
});

describe("entrata e uscita", () => {
  it("valgono anche senza account: la timbratura va sul profilo del personale del dipendente", async () => {
    const esito = await registraPresenza(ctx, { tipo: "entrata", ora: "07:30", data_evento: "2026-10-18", order_id: "rossi" });
    expect(esito.ok).toBe(true);
    expect(db.tabelle.hr_timbrature[0]).toMatchObject({ profilo_id: "profilo-emp", tipo: "entrata", order_id: "rossi" });
    expect(esito.user_message).toContain("su ORD-7 · Villa Rossi");
  });

  it("l'entrata propone il cantiere quando è chiaro; senza, si timbra lo stesso", async () => {
    const una = await freezeConfirmation(ctx, "registra_presenza", { tipo: "entrata" }, "messaggio", ADESSO);
    expect(una.pending.parametri?.order_id).toBe("rossi");
    expect(una.interactive.body.text).toContain("Cantiere: ORD-7 · Villa Rossi (è l'unico tuo cantiere aperto)");
    db.tabelle.order_employees.push({ order_id: "verdi", employee_id: "emp" });
    const due = await freezeConfirmation(ctx, "registra_presenza", { tipo: "entrata" }, "messaggio", ADESSO);
    expect(due.pending.parametri?.order_id).toBeUndefined();
    expect(due.interactive.type).toBe("button");
    const uscita = await freezeConfirmation(ctx, "registra_presenza", { tipo: "uscita" }, "messaggio", ADESSO);
    expect(uscita.pending.parametri?.order_id).toBeUndefined();
  });
});

describe("la foto di cantiere", () => {
  const conFoto = () => ({ ...ctx, mediaCorrente: { storagePath: "company/2026-10/f.jpg", url: "https://invalid.test/f.jpg", tipo: "image" } }) as ToolCtx;
  beforeEach(() => {
    (db as unknown as { storage: unknown }).storage = {
      from: () => ({
        download: async () => ({ data: new Blob(["x"], { type: "image/jpeg" }), error: null as null }),
        upload: async (path: string) => ({ data: { path }, error: null as null }),
        remove: async () => ({ data: null as null, error: null as null }),
      }),
    };
  });

  it("va sul cantiere più probabile e lo dice", async () => {
    const esito = await caricaFotoCantiere(conFoto(), { descrizione: "Getto solaio" });
    expect(esito.ok).toBe(true);
    expect(db.tabelle.foto_cantiere[0]).toMatchObject({ order_id: "rossi", source: "whatsapp" });
    expect(esito.user_message).toBe("✅ Foto salvata su ORD-7 · Villa Rossi (è l'unico tuo cantiere aperto).");
  });

  it("se non è chiaro chiede da un elenco numerato", async () => {
    db.tabelle.order_employees.push({ order_id: "verdi", employee_id: "emp" });
    const esito = await caricaFotoCantiere(conFoto(), {});
    expect(esito).toMatchObject({ ok: false, error: "cantiere_ambiguous" });
    expect(esito.ok === false && esito.user_message).toMatch(/1\. ORD-\d.*\n2\. ORD-\d/);
  });
});
