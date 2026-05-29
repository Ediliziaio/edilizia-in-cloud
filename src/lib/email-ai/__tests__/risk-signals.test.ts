import { describe, it, expect } from "vitest";
import {
  levenshtein, isLookAlikeDomain, isUrgentPaymentRequest, hasLinkMismatch,
  hasSuspiciousAttachment, parseAuthResults, valutaRischio,
} from "../risk-signals";

describe("levenshtein", () => {
  it("uguali = 0", () => expect(levenshtein("edilforniture.it", "edilforniture.it")).toBe(0));
  it("1 sostituzione", () => expect(levenshtein("edilfomiture.it", "edilforniture.it")).toBeLessThanOrEqual(2));
});

describe("isLookAlikeDomain", () => {
  it("rileva look-alike (rn↔m)", () => expect(isLookAlikeDomain("edilfomiture.it", ["edilforniture.it"])).toBe("edilforniture.it"));
  it("dominio uguale NON è look-alike", () => expect(isLookAlikeDomain("edilforniture.it", ["edilforniture.it"])).toBeNull());
  it("dominio del tutto diverso → null", () => expect(isLookAlikeDomain("gmail.com", ["edilforniture.it"])).toBeNull());
});

describe("isUrgentPaymentRequest", () => {
  it("urgenza + pagamento → true", () => expect(isUrgentPaymentRequest("URGENTE: effettuare bonifico entro oggi sul nuovo IBAN")).toBe(true));
  it("solo urgenza → false", () => expect(isUrgentPaymentRequest("Risposta urgente per favore")).toBe(false));
  it("solo pagamento → false", () => expect(isUrgentPaymentRequest("In allegato la fattura, IBAN in calce")).toBe(false));
});

describe("hasLinkMismatch", () => {
  it("testo banca, href altro dominio → true", () =>
    expect(hasLinkMismatch([{ text: "vai su intesasanpaolo.it", href: "http://evil-phish.ru/login" }])).toBe(true));
  it("coerente → false", () =>
    expect(hasLinkMismatch([{ text: "ediliziaincloud.it", href: "https://ediliziaincloud.it/area" }])).toBe(false));
});

describe("hasSuspiciousAttachment", () => {
  it("exe → true", () => expect(hasSuspiciousAttachment(["fattura.pdf", "documento.exe"])).toBe(true));
  it("docm macro → true", () => expect(hasSuspiciousAttachment(["report.docm"])).toBe(true));
  it("pdf/xlsx puliti → false", () => expect(hasSuspiciousAttachment(["fattura.pdf", "dati.xlsx"])).toBe(false));
});

describe("parseAuthResults", () => {
  it("estrae spf/dkim/dmarc", () => {
    const r = parseAuthResults("mx.google.com; spf=fail; dkim=fail; dmarc=fail");
    expect(r).toEqual({ spf: "fail", dkim: "fail", dmarc: "fail" });
  });
  it("pass", () => expect(parseAuthResults("spf=pass dkim=pass dmarc=pass").dmarc).toBe("pass"));
});

describe("valutaRischio", () => {
  it("IBAN diverso → alto", () => {
    const r = valutaRischio({ ibanDiverso: true });
    expect(r.livello).toBe("alto");
    expect(r.segnali.some((s) => s.codice === "iban_diverso")).toBe(true);
  });
  it("look-alike + urgenza pagamento → alto", () => {
    const r = valutaRischio({
      senderDomain: "edilfomiture.it", knownDomains: ["edilforniture.it"],
      testo: "URGENTE pagare bonifico su nuovo IBAN entro oggi",
    });
    expect(r.livello).toBe("alto");
  });
  it("email legittima → basso (zero falsi blocchi)", () => {
    const r = valutaRischio({
      authHeader: "spf=pass dkim=pass dmarc=pass",
      senderDomain: "edilforniture.it", knownDomains: ["edilforniture.it"],
      testo: "Buongiorno, in allegato il preventivo richiesto.",
      attachmentNames: ["preventivo.pdf"],
    });
    expect(r.livello).toBe("basso");
    expect(r.segnali).toHaveLength(0);
  });
  it("solo auth fail → medio (non condanna su singolo segnale debole)", () => {
    const r = valutaRischio({ authHeader: "spf=fail dkim=fail dmarc=fail" });
    expect(r.livello).toBe("medio");
  });
});
