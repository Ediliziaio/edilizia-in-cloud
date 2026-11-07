// ============================================================================
// webhookNormalizers.test — Email Dual-Provider FASE 11
// ============================================================================
// Testa la normalizzazione cross-provider (SendGrid, Brevo, Elastic Email,
// Resend) in `NormalizedEvent` + la decisione sullo scope della
// suppression (globale vs per-azienda).
//
// Il modulo è importato direttamente dalla sua location in supabase/functions/
// per condividere la single-source-of-truth tra Edge Function e test.
// ============================================================================
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  normalizeEvents,
  decideSuppression,
  mapSendGridEvent,
  mapBrevoEvent,
  mapElasticEvent,
  mapResendEvent,
} from "../../../supabase/functions/_shared/webhookNormalizers";

// ── Per-provider event mappers ──────────────────────────────────────────────
describe("mapSendGridEvent", () => {
  it("mappa tutti gli eventi noti", () => {
    expect(mapSendGridEvent("delivered")).toBe("delivered");
    expect(mapSendGridEvent("open")).toBe("opened");
    expect(mapSendGridEvent("click")).toBe("clicked");
    expect(mapSendGridEvent("bounce")).toBe("bounced");
    expect(mapSendGridEvent("spamreport")).toBe("spam");
    expect(mapSendGridEvent("unsubscribe")).toBe("unsubscribed");
    expect(mapSendGridEvent("dropped")).toBe("dropped");
    expect(mapSendGridEvent("deferred")).toBe("deferred");
  });

  it("ritorna 'unknown' per eventi sconosciuti", () => {
    expect(mapSendGridEvent("weird")).toBe("unknown");
    expect(mapSendGridEvent("")).toBe("unknown");
  });
});

describe("mapBrevoEvent", () => {
  it("mappa hard_bounce e soft_bounce entrambi a 'bounced'", () => {
    expect(mapBrevoEvent("hard_bounce")).toBe("bounced");
    expect(mapBrevoEvent("soft_bounce")).toBe("bounced");
  });

  it("mappa complaint a 'spam'", () => {
    expect(mapBrevoEvent("complaint")).toBe("spam");
  });
});

describe("mapElasticEvent", () => {
  it("mappa status case-sensitive PascalCase", () => {
    expect(mapElasticEvent("Sent")).toBe("delivered");
    expect(mapElasticEvent("Bounced")).toBe("bounced");
    expect(mapElasticEvent("Complaint")).toBe("spam");
    expect(mapElasticEvent("Error")).toBe("dropped");
  });

  it("ritorna 'unknown' per status lowercase (non matchano)", () => {
    expect(mapElasticEvent("sent")).toBe("unknown");
    expect(mapElasticEvent("bounced")).toBe("unknown");
  });
});

describe("mapResendEvent", () => {
  it("richiede prefix 'email.' per matchare", () => {
    expect(mapResendEvent("email.delivered")).toBe("delivered");
    expect(mapResendEvent("email.bounced")).toBe("bounced");
    expect(mapResendEvent("email.complained")).toBe("spam");
  });

  it("ritorna 'unknown' per eventi senza prefix", () => {
    expect(mapResendEvent("delivered")).toBe("unknown");
    expect(mapResendEvent("bounced")).toBe("unknown");
  });
});

// ── Full payload dispatcher ─────────────────────────────────────────────────
describe("normalizeEvents — SendGrid", () => {
  it("normalizza array di eventi SendGrid", () => {
    const body = [
      {
        event: "delivered",
        email: "a@b.it",
        sg_message_id: "abc123.filter",
        timestamp: 1713787200,
        response: "250 OK",
      },
      {
        event: "bounce",
        email: "bad@invalid.it",
        sg_message_id: "def456.filter",
        timestamp: 1713787300,
        bounce_classification: "Invalid Address",
      },
    ];
    const events = normalizeEvents(body, "transactional");
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "delivered",
      email: "a@b.it",
      providerMessageId: "abc123",
      provider: "sendgrid",
    });
    expect(events[1]).toMatchObject({
      type: "bounced",
      isHardBounce: true,
      provider: "sendgrid",
    });
  });

  it("SendGrid: bounce senza classification ma con 'does not exist' → hard", () => {
    const body = [{
      event: "bounce",
      email: "x@y.it",
      sg_message_id: "msg.123",
      reason: "550 user does not exist",
    }];
    const events = normalizeEvents(body, "transactional");
    expect(events[0].isHardBounce).toBe(true);
  });

  it("SendGrid: bounce ambiguo → isHardBounce falsy", () => {
    const body = [{
      event: "bounce",
      email: "x@y.it",
      sg_message_id: "msg.123",
      reason: "temporary failure",
    }];
    const events = normalizeEvents(body, "transactional");
    expect(events[0].isHardBounce).toBeFalsy();
  });
});

