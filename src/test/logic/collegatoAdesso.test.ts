/**
 * «Online» vero (09/10/2026).
 *
 * L'elenco utenti diceva «Online» a chi aveva una sessione con is_active = true.
 * Ma una sessione resta «attiva» finché qualcuno non esce o non la chiude: il
 * 09/10/2026 erano 131, nessuna con un segno di vita negli ultimi 15 minuti, 100
 * ferme da più di un giorno. 76 persone risultavano «Online».
 *
 * «Collegato adesso» = sessione aperta E vista attiva negli ultimi 10 minuti.
 */
import { describe, expect, it } from "vitest";
import {
  FINESTRA_COLLEGATO_MINUTI,
  motivoChiusuraLeggibile,
  personeCollegate,
  sessioneCollegata,
  sogliaCollegato,
  ultimoSegnoDiVita,
} from "@/lib/users/collegamento";

const ADESSO = new Date("2026-10-09T12:00:00.000Z");
const minutiFa = (m: number) => new Date(ADESSO.getTime() - m * 60_000).toISOString();

describe("sessioneCollegata", () => {
  it("la finestra è di 10 minuti", () => {
    expect(FINESTRA_COLLEGATO_MINUTI).toBe(10);
  });

  it("vista da pochi minuti: collegato", () => {
    expect(sessioneCollegata({ is_active: true, last_active_at: minutiFa(2) }, ADESSO)).toBe(true);
    expect(sessioneCollegata({ is_active: true, last_active_at: minutiFa(10) }, ADESSO)).toBe(true);
  });

  it("una sessione «attiva» ferma da un'ora, da tre giorni, da 40 giorni non è collegata", () => {
    for (const m of [11, 60, 3 * 24 * 60, 40 * 24 * 60]) {
      expect(sessioneCollegata({ is_active: true, last_active_at: minutiFa(m) }, ADESSO), `${m} min`).toBe(false);
    }
  });

  it("senza segni di vita, o chiusa, non è collegata", () => {
    expect(sessioneCollegata({ is_active: true, last_active_at: null }, ADESSO)).toBe(false);
    expect(sessioneCollegata({ is_active: true, last_active_at: "non-una-data" }, ADESSO)).toBe(false);
    expect(sessioneCollegata({ is_active: false, last_active_at: minutiFa(1) }, ADESSO)).toBe(false);
  });

  it("la soglia per la lettura dal database è 10 minuti prima di adesso", () => {
    expect(sogliaCollegato(ADESSO)).toBe(minutiFa(10));
  });
});

describe("personeCollegate: si contano le persone, non le sessioni", () => {
  it("tre sessioni della stessa persona sono una persona; una stantia non conta", () => {
    const persone = personeCollegate([
      { user_id: "mario", is_active: true, last_active_at: minutiFa(1) },
      { user_id: "mario", is_active: true, last_active_at: minutiFa(3) },
      { user_id: "mario", is_active: true, last_active_at: minutiFa(5 * 24 * 60) },
      { user_id: "anna", is_active: true, last_active_at: minutiFa(300) },
      { user_id: "luca", is_active: true, last_active_at: minutiFa(9) },
    ], ADESSO);
    expect([...persone].sort()).toEqual(["luca", "mario"]);
  });

  it("con le sole sessioni rimaste aperte nessuno è collegato (il caso di oggi: 131 aperte, 0 collegati)", () => {
    const stantie = Array.from({ length: 131 }, (_, i) => ({ user_id: `u${i % 76}`, is_active: true, last_active_at: minutiFa(60 + i * 60) }));
    expect(personeCollegate(stantie, ADESSO).size).toBe(0);
  });
});

describe("ultimoSegnoDiVita", () => {
  it("prende il più recente fra l'ultimo accesso e le sue sessioni", () => {
    // Chi tiene la sessione aperta può avere l'ultimo accesso di mesi fa e usare l'app ogni giorno.
    expect(ultimoSegnoDiVita("2026-08-01T08:00:00Z", [{ last_active_at: "2026-10-08T17:30:00Z" }, { last_active_at: "2026-10-01T09:00:00Z" }]))
      .toBe("2026-10-08T17:30:00Z");
    expect(ultimoSegnoDiVita("2026-10-09T08:00:00Z", [{ last_active_at: "2026-10-01T09:00:00Z" }])).toBe("2026-10-09T08:00:00Z");
  });

  it("senza niente, null", () => {
    expect(ultimoSegnoDiVita(null, [])).toBeNull();
    expect(ultimoSegnoDiVita(undefined, [{ last_active_at: null }, { last_active_at: "boh" }])).toBeNull();
  });
});

describe("motivoChiusuraLeggibile", () => {
  it("le righe vecchie, scritte in inglese, si leggono in italiano", () => {
    expect(motivoChiusuraLeggibile("Revoked by admin")).toBe("Chiusa dall'amministratore");
    expect(motivoChiusuraLeggibile("Revocata da admin")).toBe("Chiusa dall'amministratore");
    expect(motivoChiusuraLeggibile("All sessions revoked by admin")).toBe("Tutte le sessioni chiuse dall'amministratore");
    expect(motivoChiusuraLeggibile("Chiusa dall'amministratore")).toBe("Chiusa dall'amministratore");
    expect(motivoChiusuraLeggibile("Bloccato per sicurezza")).toBe("Bloccato per sicurezza");
  });
});
