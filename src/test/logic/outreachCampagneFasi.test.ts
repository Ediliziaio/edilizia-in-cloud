import { describe, it, expect } from "vitest";
import {
  costruisciFasi, faseIniziale, percentuale, oggettoLeggibile, passoMigliore, numeroPasso,
  tettoCasella, capacitaBrand, followupSchiacciati, stimaTempi, numero, giorniLeggibili, rimbalziAlti,
  type FaseRiga, type PassoDef, type RitmoBrand, type CasellaRitmo,
} from "@/components/admin/outreach/campagne/campagneFasi";

const passi: PassoDef[] = [
  { passo: 1, canale: "email", giorno: 0, oggetto: "Serramenti PVC===Seconda variante" },
  { passo: 2, canale: "email", giorno: 4, oggetto: "" },
  { passo: 3, canale: "email", giorno: 9, oggetto: "" },
];

const riga = (fase: string, contatti: number): FaseRiga => ({ fase, contatti, in_pausa: 0, prossimo_invio: null, ultimo_programmato: null });

describe("costruisciFasi", () => {
  it("disegna tutte le colonne del flusso, anche vuote, nell'ordine del contatto", () => {
    const f = costruisciFasi([riga("da_contattare", 1660), riga("passo_1", 16)], passi);
    expect(f.filter((x) => x.gruppo === "flusso").map((x) => x.chiave))
      .toEqual(["da_contattare", "passo_1", "passo_2", "passo_3", "completato"]);
    expect(f.find((x) => x.chiave === "passo_2")?.contatti).toBe(0);
    expect(f.find((x) => x.chiave === "da_contattare")?.contatti).toBe(1660);
  });

  it("il sottotitolo dice quando parte il passo successivo", () => {
    const f = costruisciFasi([], passi);
    expect(f.find((x) => x.chiave === "passo_1")?.sottotitolo).toContain("giorno 4");
    expect(f.find((x) => x.chiave === "passo_3")?.sottotitolo).toContain("ultima");
  });

  it("contatti oltre l'ultimo passo definito: la colonna compare lo stesso", () => {
    const f = costruisciFasi([riga("passo_5", 2)], passi);
    expect(f.some((x) => x.chiave === "passo_5" && x.contatti === 2)).toBe(true);
  });

  it("risposte e uscite hanno sempre le loro colonne", () => {
    const f = costruisciFasi([], passi);
    expect(f.filter((x) => x.gruppo === "risposta")).toHaveLength(4);
    expect(f.filter((x) => x.gruppo === "uscita").map((x) => x.chiave)).toEqual(["rimbalzato", "escluso", "disiscritto", "fermato"]);
  });
});

describe("faseIniziale", () => {
  it("prima le risposte", () => {
    const f = costruisciFasi([riga("passo_1", 16), riga("risposta_domanda", 1)], passi);
    expect(faseIniziale(f)).toBe("risposta_domanda");
  });
  it("poi il primo passo con qualcuno dentro", () => {
    const f = costruisciFasi([riga("da_contattare", 1660), riga("passo_2", 4), riga("passo_1", 16)], passi);
    expect(faseIniziale(f)).toBe("passo_1");
  });
  it("campagna appena partita: chi deve ancora ricevere", () => {
    expect(faseIniziale(costruisciFasi([riga("da_contattare", 10)], passi))).toBe("da_contattare");
  });
});

describe("percentuale", () => {
  it("0 su 0 non è 0%", () => expect(percentuale(0, 0)).toBe("—"));
  it("meno dell'1% ma qualcuno c'è", () => expect(percentuale(16, 1676)).toBe("<1%"));
  it("un decimale sotto il 10%", () => expect(percentuale(3, 40)).toBe("7,5%"));
  it("intero sopra il 10%", () => expect(percentuale(1, 3)).toBe("33%"));
  it("zero vero", () => expect(percentuale(0, 50)).toBe("0%"));
});

describe("oggettoLeggibile", () => {
  it("la prima variante e quante altre", () => {
    expect(oggettoLeggibile("Serramenti PVC===Seconda variante")).toEqual({ testo: "Serramenti PVC", varianti: 1, risposta: false });
  });
  it("oggetto vuoto = risposta nel thread", () => {
    expect(oggettoLeggibile("").risposta).toBe(true);
  });
});

