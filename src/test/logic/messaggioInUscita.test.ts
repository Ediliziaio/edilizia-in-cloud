import { describe, expect, it } from "vitest";
import {
  buildRFC822, dataRfc5322, dominioDi, quotedPrintable, ripulisciHtmlEmail, documentoHtmlEmail, testoDaHtml,
} from "../../../supabase/functions/_shared/imapSmtpClient";

/**
 * Perché la stessa email, dallo stesso server, dalla webmail arrivava in
 * inbox e da EiC finiva in spam (10/09/2026).
 *
 * Confrontate byte per byte le due copie in «Inviati» di Register, le
 * differenze erano tutte nostre: Message-ID sul dominio del relay, Date in GMT
 * nel formato di toUTCString(), From senza nome, HTML nudo senza <html><body>
 * con dentro gli attributi di Google Sheets, codifica 8bit, EHLO con un nome
 * che non è un host. Nessuna decide da sola; insieme sono il ritratto di un
 * mailer automatico. La misura di base su Gmail — testo cortese, nessun
 * colore — è finita in spam lo stesso.
 */
describe("Il messaggio in uscita somiglia a uno scritto da una persona", () => {
  const rfc = buildRFC822({
    from: "info@ediliziaincloud.com", fromName: "Florin Andriciuc", to: ["a@b.it"],
    subject: "prova",
    bodyText: "prova 2 di rispsota",
    bodyHtml: '<span data-sheets-root="1" class="x" style="font-size: 10pt; color: rgb(177, 2, 2); text-align: center;">prova 2 di rispsota</span>',
    messageId: "<x@ediliziaincloud.com>",
  });

  it("le intestazioni sono nell'ordine di un client di posta, non di uno script", () => {
    // L'unico elemento che, da solo, faceva la differenza fra inbox e spam
    // negli invii differenziali del 10/09/2026: stesso server, stessa casella,
    // stesso contenuto. «From, To, Subject, Date, Message-ID, MIME-Version,
    // Content-Type» → spam; «MIME-Version, Date, From, To, Subject,
    // Message-ID, Content-Type» → inbox. È l'impronta dei mailer da script.
    const testa = rfc.slice(0, rfc.indexOf("\r\n\r\n")).split("\r\n").map((r) => r.split(":")[0]);
    expect(testa[0]).toBe("MIME-Version");
    expect(testa[1]).toBe("Date");
    expect(testa.indexOf("Content-Type")).toBeGreaterThan(testa.indexOf("Message-ID"));
    expect(testa.indexOf("MIME-Version")).toBeLessThan(testa.indexOf("From"));
  });

  it("la data ha il fuso locale, non «GMT»", () => {
    expect(rfc).toMatch(/^Date: [A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} [+-]\d{4}$/m);
    expect(rfc).not.toMatch(/^Date: .* GMT$/m);
  });

  it("il From porta il nome", () => {
    expect(rfc).toContain("From: Florin Andriciuc <info@ediliziaincloud.com>");
  });

  it("l'HTML è un documento intero, non un frammento", () => {
    const html = rfc.slice(rfc.indexOf("text/html"));
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<body");
  });

  it("si scrive in quoted-printable, come fanno tutti i client", () => {
    expect(rfc).toContain("Content-Transfer-Encoding: quoted-printable");
    expect(rfc).not.toContain("Content-Transfer-Encoding: 8bit");
  });

  it("gli attributi di Google Sheets e i colori incollati non partono", () => {
    expect(rfc).not.toContain("data-sheets-root");
    expect(rfc).not.toContain("class=");
    expect(rfc).not.toMatch(/color: rgb\(177/);
  });
});

describe("I pezzi, uno per uno", () => {
  it("il Message-ID va sul dominio di chi scrive, non del server che inoltra", () => {
    expect(dominioDi("Info@EdiliziaInCloud.com")).toBe("ediliziaincloud.com");
    expect(dominioDi("senza-chiocciola")).toBe("ediliziaincloud.com");
  });

  it("la data è RFC 5322 con l'offset di Roma", () => {
    const d = dataRfc5322(new Date("2026-09-10T11:09:54Z"));
    expect(d).toBe("Thu, 10 Sep 2026 13:09:54 +0200");
    expect(dataRfc5322(new Date("2026-01-10T11:09:54Z"))).toBe("Sat, 10 Jan 2026 12:09:54 +0100");
  });

  it("quoted-printable: righe corte, accenti protetti, e si torna indietro identici", () => {
    const t = "però, città — ventitré\nspazio finale \n=uguale= " + "x".repeat(150);
    const qp = quotedPrintable(t);
    expect(qp.split("\r\n").every((r) => r.length <= 76)).toBe(true);
    expect(qp).toMatch(/^[\x20-\x7e\r\n]*$/); // solo ASCII stampabile
    const back = qp.replace(/=\r\n/g, "").replace(/=([0-9A-F]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
    const dec = new TextDecoder().decode(Uint8Array.from(back, (c) => c.charCodeAt(0)));
    expect(dec).toBe(t.replace(/\n/g, "\r\n"));
  });

  it("la spazzola toglie script, stili, data-*, class, on*, ma tiene grassetto e corsivo", () => {
    const sporco = '<style>p{}</style><p class="a" data-x="1" onclick="x()">Ciao <span style="font-weight: bold; color: red">forte</span> <b>b</b></p><script>alert(1)</script>';
    const pulito = ripulisciHtmlEmail(sporco);
    expect(pulito).toBe('<p>Ciao <span style="font-weight: bold">forte</span> <b>b</b></p>');
  });

  it("un frammento senza blocchi finisce in un paragrafo dentro il documento", () => {
    const doc = documentoHtmlEmail("solo testo");
    expect(doc).toContain("<p>solo testo</p>");
    expect(doc).toMatch(/^<!DOCTYPE html>/);
    // e un HTML già a blocchi non viene incapsulato due volte
    expect(documentoHtmlEmail("<p>già</p>")).not.toContain("<p><p>");
  });

  it("il testo semplice si ricava dall'HTML quando manca", () => {
    expect(testoDaHtml("<p>Buongiorno,</p><p>a presto<br>Florin &amp; co</p><ul><li>uno</li></ul>"))
      .toBe("Buongiorno,\n\na presto\nFlorin & co\n\n- uno");
    const rfc = buildRFC822({ from: "a@b.it", to: ["c@d.it"], subject: "s", bodyHtml: "<p>solo html</p>", messageId: "<m@b.it>" });
    expect(rfc).toContain("text/plain");
  });
});
