/**
 * Scheda contatto marketing: il WhatsApp passa da whatsapp-send (25/09/2026).
 *
 * Prima send-contact-message chiamava Meta da sé: guardava solo che il
 * servizio fosse acceso, non scalava il credito, non registrava il messaggio
 * in whatsapp_messages (niente esito della consegna, modelli come
 * «📋 Template: nome») e lo scriveva in contact_messages. Ora fa come
 * Conversazioni, l'invio rapido e le automazioni.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  erroreInvioWhatsApp,
  richiestaWhatsAppSend,
} from "../../../supabase/functions/send-contact-message/invioWhatsApp";
import { classificaBloccoPagamento } from "@/lib/creditoEsaurito";

const leggi = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("la richiesta a whatsapp-send", () => {
  const base = { companyId: "azienda", waNumberId: "numero", to: "393331234567", contactId: "contatto", testo: "Ciao" };

  it("il testo libero va in text, col contatto e il numero scelto", () => {
    expect(richiestaWhatsAppSend({ ...base, modello: null })).toEqual({
      company_id: "azienda",
      wa_number_id: "numero",
      to: "393331234567",
      contact_id: "contatto",
      text: "Ciao",
    });
  });

  it("col modello parte il modello, non il testo del composer («📋 nome»)", () => {
    const richiesta = richiestaWhatsAppSend({
      ...base,
      testo: "📋 richiesta_info_fotovoltaico",
      modello: { name: "richiesta_info_fotovoltaico", language: "it", variables: ["Florin"] },
    });
    expect(richiesta.template).toEqual({ name: "richiesta_info_fotovoltaico", language: "it", variables: ["Florin"] });
    expect(richiesta).not.toHaveProperty("text");
    expect(richiesta.contact_id).toBe("contatto");
  });

  it("senza un numero nuovo whatsapp-send usa il vecchio numero unico", () => {
    expect(richiestaWhatsAppSend({ ...base, waNumberId: null, modello: null }).wa_number_id).toBeNull();
  });
});

describe("gli errori di whatsapp-send, detti a chi ha premuto «Invia»", () => {
  it("finestra delle 24 ore chiusa: 422 e cosa fare", () => {
    const e = erroreInvioWhatsApp(422, { error: "Finestra 24h chiusa", code: "window_closed" });
    expect(e.status).toBe(422);
    expect(e.code).toBe("window_closed");
    expect(e.error).toMatch(/più di 24 ore.*template approvato/);
  });

  it("credito finito: 402, la frase di whatsapp-send e il codice che apre la ricarica", () => {
    const esito = {
      error: "insufficient_credits",
      message: "Crediti WhatsApp esauriti (saldo 0.0000 €, servono 0.0006 € per messaggio). Ricarica da Impostazioni → Crediti.",
      saldo_eur: 0,
    };
    const e = erroreInvioWhatsApp(402, esito);
    expect(e).toEqual({ status: 402, code: "insufficient_credits", error: esito.message });
    expect(classificaBloccoPagamento(e.status, { ...e, saldo_eur: 0 })).toBe("credits");
  });

  it("carta mancante e add-on spento: 402, ognuno col suo dialog", () => {
    const carta = erroreInvioWhatsApp(402, {
      error: "Registra una carta di pagamento aziendale per usare questo strumento (Impostazioni → Fatturazione).",
      code: "payment_method_required",
    });
    expect(carta.status).toBe(402);
    expect(carta.error).toMatch(/^Registra una carta/);
    expect(classificaBloccoPagamento(carta.status, carta)).toBe("payment");

    const addon = erroreInvioWhatsApp(402, {
      error: "WhatsApp Business non è attivo per questa azienda: va attivato l'add-on WhatsApp.",
      code: "whatsapp_addon_required",
    });
    expect(addon.status).toBe(402);
    expect(classificaBloccoPagamento(addon.status, addon)).toBe("addon_whatsapp");
  });

  it("servizio spento dal super admin: 403 con la frase", () => {
    expect(
      erroreInvioWhatsApp(403, { error: "whatsapp_disabled", message: "Il servizio WhatsApp è disattivato per questa azienda." }),
    ).toEqual({ status: 403, code: "whatsapp_disabled", error: "Il servizio WhatsApp è disattivato per questa azienda." });
  });

  it("credito non verificabile: non un 402, che aprirebbe il dialog della carta", () => {
    const e = erroreInvioWhatsApp(402, { error: "credit_check_failed", message: "Impossibile verificare il credito WhatsApp: timeout" });
    expect(e.status).toBe(503);
    expect(e.error).toMatch(/riprova/);
    expect(classificaBloccoPagamento(e.status, e)).toBeNull();
  });

  it("Meta rifiuta: 502 col motivo di Meta", () => {
    const e = erroreInvioWhatsApp(502, { error: "(#131030) Recipient phone number not in allowed list" });
    expect(e).toEqual({
      status: 502,
      code: null,
      error: "WhatsApp ha rifiutato il messaggio: (#131030) Recipient phone number not in allowed list",
    });
  });

  it("gli altri errori passano con la frase di whatsapp-send; un 401 interno non arriva all'utente come 401", () => {
    expect(erroreInvioWhatsApp(400, { error: "WhatsApp non configurato per questa azienda" })).toEqual({
      status: 400,
      code: null,
      error: "WhatsApp non configurato per questa azienda",
    });
    expect(erroreInvioWhatsApp(401, { error: "Unauthorized" }).status).toBe(502);
    expect(erroreInvioWhatsApp(500, {}).error).toBe("Invio WhatsApp non riuscito (errore 500).");
  });
});

describe("send-contact-message: il ramo WhatsApp", () => {
  const src = leggi("supabase/functions/send-contact-message/index.ts");
  const ramo = src.slice(src.indexOf('if (channel === "whatsapp") {'), src.indexOf('let status = "sent";'));

  it("non chiama più Meta: passa da whatsapp-send con la chiave di servizio", () => {
    expect(ramo.length).toBeGreaterThan(0);
    expect(src).not.toContain("graph.facebook.com");
    expect(src).not.toMatch(/import[^;]*resolveWhatsAppSender/);
    expect(src).not.toContain("resolveWhatsAppSender(");
    expect(ramo).toContain("/functions/v1/whatsapp-send");
    expect(ramo).toContain('Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`');
  });

  it("scrive al numero come lo vuole WhatsApp, e il messaggio resta sul contatto", () => {
    expect(ramo).toContain("const to = numeroWhatsApp(contact.phone);");
    expect(ramo).toContain("companyId: contact.company_id,");
    expect(ramo).toContain("contactId: contact.id,");
    expect(ramo).toContain("modello: waTemplate,");
  });

  it("non scrive contact_messages (comparirebbe due volte), le attività del contatto sì", () => {
    expect(ramo).not.toContain('from("contact_messages")');
    expect(ramo).toContain('from("marketing_contact_activities")');
    // Il ramo risponde da sé: l'insert in contact_messages resta a email e SMS.
    expect(ramo).toMatch(/return new Response\(\s*JSON\.stringify\(\{ success: true, status: "sent"/);
    expect(src.indexOf('from("contact_messages")')).toBeGreaterThan(src.indexOf('let status = "sent";'));
  });

  it("gli errori arrivano all'app col loro stato e codice", () => {
    expect(ramo).toContain("erroreInvioWhatsApp(invio.status, esito)");
    expect(ramo).toContain("{ status: errore.status,");
    expect(ramo).toContain("code: errore.code,");
  });

  it("opt-out, azienda dell'utente e utente bloccato vengono prima dell'invio", () => {
    const posInvio = src.indexOf("/functions/v1/whatsapp-send");
    for (const passo of [
      'channel === "whatsapp" && contact.optout_whatsapp',
      "profile?.company_id !== contact.company_id",
      'supabase.rpc("utente_bloccato")',
    ]) {
      expect(src.indexOf(passo), passo).toBeGreaterThan(-1);
      expect(src.indexOf(passo), passo).toBeLessThan(posInvio);
    }
  });

  it("il numero scelto vale se è dell'azienda del contatto, se no il più recente attivo e verificato", () => {
    const f = src.slice(src.indexOf("async function numeroMittente("), src.indexOf("Deno.serve("));
    expect(f).toContain('.eq("company_id", companyId)');
    expect(f).toContain('.is("deleted_at", null)');
    expect(f).toContain('.not("access_token_encrypted", "is", null)');
    expect(f).toMatch(/\.eq\("stato", "active"\)\s*\.eq\("webhook_verified", true\)/);
    expect(ramo).toContain("numeroMittente(adminClient, contact.company_id, wa_number_id)");
  });
});

describe("whatsapp-send: la piattaforma non registra una carta", () => {
  const invio = leggi("supabase/functions/whatsapp-send/index.ts");

  it("il controllo della carta salta solo Platform Admin CRM", () => {
    expect(invio).toContain('import { PLATFORM_ADMIN_COMPANY_ID } from "../_shared/platformAutomation.ts";');
    expect(invio).toMatch(
      /if \(companyId !== PLATFORM_ADMIN_COMPANY_ID\) \{\s*const pmCheck = await checkPaymentMethod\(adminClient, companyId\);/,
    );
    expect(leggi("supabase/functions/_shared/platformAutomation.ts")).toContain(
      'PLATFORM_ADMIN_COMPANY_ID = "00000000-0000-0000-0000-000000000001"',
    );
  });

  it("add-on e credito restano per tutti", () => {
    expect(invio).toContain('addonWhatsAppAttivo(adminClient, companyId, { seNonVerificabile: "consenti" })');
    expect(invio).toContain("addebitaMessaggioWhatsApp(");
  });
});

describe("la scheda contatto: il motivo nel messaggio, la cronologia aggiornata", () => {
  const pagina = leggi("src/pages/azienda/marketing/MarketingContactDetail.tsx");
  const inizio = pagina.indexOf('supabase.functions.invoke("send-contact-message"');
  const invio = pagina.slice(inizio, pagina.indexOf("onError:", inizio));

  it("l'errore mostra il corpo della risposta, non «non-2xx status code»", () => {
    expect(inizio).toBeGreaterThan(-1);
    expect(invio).toContain("if (error) throw new Error(await readInvokeError(error));");
  });

  it("dopo l'invio si ricaricano i messaggi della cronologia, WhatsApp compreso", () => {
    expect(invio).toContain('queryKey: ["unified_messages", id]');
    expect(invio).toContain('queryKey: ["unified_wa", companyId, id]');
  });
});
