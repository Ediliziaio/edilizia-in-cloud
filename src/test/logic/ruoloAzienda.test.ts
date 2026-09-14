/**
 * Il ruolo mostrato in fondo alla barra laterale e chi sceglie il settore.
 *
 * Caso vero, BeMade 14/09: Venusia (company_staff + call_center) vedeva «Admin»
 * sotto il suo nome e al primo accesso è stata mandata a scegliere il settore
 * dell'azienda, che ha salvato.
 */
import { describe, expect, it } from "vitest";
import { etichettaRuoloAzienda, puoScegliereSettore, ruoloPrincipale } from "@/lib/auth/ruoloAzienda";

describe("etichettaRuoloAzienda", () => {
  it("una call center si legge call center, non Admin", () => {
    expect(etichettaRuoloAzienda("company_staff", ["company_staff", "call_center"])).toBe("Call center");
  });

  it("l'amministratore resta Admin", () => {
    expect(etichettaRuoloAzienda("company_admin", ["company_admin"])).toBe("Admin");
  });

  it("vince il ruolo più significativo, in qualunque ordine arrivino", () => {
    expect(etichettaRuoloAzienda("company_staff", ["call_center", "salesperson", "company_staff"])).toBe("Commerciale");
    expect(etichettaRuoloAzienda("call_center", ["company_admin", "call_center"])).toBe("Admin");
  });

  it("lo staff senza altri ruoli è Staff", () => {
    expect(etichettaRuoloAzienda("company_staff", ["company_staff"])).toBe("Staff");
  });

  it("il super admin dentro un'azienda si legge Super Admin", () => {
    expect(etichettaRuoloAzienda("company_admin", ["company_admin"], { isImpersonating: true })).toBe("Super Admin");
  });

  it("senza ruoli non inventa un titolo", () => {
    expect(etichettaRuoloAzienda(null, [])).toBe("Accesso");
  });
});

describe("ruoloPrincipale", () => {
  it("usa anche il ruolo singolo quando l'elenco è vuoto", () => {
    expect(ruoloPrincipale("call_center", [])).toBe("call_center");
  });
});

describe("puoScegliereSettore", () => {
  it("solo l'amministratore sceglie il settore", () => {
    expect(puoScegliereSettore("company_admin", ["company_admin"])).toBe(true);
    expect(puoScegliereSettore("company_staff", ["company_staff", "company_admin"])).toBe(true);
  });

  it("call center, commerciali e staff no", () => {
    expect(puoScegliereSettore("company_staff", ["company_staff", "call_center"])).toBe(false);
    expect(puoScegliereSettore("salesperson", ["salesperson"])).toBe(false);
    expect(puoScegliereSettore("company_staff", ["company_staff"])).toBe(false);
    expect(puoScegliereSettore(null, [])).toBe(false);
  });
});
