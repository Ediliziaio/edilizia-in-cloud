import { describe, expect, it } from "vitest";
import { parseImapMessage, valoreHeader } from "../../../supabase/functions/_shared/imapSmtpClient";

/**
 * Il messaggio che arrivava senza testo.
 *
 * Una email vera porta con sé la firma DKIM, che elenca i campi firmati:
 * `h=content-type:mime-version:subject:…`. Cercando «content-type:» dentro il
 * blocco header con una regex qualunque, la prima occorrenza è quella —
 * e il tipo del messaggio risultava «mime-version:subject:…» invece di
 * «multipart/alternative». Non essendo riconosciuto come multipart, il corpo
 * non veniva mai aperto: l'email arrivava in EiC con oggetto e mittente giusti
 * e il testo vuoto. Vale per qualunque email firmata, cioè quasi tutte.
 */
function rispostaFetch(corpo: string): string {
  const byte = new TextEncoder().encode(corpo).length;
  return `* 2 FETCH (UID 2 BODY[] {${byte}}\r\n${corpo}\r\n)\r\nA5 OK Fetch completed.\r\n`;
}

const CON_DKIM = [
  "Return-Path: <mario@example.com>",
  "DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=example.com;",
  "        h=content-type:mime-version:subject:message-id:to:from:date;",
  "        b=abcdef0123456789",
  "From: Mario Rossi <mario@example.com>",
  "To: info@ediliziaincloud.com",
  "Subject: =?UTF-8?B?cGVyw7I=?=",
  "Date: Thu, 10 Sep 2026 09:58:58 +0200",
  "MIME-Version: 1.0",
  'Content-Type: multipart/alternative; boundary="confine123"',
  "",
  "--confine123",
  'Content-Type: text/plain; charset="utf-8"',
  "Content-Transfer-Encoding: 7bit",
  "",
  "Buongiorno, questo è il testo.",
  "",
  "--confine123",
  'Content-Type: text/html; charset="utf-8"',
  "Content-Transfer-Encoding: 7bit",
  "",
  "<p>Buongiorno, questo è il testo.</p>",
  "",
  "--confine123--",
].join("\r\n");

describe("Un messaggio firmato non perde il corpo", () => {
  const m = parseImapMessage("2", rispostaFetch(CON_DKIM));

  it("il testo arriva", () => {
    expect(m).not.toBeNull();
    expect(m!.text).toContain("questo è il testo");
  });

  it("e anche la versione HTML", () => {
    expect(m!.html).toContain("<p>Buongiorno");
  });

  it("mittente, nome e oggetto restano quelli giusti", () => {
    expect(m!.from).toBe("mario@example.com");
    expect(m!.fromName).toBe("Mario Rossi");
    expect(m!.subject).toBe("però"); // oggetto codificato RFC 2047
  });
});

describe("Leggere un header vuol dire leggere quell'header", () => {
  it("non si lascia ingannare dai campi elencati nella firma DKIM", () => {
    expect(valoreHeader(CON_DKIM, "content-type")).toContain("multipart/alternative");
  });

  it("segue le righe di continuazione, dove spesso finisce il boundary", () => {
    const piegato = [
      "From: a@b.it",
      "Content-Type: multipart/mixed;",
      '\tboundary="pezzo-9"',
      "",
      "corpo",
    ].join("\r\n");
    expect(valoreHeader(piegato, "content-type")).toContain('boundary="pezzo-9"');
  });

  it("un header assente resta assente, non diventa un altro", () => {
    expect(valoreHeader("From: a@b.it\r\n\r\ncorpo", "content-type")).toBe("");
  });
});

describe("Il messaggio si taglia dove finisce davvero", () => {
  it("un'email con accenti fuori codifica non si porta dietro il protocollo", () => {
    // `size` conta BYTE, il taglio contava CARATTERI: con «però» in chiaro i
    // due numeri divergono, il taglio cade oltre la fine del messaggio e nel
    // testo dell'email finiva la coda del dialogo IMAP.
    const conAccenti = [
      "From: a@b.it",
      "Subject: prova",
      'Content-Type: text/plain; charset="utf-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      "però però però — e questa è l'ultima riga, quella che si perdeva.",
    ].join("\r\n");
    const m = parseImapMessage("7", rispostaFetch(conAccenti));
    expect(m!.text).toContain("l'ultima riga, quella che si perdeva.");
    expect(m!.text).not.toContain("OK Fetch completed");
    expect(m!.text.trimEnd().endsWith("perdeva.")).toBe(true);
  });
});
