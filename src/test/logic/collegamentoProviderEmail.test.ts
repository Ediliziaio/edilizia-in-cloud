import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * Collegare una casella: Gmail, Outlook, IMAP.
 *
 * Verifica del 10/09/2026 sui tre percorsi — collegamento, ricezione, invio.
 * Gmail è stato provato sul vivo (token rinnovato, 201 messaggi letti, un
 * messaggio costruito dal nostro codice e accettato da Google); l'IMAP sul
 * server di Register. Qui restano fermi i punti che si romperebbero in
 * silenzio.
 */
describe("Il collegamento chiede i permessi giusti", () => {
  const avvio = leggi("supabase/functions/email-oauth-start/index.ts");

  it("Gmail: leggere, marcare letto, inviare — e il consenso che dà il refresh", () => {
    expect(avvio).toContain("gmail.readonly");
    expect(avvio).toContain("gmail.modify");
    expect(avvio).toContain("gmail.send");
    // Senza questi due Google non restituisce il refresh token, e la casella
    // si scollega dopo un'ora.
    expect(avvio).toContain('access_type: "offline"');
    expect(avvio).toContain('prompt: "consent"');
  });

  it("Outlook: leggere, inviare, e restare collegati", () => {
    expect(avvio).toContain("Mail.Read");
    expect(avvio).toContain("Mail.Send");
    expect(avvio).toContain("offline_access");
  });

  it("un segreto messo al posto dell'identificativo non parte nell'indirizzo", () => {
    // Successo davvero: in MS_OAUTH_CLIENT_ID c'era un valore con la forma di
    // un client secret di Azure. Il collegamento non poteva funzionare, e a
    // ogni tentativo quel segreto finiva nella barra degli indirizzi.
    expect(avvio).toContain("identificativoSospetto");
    expect(avvio).toContain("deve essere un GUID");
    expect(avvio).toContain(".apps.googleusercontent.com");
  });
});

describe("Rispondere resta dentro la conversazione", () => {
  const invio = leggi("supabase/functions/email-send/index.ts");

  it("Gmail riceve il thread della conversazione, non un null fisso", () => {
    // `const providerThreadId: string | null = null` non cambiava mai: ogni
    // risposta nasceva come conversazione nuova accanto a quella vera.
    expect(invio).not.toContain("const providerThreadId: string | null = null;");
    expect(invio).toContain("if (parent?.provider_thread_id) providerThreadId = parent.provider_thread_id as string;");
  });

  it("un nome che somiglia a un indirizzo, o dice «Admin», non finisce nel From", () => {
    // «"flo.andriciuc Admin" <info@…>» è il profilo del super admin: sembra
    // un'identità travestita, e i filtri antiphishing lo pesano.
    expect(invio).toContain("sembraUnaPersona");
    expect(invio).toContain("fromName = sembraUnaPersona ? nome : null");
  });

  it("la copia in «Inviate» porta con sé i riferimenti", () => {
    expect(invio).toContain("in_reply_to: filo?.inReplyTo ?? null");
    expect(invio).toContain("references_ids: filo?.references ?? []");
  });

  it("il limite di Outlook sul threading è scritto dove serve", () => {
    // Graph scarta In-Reply-To su /sendMail: chi legge quel codice deve sapere
    // perché il parametro c'è e non viene usato.
    expect(invio).toContain("createReply");
  });
});

describe("La posta in arrivo è la posta in arrivo", () => {
  const poller = leggi("supabase/functions/email-poll-inbox/index.ts");

  it("Outlook: si guarda la casella di posta, non tutte le cartelle", () => {
    // `/me/messages` restituisce anche inviati e cestino: sarebbero finiti
    // fra i messaggi ricevuti.
    expect(poller).toContain("mailFolders/inbox/messages");
    expect(poller).not.toContain("`${GRAPH_API}/messages?${params.toString()}`");
  });
});
