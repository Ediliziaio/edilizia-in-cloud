import { describe, expect, it } from "vitest";
import { eDominioGratuito } from "@/lib/email/dominiGratuiti";

describe("domini delle caselle gratuite", () => {
  it("Gmail, Outlook.com e i fornitori italiani non si controllano", () => {
    for (const d of ["gmail.com", "GMAIL.COM", " outlook.it ", "@libero.it", "icloud.com", "hotmail.it"]) {
      expect(eDominioGratuito(d), d).toBe(true);
    }
  });

  it("i domini aziendali sì, anche se la posta è su Google o Microsoft", () => {
    for (const d of ["overthemol.com", "impresa-rossi.it", "mail.gmail.com.example.it", "", null]) {
      expect(eDominioGratuito(d), String(d)).toBe(false);
    }
  });
});