describe("numero e giorniLeggibili", () => {
  it("il punto delle migliaia anche a quattro cifre", () => {
    expect(numero(1676)).toBe("1.676");
    expect(numero(42979)).toBe("42.979");
    expect(numero(16)).toBe("16");
    expect(numero(1234567)).toBe("1.234.567");
  });
  it("giorni d'invio in parole", () => {
    expect(giorniLeggibili([1, 2, 3, 4, 5])).toBe("lun–ven");
    expect(giorniLeggibili([1, 3, 5])).toBe("lun, mer, ven");
    expect(giorniLeggibili([0, 1, 2, 3, 4, 5, 6])).toBe("tutti i giorni");
  });
});

describe("passoMigliore", () => {
  it("il passo migliore serve un numero minimo di invii", () => {
    expect(passoMigliore([{ passo: 1, inviati: 10, risposte: 3 }, { passo: 2, inviati: 200, risposte: 4 }])).toBe(2);
    expect(passoMigliore([{ passo: 1, inviati: 10, risposte: 3 }])).toBeNull();
  });
  it("numeroPasso", () => {
    expect(numeroPasso("passo_12")).toBe(12);
    expect(numeroPasso("completato")).toBeNull();
  });
});

// ── Ritmo e tempi: stessi conti del dispatcher ──

const casella = (c: Partial<CasellaRitmo> = {}): CasellaRitmo => ({
  tetto: 5, base: 3, passo: 1, giorno: 0, avviato: true, inviati_oggi: 0, ...c,
});
const brand = (caselle: CasellaRitmo[], r: Partial<RitmoBrand> = {}): RitmoBrand => ({
  brand_id: "b", brand: "ThermoDMR", stato: "active", nuovi_al_giorno: null,
  giorni_invio: [1, 2, 3, 4, 5], ora_inizio: 8, ora_fine: 19, caselle, ...r,
});
// Venerdì 11 settembre 2026, ore 10: finestra aperta.
const VENERDI = new Date(2026, 8, 11, 10, 0, 0);

describe("tettoCasella", () => {
  it("la rampa sale di un passo al giorno fino al tetto", () => {
    const c = casella();
    expect([0, 1, 2, 3].map((k) => tettoCasella(c, k))).toEqual([3, 4, 5, 5]);
  });
  it("warm-up non ancora avviato: domani resta alla base, poi sale", () => {
    const c = casella({ avviato: false });
    expect([0, 1, 2, 3].map((k) => tettoCasella(c, k))).toEqual([3, 3, 4, 5]);
  });
});

describe("capacitaBrand", () => {
  it("oggi toglie quello che le caselle hanno già spedito", () => {
    const r = brand([casella({ inviati_oggi: 3 }), casella()]);
    expect(capacitaBrand(r, 0).totale).toBe(3);
    expect(capacitaBrand(r, 1).totale).toBe(8);
  });
  it("i primi contatti non superano i nuovi al giorno di ogni casella", () => {
    const r = brand([casella({ tetto: 30, base: 30 }), casella({ tetto: 30, base: 30 })], { nuovi_al_giorno: 5 });
    expect(capacitaBrand(r, 1)).toEqual({ totale: 60, nuovi: 10 });
  });
});

describe("followupSchiacciati", () => {
  it("tetto uguale ai nuovi al giorno: i primi si prendono tutto", () => {
    expect(followupSchiacciati(brand([casella({ tetto: 5 })], { nuovi_al_giorno: 5 }))).toBe(true);
  });
  it("tetto più alto dei nuovi: resta posto per i follow-up", () => {
    expect(followupSchiacciati(brand([casella({ tetto: 30 })], { nuovi_al_giorno: 5 }))).toBe(false);
  });
});

