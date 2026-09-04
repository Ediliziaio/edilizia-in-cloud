import { describe, it, expect } from "vitest";
import {
  termineRicerca,
  normalizzaUnita,
  unitaCompatibili,
  confrontaVoce,
  riepilogaConfronti,
  tonoScostamento,
  type VoceComputoDaConfrontare,
  type VocePrezzario,
} from "@/lib/prezzario/confronto";

/**
 * Il confronto col prezzario finisce accanto al prezzo che l'impresa propone al
 * cliente. Uno scostamento sbagliato porta a rifare un preventivo che andava
 * bene, o a lasciarne passare uno fuori mercato convinti che sia in linea.
 */

const voce = (p: Partial<VoceComputoDaConfrontare>): VoceComputoDaConfrontare => ({
  id: "v1", descrizione: "Intonaco civile", unita_misura: "mq",
  prezzo_unitario: 22, quantita: 100, ...p,
});
const rif = (p: Partial<VocePrezzario>): VocePrezzario => ({
  id: "p1", codice: "A.01", descrizione: "Intonaco civile",
  unita_misura: "mq", prezzo: 20, ...p,
});

describe("normalizzaUnita", () => {
  it("le scritture della stessa unità coincidono", () => {
    for (const forme of [["mq", "m²", "M2", "metro quadro"], ["mc", "m³", "m3"], ["cad", "pz", "n.", "NR"], ["ml", "m", "metro lineare"]]) {
      const n = forme.map(normalizzaUnita);
      expect(new Set(n).size, forme.join("/")).toBe(1);
    }
  });

  it("unità diverse restano diverse", () => {
    expect(normalizzaUnita("mq")).not.toBe(normalizzaUnita("mc"));
    expect(normalizzaUnita("mq")).not.toBe(normalizzaUnita("ml"));
    expect(normalizzaUnita("kg")).not.toBe(normalizzaUnita("t"));
  });

  it("un'unità mancante non combacia con nulla, nemmeno con un'altra mancante", () => {
    expect(unitaCompatibili(null, null)).toBe(false);
    expect(unitaCompatibili("", "mq")).toBe(false);
    expect(unitaCompatibili("mq", undefined)).toBe(false);
  });
});

describe("confrontaVoce", () => {
  it("calcola scostamento in percentuale e in euro sulla riga", () => {
    const c = confrontaVoce(voce({}), rif({}), "certa");
    expect(c.scostamentoPct).toBeCloseTo(10, 5);     // 22 su 20
    expect(c.scostamentoEuro).toBeCloseTo(200, 5);   // (22-20) × 100
    expect(c.confidenza).toBe("certa");
  });

  it("prezzo sotto il prezzario: scostamento negativo", () => {
    const c = confrontaVoce(voce({ prezzo_unitario: 16 }), rif({}), "probabile");
    expect(c.scostamentoPct).toBeCloseTo(-20, 5);
    expect(c.scostamentoEuro).toBeCloseTo(-400, 5);
  });

  it("unità diverse: NON confronta e dice perché", () => {
    // €/mq contro €/cad darebbe un numero spettacolare e senza senso.
    const c = confrontaVoce(voce({ unita_misura: "mq" }), rif({ unita_misura: "cad" }), "probabile");
    expect(c.scostamentoPct).toBeNull();
    expect(c.motivo).toBe("unita-diversa");
    expect(c.riferimento).not.toBeNull(); // la voce trovata si mostra lo stesso
  });

  it("nessuna corrispondenza: nessun numero inventato", () => {
    const c = confrontaVoce(voce({}), null, null);
    expect(c.scostamentoPct).toBeNull();
    expect(c.motivo).toBe("nessuna-corrispondenza");
  });

  it("riferimento senza prezzo: non si divide per zero", () => {
    expect(confrontaVoce(voce({}), rif({ prezzo: null }), "certa").motivo).toBe("prezzo-mancante");
    expect(confrontaVoce(voce({}), rif({ prezzo: 0 }), "certa").motivo).toBe("prezzo-mancante");
  });

  it("stessa unità scritta diversamente si confronta lo stesso", () => {
    const c = confrontaVoce(voce({ unita_misura: "m²" }), rif({ unita_misura: "MQ" }), "certa");
    expect(c.scostamentoPct).toBeCloseTo(10, 5);
  });
});

