import { describe, expect, it } from "vitest";
import {
  destinazioneBollaNuova,
  destinazioneRiga,
  MESSAGGIO_SENZA_MAGAZZINI,
  messaggioErroreConsegna,
  senzaMagazzini,
} from "@/lib/ddt/senzaMagazzini";

describe("bolle senza magazzini (11/11/2026)", () => {
  it("«senza magazzini» solo a elenco caricato, vuoto e senza errori", () => {
    expect(senzaMagazzini({ magazzini: [], caricamento: false })).toBe(true);
    expect(senzaMagazzini({ magazzini: [], caricamento: true })).toBe(false);
    expect(senzaMagazzini({ magazzini: [], caricamento: false, errore: new Error("x") })).toBe(false);
    expect(senzaMagazzini({ magazzini: [{ id: "m" }], caricamento: false })).toBe(false);
  });

  it("le righe partono per il cantiere quando non ci sono magazzini, ma la scelta della riga vale sempre", () => {
    expect(destinazioneRiga({ destinazioneBolla: "magazzino", nessunMagazzino: true })).toBe("cantiere");
    expect(destinazioneRiga({ destinazioneBolla: "magazzino", nessunMagazzino: false })).toBe("magazzino");
    expect(
      destinazioneRiga({ sceltaRiga: "magazzino", destinazioneBolla: "cantiere", nessunMagazzino: true }),
    ).toBe("magazzino");
  });

  it("bolla nuova: col cantiere solo se la commessa è nota; senza magazzini è la partenza", () => {
    const base = { scelta: "magazzino" as const, sceltaToccata: false };
    expect(destinazioneBollaNuova({ ...base, commessaNota: true, nessunMagazzino: true })).toBe("cantiere");
    expect(destinazioneBollaNuova({ ...base, commessaNota: false, nessunMagazzino: true })).toBe("magazzino");
    expect(destinazioneBollaNuova({ ...base, commessaNota: true, nessunMagazzino: false })).toBe("magazzino");
    expect(
      destinazioneBollaNuova({ ...base, sceltaToccata: true, commessaNota: true, nessunMagazzino: true }),
    ).toBe("magazzino");
    expect(
      destinazioneBollaNuova({ scelta: "cantiere", sceltaToccata: true, commessaNota: false, nessunMagazzino: false }),
    ).toBe("magazzino");
  });

  it("l'errore del database diventa un'indicazione solo per chi non ha magazzini", () => {
    const db = "Magazzino non disponibile o permesso mancante";
    expect(messaggioErroreConsegna(db, true)).toBe(MESSAGGIO_SENZA_MAGAZZINI);
    expect(messaggioErroreConsegna(db, false)).toBe(db);
    expect(messaggioErroreConsegna("Altro errore", true)).toBe("Altro errore");
  });
});
