/**
 * Gli orari liberi di un calendario calcolati lato server (25/09/2026).
 *
 * Prima li calcolava solo la pagina /prenota nel browser, e gli agenti AI
 * prenotavano a caso su slot fissi 8-18. Qui le stesse regole della pagina,
 * più il fuso di Roma per gli impegni esterni (che arrivano in UTC).
 */
import { describe, expect, it } from "vitest";
import { fasciaDi, slotLiberi, type InputSlot } from "../../../supabase/functions/_shared/calendarioSlot";

// Venerdì 2 ottobre 2026 (ora legale, UTC+2); lunedì 7 dicembre 2026 (ora solare, UTC+1).
const OTTOBRE = "2026-10-02";
const DICEMBRE = "2026-12-07";

function base(parziale: Partial<InputSlot> = {}): InputSlot {
  return {
    dataIso: OTTOBRE,
    regole: [{ day_of_week: 5, specific_date: null, start_time: "09:00:00", end_time: "10:30:00" }],
    durataMin: 30,
    bufferPrimaMin: 0,
    bufferDopoMin: 0,
    preavvisoMin: 0,
    maxAlGiorno: null,
    appuntamenti: [],
    impegni: [],
    // Il giorno prima: niente conta come «già passato».
    adesso: new Date("2026-10-01T08:00:00Z"),
    ...parziale,
  };
}

describe("slotLiberi", () => {
  it("divide la fascia del giorno per la durata del calendario", () => {
    expect(slotLiberi(base())).toEqual(["09:00", "09:30", "10:00"]);
  });

  it("senza fasce per quel giorno non ci sono orari", () => {
    expect(slotLiberi(base({ regole: [{ day_of_week: 1, specific_date: null, start_time: "09:00", end_time: "12:00" }] }))).toEqual([]);
  });

  it("la data specifica vince sul giorno della settimana", () => {
    const regole = [
      { day_of_week: 5, specific_date: null, start_time: "09:00", end_time: "12:00" },
      { day_of_week: null, specific_date: OTTOBRE, start_time: "15:00", end_time: "16:00" },
    ];
    expect(slotLiberi(base({ regole }))).toEqual(["15:00", "15:30"]);
  });

  it("un appuntamento con i margini toglie gli orari attaccati", () => {
    const out = slotLiberi(base({
      appuntamenti: [{ inizio: "09:30", fine: "10:00" }],
      bufferPrimaMin: 15,
      bufferDopoMin: 15,
    }));
    expect(out).toEqual([]);
  });

  it("senza margini un appuntamento toglie solo il suo orario", () => {
    expect(slotLiberi(base({ appuntamenti: [{ inizio: "09:30", fine: "10:00" }] }))).toEqual(["09:00", "10:00"]);
  });

  it("il preavviso minimo toglie gli orari troppo vicini (ora di Roma)", () => {
    // 07:10 UTC = 09:10 a Roma; preavviso 60 minuti → dalle 10:10 in poi.
    const out = slotLiberi(base({ adesso: new Date(`${OTTOBRE}T07:10:00Z`), preavvisoMin: 60 }));
    expect(out).toEqual([]);
  });

  it("gli orari già passati oggi non si propongono", () => {
    // 07:40 UTC = 09:40 a Roma: resta solo 10:00.
    expect(slotLiberi(base({ adesso: new Date(`${OTTOBRE}T07:40:00Z`) }))).toEqual(["10:00"]);
  });

  it("un impegno su Google in UTC toglie l'orario giusto con l'ora legale", () => {
    // 07:30-08:15 UTC = 09:30-10:15 a Roma in ottobre.
    const out = slotLiberi(base({ impegni: [{ start_at: `${OTTOBRE}T07:30:00Z`, end_at: `${OTTOBRE}T08:15:00Z` }] }));
    expect(out).toEqual(["09:00"]);
  });

  it("con l'ora solare lo stesso impegno cade un'ora più tardi", () => {
    // 07:30-08:15 UTC = 08:30-09:15 a Roma in dicembre (lunedì).
    const out = slotLiberi(base({
      dataIso: DICEMBRE,
      regole: [{ day_of_week: 1, specific_date: null, start_time: "08:00", end_time: "10:00" }],
      impegni: [{ start_at: `${DICEMBRE}T07:30:00Z`, end_at: `${DICEMBRE}T08:15:00Z` }],
      adesso: new Date("2026-12-06T08:00:00Z"),
    }));
    expect(out).toEqual(["08:00", "09:30"]);
  });

  it("raggiunto il tetto del giorno non resta niente", () => {
    const out = slotLiberi(base({
      regole: [{ day_of_week: 5, specific_date: null, start_time: "09:00", end_time: "18:00" }],
      appuntamenti: [{ inizio: "15:00", fine: "15:30" }, { inizio: "16:00", fine: null }],
      maxAlGiorno: 2,
    }));
    expect(out).toEqual([]);
  });

  it("un appuntamento senza fine dura quanto il calendario", () => {
    expect(slotLiberi(base({ appuntamenti: [{ inizio: "09:00", fine: null }] }))).toEqual(["09:30", "10:00"]);
  });

  it("due fasce nello stesso giorno danno orari ordinati e senza doppioni", () => {
    const regole = [
      { day_of_week: 5, specific_date: null, start_time: "14:00", end_time: "15:00" },
      { day_of_week: 5, specific_date: null, start_time: "09:00", end_time: "10:00" },
      { day_of_week: 5, specific_date: null, start_time: "09:30", end_time: "10:00" },
    ];
    expect(slotLiberi(base({ regole }))).toEqual(["09:00", "09:30", "14:00", "14:30"]);
  });
});

describe("fasciaDi", () => {
  it("mattina fino alle 12:59, pomeriggio fino alle 17:59, poi sera", () => {
    expect(fasciaDi("08:00")).toBe("mattina");
    expect(fasciaDi("12:59")).toBe("mattina");
    expect(fasciaDi("13:00")).toBe("pomeriggio");
    expect(fasciaDi("17:59")).toBe("pomeriggio");
    expect(fasciaDi("18:00")).toBe("sera");
  });
});
