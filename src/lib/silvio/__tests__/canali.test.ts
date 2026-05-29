import { describe, it, expect } from "vitest";
import {
  richiedeIdentitaVerificata, forzaConferma, approvabileSuCanale,
  richiedeRiformulazione, SOGLIA_CONFIDENZA_CANALE,
} from "../canali";

describe("identità obbligatoria sui canali esterni", () => {
  it("whatsapp/voce richiedono identità verificata", () => {
    expect(richiedeIdentitaVerificata("whatsapp")).toBe(true);
    expect(richiedeIdentitaVerificata("voce")).toBe(true);
  });
  it("web/email no (identità di sessione)", () => {
    expect(richiedeIdentitaVerificata("web")).toBe(false);
    expect(richiedeIdentitaVerificata("email")).toBe(false);
  });
});

describe("forza conferma calibrata sul canale", () => {
  it("web → piena per qualsiasi rischio", () => {
    expect(forzaConferma("web", "denaro")).toBe("piena");
    expect(forzaConferma("web", "interno")).toBe("piena");
  });
  it("whatsapp: interno forte, denaro/esterno → rimanda all'app", () => {
    expect(forzaConferma("whatsapp", "interno")).toBe("forte");
    expect(forzaConferma("whatsapp", "denaro")).toBe("rimanda_app");
    expect(forzaConferma("whatsapp", "esterno")).toBe("rimanda_app");
  });
  it("voce: interno media, esterno forte, denaro → rimanda all'app", () => {
    expect(forzaConferma("voce", "interno")).toBe("media");
    expect(forzaConferma("voce", "esterno")).toBe("forte");
    expect(forzaConferma("voce", "denaro")).toBe("rimanda_app");
  });
});

describe("approvabileSuCanale — denaro su canale debole rimanda all'app", () => {
  it("denaro NON approvabile via whatsapp/voce", () => {
    expect(approvabileSuCanale("whatsapp", "denaro")).toBe(false);
    expect(approvabileSuCanale("voce", "denaro")).toBe(false);
  });
  it("interno approvabile via voce/whatsapp", () => {
    expect(approvabileSuCanale("voce", "interno")).toBe(true);
    expect(approvabileSuCanale("whatsapp", "interno")).toBe(true);
  });
  it("denaro sempre approvabile via web", () => expect(approvabileSuCanale("web", "denaro")).toBe(true));
});

describe("interpretazione incerta → riformula, non agire", () => {
  it("confidenza bassa → riformula", () => expect(richiedeRiformulazione(SOGLIA_CONFIDENZA_CANALE - 0.1)).toBe(true));
  it("confidenza assente → riformula", () => expect(richiedeRiformulazione(null)).toBe(true));
  it("confidenza alta → procede", () => expect(richiedeRiformulazione(0.9)).toBe(false));
});
