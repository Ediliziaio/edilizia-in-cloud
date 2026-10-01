import { describe, expect, it } from "vitest";
import {
  contaPerCanale, formattaContatto, percorsoMessaggio, rigaPercorsoWhatsApp,
} from "@/lib/conversazioni/presentazione";

describe("presentazione dei messaggi", () => {
  it("formatta i numeri e lascia le email", () => {
    expect(formattaContatto("393479047790")).toBe("+39 347 9047790");
    expect(formattaContatto("+39 331 953 6197")).toBe("+39 331 9536197");
    expect(formattaContatto("a@b.it")).toBe("a@b.it");
    expect(formattaContatto("")).toBe("");
    expect(formattaContatto("15")).toBe("15");
  });

  it("scrive il percorso da → a con il numero usato", () => {
    const p = percorsoMessaggio({ da: "+39 331 953 6197", a: "393479047790", via: "Il Bagno Group" });
    expect(rigaPercorsoWhatsApp(p)).toBe("+39 331 9536197 (Il Bagno Group) → +39 347 9047790");
    expect(percorsoMessaggio({ da: null, a: null, via: null })).toBeNull();
    expect(percorsoMessaggio(undefined)).toBeNull();
  });

  it("conta i messaggi per canale", () => {
    expect(contaPerCanale([{ canale: "whatsapp" }, { canale: "email" }, { canale: "email" }, { canale: "nota" }]))
      .toEqual({ tutti: 4, whatsapp: 1, email: 2, sms: 0 });
  });
});
