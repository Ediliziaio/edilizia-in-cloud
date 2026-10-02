import { describe, expect, it } from "vitest";
import {
  chiaveGruppo, filtraTimbrature, nomeFoglio, oreMinuti, riepilogoGiornaliero, statoPresenza, valoriDistinti,
  type RigaTimbratura,
} from "@/lib/personale/timbrature";

let n = 0;
const ev = (profilo: string, tipo: string, ora: string, extra: Partial<RigaTimbratura> = {}): RigaTimbratura => ({
  id: `e${n++}`, data_evento: "2026-10-01", ora_evento: `${ora}:00`, tipo, profilo_id: profilo,
  profilo_nome: profilo === "a" ? "Mario" : "Luca", profilo_cognome: profilo === "a" ? "Rossi" : "Bianchi",
  reparto: profilo === "a" ? "Cantiere" : "Ufficio", mansione: profilo === "a" ? "Muratore" : null, ...extra,
});

describe("stato di presenza", () => {
  it("entrata e fine pausa = in azienda; inizio pausa = in pausa; uscita = uscito; niente = non timbrato", () => {
    expect(statoPresenza("entrata")).toBe("in_azienda");
    expect(statoPresenza("pausa_fine")).toBe("in_azienda");
    expect(statoPresenza("fine_pausa")).toBe("in_azienda");
    expect(statoPresenza("pausa_inizio")).toBe("in_pausa");
    expect(statoPresenza("inizio_pausa")).toBe("in_pausa");
    expect(statoPresenza("uscita")).toBe("uscito");
    expect(statoPresenza(null)).toBe("non_timbrato");
  });
});

describe("ore del giorno", () => {
  it("giornata normale con pausa: 8:00-12:00, pausa 12:00-13:00, 13:00-17:00 → 8 ore nette, 1 di pausa", () => {
    const r = riepilogoGiornaliero([
      ev("a", "entrata", "08:00"), ev("a", "pausa_inizio", "12:00"), ev("a", "pausa_fine", "13:00"), ev("a", "uscita", "17:00"),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ entrata: "08:00", uscita: "17:00", pausaMin: 60, lavoratiMin: 480, anomalia: "" });
    expect(oreMinuti(r[0].lavoratiMin)).toBe("8:00");
  });
  it("le due grafie della pausa valgono lo stesso; l'ordine non dipende da come arrivano", () => {
    const r = riepilogoGiornaliero([
      ev("a", "uscita", "16:30"), ev("a", "fine_pausa", "13:30"), ev("a", "entrata", "08:30"), ev("a", "inizio_pausa", "12:30"),
    ]);
    expect(r[0]).toMatchObject({ pausaMin: 60, lavoratiMin: 420 });
    expect(oreMinuti(420)).toBe("7:00");
  });
  it("uscita mancante: niente ore inventate, anomalia segnalata", () => {
    const r = riepilogoGiornaliero([ev("a", "entrata", "08:00")]);
    expect(r[0].lavoratiMin).toBeNull();
    expect(r[0].anomalia).toBe("Uscita mancante");
  });
  it("uscita senza entrata e due entrate di fila sono anomalie", () => {
    expect(riepilogoGiornaliero([ev("a", "uscita", "17:00")])[0].anomalia).toContain("Uscita senza entrata");
    expect(riepilogoGiornaliero([ev("a", "entrata", "08:00"), ev("a", "entrata", "08:05"), ev("a", "uscita", "12:00")])[0].anomalia).toContain("Due entrate di fila");
  });
  it("una riga per persona e per giorno", () => {
    const r = riepilogoGiornaliero([
      ev("a", "entrata", "08:00"), ev("a", "uscita", "12:00"), ev("b", "entrata", "09:00"), ev("b", "uscita", "13:00"),
      ev("a", "entrata", "08:00", { data_evento: "2026-10-02" }), ev("a", "uscita", "10:00", { data_evento: "2026-10-02" }),
    ]);
    expect(r.map((x) => `${x.data} ${x.persona} ${x.lavoratiMin}`)).toEqual([
      "2026-10-01 Luca Bianchi 240", "2026-10-01 Mario Rossi 240", "2026-10-02 Mario Rossi 120",
    ]);
  });
});

describe("filtri e raggruppamenti", () => {
  const righe = [ev("a", "entrata", "08:00"), ev("b", "entrata", "09:00", { cantiere_codice: "C-12" }), ev("b", "uscita", "17:00")];
  it("filtra per reparto, ruolo (anche «non indicato»), tipo e testo (persona o cantiere)", () => {
    expect(filtraTimbrature(righe, { reparto: "Ufficio" })).toHaveLength(2);
    expect(filtraTimbrature(righe, { mansione: "Muratore" })).toHaveLength(1);
    expect(filtraTimbrature(righe, { mansione: "(non indicato)" })).toHaveLength(2);
    expect(filtraTimbrature(righe, { tipo: "uscita" })).toHaveLength(1);
    expect(filtraTimbrature(righe, { testo: "c-12" })).toHaveLength(1);
    expect(filtraTimbrature(righe, { testo: "rossi" })).toHaveLength(1);
  });
  it("valori distinti per le tendine e chiave del gruppo", () => {
    expect(valoriDistinti(righe, "reparto")).toEqual(["Cantiere", "Ufficio"]);
    expect(chiaveGruppo(righe[1], "mansione")).toBe("(non indicato)");
    expect(chiaveGruppo(righe[0], "dipendente")).toBe("Mario Rossi");
    expect(chiaveGruppo(righe[0], "nessuno")).toBe("Tutti");
  });
  it("nomi di foglio Excel validi e unici", () => {
    const usati = new Set<string>();
    expect(nomeFoglio("Cantiere/Nord: squadra [A]?", usati)).toBe("Cantiere Nord squadra A");
    expect(nomeFoglio("Cantiere Nord squadra A", usati)).toBe("Cantiere Nord squadra A (2)");
    expect(nomeFoglio("x".repeat(40), usati).length).toBeLessThanOrEqual(31);
  });
});
