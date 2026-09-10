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

/**
 * Il resto dell'audit del 10/09/2026 sul dialogo con i server di posta: ogni
 * punto qui sotto è un modo diverso in cui una casella collegata poteva
 * smettere di funzionare senza dirlo.
 */
describe("Il dialogo con il server non si pianta e non mente", () => {
  const client = leggi("supabase/functions/_shared/imapSmtpClient.ts");

  it("una lettura che non torna ha una scadenza", () => {
    // Senza, una casella lenta teneva impegnata la funzione fino al taglio
    // dell'ambiente e le altre caselle di quel giro non venivano provate.
    expect(client).toContain("imap_timeout");
    expect(client).toContain("smtp_timeout");
  });

  it("i caratteri a cavallo di due letture non si rompono", () => {
    // Senza `stream: true`, un accento spezzato fra due pacchetti diventa "?".
    expect(client).toContain('decoder.decode(readBuf.subarray(0, n as number), { stream: true })');
  });

  it("login e apertura della casella vengono verificati", () => {
    expect(client).toContain("imap_login_rifiutato");
    expect(client).toContain("imap_inbox_non_apribile");
  });

  it("la password può contenere una barra rovesciata", () => {
    // In una stringa IMAP fra virgolette vanno protetti sia \\ sia ": senza il
    // primo il login falliva con un errore incomprensibile.
    expect(client).toContain('replace(/\\\\/g, "\\\\\\\\").replace(/"/g, \'\\\\"\')');
  });

  it("il tag di fine risposta si riconosce a inizio riga", () => {
    // Dentro un messaggio può esserci qualunque testo, «A5 OK» compreso.
    expect(client).toContain("(?:^|\\\\r\\\\n)${t} (OK|NO|BAD)");
  });
});

describe("La copia in «Inviati» non blocca l'invio", () => {
  const client = leggi("supabase/functions/_shared/imapSmtpClient.ts");

  it("dopo APPEND il server dice «+», e va ascoltato", () => {
    // Aspettando il tag di chiusura si restava fermi mentre il server
    // aspettava i byte del messaggio: un abbraccio mortale che si scioglieva
    // solo con la morte della funzione.
    expect(client).toContain("/(?:^|\\r\\n)\\+/.test(cont)");
  });

  it("la cartella degli inviati la dice il server, non la si indovina", () => {
    // I nomi cambiano da provider a provider: Sent, INBOX.Sent, Posta inviata.
    expect(client).toContain('LIST "" "*"');
    expect(client).toContain("\\\\Sent");
  });
});

describe("Le risposte SMTP si leggono per intero", () => {
  const client = leggi("supabase/functions/_shared/imapSmtpClient.ts");

  it("EHLO risponde su più righe: si aspetta quella conclusiva", () => {
    // Verificato sul server di Register: otto righe. Leggendo una volta sola,
    // il resto restava nel socket e veniva scambiato per la risposta del
    // comando successivo.
    expect(client).toContain('/(?:^|\\r\\n)\\d{3} [^\\r\\n]*\\r\\n$/');
  });

  it("il codice che conta è quello dell'ultima riga", () => {
    expect(client).toContain('const conclusiva = (resp.trimEnd().split("\\r\\n").pop() ?? resp).trim()');
  });
});
