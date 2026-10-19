// src/test/logic/whatsappAffidabilita.test.ts
/**
 * Il bot WhatsApp non lascia nessuno senza risposta e non promette cose che
 * non fa (18/10/2026):
 *  - un preventivo con tante voci si conferma lo stesso: l'elenco completo
 *    arriva prima dei bottoni, e si approva proprio quell'elenco;
 *  - «sì, fallo», «ok mandalo» valgono come conferma;
 *  - foto e vocali dei clienti diventano un ticket per l'ufficio, con una
 *    risposta da cliente, non da operaio sconosciuto;
 *  - un numero sconosciuto apre un solo ticket al giorno, in Assistenza.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
// Il client AI carica moduli remoti: per foto e vocali dei clienti non serve.
vi.mock("../../../supabase/functions/whatsapp-ai-processor/openai", () => ({ callOpenAI: vi.fn() }));
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DbMinimo } from "../helpers/edgeFinto";
import { freezeConfirmation, frozenConfirmationValid, riepilogoPreventivo, aPezzi } from "../../../supabase/functions/whatsapp-ai-processor/frozenConfirmation";
import { rispostaAllaConferma } from "../../../supabase/functions/_shared/botOperativoConferme";
import { gestisciMessaggioCliente } from "../../../supabase/functions/whatsapp-ai-processor/cliente";
import { ticketPerUfficio } from "../../../supabase/functions/whatsapp-ai-processor/ticketUfficio";
import type { ToolCtx } from "../../../supabase/functions/whatsapp-ai-processor/tools/shared/types";

let db: DbMinimo;
beforeEach(() => { db = new DbMinimo(); });

describe("preventivo da salvare", () => {
  const voci = (n: number) => Array.from({ length: n }, (_, i) => ({
    name: `Voce di lavoro numero ${i + 1} con una descrizione piuttosto lunga`, quantity: 2, unit_price: 50, unit_of_measure: "mq", vat_rate: 10, item_type: "material",
  }));
  const ctx = () => ({ supabase: db, company_id: "company", user_id: "u", employee_id: null, kind: "admin", waNumberId: "n", sessionId: null, mediaCorrente: null } as unknown as ToolCtx);

  it("con poche voci mostra tutto nei bottoni, con i totali", async () => {
    const { interactive, preambolo } = await freezeConfirmation(ctx(), "salva_preventivo_bozza", { client_name: "Mario Rossi", items: voci(3) }, "m");
    expect(preambolo).toBeUndefined();
    expect(interactive.body.text).toContain("1. Voce di lavoro numero 1");
    expect(interactive.body.text).toMatch(/Imponibile (€\s)?300,00(\s€)? · IVA 10% (€\s)?30,00(\s€)? · Totale (€\s)?330,00/);
    expect(interactive.body.text).toContain("Nulla viene inviato al cliente");
  });

  it("con tante voci manda prima l'elenco completo, poi bottoni brevi; l'impronta copre le voci", async () => {
    const { pending, interactive, preambolo } = await freezeConfirmation(ctx(), "salva_preventivo_bozza", { client_name: "Mario Rossi", items: voci(40) }, "m");
    expect(preambolo!.join("\n")).toContain("40. Voce di lavoro numero 40");
    expect(preambolo!.every((p) => p.length <= 3500)).toBe(true);
    expect(interactive.body.text.length).toBeLessThanOrEqual(1024);
    expect(interactive.body.text).toContain("40 voci");
    expect(await frozenConfirmationValid(pending)).toBe(true);
    const altro = { ...pending, parametri: { ...pending.parametri, items: voci(39) } };
    expect(await frozenConfirmationValid(altro)).toBe(false);
  });

  it("il riepilogo somma con aliquote diverse e divide i messaggi senza spezzare righe", () => {
    const r = riepilogoPreventivo({ client_name: "A", items: [{ name: "x", quantity: 1, unit_price: 100, vat_rate: 22 }, { name: "y", quantity: 1, unit_price: 100, vat_rate: 10 }] });
    expect(r.totali).toMatch(/^Imponibile (€\s)?200,00(\s€)? · IVA (€\s)?32,00(\s€)? · Totale (€\s)?232,00(\s€)?$/);
    expect(aPezzi(["aaa", "bbb", "ccc"], 7)).toEqual(["aaa\nbbb", "ccc"]);
  });
});

describe("le conferme di tutti i giorni", () => {
  it("«sì» con il verbo di ciò che si conferma vale come sì", () => {
    for (const t of ["sì, fallo", "ok mandalo", "si salvalo", "sì registralo", "vai procedi"]) expect(rispostaAllaConferma(t), t).toBe("si");
    for (const t of ["sì ma cambia il prezzo", "mandalo a Rossi"]) expect(rispostaAllaConferma(t), t).toBeNull();
  });
});

describe("il cliente che manda una foto o un vocale", () => {
  it("riceve una risposta da cliente e l'ufficio trova un ticket in Assistenza", async () => {
    db.tabelle.marketing_contacts = [{ id: "c1", company_id: "company", first_name: "Anna", last_name: "Neri", phone: "+393331234567" }];
    db.tabelle.orders = [];
    const risposte: string[] = [];
    const gestito = await gestisciMessaggioCliente(db as never,
      { id: "m1", company_id: "company", wa_number_id: "n", from_phone: "393331234567", message_type: "image", content_text: null },
      async (_m, t) => { risposte.push(t); });
    expect(gestito).toBe(true);
    expect(risposte[0]).toContain("ho ricevuto la foto");
    expect(db.tabelle.tickets[0]).toMatchObject({ company_id: "company", fonte: "cliente", status: "aperto", customer_id: null });
    expect(db.tabelle.tickets[0].subject).toContain("393331234567");
  });
});

describe("il numero che il bot non riconosce", () => {
  it("apre un solo ticket al giorno in Assistenza", async () => {
    const t = { companyId: "company", telefono: "393339999999", fonte: "api" as const, titolo: "Numero WhatsApp non riconosciuto", descrizione: "x" };
    expect(await ticketPerUfficio(db as never, t)).toBe(true);
    db.tabelle.tickets[0].created_at = new Date().toISOString();
    expect(await ticketPerUfficio(db as never, t)).toBe(true);
    expect(db.tabelle.tickets).toHaveLength(1);
    expect(db.tabelle.support_tickets ?? []).toHaveLength(0);
  });

  it("dice «ho avvisato l'ufficio» solo se il ticket c'è davvero", () => {
    const codice = readFileSync(resolve(process.cwd(), "supabase/functions/whatsapp-ai-processor/index.ts"), "utf8");
    expect(codice).toMatch(/const avvisato = operationalSettings\.unknown_worker_mode === "create_review_ticket"\s*&& await createUnknownWorkerTicket/);
    expect(codice).toContain("avvisato\n          ? \"Non ti riconosco ancora. Ho avvisato l'ufficio");
  });
});

describe("una conversazione non resta bloccata", () => {
  it("il recupero chiude come fallito, senza rilanciarlo, un messaggio fermo «in elaborazione» da oltre 15 minuti", () => {
    const codice = readFileSync(resolve(process.cwd(), "supabase/functions/whatsapp-ai-recovery/index.ts"), "utf8");
    expect(codice).toMatch(/\.update\(\{ processing_status: "failed", processing_error: "stale_processing" \}\)\s*\.eq\("direction", "inbound"\)\.eq\("processing_status", "processing"\)/);
    // Anche chi non ha mai segnato un tentativo, e chi ha scritto viene avvisato.
    expect(codice).toContain("last_processing_attempt_at.lt.${fermo},and(last_processing_attempt_at.is.null,created_at.lt.${fermo})");
    expect(codice).toContain("Puoi rimandarlo?");
    expect(codice).toContain("Date.now() - 15 * 60_000");
  });
});
