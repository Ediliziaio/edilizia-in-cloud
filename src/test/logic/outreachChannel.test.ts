import { describe, it, expect } from "vitest";
import {
  channelForNodeType,
  isMessageChannelNode,
  isOptedOut,
  normalizePhone,
  planChannelSend,
  hasTemplate,
  orderTemplateParams,
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

// ── hasTemplate: nodo WhatsApp con template approvato vs testo libero ─────────
describe("hasTemplate", () => {
  it("template_name valorizzato → true", () => {
    expect(hasTemplate({ name: "promo_estate" })).toBe(true);
  });
  it("name assente/vuoto/solo-spazi → false (testo libero)", () => {
    expect(hasTemplate({ name: null })).toBe(false);
    expect(hasTemplate({ name: "" })).toBe(false);
    expect(hasTemplate({ name: "   " })).toBe(false);
    expect(hasTemplate(null)).toBe(false);
    expect(hasTemplate(undefined)).toBe(false);
    expect(hasTemplate({})).toBe(false);
  });
});

// ── orderTemplateParams: mappa posizionale → array ordinato per {{n}} ─────────
describe("orderTemplateParams", () => {
  it("mappa { '1','2','3' } → array nell'ordine 1,2,3", () => {
    expect(orderTemplateParams({ "1": "a", "2": "b", "3": "c" })).toEqual(["a", "b", "c"]);
  });
  it("ordina per chiave NUMERICA (non lessicografica): 10 dopo 2", () => {
    expect(orderTemplateParams({ "2": "b", "10": "j", "1": "a" })).toEqual(["a", "b", "", "", "", "", "", "", "", "j"]);
  });
  it("posizioni mancanti → '' (Meta richiede un parametro per ogni {{n}})", () => {
    expect(orderTemplateParams({ "1": "a", "3": "c" })).toEqual(["a", "", "c"]);
  });
  it("array già ordinato → mappato a stringhe", () => {
    expect(orderTemplateParams(["x", "y"])).toEqual(["x", "y"]);
  });
  it("null/undefined/oggetto vuoto → array vuoto", () => {
    expect(orderTemplateParams(null)).toEqual([]);
    expect(orderTemplateParams(undefined)).toEqual([]);
    expect(orderTemplateParams({})).toEqual([]);
  });
  it("chiavi non numeriche o <1 ignorate", () => {
    expect(orderTemplateParams({ "0": "z", foo: "bar", "1": "a" })).toEqual(["a"]);
  });
});
