import { describe, it, expect } from "vitest";
import { parseBounce } from "../../../supabase/functions/_shared/outreach-bounce";

describe("parseBounce", () => {
  it("una risposta normale non e' un bounce", () => {
    const b = parseBounce({ from: "Mario <mario@edilrossi.it>", subject: "Re: Cantieri", text: "Sì mi interessa" });
    expect(b.isBounce).toBe(false);
    expect(b.failedEmails).toEqual([]);
  });
  it("NDR Gmail: hard bounce con indirizzo estratto dal report", () => {
    const b = parseBounce({
      from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
      subject: "Delivery Status Notification (Failure)",
      text: "The response was: 550 5.1.1 The email account that you tried to reach does not exist.\nFinal-Recipient: rfc822; luca@impresaverdi.it\nAction: failed",
      ignoreEmails: ["marco@overthemol.com"],
    });
    expect(b.isBounce).toBe(true);
    expect(b.hard).toBe(true);
    expect(b.failedEmails).toEqual(["luca@impresaverdi.it"]);
  });
  it("casella piena = bounce soft, non si sopprime", () => {
    const b = parseBounce({
      from: "postmaster@aruba.it",
      subject: "Mancata consegna",
      text: "Il messaggio per anna@costruzionibianchi.it non è stato consegnato: mailbox full (452 4.2.2)",
    });
    expect(b.isBounce).toBe(true);
    expect(b.hard).toBe(false);
    expect(b.failedEmails).toEqual(["anna@costruzionibianchi.it"]);
  });
  it("ignora la casella mittente e gli indirizzi di sistema", () => {
    const b = parseBounce({
      from: "MAILER-DAEMON@mx.register.it",
      subject: "Undelivered Mail Returned to Sender",
      text: "From: marco@edilcloud.it\n<paolo@ditta.it>: host mx.ditta.it said: 550 user unknown\nContact postmaster@register.it",
      ignoreEmails: ["marco@edilcloud.it"],
    });
    expect(b.failedEmails).toEqual(["paolo@ditta.it"]);
    expect(b.hard).toBe(true);
  });
});
