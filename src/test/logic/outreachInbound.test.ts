import { describe, it, expect } from "vitest";
import {
  extractEmail, snippetFrom, normalizeInbound, isSnsSubscriptionConfirmation,
} from "../../../supabase/functions/_shared/outreach-inbound-logic";

describe("extractEmail", () => {
  it("estrae da 'Nome <email>'", () => {
    expect(extractEmail("Mario Rossi <Mario.Rossi@Test.IT>")).toBe("mario.rossi@test.it");
  });
  it("estrae da indirizzo nudo", () => {
    expect(extractEmail("luigi@verdi.com")).toBe("luigi@verdi.com");
  });
  it("null se assente", () => {
    expect(extractEmail(null)).toBeNull();
    expect(extractEmail("nessuna email qui")).toBeNull();
  });
});

describe("snippetFrom", () => {
  it("rimuove righe citate", () => {
    const body = "Ciao, mi interessa.\n> Il giorno X hai scritto:\n> blah blah";
    expect(snippetFrom(body)).toBe("Ciao, mi interessa.");
  });
  it("taglia sull'header di quoting IT/EN", () => {
    expect(snippetFrom("Va bene, sentiamoci.\nIl 12/06 ha scritto:\nvecchio testo")).toBe("Va bene, sentiamoci.");
    expect(snippetFrom("Sounds good.\nOn Mon, Jun 12 wrote:\nold")).toBe("Sounds good.");
  });
  it("si ferma alla firma --", () => {
    expect(snippetFrom("Perfetto.\n--\nMario | CEO")).toBe("Perfetto.");
  });
  it("comprime spazi e tronca", () => {
    const long = "a ".repeat(200);
    const s = snippetFrom(long, 50)!;
    expect(s.length).toBeLessThanOrEqual(50);
    expect(s.endsWith("…")).toBe(true);
  });
  it("null se vuoto", () => {
    expect(snippetFrom("")).toBeNull();
    expect(snippetFrom(null)).toBeNull();
  });
});

describe("normalizeInbound", () => {
  it("formato semplice", () => {
    const r = normalizeInbound({ from: "Anna <anna@x.it>", to: "marco@mail-edilizia.com", subject: "Re: proposta", text: "Sì, mi interessa.\n> citazione" });
    expect(r).toEqual({
      fromEmail: "anna@x.it", toEmail: "marco@mail-edilizia.com",
      subject: "Re: proposta", snippet: "Sì, mi interessa.", messageId: null, inReplyTo: null,
      headers: {},
    });
  });
  it("estrae header (oggetto chiave→valore) lowercase", () => {
    const r = normalizeInbound({
      from: "ooo@x.it", subject: "Out of office",
      headers: { "Auto-Submitted": "auto-replied", "X-Mailer": "Vacation" },
    });
    expect(r?.headers).toEqual({ "auto-submitted": "auto-replied", "x-mailer": "Vacation" });
  });
  it("estrae header da array stile SES Lambda ({name,value})", () => {
    const r = normalizeInbound({
      from: "ooo@x.it", subject: "x",
      headers: [{ name: "Precedence", value: "bulk" }, { name: "Subject", value: "x" }],
    });
    expect(r?.headers?.["precedence"]).toBe("bulk");
  });
  it("chiavi stile Mailgun", () => {
    const r = normalizeInbound({ sender: "boss@impresa.it", recipient: "luca@get-edilizia.com", Subject: "RISPOSTA", "stripped-text": "Chiamami." });
    expect(r?.fromEmail).toBe("boss@impresa.it");
    expect(r?.toEmail).toBe("luca@get-edilizia.com");
    expect(r?.subject).toBe("RISPOSTA");
    expect(r?.snippet).toBe("Chiamami.");
  });
  it("null senza mittente", () => {
    expect(normalizeInbound({ subject: "vuoto" })).toBeNull();
    expect(normalizeInbound(null)).toBeNull();
    expect(normalizeInbound("stringa")).toBeNull();
  });
});

describe("isSnsSubscriptionConfirmation", () => {
  it("riconosce la conferma SNS", () => {
    expect(isSnsSubscriptionConfirmation({ Type: "SubscriptionConfirmation", SubscribeURL: "https://…" })).toBe(true);
  });
  it("falso per notifiche normali", () => {
    expect(isSnsSubscriptionConfirmation({ Type: "Notification" })).toBe(false);
    expect(isSnsSubscriptionConfirmation({ from: "x@y.it" })).toBe(false);
  });
});
