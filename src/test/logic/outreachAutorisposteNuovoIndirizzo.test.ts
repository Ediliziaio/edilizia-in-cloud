/**
 * Le risposte automatiche non sono risposte ottenute (22/09/2026).
 *
 * Florin: «la risposta automatica non deve contare come risposta ottenuta».
 * Delle 57 risposte arrivate fino a quel giorno, 25 erano automatiche: 15
 * «abbiamo ricevuto, vi risponderemo», 8 «questo indirizzo non è più attivo,
 * scrivete a …» (6 aziende), e 2 prese per vere dall'AI (una conferma di
 * autolettura passata per domanda, una risposta standard «compilate il modulo»
 * passata per interessata: flusso fermato, avviso, task e opportunità).
 *
 * Regole: se dice di scrivere a un altro indirizzo, l'indirizzo cambia e
 * l'email si rimanda; se dice di aspettare, il flusso prosegue. I testi qui
 * sotto sono quelli arrivati davvero, con nomi e indirizzi inventati.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isAutoReply,
  nuovoIndirizzoDaAutorisposta,
  senzaCitazione,
  textIndicatesAutoReply,
  tipoAutorisposta,
} from "../../../supabase/functions/_shared/outreach-autoreply";
import { passoDellInvio } from "../../../supabase/functions/_shared/outreach-sequence";
import { stessoDestinatario } from "../../../supabase/functions/_shared/outreach-threading";

const ROOT = join(__dirname, "../../..");
const leggi = (p: string) => readFileSync(join(ROOT, p), "utf8");

const NOSTRI = ["mktedile.fun", "thermodmr.it", "marketingedile.blog"];

describe("«questa casella non è più attiva, scrivete a …»", () => {
  const casi: Array<{ nome: string; vecchio: string; testo: string; nuovo: string }> = [
    {
      nome: "indirizzo non più attivo, nuovo indirizzo di posta",
      vecchio: "impianti.rossi.srl@gmail.com",
      testo: "Buongiorno,La informiamo che questo indirizzo email non è più attivo. Il nostro nuovo indirizzo di posta elettronica è: info@impiantirossi.it La invitiamo ad aggiornare i suoi contatti ed utilizzare esclusivamente il nuovo indirizzo per le future comunicazioni. Grazie per la collaborazione. Cordiali saluti, Impianti Rossi Srl--",
      nuovo: "info@impiantirossi.it",
    },
    {
      nome: "stesso dominio, nome diverso",
      vecchio: "idrobianchisnc@libero.it",
      testo: "Buongiorno, come da precedenti comunicazioni questa mail non è più attiva. Potete inviare le vostre mail a idro.bianchisrl@libero.it Saluti IDRO BIANCHI SRL",
      nuovo: "idro.bianchisrl@libero.it",
    },
    {
      nome: "casella disattivata, al seguente indirizzo",
      vecchio: "anna.verdi@studioverdi.eu",
      testo: "Buongiorno, grazie per il messaggio. La presente casella di posta elettronica è stata disattivata. Vi chiediamo pertanto di inviare le comunicazioni al seguente indirizzo: amministrazione@studioverdi.eu Grazie per la collaborazione. Cordiali saluti, Amministrazione Studio Verdi",
      nuovo: "amministrazione@studioverdi.eu",
    },
    {
      nome: "in due lingue, l'indirizzo in fondo",
      vecchio: "info@parquetneri.it",
      testo: "Questa casella di posta a breve sarà dismessa. Si prega di scrivere al seguente nuovo indirizzo e di aggiornare la Vs rubrica: This mailbox will soon be discontinued. Please write to the following new address and update your address book: info@casaneri.it",
      nuovo: "info@casaneri.it",
    },
    {
      nome: "punto finale attaccato",
      vecchio: "impresagialli@libero.it",
      testo: "Salve, grazie per il suo messaggio. Questo indirizzo email non è più attivo. Vi invito a contatarmi al mio nuovo indirizzo info@impresaedilegialli.it. Grazie, saluti.",
      nuovo: "info@impresaedilegialli.it",
    },
    {
      nome: "due indirizzi incollati dalla conversione HTML: vale il primo",
      vecchio: "ponteggiservice@gmail.com",
      testo: "Gentile cliente, avvisiamo che l’indirizzo e-mail corrente non sarà a breve più in utilizzo. Vi preghiamo di scrivere ai seguenti indirizzi: info@ponteggiblu.itamministrazione@ponteggiblu.it Grazie e cordiali saluti",
      nuovo: "info@ponteggiblu.it",
    },
  ];

  for (const caso of casi) {
    it(caso.nome, () => {
      expect(isAutoReply({ subject: "Risposta automatica", body: caso.testo })).toBe(true);
      expect(nuovoIndirizzoDaAutorisposta({ body: caso.testo, vecchi: [caso.vecchio], nostriDomini: NOSTRI })).toBe(caso.nuovo);
      expect(tipoAutorisposta({ body: caso.testo, vecchi: [caso.vecchio], nostriDomini: NOSTRI }))
        .toEqual({ tipo: "nuovo_indirizzo", nuovoIndirizzo: caso.nuovo });
    });
  }

  it("la casella dismessa basta da sola a riconoscerla automatica, anche senza header", () => {
    expect(textIndicatesAutoReply("Variazione indirizzo email", casi[0].testo)).toBe(true);
    expect(textIndicatesAutoReply("Auto: Contratto di fornitura", casi[1].testo)).toBe(true);
  });

  it("un indirizzo del mittente, un nostro o di sistema non è mai quello nuovo", () => {
    const testo = "Questo indirizzo email non è più attivo. Scrivete a noreply@azienda.it oppure a francesco@mktedile.fun";
    expect(nuovoIndirizzoDaAutorisposta({ body: testo, vecchi: ["vecchio@azienda.it"], nostriDomini: NOSTRI })).toBeNull();
    const soloVecchio = "Questa casella non è più attiva: vecchio@azienda.it non viene più letta.";
    expect(nuovoIndirizzoDaAutorisposta({ body: soloVecchio, vecchi: ["vecchio@azienda.it"] })).toBeNull();
  });

  it("un indirizzo lontano dall'annuncio è la firma, non l'indirizzo nuovo", () => {
    const testo = `Questa casella di posta è stata disattivata. ${"Grazie per la comprensione e buona giornata. ".repeat(10)} Firma: segreteria@azienda.it`;
    expect(nuovoIndirizzoDaAutorisposta({ body: testo, vecchi: ["vecchio@azienda.it"] })).toBeNull();
  });

  it("la nostra email citata sotto non conta", () => {
    const testo = "Buongiorno, non ci interessa.\nIl giorno lun 21 set 2026 alle 09:38 Francesco <francesco@mktedile.fun> ha scritto:\n> Il nostro nuovo indirizzo è info@nuovo.it";
    expect(nuovoIndirizzoDaAutorisposta({ body: testo, vecchi: ["cliente@azienda.it"] })).toBeNull();
  });
});

describe("«vi risponderemo», «sono in ferie»: si aspetta e il flusso prosegue", () => {
  it("conferma di ricezione, ticket, orari d'ufficio", () => {
    for (const testo of [
      "Gentile Cliente, Abbiamo ricevuto la tua richiesta di contatto: ti risponderemo il prima possibile. Cordialmente.",
      "Buongiorno, Con La presente si conferma che la Vs. e-mail è stata ricevuta dal ns. ufficio. Vi daremo un cortese riscontro in merito nel più breve tempo possibile.",
      "Buongiorno, grazie per averci contattato! La presente e-mail conferma l'avvenuta ricezione del Suo messaggio. I nostri uffici sono operativi dal Lunedì al Sabato.",
      "Ti Ringraziamo per averci scritto, la tua comunicazione è stata presa in carico, per un contatto urgente siete pregati di contattarci al numero 02.000.000.",
    ]) {
      expect(isAutoReply({ subject: "Re: proposta", body: testo })).toBe(true);
      expect(tipoAutorisposta({ body: testo, vecchi: ["info@azienda.it"] })).toEqual({ tipo: "attesa", nuovoIndirizzo: null });
    }
  });

  it("le due prese per vere il 22/09: autolettura e risposta standard col modulo", () => {
    const autolettura = "Gentile Cliente, in merito all’autolettura da lei inviata (vedi mail allegata), chiediamo cortesemente di rinviarci i dati necessari all’inserimento della lettura, rispondendo a questa mail, senza modificare l’oggetto e compilando i campi.";
    const modulo = "Buongiorno, Vi ringraziamo per l’interesse dimostrato verso ENERGIA ESEMPIO ITALIA. Potete inviare la Vs. presentazione e richiesta di collaborazione al form «diventa un nostro partner» sul nostro sito.";
    expect(isAutoReply({ subject: "26092208024662 - Richiesta Dati Autolettura", body: autolettura })).toBe(true);
    expect(isAutoReply({ subject: "R: Richieste di preventivo fotovoltaico", body: modulo })).toBe(true);
  });

  it("in ferie con un collega indicato: l'indirizzo non cambia", () => {
    for (const testo of [
      "Sono in ferie fino al 5 ottobre. Per urgenze scrivere al mio collega mario@azienda.it",
      "Sono fuori ufficio fino al 30/09: nel frattempo potete scrivere al nuovo indirizzo del reparto ufficio@azienda.it",
    ]) {
      expect(isAutoReply({ body: testo })).toBe(true);
      expect(nuovoIndirizzoDaAutorisposta({ body: testo, vecchi: ["luca@azienda.it"] })).toBeNull();
    }
  });
});

describe("una risposta scritta da una persona resta una risposta", () => {
  it("anche se cita la nostra email", () => {
    const testo = "Mi interessa, chiamatemi domani.\nIl giorno lun 21 set 2026 alle 09:38 Francesco <francesco@mktedile.fun> ha scritto:\n> Abbiamo ricevuto la vostra richiesta e vi risponderemo al più presto.";
    expect(textIndicatesAutoReply("Re: proposta", testo)).toBe(false);
    expect(senzaCitazione(testo)).toBe("Mi interessa, chiamatemi domani.");
  });

  it("citazione sulla stessa riga, come arriva da Gmail e da Outlook", () => {
    expect(senzaCitazione("Salve, non fa per noi Il Mar 22 Set 2026, 10:28 Francesco <f@mktedile.fun> ha scritto: Buongiorno"))
      .toBe("Salve, non fa per noi");
    expect(senzaCitazione("Grazie, non siamo interessati. Da: Filippo <info@thermodmr.it> Inviato: lunedì 21 settembre 2026"))
      .toBe("Grazie, non siamo interessati.");
  });

  it("«la ditta non è più attiva» e «grazie per averci contattato, ma…» non sono risponditori", () => {
    expect(textIndicatesAutoReply("Re: proposta", "Buongiorno, la ditta non è più attiva da due anni, cancellateci.")).toBe(false);
    expect(textIndicatesAutoReply("Re: proposta", "Grazie per averci contattato ma non ci interessa.")).toBe(false);
  });
});

describe("rimandare l'email all'indirizzo nuovo", () => {
  const passi = [
    { id: "p1", step_order: 1, channel: "email", subject: "Primo", body: "a" },
    { id: "w", step_order: 2, channel: "whatsapp", subject: null, body: "b" },
    { id: "p2", step_order: 3, channel: "email", subject: "Secondo", body: "c" },
    { id: "p3", step_order: 4, channel: "email", subject: "Terzo", body: "d" },
  ];

  it("flusso lineare: la k-esima email spedita è il k-esimo passo email", () => {
    const spedite = [{ id: "q1" }, { id: "q2" }];
    expect(passoDellInvio(passi, { id: "q1", node_id: null }, spedite)?.id).toBe("p1");
    expect(passoDellInvio(passi, { id: "q2", node_id: null }, spedite)?.id).toBe("p2");
    expect(passoDellInvio(passi, { id: "sconosciuta", node_id: null }, spedite)).toBeNull();
  });

  it("flusso a grafo: vale il nodo della riga in coda", () => {
    expect(passoDellInvio(passi, { id: "q9", node_id: "p3" }, [])?.id).toBe("p3");
  });

  it("il reinvio non è un «Re:» di email spedite alla casella vecchia", () => {
    const precedenti = [
      { messageId: "<a>", subject: "Primo", toEmail: "Vecchio@Azienda.it" },
      { messageId: "<b>", subject: "Re: Primo", toEmail: "nuovo@azienda.it" },
      { messageId: "<c>", subject: "Senza destinatario", toEmail: null },
    ];
    expect(stessoDestinatario(precedenti, "nuovo@azienda.it").map((p) => p.messageId)).toEqual(["<b>", "<c>"]);
    expect(stessoDestinatario(precedenti, " VECCHIO@azienda.it ").map((p) => p.messageId)).toEqual(["<a>", "<c>"]);
    expect(stessoDestinatario(precedenti, null)).toHaveLength(3);
  });
});

describe("il gestore delle risposte e il motore usano le regole", () => {
  const gestore = leggi("supabase/functions/_shared/outreach-reply-handler.ts");
  const motore = leggi("supabase/functions/outreach-dispatch/index.ts");

  it("un'autorisposta entra già letta e non ferma, non avvisa, non crea niente", () => {
    expect(gestore).toContain('status: autoReply ? "read" : "unread",');
    const dopoInsert = gestore.slice(gestore.indexOf("  if (autoReply) {"));
    expect(dopoInsert.indexOf("await gestisciAutorisposta(")).toBeGreaterThan(-1);
    expect(dopoInsert.indexOf("return;")).toBeLessThan(dopoInsert.indexOf("await avvisaRisposta("));
  });

  it("se è l'AI a riconoscerla automatica vale lo stesso, prima di avviso, stop, task e opportunità", () => {
    const blocco = gestore.indexOf('if (intent === "auto_reply" || intent === "out_of_office") {');
    expect(blocco).toBeGreaterThan(-1);
    for (const passo of ["await avvisaRisposta(", "await stopActiveSequences(", "outreach_call_tasks", "triggerOpportunityFromSignal("]) {
      expect(gestore.indexOf(passo, gestore.indexOf("export async function handleInboundReply("))).toBeGreaterThan(blocco);
    }
  });

  it("il nuovo indirizzo passa gli stessi controlli di un'iscrizione", () => {
    const cambio = gestore.slice(gestore.indexOf("async function cambiaIndirizzoERimanda("), gestore.indexOf("async function rimandaEmail("));
    for (const controllo of ["classifyEmail(nuovo)", "isPecEmail(nuovo)", '"email_suppressions"', "eClienteEic(", "domainHasMx(", '"gia_in_rubrica"', '"troppi_cambi"']) {
      expect(cambio).toContain(controllo);
    }
  });

  it("il reinvio si accoda prima di annullare il resto", () => {
    const rimanda = gestore.slice(gestore.indexOf("async function rimandaEmail("));
    expect(rimanda.indexOf('.insert({')).toBeLessThan(rimanda.indexOf('.update({ status: "cancelled"'));
    expect(rimanda).toContain('.neq("id", nuova.id)');
  });

  it("il motore fa filo solo con lo stesso destinatario", () => {
    expect(motore).toContain("await inviatiPrecedenti(supabase, enr.id, item.to_email)");
    expect(motore).toContain("return stessoDestinatario(");
  });
});
