/**
 * Attese legate al calendario dell'anno (19/09/2026): le 9 email a data fissa
 * del broadcast EdiliziaInCloud partono nella loro settimana (6, 10, 19, 26,
 * 28, 32, 41, 46, 50), e in quelle settimane la rotazione del martedì salta.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  calendarioDelGiorno,
  giornoAmmesso,
  leggiSettimane,
  settimanaIso,
  type GiornoRoma,
  type RegoleGiorno,
} from "../../../supabase/functions/_shared/attesaCalendario";

const ROOT = join(__dirname, "../../..");

function giorno(iso: string): GiornoRoma {
  const [anno, mese, g] = iso.split("-").map(Number);
  return { anno, mese, giorno: g, giornoSettimana: new Date(Date.UTC(anno, mese - 1, g)).getUTCDay() };
}

/** Il primo giorno ammesso a partire da una data, come fa il motore (+24h alla volta). */
function primoGiorno(da: string, regole: Parameters<typeof giornoAmmesso>[1]): string {
  const d = new Date(`${da}T12:00:00Z`);
  for (let i = 0; i < 372; i++) {
    const iso = d.toISOString().slice(0, 10);
    if (giornoAmmesso(giorno(iso), regole)) return iso;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return "mai";
}

describe("settimanaIso", () => {
  it("la settimana 1 è quella del primo giovedì dell'anno", () => {
    expect(settimanaIso(2026, 1, 1)).toBe(1);
    expect(settimanaIso(2027, 1, 4)).toBe(1);
  });

  it("i giorni a cavallo dell'anno stanno nella settimana giusta", () => {
    expect(settimanaIso(2026, 12, 28)).toBe(53);
    expect(settimanaIso(2027, 1, 1)).toBe(53); // venerdì: è ancora il 2026
    expect(settimanaIso(2021, 1, 3)).toBe(53); // domenica: è ancora il 2020
  });

  it("date qualunque", () => {
    expect(settimanaIso(2026, 2, 3)).toBe(6);
    expect(settimanaIso(2026, 9, 15)).toBe(38);
  });
});

describe("leggiSettimane", () => {
  it("numeri o testo, solo settimane vere", () => {
    expect(leggiSettimane([6, "10", 99, 0, "x"])).toEqual([6, 10]);
    expect(leggiSettimane("6, 10;19 26")).toEqual([6, 10, 19, 26]);
    expect(leggiSettimane(null)).toEqual([]);
  });
});

describe("giornoAmmesso", () => {
  const martedi6: RegoleGiorno = { giorni: [2], settimane: [6], settimaneEscluse: [] };

  it("il martedì della settimana 6, e nessun altro giorno", () => {
    expect(giornoAmmesso(giorno("2026-02-03"), martedi6)).toBe(true);
    expect(giornoAmmesso(giorno("2026-02-04"), martedi6)).toBe(false); // mercoledì
    expect(giornoAmmesso(giorno("2026-02-10"), martedi6)).toBe(false); // settimana 7
  });

  it("le settimane escluse saltano", () => {
    expect(giornoAmmesso(giorno("2026-02-03"), { giorni: [2], settimane: [], settimaneEscluse: [6] })).toBe(false);
  });

  it("senza regole ogni giorno va bene", () => {
    expect(giornoAmmesso(giorno("2026-02-08"), { giorni: [], settimane: [], settimaneEscluse: [] })).toBe(true);
  });

  it("dal 19 settembre, «martedì della settimana 6» è il 9 febbraio 2027", () => {
    expect(primoGiorno("2026-09-19", martedi6)).toBe("2027-02-09");
  });

  it("la rotazione del martedì salta la settimana 41: dal 5 ottobre si va al 13", () => {
    expect(primoGiorno("2026-10-05", { giorni: [2], settimane: [], settimaneEscluse: [41] })).toBe("2026-10-13");
  });
});

describe("calendarioDelGiorno", () => {
  it("oggi come record per le condizioni «calendario.*»", () => {
    expect(calendarioDelGiorno(giorno("2026-10-06"))).toEqual({
      anno: 2026, mese: 10, giorno: 6, giorno_settimana: 2, settimana_iso: 41,
    });
  });

  it("il 1° gennaio 2027 è ancora nella settimana 53 del 2026", () => {
    expect(calendarioDelGiorno(giorno("2027-01-01")).settimana_iso).toBe(53);
  });
});

describe("il motore usa le regole del calendario", () => {
  const motore = readFileSync(join(ROOT, "supabase/functions/process-automation/index.ts"), "utf8");

  it("giorni, settimane dell'anno e settimane escluse nello stesso controllo", () => {
    expect(motore).toContain("settimane: leggiSettimane(cfg.delay_settimane_anno)");
    expect(motore).toContain("settimaneEscluse: leggiSettimane(cfg.delay_settimane_escluse)");
    expect(motore).toContain("while (!giornoAmmesso(romeGiorno(new Date(Date.now() + delayMs)), regole) && guard < 372)");
  });

  it("le condizioni leggono «calendario.*» come oggi a Roma", () => {
    expect(motore).toContain('} else if (prefix === "calendario") {');
    expect(motore).toContain("row = calendarioDelGiorno(romeGiorno(new Date()));");
  });

  it("dopo un salto di giorni l'orario scelto resta quello, anche col cambio dell'ora legale", () => {
    expect(motore).toContain("if (minutiBersaglio !== null && guard > 0)");
    expect(motore).toContain("if (Math.abs(scarto) === 60) delayMs += scarto * 60_000;");
  });
});
