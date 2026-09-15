import { describe, it, expect } from "vitest";
import { parseBounce, classificaRifiuto } from "../../../supabase/functions/_shared/outreach-bounce";

describe("rimbalzi letti nella casella: quando il contatto va in DND", () => {
  it("indirizzo inesistente (550 5.1.1) → definitivo e DND", () => {
    const b = parseBounce({
      from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
      subject: "Delivery Status Notification (Failure)",
      text: "550 5.1.1 The email account that you tried to reach does not exist.\nFinal-Recipient: rfc822; luca@impresaverdi.it",
    });
    expect(b.hard).toBe(true);
    expect(b.dnd).toBe(true);
  });

  it("mancato recapito senza motivo scritto e senza ritardo → definitivo e DND", () => {
    // Il 15/09/2026 uno così (mahdi@omifer.it) era passato per temporaneo e la sequenza proseguiva.
    const b = parseBounce({
      from: "MAILER-DAEMON@securemail.pro",
      subject: "Undelivered Mail Returned to Sender",
      text: "This is the mail system at host securemail.pro.\nFinal-Recipient: rfc822; mahdi@omifer.it\nAction: failed",
    });
    expect(b.isBounce).toBe(true);
    expect(b.hard).toBe(true);
    expect(b.dnd).toBe(true);
    expect(b.failedEmails).toEqual(["mahdi@omifer.it"]);
  });

  it("avviso di ritardo: il server riprova, niente DND", () => {
    const b = parseBounce({
      from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
      subject: "Delivery Status Notification (Delay)",
      text: "Delivery to the following recipient has been delayed: anna@costruzionibianchi.it\nWe will retry for 2 more days.",
    });
    expect(b.hard).toBe(false);
    expect(b.dnd).toBe(false);
  });

  it("casella piena: temporaneo, niente DND", () => {
    const b = parseBounce({
      from: "postmaster@aruba.it",
      subject: "Mancata consegna",
      text: "Il messaggio per anna@costruzionibianchi.it non è stato consegnato: mailbox full (452 4.2.2)",
    });
    expect(b.hard).toBe(false);
    expect(b.dnd).toBe(false);
  });

  it("bloccato come spam (5.7.1): il flusso si ferma ma il contatto non va in DND", () => {
    const b = parseBounce({
      from: "postmaster@aruba.it",
      subject: "Mancata consegna",
      text: "Il messaggio per paolo@ditta.it è stato rifiutato: 550 5.7.1 message rejected as spam",
    });
    expect(b.hard).toBe(true);
    expect(b.dnd).toBe(false);
  });

  it("una persona che risponde con «rejected» nell'oggetto non finisce in DND", () => {
    const b = parseBounce({
      from: "Mario <mario@edilrossi.it>",
      subject: "Re: preventivo rejected",
      text: "Grazie, per ora no. mario@edilrossi.it",
    });
    expect(b.hard).toBe(false);
    expect(b.dnd).toBe(false);
  });
});

describe("classificaRifiuto — risposta del server al momento dell'invio", () => {
  it("recipient rejected 550 5.1.1 (dominio sbagliato) → definitivo e DND", () => {
    expect(classificaRifiuto('"smtp_rcpt_rejected: 550 5.1.1 <ble.stefano@libero.itk> recipient rejected\\r\\n"'))
      .toEqual({ definitivo: true, dnd: true });
  });
  it("errore temporaneo (greylisting) → niente", () => {
    expect(classificaRifiuto("451 4.7.1 Greylisted, try again later")).toEqual({ definitivo: false, dnd: false });
  });
  it("blocco per spam → definitivo ma niente DND", () => {
    expect(classificaRifiuto("554 5.7.1 Service unavailable; client host blocked using Spamhaus"))
      .toEqual({ definitivo: true, dnd: false });
  });
  it("nessun testo → niente", () => {
    expect(classificaRifiuto(null)).toEqual({ definitivo: false, dnd: false });
  });
});
