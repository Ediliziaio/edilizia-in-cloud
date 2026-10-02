import { describe, expect, it } from "vitest";
import { decidiRientro, giorniRientroValidi, modoRientroValido, notaRientro } from "../../../supabase/functions/_shared/rientroLead";

const adesso = new Date("2026-10-01T12:00:00Z");
const giorniFa = (n: number) => new Date(adesso.getTime() - n * 86_400_000).toISOString();

describe("lead Meta che rientrano dopo una chiusura", () => {
  it("regola spenta (default): comportamento di sempre", () => {
    expect(decidiRientro({ modo: undefined, giorni: 90, chiusure: [{ status: "lost", chiusaIl: giorniFa(2) }], aperte: 0, adesso }).azione).toBe("normale");
    expect(decidiRientro({ modo: "off", giorni: 90, chiusure: [{ status: "lost", chiusaIl: giorniFa(2) }], aperte: 0, adesso }).azione).toBe("normale");
  });
  it("blocca: persa o abbandonata da meno di N giorni", () => {
    for (const status of ["lost", "abandoned"]) {
      const d = decidiRientro({ modo: "blocca", giorni: 90, chiusure: [{ status, chiusaIl: giorniFa(10) }], aperte: 0, adesso });
      expect(d.azione).toBe("blocca");
      expect(d.giorniDallaChiusura).toBe(10);
    }
  });
  it("oltre la finestra rientra normalmente; il giorno N compreso blocca", () => {
    expect(decidiRientro({ modo: "blocca", giorni: 90, chiusure: [{ status: "lost", chiusaIl: giorniFa(200) }], aperte: 0, adesso }).azione).toBe("normale");
    expect(decidiRientro({ modo: "blocca", giorni: 90, chiusure: [{ status: "lost", chiusaIl: giorniFa(90) }], aperte: 0, adesso }).azione).toBe("blocca");
    expect(decidiRientro({ modo: "blocca", giorni: 90, chiusure: [{ status: "lost", chiusaIl: giorniFa(91) }], aperte: 0, adesso }).azione).toBe("normale");
  });
  it("conta la chiusura più recente, non la più vecchia", () => {
    const d = decidiRientro({ modo: "blocca", giorni: 30, chiusure: [{ status: "lost", chiusaIl: giorniFa(400) }, { status: "abandoned", chiusaIl: giorniFa(5) }], aperte: 0, adesso });
    expect(d.azione).toBe("blocca");
    expect(d.giorniDallaChiusura).toBe(5);
  });
  it("vinta o aperta non è una chiusura da bloccare; con un'opportunità aperta decide il flusso di sempre", () => {
    expect(decidiRientro({ modo: "blocca", giorni: 90, chiusure: [{ status: "won", chiusaIl: giorniFa(3) }], aperte: 0, adesso }).azione).toBe("normale");
    expect(decidiRientro({ modo: "blocca", giorni: 90, chiusure: [{ status: "lost", chiusaIl: giorniFa(3) }], aperte: 1, adesso }).azione).toBe("normale");
  });
  it("segnala: entra ma si segnala; data mancante o futura non blocca", () => {
    expect(decidiRientro({ modo: "segnala", giorni: 90, chiusure: [{ status: "lost", chiusaIl: giorniFa(1) }], aperte: 0, adesso }).azione).toBe("segnala");
    expect(decidiRientro({ modo: "blocca", giorni: 90, chiusure: [{ status: "lost", chiusaIl: null }], aperte: 0, adesso }).azione).toBe("normale");
    expect(decidiRientro({ modo: "blocca", giorni: 90, chiusure: [{ status: "lost", chiusaIl: giorniFa(-3) }], aperte: 0, adesso }).azione).toBe("normale");
  });
  it("valori strani nelle impostazioni tornano ai default", () => {
    expect(modoRientroValido("tutto")).toBe("off");
    expect(giorniRientroValidi(0)).toBe(90);
    expect(giorniRientroValidi("abc")).toBe(90);
    expect(giorniRientroValidi(30)).toBe(30);
  });
  it("la nota dice che cosa è successo", () => {
    const d = decidiRientro({ modo: "blocca", giorni: 90, chiusure: [{ status: "lost", chiusaIl: giorniFa(10) }], aperte: 0, adesso });
    expect(notaRientro(d, "Conto Termico")).toMatch(/non è stata aperta una nuova opportunità/);
  });
});
