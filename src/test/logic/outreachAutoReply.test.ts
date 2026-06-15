import { describe, it, expect } from "vitest";
import {
  isAutoReply,
  headersIndicateAutoReply,
  textIndicatesAutoReply,
} from "../../../supabase/functions/_shared/outreach-autoreply";

describe("headersIndicateAutoReply", () => {
  it("Auto-Submitted: auto-replied → true (RFC 3834)", () => {
    expect(headersIndicateAutoReply({ "Auto-Submitted": "auto-replied" })).toBe(true);
    expect(headersIndicateAutoReply({ "auto-submitted": "auto-generated" })).toBe(true);
  });
  it("Auto-Submitted: no → false", () => {
    expect(headersIndicateAutoReply({ "Auto-Submitted": "no" })).toBe(false);
  });
  it("Precedence bulk/junk/auto_reply → true", () => {
    expect(headersIndicateAutoReply({ Precedence: "bulk" })).toBe(true);
    expect(headersIndicateAutoReply({ precedence: "junk" })).toBe(true);
    expect(headersIndicateAutoReply({ Precedence: "auto_reply" })).toBe(true);
  });
  it("Precedence: list da solo NON basta (newsletter legittime)", () => {
    expect(headersIndicateAutoReply({ Precedence: "list" })).toBe(false);
  });
  it("X-Autoreply / X-Autorespond presenti → true", () => {
    expect(headersIndicateAutoReply({ "X-Autoreply": "yes" })).toBe(true);
    expect(headersIndicateAutoReply({ "X-Autorespond": "1" })).toBe(true);
    expect(headersIndicateAutoReply({ "X-Auto-Response-Suppress": "All" })).toBe(true);
  });
  it("From mailer-daemon / no-reply / postmaster → true", () => {
    expect(headersIndicateAutoReply({ From: "Mail Delivery System <MAILER-DAEMON@example.com>" })).toBe(true);
    expect(headersIndicateAutoReply({ from: "no-reply@azienda.it" })).toBe(true);
    expect(headersIndicateAutoReply({ From: "postmaster@corp.com" })).toBe(true);
  });
  it("header assenti / vuoti → false", () => {
    expect(headersIndicateAutoReply(null)).toBe(false);
    expect(headersIndicateAutoReply(undefined)).toBe(false);
    expect(headersIndicateAutoReply({})).toBe(false);
    expect(headersIndicateAutoReply({ From: "mario.rossi@cliente.it", Subject: "Re: proposta" })).toBe(false);
  });
});

describe("textIndicatesAutoReply", () => {
  it("oggetto 'Out of Office' → true", () => {
    expect(textIndicatesAutoReply("Out of Office: Re: la tua proposta", "")).toBe(true);
    expect(textIndicatesAutoReply("Automatic reply: meeting", null)).toBe(true);
  });
  it("oggetto/corpo IT 'fuori sede' / 'risposta automatica' / 'in ferie' → true", () => {
    expect(textIndicatesAutoReply("R: la tua email", "Sono attualmente fuori sede e rientrerò lunedì.")).toBe(true);
    expect(textIndicatesAutoReply("Risposta automatica", "")).toBe(true);
    expect(textIndicatesAutoReply(null, "Grazie della mail, sono in ferie fino al 30 agosto.")).toBe(true);
    expect(textIndicatesAutoReply("Re: proposta", "Al momento non sono in ufficio.")).toBe(true);
  });
  it("autorisposte non-italiane comuni → true", () => {
    expect(textIndicatesAutoReply("Abwesenheitsnotiz", "")).toBe(true);
    expect(textIndicatesAutoReply("Réponse automatique", "")).toBe(true);
    expect(textIndicatesAutoReply("Respuesta automática", "")).toBe(true);
  });
  it("risposta umana normale → false", () => {
    expect(textIndicatesAutoReply("Re: la tua proposta", "Ciao, grazie! Mi interessa, possiamo sentirci giovedì?")).toBe(false);
    expect(textIndicatesAutoReply("Info costi", "Quanto costa il vostro servizio? Mandami un preventivo.")).toBe(false);
    expect(textIndicatesAutoReply("", "")).toBe(false);
  });
  it("non confonde 'ufficio' generico in una risposta vera", () => {
    expect(textIndicatesAutoReply("Re: appuntamento", "Passa pure dal nostro ufficio quando vuoi, siamo disponibili.")).toBe(false);
  });
});

describe("isAutoReply (decisione complessiva)", () => {
  it("header auto-submitted vince anche con corpo neutro", () => {
    expect(isAutoReply({ headers: { "Auto-Submitted": "auto-replied" }, subject: "Re: x", body: "ok" })).toBe(true);
  });
  it("from di sistema basta da solo (senza header normalizzati)", () => {
    expect(isAutoReply({ from: "mailer-daemon@googlemail.com", subject: "Delivery Status Notification" })).toBe(true);
  });
  it("euristica testo quando mancano gli header", () => {
    expect(isAutoReply({ subject: "Fuori sede", body: "Rientro il 5 settembre." })).toBe(true);
  });
  it("risposta umana → false (nessun header, testo normale)", () => {
    expect(isAutoReply({ subject: "Re: proposta", body: "Sì, sono interessato. Chiamami domani." })).toBe(false);
    expect(isAutoReply({})).toBe(false);
  });
  it("è idempotente sul risultato (funzione pura, nessuno stato)", () => {
    const a = { subject: "Out of office", body: "back monday" };
    expect(isAutoReply(a)).toBe(isAutoReply(a));
  });
});