describe("normalizeEvents — Resend", () => {
  it("normalizza Resend email.bounced permanent → hard", () => {
    const body = {
      type: "email.bounced",
      created_at: "2026-04-22T10:00:00Z",
      data: {
        email_id: "re_abc123",
        to: ["user@example.com"],
        bounce: { type: "Permanent", message: "Mailbox does not exist" },
      },
    };
    const events = normalizeEvents(body, "transactional");
    expect(events[0]).toMatchObject({
      type: "bounced",
      isHardBounce: true,
      email: "user@example.com",
      providerMessageId: "re_abc123",
      provider: "resend",
    });
  });

  it("Resend email.bounced transient → soft", () => {
    const body = {
      type: "email.bounced",
      data: {
        email_id: "re_xyz",
        to: ["x@y.it"],
        bounce: { type: "Transient", message: "Mailbox full" },
      },
    };
    const events = normalizeEvents(body, "transactional");
    expect(events[0].isHardBounce).toBe(false);
  });

  it("Resend email.delivered → nessun flag bounce", () => {
    const body = {
      type: "email.delivered",
      data: { email_id: "re_ok", to: ["a@b.it"] },
    };
    const events = normalizeEvents(body, "transactional");
    expect(events[0]).toMatchObject({
      type: "delivered",
      provider: "resend",
    });
    expect(events[0].isHardBounce).toBeUndefined();
  });

  it("Resend si riconosce dal type namespaced «email.*»", () => {
    const body = {
      type: "email.complained",
      data: { email_id: "re_spam", to: ["spam@report.it"] },
    };
    const events = normalizeEvents(body, "transactional");
    expect(events[0].provider).toBe("resend");
    expect(events[0].type).toBe("spam");
  });
});

describe("normalizeEvents — Brevo", () => {
  it("Brevo hard_bounce → bounced + isHardBounce=true", () => {
    const body = {
      event: "hard_bounce",
      email: "bad@test.it",
      "message-id": "<brevo123@relay.sib>",
      reason: "Invalid recipient",
      date: "2026-04-22 10:00:00",
    };
    const events = normalizeEvents(body, "marketing");
    expect(events[0]).toMatchObject({
      type: "bounced",
      isHardBounce: true,
      email: "bad@test.it",
      providerMessageId: "<brevo123@relay.sib>",
      provider: "brevo",
    });
  });

  it("Brevo soft_bounce → bounced + isHardBounce=false", () => {
    const body = {
      event: "soft_bounce",
      email: "x@y.it",
      "message-id": "<id@brevo>",
    };
    const events = normalizeEvents(body, "marketing");
    expect(events[0].isHardBounce).toBe(false);
  });

  it("Brevo complaint → spam", () => {
    const body = {
      event: "complaint",
      email: "x@y.it",
      "message-id": "<id@brevo>",
    };
    const events = normalizeEvents(body, "marketing");
    expect(events[0].type).toBe("spam");
  });
});

describe("normalizeEvents — Elastic Email", () => {
  it("EE Bounced HardBounce → hard", () => {
    const body = {
      status: "Bounced",
      msgID: "ee-msg-1",
      to: "user@test.it",
      error_category: "HardBounce",
    };
    const events = normalizeEvents(body, "marketing");
    expect(events[0]).toMatchObject({
      type: "bounced",
      isHardBounce: true,
      email: "user@test.it",
      provider: "elastic_email",
    });
  });

  it("EE Bounced NoMailbox case-insensitive → hard", () => {
    const body = {
      status: "Bounced",
      msgID: "ee-msg-2",
      to: "x@y.it",
      error_category: "NoMailbox",
    };
    const events = normalizeEvents(body, "marketing");
    expect(events[0].isHardBounce).toBe(true);
  });

  it("EE Bounced BadAddress → hard", () => {
    const body = {
      status: "Bounced",
      msgID: "ee-msg-3",
      to: "x@y.it",
      error_category: "BadAddress",
    };
    const events = normalizeEvents(body, "marketing");
    expect(events[0].isHardBounce).toBe(true);
  });

  it("EE Bounced con category ambigua → undefined (no refund)", () => {
    const body = {
      status: "Bounced",
      msgID: "ee-msg-4",
      to: "x@y.it",
      error_category: "Temporary",
    };
    const events = normalizeEvents(body, "marketing");
    expect(events[0].isHardBounce).toBeUndefined();
  });

  it("EE Complaint → spam", () => {
    const body = { status: "Complaint", msgID: "ee-spam", to: "x@y.it" };
    const events = normalizeEvents(body, "marketing");
    expect(events[0].type).toBe("spam");
  });
});

