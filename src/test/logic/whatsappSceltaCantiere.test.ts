// src/test/logic/whatsappSceltaCantiere.test.ts
/**
 * L'operaio manda una bolla o un rapportino su WhatsApp senza ricordare il
 * codice della commessa (18/10/2026): il bot propone il cantiere più probabile
 * e dice perché, oppure mostra l'elenco dei suoi cantieri aperti da toccare.
 * I cantieri sono quelli dell'app Campo: assegnazione diretta, squadra della
 * commessa, fasi. Le commesse chiuse, in bozza o cancellate non compaiono.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { DbMinimo } from "../helpers/edgeFinto";
import { commessaAperta } from "../../../supabase/functions/whatsapp-ai-processor/tools/shared/cantieriAperti";
import { sceltaCantiere, cantiereDalTesto } from "../../../supabase/functions/whatsapp-ai-processor/tools/shared/sceltaCantiere";
import {
  freezeConfirmation, frozenConfirmationValid, rispostaCantiere, confirmationReplyMatches, ConfirmationReviewError,
} from "../../../supabase/functions/whatsapp-ai-processor/frozenConfirmation";
import { rispostaAllaConferma } from "../../../supabase/functions/_shared/botOperativoConferme";
import type { ToolCtx } from "../../../supabase/functions/whatsapp-ai-processor/tools/shared/types";

const ADESSO = new Date("2026-10-18T09:00:00Z");
let db: DbMinimo;
let ctx: ToolCtx;

const commessa = (id: string, extra: Record<string, unknown> = {}) => ({
  id, company_id: "company", order_code: `ORD-${id}`, description: `Lavori ${id}`, client_name: null as string | null,
  indirizzo_lavori: `Via ${id} 1`, status: "confermato", work_start_date: null as string | null, work_end_date: null as string | null,
  updated_at: "2026-10-01T10:00:00Z", deleted_at: null as string | null, ...extra,
});

beforeEach(() => {
  db = new DbMinimo();
  db.tabelle.orders = [
    commessa("rossi"), commessa("verdi", { status: "in_corso" }), commessa("bianchi", { status: "active" }),
    commessa("chiusa", { status: "completato" }), commessa("cancellata", { deleted_at: "2026-09-01T00:00:00Z" }),
    commessa("altrui"),
  ];
  // Assegnazioni come nell'app Campo: quasi tutte stanno nella squadra della commessa.
  db.tabelle.order_employees = ["rossi", "verdi", "bianchi", "chiusa", "cancellata"].map((order_id) => ({ order_id, employee_id: "emp" }));
  db.tabelle.order_campo_assignments = [];
  db.tabelle.order_phase_assignments = [];
  db.tabelle.campo_timbrature = [];
  db.tabelle.campo_rapportini = [];
  ctx = {
    supabase: db, company_id: "company", user_id: "user", employee_id: "emp", phone: "0000", role_grants: ["ddt.write"],
    locale: "it", waNumberId: "number", sessionId: null, kind: "operaio", mediaCorrente: null,
  } as unknown as ToolCtx;
});

describe("quali cantieri sono aperti", () => {
  it("considera aperte le commesse confermate, in corso e attive; chiuse quelle completate, annullate o in bozza", () => {
    for (const s of ["confermato", "in_corso", "active", "sospeso"]) expect(commessaAperta(s), s).toBe(true);
    for (const s of ["completato", "annullato", "chiuso", "bozza"]) expect(commessaAperta(s), s).toBe(false);
  });

  it("elenca i cantieri della squadra dell'operaio, senza le commesse chiuse, cancellate o di altri", async () => {
    const { candidati } = await sceltaCantiere(ctx, {}, ADESSO);
    expect(candidati.map((c) => c.id).sort()).toEqual(["bianchi", "rossi", "verdi"]);
  });
});

describe("il cantiere proposto all'operaio", () => {
  it("propone quello dove ha timbrato oggi, e dice perché", async () => {
    db.tabelle.campo_timbrature = [{ company_id: "company", user_id: "user", order_id: "verdi", timestamp_evento: "2026-10-18T06:30:00Z" }];
    const { proposto } = await sceltaCantiere(ctx, {}, ADESSO);
    expect(proposto).toMatchObject({ id: "verdi", motivo: "hai timbrato lì oggi" });
  });

  it("propone quello dove ha lavorato ieri", async () => {
    db.tabelle.campo_rapportini = [{ company_id: "company", user_id: "user", order_id: "bianchi", data_lavoro: "2026-10-17" }];
    const { proposto } = await sceltaCantiere(ctx, {}, ADESSO);
    expect(proposto).toMatchObject({ id: "bianchi", motivo: "ci hai lavorato ieri" });
  });

  it("propone il cantiere che l'operaio nomina", async () => {
    expect((await sceltaCantiere(ctx, { hint: "Rossi" }, ADESSO)).proposto).toMatchObject({ id: "rossi", motivo: "come mi hai scritto" });
  });

  it("con un solo cantiere aperto propone quello", async () => {
    db.tabelle.order_employees = [{ order_id: "rossi", employee_id: "emp" }];
    expect((await sceltaCantiere(ctx, {}, ADESSO)).proposto).toMatchObject({ id: "rossi", motivo: "è l'unico tuo cantiere aperto" });
  });

  it("senza un cantiere chiaramente più probabile lascia scegliere dall'elenco", async () => {
    const scelta = await sceltaCantiere(ctx, {}, ADESSO);
    expect(scelta.proposto).toBeNull();
    expect(scelta.candidati).toHaveLength(3);
  });
});

describe("la conferma della bolla su WhatsApp", () => {
  const bolla = (righe = 3) => ({
    numero_ddt: "123", fornitore: "Fornitore Demo", data_ddt: "2026-10-18",
    righe: Array.from({ length: righe }, (_, i) => ({ descrizione: `Articolo ${i + 1}`, quantita: i + 1, unita_misura: "pz" })),
  });

  it("propone il cantiere con Sì, Altro cantiere e No, e un riepilogo leggibile", async () => {
    db.tabelle.campo_timbrature = [{ company_id: "company", user_id: "user", order_id: "verdi", timestamp_evento: "2026-10-18T06:30:00Z" }];
    const { pending, interactive } = await freezeConfirmation(ctx, "carica_ddt", bolla(), "message", ADESSO);
    expect(pending.parametri?.order_id).toBe("verdi");
    expect(interactive.type).toBe("button");
    const testo = interactive.body.text;
    expect(testo).toContain("Bolla n. 123 del 18/10/2026");
    expect(testo).toContain("Fornitore: Fornitore Demo");
    expect(testo).toContain("• Articolo 1 — 1 pz");
    expect(testo).toContain("Cantiere: ORD-verdi · Lavori verdi (hai timbrato lì oggi)");
    expect(testo).not.toContain("{");
    if (interactive.type === "button") {
      expect(interactive.action.buttons.map((b) => b.reply.title)).toEqual(["Sì", "Altro cantiere", "No"]);
    }
    expect(await frozenConfirmationValid(pending)).toBe(true);
  });

  it("una bolla con tante righe resta confermabile: le righe in più si contano", async () => {
    db.tabelle.order_employees = [{ order_id: "rossi", employee_id: "emp" }];
    const { interactive } = await freezeConfirmation(ctx, "carica_ddt", bolla(60), "message", ADESSO);
    expect(interactive.body.text.length).toBeLessThanOrEqual(1024);
    expect(interactive.body.text).toMatch(/…e altre \d+ righe/);
    expect(interactive.body.text).toContain("Articoli (60):");
  });

  it("senza un cantiere probabile mostra l'elenco: toccare un cantiere conferma", async () => {
    const { pending, interactive } = await freezeConfirmation(ctx, "carica_ddt", bolla(), "message", ADESSO);
    expect(pending.parametri?.order_id).toBeUndefined();
    expect(pending.lista_mostrata).toBe(true);
    expect(interactive.type).toBe("list");
    expect(interactive.body.text).toContain("Su quale cantiere?");
    // I nomi stanno nel testo, numerati: con due cantieri i bottoni mostrano solo il codice.
    expect(interactive.body.text).toMatch(/\n1\. ORD-\w+ · Lavori \w+/);
    if (interactive.type === "list") {
      const righe = interactive.action.sections[0].rows;
      expect(righe.at(-1)).toMatchObject({ id: `reject:${pending.id}`, title: "Annulla" });
      expect(righe.slice(0, -1).every((r, i) => r.id === `site:${pending.id}:${i}`)).toBe(true);
    }
    const secondo = pending.cantieri![1].id;
    const tocco = { interactive: { list_reply: { id: `site:${pending.id}:1` } } };
    expect(confirmationReplyMatches(pending, tocco, "interactive")).toBe(true);
    expect(rispostaCantiere(pending, tocco, "interactive", "")).toEqual({ tipo: "cantiere", order_id: secondo });
    expect(rispostaCantiere(pending, null, "text", "2")).toEqual({ tipo: "cantiere", order_id: secondo });
    expect(rispostaCantiere(pending, null, "text", "rossi")).toEqual({ tipo: "cantiere", order_id: "rossi" });
  });

  it("«Altro cantiere» apre l'elenco; un tocco su una domanda vecchia non sceglie niente", async () => {
    db.tabelle.campo_timbrature = [{ company_id: "company", user_id: "user", order_id: "verdi", timestamp_evento: "2026-10-18T06:30:00Z" }];
    const { pending } = await freezeConfirmation(ctx, "carica_ddt", bolla(), "message", ADESSO);
    expect(rispostaCantiere(pending, { interactive: { button_reply: { id: `other:${pending.id}` } } }, "interactive", "")).toEqual({ tipo: "altro" });
    expect(rispostaCantiere(pending, { interactive: { list_reply: { id: "site:vecchia:0" } } }, "interactive", "")).toBeNull();
    expect(rispostaCantiere(pending, null, "text", "2")).toBeNull();
  });

  it("l'elenco dei cantieri fa parte di ciò che si approva", async () => {
    const { pending } = await freezeConfirmation(ctx, "carica_ddt", bolla(), "message", ADESSO);
    const altro = { ...pending, cantieri: [{ id: "altrui", titolo: "ORD-altrui", dettaglio: "Lavori altrui" }] };
    expect(await frozenConfirmationValid(altro)).toBe(false);
  });

  it("chi non è su nessun cantiere aperto riceve un messaggio chiaro, non un errore generico", async () => {
    db.tabelle.order_employees = [];
    const errore = await freezeConfirmation(ctx, "crea_rapportino", { ore_lavorate: 8 }, "message", ADESSO).catch((e) => e);
    expect(errore).toBeInstanceOf(ConfirmationReviewError);
    expect(errore.message).toContain("Chiedi all'ufficio di aggiungerti alla squadra della commessa");
  });
});

describe("le risposte dell'operaio", () => {
  it("riconosce le conferme e i rifiuti di tutti i giorni", () => {
    for (const t of ["Sì", "sì, confermo", "ok procedi", "Si va bene", "ok grazie", "perfetto"]) expect(rispostaAllaConferma(t), t).toBe("si");
    for (const t of ["no", "No, annulla", "no grazie"]) expect(rispostaAllaConferma(t), t).toBe("no");
    for (const t of ["ok, ma cambia le ore", "sì ma metti 7 ore", "dopo"]) expect(rispostaAllaConferma(t), t).toBeNull();
  });

  it("un numero o un nome scelgono il cantiere solo se è uno", () => {
    const elenco = [{ id: "a", titolo: "ORD-1", dettaglio: "Villa Rossi — Via Roma 1" }, { id: "b", titolo: "ORD-2", dettaglio: "Casa Rossi — Via Po 3" }];
    expect(cantiereDalTesto("il 2", elenco)).toBe("b");
    expect(cantiereDalTesto("via po", elenco)).toBe("b");
    expect(cantiereDalTesto("rossi", elenco)).toBeNull();
    expect(cantiereDalTesto("7", elenco)).toBeNull();
  });
});
