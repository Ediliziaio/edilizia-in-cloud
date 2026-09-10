import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * Perché una casella IMAP collegata non portava dentro niente.
 *
 * Collegata info@ediliziaincloud.com (Register/SecureMail): connessione ok,
 * «Sync completato — nessuna nuova email», casella vuota. Sul server invece
 * c'erano due messaggi, uno dei quali mai letto.
 *
 * IMAP vuole la data con i trattini — `11-Aug-2026`. EiC la mandava con gli
 * spazi (`toUTCString().slice(5,16)` → "11 Aug 2026") e il server rispondeva
 * `BAD Invalid search date parameter`. Chi leggeva la risposta cercava la riga
 * `* SEARCH`, non la trovava, e concludeva «nessun messaggio»: un errore del
 * server travestito da casella vuota. Verificato sul server vero, comando per
 * comando.
 */
describe("La ricerca IMAP parla la lingua del server", () => {
  const client = leggi("supabase/functions/_shared/imapSmtpClient.ts");

  it("la data va con i trattini, o è BAD", () => {
    expect(client).toContain('sinceDate.toUTCString().slice(5, 16).replace(/ /g, "-")');
  });

  it("una ricerca rifiutata è un errore, non una casella vuota", () => {
    // È il punto che ha reso il guasto invisibile: senza questo controllo il
    // «BAD» diventava zero messaggi e lo stato restava verde.
    expect(client).toContain("imap_search_rifiutata");
    expect(client).toContain("if (searchLine === null)");
  });

  it("prende i messaggi più recenti, non i più vecchi", () => {
    // Su una casella con storico, i primi UID sono i più vecchi: il tetto si
    // riempiva senza mai arrivare a oggi.
    expect(client).toContain(".slice(-maxMessages)");
  });
});

describe("Chi legge la posta anche altrove non la perde", () => {
  const client = leggi("supabase/functions/_shared/imapSmtpClient.ts");
  const poller = leggi("supabase/functions/email-poll-inbox/index.ts");

  it("il client di posta scarica anche i messaggi già letti", () => {
    // Con `UNSEEN`, un messaggio aperto su Spark o in webmail per EiC non
    // sarebbe mai esistito.
    expect(client).toContain("includiLette = false");
    expect(poller).toContain("true, // anche i messaggi già letti altrove");
  });

  it("il cursore UID evita di ripescare ogni volta lo stesso periodo", () => {
    expect(poller).toContain("metaImap.last_imap_uid");
    expect(poller).toContain("last_imap_uid: uidPiuAlto");
  });

  it("il cursore non calpesta il resto di provider_metadata", () => {
    expect(poller).toContain("{ ...metaImap, last_imap_uid: uidPiuAlto }");
  });
});

describe("I dati di Register.it", () => {
  it("il preset punta al server che risponde davvero", () => {
    // Verificato: imap.register.it non ha un certificato valido per quel nome
    // e out.register.it non esiste più nel DNS. Le caselle Register di oggi
    // stanno su SecureMail, dove `pop.securemail.pro` sulla 993 parla IMAP —
    // il nome inganna, il protocollo no.
    const dialog = leggi("src/components/integrations/ImapCustomDialog.tsx");
    const register = dialog.slice(dialog.indexOf("register: {"), dialog.indexOf("icloud: {"));
    expect(register).toContain("pop.securemail.pro");
    expect(register).toContain("authsmtp.securemail.pro");
  });
});