describe("normalizeEvents — edge cases", () => {
  it("body null → []", () => {
    expect(normalizeEvents(null, "marketing")).toEqual([]);
  });

  it("body vuoto {} → []", () => {
    expect(normalizeEvents({}, "marketing")).toEqual([]);
  });

  it("payload SendGrid array vuoto → []", () => {
    expect(normalizeEvents([], "marketing")).toEqual([]);
  });

  it("un payload che non si riconosce non produce eventi (07/11/2026)", () => {
    // Fino al 07/11 un body con il solo campo `event` cadeva sul «catch-all»
    // Mailgun e veniva letto come un evento Mailgun. Mailgun non è mai stato
    // configurato ed è stato tolto: un payload ignoto si scarta, perché un
    // rimbalzo inventato sopprimerebbe un indirizzo buono.
    expect(normalizeEvents({ event: "delivered" }, "marketing")).toEqual([]);
    expect(normalizeEvents({ "event-data": { event: "failed", recipient: "x@y.it" } }, "marketing")).toEqual([]);
  });
});

// ── Suppression decision logic ──────────────────────────────────────────────
describe("decideSuppression", () => {
  it("hard bounce → reason=hard_bounce, scope=globale (company_id=null)", () => {
    const r = decideSuppression(
      { type: "bounced", isHardBounce: true, email: "x@y.it", provider: "sendgrid" },
      "company-abc",
    );
    expect(r).toEqual({
      reason: "hard_bounce",
      companyIdScope: null,
      shouldSuppress: true,
    });
  });

  it("soft bounce → no suppression", () => {
    const r = decideSuppression(
      { type: "bounced", isHardBounce: false, email: "x@y.it" },
      "company-abc",
    );
    expect(r.shouldSuppress).toBe(false);
    expect(r.reason).toBeNull();
  });

  it("bounce ambiguo (isHardBounce undefined) → no suppression", () => {
    const r = decideSuppression(
      { type: "bounced", email: "x@y.it" },
      "company-abc",
    );
    expect(r.shouldSuppress).toBe(false);
  });

  it("spam complaint → reason=spam_complaint, scope=globale", () => {
    const r = decideSuppression(
      { type: "spam", email: "x@y.it", provider: "resend" },
      "company-abc",
    );
    expect(r).toEqual({
      reason: "spam_complaint",
      companyIdScope: null,
      shouldSuppress: true,
    });
  });

  it("unsubscribe → reason=unsubscribe, scope=PER-AZIENDA (preserva company_id)", () => {
    const r = decideSuppression(
      { type: "unsubscribed", email: "x@y.it", provider: "elastic_email" },
      "company-abc",
    );
    expect(r).toEqual({
      reason: "unsubscribe",
      companyIdScope: "company-abc",
      shouldSuppress: true,
    });
  });

  it("unsubscribe SENZA company_id conosciuta → no suppression globale", () => {
    const r = decideSuppression(
      { type: "unsubscribed", email: "x@y.it" },
      null,
    );
    expect(r.reason).toBeNull();
    expect(r.companyIdScope).toBeNull();
    expect(r.shouldSuppress).toBe(false);
  });

  it("delivered / opened / clicked / dropped / deferred → no suppression", () => {
    for (const type of ["delivered", "opened", "clicked", "dropped", "deferred"] as const) {
      const r = decideSuppression(
        { type, email: "x@y.it" },
        "company-abc",
      );
      expect(r.shouldSuppress).toBe(false);
    }
  });
});

// ── Mailgun tolto (07/11/2026) ──────────────────────────────────────────────
// Mai configurato: nessuna impostazione, nessun invio, nessun log, niente nel
// Vault. I provider in uso sono Resend (transazionali) ed Elastic Email
// (marketing). Questi controlli impediscono che rientri da una porta laterale.
describe("Mailgun non è più un provider", () => {
  const leggi = (p: string) => readFileSync(join(__dirname, "../../..", p), "utf8");

  it("non si sceglie nel pannello e non ha un campo per la firma", () => {
    expect(leggi("src/components/admin/settings/email/EmailProviderConfig.tsx")).not.toMatch(/value: "mailgun"/);
    expect(leggi("src/components/admin/settings/email/EmailWebhookConfig.tsx")).not.toMatch(/mailgun/i);
  });

  it("non ha un ramo di invio, di verifica firma o di controllo salute", () => {
    expect(leggi("supabase/functions/_shared/emailProvider.ts")).not.toMatch(/case "mailgun"|api\.mailgun\.net/);
    expect(leggi("supabase/functions/_shared/webhookSecurity.ts")).not.toMatch(/Mailgun/);
    expect(leggi("supabase/functions/check-api-health/index.ts")).not.toMatch(/mailgun/i);
  });
});
