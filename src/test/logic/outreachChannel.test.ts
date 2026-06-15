import { describe, it, expect } from "vitest";
import {
  channelForNodeType,
  isMessageChannelNode,
  isOptedOut,
  normalizePhone,
  planChannelSend,
} from "../../../supabase/functions/_shared/outreach-channel";

// ── channelForNodeType ───────────────────────────────────────────────────────
describe("channelForNodeType", () => {
  it("nodi d'invio → il loro canale", () => {
    expect(channelForNodeType("email")).toBe("email");
    expect(channelForNodeType("whatsapp")).toBe("whatsapp");
    expect(channelForNodeType("sms")).toBe("sms");
  });
  it("nodi non-invianti → null", () => {
    expect(channelForNodeType("wait")).toBeNull();
    expect(channelForNodeType("condition")).toBeNull();
    expect(channelForNodeType("end")).toBeNull();
    expect(channelForNodeType(null)).toBeNull();
    expect(channelForNodeType(undefined)).toBeNull();
  });
});

describe("isMessageChannelNode", () => {
  it("whatsapp/sms → true; email/altro → false", () => {
    expect(isMessageChannelNode("whatsapp")).toBe(true);
    expect(isMessageChannelNode("sms")).toBe(true);
    expect(isMessageChannelNode("email")).toBe(false);
    expect(isMessageChannelNode("wait")).toBe(false);
    expect(isMessageChannelNode(null)).toBe(false);
  });
});

// ── isOptedOut: opt-out PER-CANALE ───────────────────────────────────────────
describe("isOptedOut — opt-out per-canale indipendente", () => {
  it("optout_sms blocca SOLO l'sms, non whatsapp/email", () => {
    const c = { optout_sms: true, optout_whatsapp: false, optout_email: false };
    expect(isOptedOut("sms", c)).toBe(true);
    expect(isOptedOut("whatsapp", c)).toBe(false);
    expect(isOptedOut("email", c)).toBe(false);
  });
  it("optout_whatsapp blocca SOLO whatsapp", () => {
    const c = { optout_whatsapp: true };
    expect(isOptedOut("whatsapp", c)).toBe(true);
    expect(isOptedOut("sms", c)).toBe(false);
  });
  it("null/undefined → non optato", () => {
    expect(isOptedOut("sms", null)).toBe(false);
    expect(isOptedOut("whatsapp", {})).toBe(false);
    expect(isOptedOut("sms", { optout_sms: null })).toBe(false);
  });
});

// ── normalizePhone ───────────────────────────────────────────────────────────
describe("normalizePhone", () => {
  it("tiene solo le cifre", () => {
    expect(normalizePhone("+39 333 12 34 567")).toBe("393331234567");
    expect(normalizePhone("(02) 1234-5678")).toBe("0212345678");
  });
  it("vuoto/null → stringa vuota", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone(null)).toBe("");
    expect(normalizePhone(undefined)).toBe("");
    expect(normalizePhone("nessuna cifra")).toBe("");
  });
});

// ── planChannelSend: telefono mancante / opt-out → skip; valido → ok ─────────
describe("planChannelSend", () => {
  it("contatto con telefono e senza opt-out → spedibile", () => {
    const plan = planChannelSend("sms", { phone: "+39 333 1234567" });
    expect(plan.ok).toBe(true);
    expect(plan.phone).toBe("393331234567");
    expect(plan.skipReason).toBeUndefined();
  });

  it("telefono mancante → NON spedibile, skipReason 'telefono mancante'", () => {
    const plan = planChannelSend("whatsapp", { phone: null });
    expect(plan.ok).toBe(false);
    expect(plan.phone).toBe("");
    expect(plan.skipReason).toBe("telefono mancante");
  });

  it("telefono presente ma solo simboli → mancante", () => {
    const plan = planChannelSend("sms", { phone: "---" });
    expect(plan.ok).toBe(false);
    expect(plan.skipReason).toBe("telefono mancante");
  });

  it("opt-out di canale → NON spedibile, skipReason 'optout_<canale>'", () => {
    const sms = planChannelSend("sms", { phone: "3331234567", optout_sms: true });
    expect(sms.ok).toBe(false);
    expect(sms.skipReason).toBe("optout_sms");
    const wa = planChannelSend("whatsapp", { phone: "3331234567", optout_whatsapp: true });
    expect(wa.ok).toBe(false);
    expect(wa.skipReason).toBe("optout_whatsapp");
  });

  it("opt-out su un ALTRO canale non blocca questo canale", () => {
    // optato su whatsapp ma spedito via sms: deve passare.
    const plan = planChannelSend("sms", { phone: "3331234567", optout_whatsapp: true, optout_sms: false });
    expect(plan.ok).toBe(true);
  });

  it("contatto assente → non spedibile", () => {
    const plan = planChannelSend("sms", null);
    expect(plan.ok).toBe(false);
    expect(plan.skipReason).toBe("contatto assente");
  });
});
