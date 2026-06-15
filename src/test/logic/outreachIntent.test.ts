import { describe, it, expect } from "vitest";
import {
  INTENT_LABELS,
  normalizeIntent,
  normalizeConfidence,
  buildIntentUserPrompt,
} from "../../../supabase/functions/_shared/outreach-intent";

describe("normalizeIntent", () => {
  it("etichette valide passano invariate", () => {
    for (const l of INTENT_LABELS) expect(normalizeIntent(l)).toBe(l);
  });
  it("sinonimi mappati", () => {
    expect(normalizeIntent("interest")).toBe("interested");
    expect(normalizeIntent("NO")).toBe("not_interested");
    expect(normalizeIntent("OOO")).toBe("out_of_office");
    expect(normalizeIntent("opt-out")).toBe("unsubscribe");
    expect(normalizeIntent("domanda")).toBe("question");
  });
  it("normalizza spazi/trattini/maiuscole", () => {
    expect(normalizeIntent("Not Interested")).toBe("not_interested");
    expect(normalizeIntent(" out-of-office ")).toBe("out_of_office");
  });
  it("sconosciuto → other", () => {
    expect(normalizeIntent("blah")).toBe("other");
    expect(normalizeIntent(null)).toBe("other");
    expect(normalizeIntent(undefined)).toBe("other");
  });
});

describe("normalizeConfidence", () => {
  it("numeri in range", () => {
    expect(normalizeConfidence(0.7)).toBe(0.7);
  });
  it("clamp 0-1", () => {
    expect(normalizeConfidence(1.5)).toBe(1);
    expect(normalizeConfidence(-2)).toBe(0);
  });
  it("stringhe numeriche", () => {
    expect(normalizeConfidence("0.4")).toBe(0.4);
  });
  it("non numerico → 0", () => {
    expect(normalizeConfidence("x")).toBe(0);
    expect(normalizeConfidence(null)).toBe(0);
  });
});

describe("buildIntentUserPrompt", () => {
  it("include oggetto ed estratto, tronca a 600", () => {
    const p = buildIntentUserPrompt("Re: ciao", "x".repeat(800));
    expect(p).toContain("Oggetto: Re: ciao");
    expect(p).toContain("x".repeat(600));
    expect(p).not.toContain("x".repeat(601));
  });
  it("placeholder se vuoti", () => {
    expect(buildIntentUserPrompt("", "")).toContain("—");
  });
});
