import { describe, it, expect } from "vitest";
import {
  accessoPiattaforma,
  quantiEntrano,
  spiegazioneAccesso,
  ETICHETTA_ACCESSO,
} from "@/lib/hr/accessoPiattaforma";

const marco = { id: "u1", first_name: "Marco", last_name: "Ricci", email: "marco@azienda.it" };
const elena = { id: "u2", first_name: "Elena", last_name: "Conti", email: "Elena@Azienda.IT" };
const staff = [marco, elena];

describe("accessoPiattaforma", () => {
  it("col legame all'account: entra", () => {
    const e = accessoPiattaforma({ user_id: "u1" }, staff)!;
    expect(e.stato).toBe("entra");
    expect(e.utente?.id).toBe("u1");
  });

  it("senza legame ma con la stessa email: account da collegare", () => {
    const e = accessoPiattaforma({ email: "marco@azienda.it" }, staff)!;
    expect(e.stato).toBe("da_collegare");
    expect(e.utente?.id).toBe("u1");
  });

  it("l'email si confronta senza badare a maiuscole e spazi", () => {
    expect(accessoPiattaforma({ email: "  ELENA@azienda.it " }, staff)!.stato).toBe("da_collegare");
  });

  it("legato a un account che non è più fra gli utenti: non dice che entra", () => {
    const e = accessoPiattaforma({ user_id: "sparito" }, staff)!;
    expect(e.stato).toBe("revocato");
    expect(e.utente).toBeNull();
  });

  it("senza legame e senza email corrispondente: nessun accesso", () => {
    expect(accessoPiattaforma({ email: "nuovo@altro.it" }, staff)!.stato).toBe("nessuno");
    expect(accessoPiattaforma({}, staff)!.stato).toBe("nessuno");
    expect(accessoPiattaforma({ email: "   " }, staff)!.stato).toBe("nessuno");
  });

  it("con l'elenco degli utenti non ancora caricato non inventa una risposta", () => {
    expect(accessoPiattaforma({ user_id: "u1" }, null)).toBeNull();
    expect(accessoPiattaforma({ user_id: "u1" }, undefined)).toBeNull();
  });

  it("un elenco vuoto è una risposta: nessuno entra", () => {
    expect(accessoPiattaforma({ user_id: "u1" }, [])!.stato).toBe("revocato");
    expect(accessoPiattaforma({ email: "marco@azienda.it" }, [])!.stato).toBe("nessuno");
  });
});

describe("quantiEntrano", () => {
  it("conta solo chi ha il legame vero, non chi ha solo l'email uguale", () => {
    const profili = [
      { user_id: "u1" },
      { email: "marco@azienda.it" },
      { user_id: "u2" },
      { user_id: "sparito" },
      {},
    ];
    expect(quantiEntrano(profili, staff)).toBe(2);
  });

  it("senza elenco degli utenti non conta niente", () => {
    expect(quantiEntrano([{ user_id: "u1" }], null)).toBe(0);
  });
});

describe("spiegazioneAccesso", () => {
  it("dice il nome dell'account quando c'è", () => {
    expect(spiegazioneAccesso(accessoPiattaforma({ user_id: "u1" }, staff)!)).toContain("Marco Ricci");
  });

  it("per chi non entra lo dice in chiaro, senza giri", () => {
    const t = spiegazioneAccesso(accessoPiattaforma({}, staff)!);
    expect(t).toContain("non entra nel gestionale");
  });

  it("ogni stato ha un'etichetta e una spiegazione", () => {
    for (const stato of ["entra", "da_collegare", "revocato", "nessuno"] as const) {
      expect(ETICHETTA_ACCESSO[stato]).toBeTruthy();
      expect(spiegazioneAccesso({ stato, utente: null })).toBeTruthy();
    }
  });
});