describe("riepilogaConfronti", () => {
  it("dichiara la copertura: la percentuale vale quanto la parte confrontata", () => {
    const voci = [
      voce({ id: "a", prezzo_unitario: 22, quantita: 100 }),   // confrontata: 2.200 €
      voce({ id: "b", prezzo_unitario: 50, quantita: 100 }),   // non confrontata: 5.000 €
    ];
    const confronti = [
      confrontaVoce(voci[0], rif({}), "certa"),
      confrontaVoce(voci[1], null, null),
    ];
    const r = riepilogaConfronti(voci, confronti);
    expect(r.confrontate).toBe(1);
    expect(r.totali).toBe(2);
    expect(r.importoTotale).toBeCloseTo(7_200, 5);
    expect(r.importoConfrontato).toBeCloseTo(2_200, 5);
    expect(r.copertura).toBeCloseTo(2_200 / 7_200, 5);
  });

  it("la percentuale è sull'importo del PREZZARIO, non sul proprio", () => {
    // 2.200 € proposti contro 2.000 € di prezzario = +10%, non +9,09%.
    const voci = [voce({ id: "a" })];
    const r = riepilogaConfronti(voci, [confrontaVoce(voci[0], rif({}), "certa")]);
    expect(r.scostamentoEuro).toBeCloseTo(200, 5);
    expect(r.scostamentoPct).toBeCloseTo(10, 5);
  });

  it("niente da confrontare: percentuale nulla, non zero", () => {
    const voci = [voce({ id: "a" })];
    const r = riepilogaConfronti(voci, [confrontaVoce(voci[0], null, null)]);
    expect(r.confrontate).toBe(0);
    expect(r.scostamentoPct).toBeNull();
    expect(r.copertura).toBe(0);
  });

  it("computo vuoto: nessuna divisione per zero", () => {
    const r = riepilogaConfronti([], []);
    expect(r).toMatchObject({ confrontate: 0, totali: 0, copertura: 0, scostamentoPct: null });
  });

  it("somma correttamente più righe, sopra e sotto", () => {
    const voci = [
      voce({ id: "a", prezzo_unitario: 22, quantita: 100 }),  // +200
      voce({ id: "b", prezzo_unitario: 18, quantita: 100 }),  // -200
    ];
    const confronti = voci.map((v) => confrontaVoce(v, rif({}), "certa"));
    const r = riepilogaConfronti(voci, confronti);
    expect(r.scostamentoEuro).toBeCloseTo(0, 5);
    expect(r.scostamentoPct).toBeCloseTo(0, 5);
    expect(r.copertura).toBe(1);
  });
});

describe("termineRicerca", () => {
  it("tiene le parole che identificano la lavorazione, non la frase intera", () => {
    // Passare la descrizione intera alla ricerca full-text non trova mai nulla:
    // in websearch devono comparire TUTTE le parole.
    const d = "MURATURA IN MATTONI FORATI IN LATERIZIO A 6 FORI. Muratura di mattoni forati uniti con malta a resistenza garantita. È compreso quanto altro occorre per dare l'opera finita.";
    expect(termineRicerca(d)).toBe("muratura mattoni forati laterizio");
  });

  it("butta via preposizioni, parole corte e formule di capitolato", () => {
    expect(termineRicerca("Fornitura e posa in opera di intonaco civile per interni"))
      .toBe("intonaco civile interni");
  });

  it("una descrizione senza parole utili non produce un termine", () => {
    expect(termineRicerca("con e di per")).toBe("");
    expect(termineRicerca("")).toBe("");
  });

  it("ignora la punteggiatura e le maiuscole", () => {
    expect(termineRicerca("PAVIMENTO/RIVESTIMENTO in gres (porcellanato)"))
      .toBe("pavimento rivestimento gres porcellanato");
  });

  it("si ferma al numero di parole richiesto", () => {
    // Più termini in websearch = meno risultati: quattro parole piene sono già
    // molto selettive, cinque non troverebbero quasi niente.
    const d = "demolizione tramezzi laterizio spessore dodici centimetri interni";
    expect(termineRicerca(d).split(" ")).toHaveLength(4);
    expect(termineRicerca(d, 2)).toBe("demolizione tramezzi");
  });
});

describe("riepilogo: trovate ma non confrontabili", () => {
  it("distingue «non l'ho trovata» da «l'ho trovata ma non ha unità»", () => {
    const voci = [voce({ id: "a" }), voce({ id: "b" })];
    const confronti = [
      confrontaVoce(voci[0], null, null),                                  // non trovata
      confrontaVoce(voci[1], rif({ unita_misura: null }), "probabile"),    // trovata, senza unità
    ];
    const r = riepilogaConfronti(voci, confronti);
    expect(r.confrontate).toBe(0);
    expect(r.trovateNonConfrontabili).toBe(1);
  });
});

describe("tonoScostamento", () => {
  it("entro il 3% si è in linea: un preventivo non si rifà per l'1%", () => {
    expect(tonoScostamento(0)).toBe("in-linea");
    expect(tonoScostamento(2.9)).toBe("in-linea");
    expect(tonoScostamento(-3)).toBe("in-linea");
  });

  it("oltre il 3% sopra o sotto", () => {
    expect(tonoScostamento(3.1)).toBe("sopra");
    expect(tonoScostamento(-12)).toBe("sotto");
  });

  it("senza dato non si pronuncia", () => {
    expect(tonoScostamento(null)).toBe("ignoto");
  });
});