describe("stimaTempi", () => {
  it("salta i weekend e finisce quando è finito il lavoro", () => {
    // 1 casella a 10 al giorno fissi, 30 messaggi: ven, lun, mar.
    const r = brand([casella({ tetto: 10, base: 10 })]);
    const s = stimaTempi({ ritmo: r, primiDaMandare: 30, messaggiDaMandare: 30, quotaPrimi: 1, quotaTotale: 1, adesso: VENERDI, oraAdesso: 10 });
    expect(s.tutto?.giorni).toBe(3);
    expect(s.tutto?.fine.getDate()).toBe(15); // martedì 15
    expect(s.perGiorno.slice(0, 4).map((g) => g.stima)).toEqual([10, 0, 0, 10]);
  });

  it("a finestra chiusa oggi non conta", () => {
    const r = brand([casella({ tetto: 10, base: 10 })]);
    const s = stimaTempi({ ritmo: r, primiDaMandare: 10, messaggiDaMandare: 10, quotaPrimi: 1, quotaTotale: 1, adesso: VENERDI, oraAdesso: 20 });
    expect(s.perGiorno[0].stima).toBe(0);
    expect(s.tutto?.fine.getDate()).toBe(14); // lunedì
  });

  it("prima i primi contatti, i follow-up dopo", () => {
    // 20 al giorno, nuovi 10: 30 primi + 30 follow-up.
    const r = brand([casella({ tetto: 20, base: 20 })], { nuovi_al_giorno: 10 });
    const s = stimaTempi({ ritmo: r, primiDaMandare: 30, messaggiDaMandare: 60, quotaPrimi: 1, quotaTotale: 1, adesso: VENERDI, oraAdesso: 10 });
    expect(s.primi?.giorni).toBe(3);
    expect(s.tutto?.giorni).toBe(3);
  });

  it("due campagne sullo stesso brand si dividono il ritmo", () => {
    const r = brand([casella({ tetto: 10, base: 10 })]);
    const meta = stimaTempi({ ritmo: r, primiDaMandare: 10, messaggiDaMandare: 10, quotaPrimi: 0.5, quotaTotale: 0.5, adesso: VENERDI, oraAdesso: 10 });
    expect(meta.tutto?.giorni).toBe(2);
  });

  it("niente caselle o campagna ferma: nessuna stima, e non «oltre tre anni»", () => {
    const s = stimaTempi({ ritmo: brand([]), primiDaMandare: 10, messaggiDaMandare: 10, quotaPrimi: 1, quotaTotale: 1, adesso: VENERDI, oraAdesso: 10 });
    expect(s.tutto).toBeNull();
    expect(s.oltre).toBe(false);
  });

  it("il caso reale: 9 caselle a 5 al giorno e 2.603 primi contatti", () => {
    const r = brand(Array.from({ length: 9 }, () => casella({ avviato: false, inviati_oggi: 3 })), { nuovi_al_giorno: 5 });
    const s = stimaTempi({ ritmo: r, primiDaMandare: 2603, messaggiDaMandare: 18371, quotaPrimi: 1, quotaTotale: 1, adesso: VENERDI, oraAdesso: 10 });
    expect(s.capOggi).toBe(27);
    expect(s.capRegime).toBe(45);
    // ~45 al giorno: circa 58 giorni d'invio per i primi, oltre un anno per tutto.
    expect(s.primi!.giorni).toBeGreaterThan(55);
    expect(s.primi!.giorni).toBeLessThan(62);
    expect(s.tutto!.giorni).toBeGreaterThan(400);
  });
});

describe("rimbalziAlti", () => {
  it("oltre il 3% degli invii è un allarme (i casi veri del 24/09/2026)", () => {
    expect(rimbalziAlti(37, 621)).toBe(true); // ThermoDMR · Flusso C, 6%
    expect(rimbalziAlti(56, 463)).toBe(true); // Edilizia in Cloud · Tutti gli altri, 12%
    expect(rimbalziAlti(12, 730)).toBe(false); // Marketing Edile · Tetti, 1,6%
  });

  it("il 3% esatto non è ancora allarme, e sotto i 20 invii non si giudica", () => {
    expect(rimbalziAlti(3, 100)).toBe(false);
    expect(rimbalziAlti(4, 100)).toBe(true);
    expect(rimbalziAlti(2, 15)).toBe(false);
    expect(rimbalziAlti(0, 0)).toBe(false);
  });
});
