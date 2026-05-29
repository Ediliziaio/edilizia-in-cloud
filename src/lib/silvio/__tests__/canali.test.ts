import { describe, it, expect } from "vitest";
import {
  richiedeIdentitaVerificata, forzaConferma, approvabileSuCanale,
  richiedeRiformulazione, SOGLIA_CONFIDENZA_CANALE, messaggioEsito,
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

describe("messaggioEsito — il canale dice la verità (coda ≠ fatto)", () => {
  it("solo coda → dice da confermare in app, non 'fatto'", () => {
    const m = messaggioEsito(0, 2, true);
    expect(m).toContain("da confermare in app");
    expect(m).not.toContain("Ho fatto");
  });
  it("solo eseguite → 'Ho fatto N'", () => {
    expect(messaggioEsito(3, 0, true)).toContain("Ho fatto 3 cose");
  });
  it("singolare corretto", () => {
    expect(messaggioEsito(1, 0, true)).toContain("Ho fatto 1 cosa");
    expect(messaggioEsito(0, 1, true)).toContain("azione è da confermare");
  });
  it("misto → mostra entrambe", () => {
    const m = messaggioEsito(1, 1, true);
    expect(m).toContain("Ho fatto 1 cosa");
    expect(m).toContain("da confermare in app");
  });
  it("niente da fare → messaggio neutro", () => expect(messaggioEsito(0, 0, true)).toBe("Ok, non serviva fare nulla."));
  it("non capito → invita a riformulare", () => expect(messaggioEsito(0, 0, false)).toContain("riformulare"));
});
