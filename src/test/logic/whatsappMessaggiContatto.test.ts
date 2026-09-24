/**
 * WhatsApp (numeri collegati a Meta): ogni messaggio legato al suo contatto,
 * nei due sensi, con l'esito della consegna (24/09/2026).
 *
 * Prima il webhook cercava il contatto solo in telefono_normalized (compilato
 * su un contatto su quattro) e lo creava senza first_name, che il database
 * esige: per i numeri «lead» e «assistenza» il messaggio andava perso, per
 * «marketing» restava senza contatto. In Conversazioni c'erano solo i messaggi
 * in arrivo, e nessuno sapeva se un invio era stato consegnato.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  filtroStatiSuperabili,
  motivoMancataConsegna,
  statiSuperabili,
} from "../../../supabase/functions/whatsapp-webhook/esitoConsegna";
import { NOME_SENZA_PROFILO, nomeDalProfilo } from "../../../supabase/functions/whatsapp-webhook/contattoDaWhatsApp";

const leggi = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const WEBHOOK = "supabase/functions/whatsapp-webhook";

describe("esito della consegna", () => {
  it("lo stato va solo avanti: inviato → consegnato → letto", () => {
    expect(statiSuperabili("sent")).toEqual([null]);
    expect(statiSuperabili("delivered")).toEqual([null, "sent"]);
    expect(statiSuperabili("read")).toEqual([null, "sent", "delivered"]);
    // Un «consegnato» dopo il «letto» non trova righe da aggiornare.
    expect(statiSuperabili("delivered")).not.toContain("read");
  });

  it("«non consegnato» vale finché il messaggio non è stato letto", () => {
    expect(statiSuperabili("failed")).toEqual([null, "sent", "delivered"]);
  });

  it("gli avvisi che non sono un esito non toccano niente", () => {
    expect(statiSuperabili("deleted")).toEqual([]);
    expect(statiSuperabili("warning")).toEqual([]);
    expect(statiSuperabili(undefined)).toEqual([]);
  });

  it("il filtro per il database", () => {
    expect(filtroStatiSuperabili([null])).toBe("delivery_status.is.null");
    expect(filtroStatiSuperabili([null, "sent", "delivered"])).toBe(
      "delivery_status.is.null,delivery_status.in.(sent,delivered)",
    );
  });

  it("il motivo in italiano per i codici più frequenti", () => {
    expect(motivoMancataConsegna([{ code: 131047, title: "Re-engagement message" }])).toMatch(/24 ore.*modello/);
    expect(motivoMancataConsegna([{ code: 131049 }])).toMatch(/marketing/);
    expect(motivoMancataConsegna([{ code: 131026 }])).toMatch(/non è su WhatsApp/);
    expect(motivoMancataConsegna([{ code: 132001 }])).toMatch(/modello non esiste/);
  });

  it("un codice sconosciuto resta leggibile, e senza errori lo si dice", () => {
    expect(motivoMancataConsegna([{ code: 999999, title: "Something new" }])).toBe("errore 999999: Something new");
    expect(motivoMancataConsegna([])).toBe("Meta non ha detto il motivo");
    expect(motivoMancataConsegna(undefined)).toBe("Meta non ha detto il motivo");
  });
});

describe("il contatto nuovo da un messaggio WhatsApp", () => {
  it("nome e cognome dal profilo WhatsApp", () => {
    expect(nomeDalProfilo("Mario Rossi")).toEqual({ nome: "Mario", cognome: "Rossi" });
    expect(nomeDalProfilo("  Anna  Maria   De Luca ")).toEqual({ nome: "Anna", cognome: "Maria De Luca" });
    expect(nomeDalProfilo("Giò")).toEqual({ nome: "Giò", cognome: null });
  });

  it("senza profilo (il router mette il numero) il nome non è mai vuoto", () => {
    expect(nomeDalProfilo("393483467567")).toEqual({ nome: NOME_SENZA_PROFILO, cognome: null });
    expect(nomeDalProfilo("")).toEqual({ nome: NOME_SENZA_PROFILO, cognome: null });
    expect(nomeDalProfilo(undefined)).toEqual({ nome: NOME_SENZA_PROFILO, cognome: null });
  });
});

describe("webhook: il contatto si trova dal numero, e si crea bene", () => {
  const contatto = leggi(`${WEBHOOK}/handlers/_contact.ts`);

  it("la ricerca passa da contatto_da_telefono, non dal solo telefono_normalized", () => {
    expect(contatto).toContain('supabase.rpc("contatto_da_telefono"');
    expect(contatto).not.toMatch(/\.eq\("telefono_normalized"/);
  });

  it("se la ricerca non risponde non si crea un doppione", () => {
    const dopoErrore = contatto.slice(contatto.indexOf("if (errCerca) {"), contatto.indexOf("if (esistente) {"));
    expect(dopoErrore).toContain("return null;");
  });

  it("il contatto nuovo ha first_name (obbligatorio) e legge solo colonne che esistono", () => {
    expect(contatto).toMatch(/first_name: nome,/);
    expect(contatto).not.toMatch(/nome, cognome, telefono,/);
    expect(contatto).toContain(".select(COLONNE_CONTATTO)");
  });

  it("lo STOP spegne optout_whatsapp, quello che guardano gli invii", () => {
    const stop = contatto.slice(contatto.indexOf("export async function markOptOut"));
    expect(stop).toMatch(/optout_whatsapp: true/);
  });

  it("le automazioni «Quando arriva un WhatsApp» ricevono l'evento", () => {
    expect(contatto).toContain('trigger_event: "whatsapp_message_received"');
    expect(contatto).toContain('entity_type: "contact"');
  });
});

describe("webhook: il messaggio si salva sempre, una volta sola", () => {
  for (const gestore of ["lead", "assistenza", "marketing"]) {
    const src = leggi(`${WEBHOOK}/handlers/${gestore}.ts`);

    it(`${gestore}: un avviso ripetuto da Meta non si rielabora`, () => {
      const inizio = src.indexOf("if (await messaggioGiaRicevuto(supabase, ctx)) return;");
      expect(inizio).toBeGreaterThan(-1);
      expect(inizio).toBeLessThan(src.indexOf("resolveOrCreateContact(supabase"));
    });

    it(`${gestore}: si salva col contatto, anche quando il contatto non c'è`, () => {
      const salva = src.indexOf("persistInboundMessage(supabase, ctx, { contactId: contact?.id ?? null })");
      expect(salva).toBeGreaterThan(src.indexOf("resolveOrCreateContact(supabase"));
      const senzaContatto = src.indexOf("if (!contact)");
      if (senzaContatto > -1) expect(salva).toBeLessThan(senzaContatto);
    });

    it(`${gestore}: le automazioni partono dopo lo STOP, mai per lo STOP`, () => {
      const avviso = src.indexOf("await avvisaAutomazioni(supabase, ctx, contact.id, messageId);");
      expect(avviso).toBeGreaterThan(src.indexOf("if (isStopMessage(extracted.content))"));
    });
  }

  it("marketing: niente ticket per ogni risposta, e i broadcast si cercano nelle colonne vere", () => {
    const src = leggi(`${WEBHOOK}/handlers/marketing.ts`);
    expect(src).not.toContain('from("support_tickets")');
    expect(src).not.toContain('"phone_number"');
    expect(src).toContain('.gte("sent_at", since)');
    expect(src).toContain('destinatari.eq("contact_id", contact.id)');
  });
});

describe("webhook: l'esito arriva anche sui messaggi inviati da whatsapp-send", () => {
  const router = leggi(`${WEBHOOK}/router.ts`);

  it("dopo broadcast e vecchie conversazioni aggiorna whatsapp_messages", () => {
    const stato = router.slice(router.indexOf("async function handleDeliveryStatus"));
    expect(stato).toContain("await aggiornaEsitoMessaggio(supabase, status, isoTs);");
    const aggiorna = router.slice(router.indexOf("async function aggiornaEsitoMessaggio"));
    expect(aggiorna).toMatch(/from\("whatsapp_messages"\)\s*\.update\(valori\)\s*\.eq\("wa_message_id", status\.id\)\s*\.eq\("direction", "outbound"\)\s*\.or\(filtroStatiSuperabili\(superabili\)\)/);
    expect(aggiorna).toContain("valori.delivery_error = motivoMancataConsegna(status.errors)");
  });
});

describe("whatsapp-send: il contatto indicato vale solo se è dell'azienda", () => {
  const invio = leggi("supabase/functions/whatsapp-send/index.ts");

  it("si verifica in marketing_contacts con la stessa azienda, poi si salva", () => {
    expect(invio).toMatch(/from\("marketing_contacts"\)\s*\.select\("id"\)\s*\.eq\("id", body\.contact_id\)\s*\.eq\("company_id", companyId\)/);
    expect(invio).toContain("...(contattoId ? { contact_id: contattoId } : {}),");
  });
});

describe("migrazione: Conversazioni legge i messaggi nei due sensi", () => {
  const cartella = join(process.cwd(), "supabase/migrations");
  const sql = readdirSync(cartella)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .reverse()
    .map((f) => readFileSync(join(cartella, f), "utf8"))
    .find((s) => s.includes("create or replace function public.whatsapp_messages_collega_contatto()")) ?? "";

  it("il contatto si collega all'inserimento, e un errore non fa perdere il messaggio", () => {
    expect(sql).toMatch(/before insert on public\.whatsapp_messages/);
    expect(sql).toMatch(/exception when others then\s+new\.contact_id := null;/);
  });

  it("i rami nuovi: per contatto collegato (entrambi i sensi) e, senza, per cifre uguali come prima", () => {
    expect(sql).toContain("JOIN marketing_contacts ct ON ct.id = wa.contact_id AND ct.company_id = wa.company_id");
    expect(sql).toContain("WHERE wa.contact_id IS NULL");
    expect(sql).toMatch(/WHEN wa\.direction = 'inbound'::text THEN 'in'::text\s+ELSE 'out'::text/);
  });

  it("la vista resta leggibile solo dalle funzioni (security_invoker)", () => {
    expect(sql).toContain("create or replace view public.v_conversazioni_messaggi with (security_invoker = on) as");
  });

  it("chi cerca il contatto dal numero è riservato alle funzioni interne", () => {
    expect(sql).toMatch(/revoke all on function public\.contatto_da_telefono\(uuid, text\) from public, anon, authenticated;/);
    expect(sql).toMatch(/grant execute on function public\.contatto_da_telefono\(uuid, text\) to service_role;/);
  });
});
