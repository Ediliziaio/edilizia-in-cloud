// L'anteprima dei preventivi a computo: una funzione sola per gli otto moduli
// edili, che non calcola niente di suo — i numeri sono quelli del `calcoli` del
// modulo, lo stesso dello step Economia e del PDF.
import { describe, expect, it } from "vitest";
import * as calcoliBagni from "@/lib/bagni/calcoli";
import * as calcoliTermoidraulico from "@/lib/termoidraulico/calcoli";
import {
  anteprimaComputo,
  type OpzioniAnteprimaComputo,
  type ProgettoAnteprimaComputo,
  type VoceComputoAnteprima,
} from "@/lib/preventivatore/anteprimaComputo";
import { righeSenzaPrezzo } from "@/lib/preventivatore/anteprima";

const voce = (id: string, capitolo: string, descrizione: string, extra: Partial<VoceComputoAnteprima>): VoceComputoAnteprima => ({
  id, capitolo_nome: capitolo, descrizione, unita_misura: "cad", quantita: 1, prezzo_unitario: 0, sconto_pct: 0,
  costo_materiali: 0, costo_manodopera: 0, ...extra,
});

const VOCI: VoceComputoAnteprima[] = [
  voce("a", "Generatore", "Caldaia a condensazione", { prezzo_unitario: 2400, costo_materiali: 1500, costo_manodopera: 400 }),
  voce("b", "Distribuzione", "Radiatori", { quantita: 6, prezzo_unitario: 120, sconto_pct: 10, costo_materiali: 60, costo_manodopera: 20 }),
  voce("c", "Distribuzione", "Posa e collaudo", { unita_misura: "a corpo" }),
];

const PROGETTO: ProgettoAnteprimaComputo = {
  code: "IDR-2026-0031", cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_telefono: "347 123 4567", cliente_email: "m.rossi@example.it",
  cantiere_indirizzo: "Via Roma 4", cantiere_cap: "36100", cantiere_citta: "Vicenza", cantiere_provincia: "VI",
  sconto_pct: 5, iva_pct: 10, detrazione_pct: 0,
};

const OPZIONI: OpzioniAnteprimaComputo = { emittente: "Bianchi Impianti", ivaDefault: 22, oggi: new Date(2026, 9, 5) };

const costruisci = (voci = VOCI, progetto = PROGETTO, opzioni = OPZIONI) =>
  anteprimaComputo(voci, progetto, calcoliTermoidraulico, opzioni);

describe("anteprimaComputo — le righe", () => {
  it("un gruppo per capitolo, nell'ordine in cui compaiono, con unità e sconto di riga", () => {
    const a = costruisci();
    expect(a.gruppi.map((g) => g.titolo)).toEqual(["Generatore", "Distribuzione"]);
    const radiatori = a.gruppi[1].righe[0];
    expect(radiatori).toMatchObject({ titolo: "Radiatori", quantita: 6, unita: "cad", prezzoUnitario: 120, dettaglio: "sconto 10%" });
    // 6 × 120 − 10% = 648: l'importo di riga è quello del calcolo del modulo
    expect(radiatori.totale).toBeCloseTo(648, 5);
    expect(a.gruppi[0].righe[0].dettaglio).toBeNull();
  });

  it("il costo della riga è (materiali + manodopera) × quantità; senza costi non c'è", () => {
    const a = costruisci();
    expect(a.gruppi[0].righe[0].costo).toBe(1900);
    expect(a.gruppi[1].righe[0].costo).toBe(480);
    expect(a.gruppi[1].righe[1].costo).toBeNull();
  });

  it("la riga a 0 € è da prezzare, e l'avviso la conta (a meno che il prezzo sia scritto a mano)", () => {
    const a = costruisci();
    expect(righeSenzaPrezzo(a)).toBe(1);
    const aMano = costruisci(VOCI, { ...PROGETTO, prezzo_manuale: 5000 });
    expect(aMano.prezzoACorpo).toBe(true);
    expect(righeSenzaPrezzo(aMano)).toBe(0);
  });

  it("senza descrizione la voce si chiama come tale; l'ambiente della Ristrutturazione va nel dettaglio", () => {
    const a = costruisci([voce("x", "Generale", "  ", { prezzo_unitario: 10, sconto_pct: 5, ambiente: "Cucina" })]);
    expect(a.gruppi[0].righe[0].titolo).toBe("Voce senza descrizione");
    expect(a.gruppi[0].righe[0].dettaglio).toBe("Cucina · sconto 5%");
  });
});

describe("anteprimaComputo — i totali", () => {
  it("sono quelli di calcTotaliComputo: 3.048 − 5% = 2.895,60 + IVA 10% = 3.185,16", () => {
    const a = costruisci();
    expect(a.totali.map((t) => [t.id, t.etichetta, Math.round(t.importo * 100) / 100])).toEqual([
      ["lordo", "Totale voci", 3048],
      ["sconto", "Sconto 5%", 152.4],
      ["netto", "Imponibile", 2895.6],
      ["iva", "IVA 10%", 289.56],
      ["totale", "Totale", 3185.16],
    ]);
    expect(a.totali.at(-1)?.forte).toBe(true);
    expect(a.totaleDocumento).toBeCloseTo(3185.16, 5);
    const calcolo = calcoliTermoidraulico.calcTotaliComputo(
      VOCI.map((v) => ({ capitolo_nome: v.capitolo_nome, quantita: v.quantita, prezzo_unitario: v.prezzo_unitario, sconto_pct: v.sconto_pct, costo_materiali: v.costo_materiali, costo_manodopera: v.costo_manodopera })),
      { sconto_pct: 5, iva_pct: 10 },
    );
    expect(a.totaleDocumento).toBe(calcolo.totale);
  });

  it("senza sconto non ripete l'imponibile; l'IVA percentuale si legge senza decimali inutili", () => {
    const a = costruisci(VOCI, { ...PROGETTO, sconto_pct: 0, iva_pct: 4 });
    expect(a.totali.map((t) => t.id)).toEqual(["lordo", "iva", "totale"]);
    expect(a.totali[1].etichetta).toBe("IVA 4%");
  });

  it("l'IVA di riserva è quella del modulo, ma uno 0 scritto resta 0", () => {
    const senza = costruisci(VOCI, { ...PROGETTO, sconto_pct: 0, iva_pct: undefined });
    expect(senza.totali.find((t) => t.id === "iva")?.etichetta).toBe("IVA 22%");
    const bagni = anteprimaComputo(VOCI, { ...PROGETTO, sconto_pct: 0, iva_pct: undefined }, calcoliBagni, { ...OPZIONI, ivaDefault: 10 });
    expect(bagni.totali.find((t) => t.id === "iva")?.etichetta).toBe("IVA 10%");
    const zero = costruisci(VOCI, { ...PROGETTO, sconto_pct: 0, iva_pct: 0 });
    expect(zero.totali.find((t) => t.id === "iva")?.importo).toBe(0);
  });

  it("col prezzo scritto a mano parte da quello, e lo dice", () => {
    const a = costruisci(VOCI, { ...PROGETTO, sconto_pct: 0, prezzo_manuale: 5000 });
    expect(a.totali[0]).toMatchObject({ etichetta: "Prezzo concordato", importo: 5000 });
    expect(a.note.join(" ")).toMatch(/Prezzo scritto a mano/);
    expect(a.totaleDocumento).toBeCloseTo(5500, 5);
  });

  it("senza voci e senza prezzo non c'è niente da sommare: nessun totale", () => {
    const a = costruisci([], { ...PROGETTO, prezzo_manuale: null });
    expect(a.totali).toEqual([]);
    expect(a.totaleDocumento).toBeNull();
    expect(a.gruppi).toEqual([]);
  });
});

describe("anteprimaComputo — il margine dell'impresa", () => {
  it("a costi completi: margine in euro e in percentuale", () => {
    const a = costruisci([VOCI[0], VOCI[1]]);
    // 2.895,60 netti − (1.900 + 480) = 515,60
    expect(a.impresa?.costi).toBe(2380);
    expect(a.impresa?.margine).toBeCloseTo(515.6, 5);
    expect(a.impresa?.marginePct).toBeCloseTo(17.8, 1);
    expect(a.impresa?.costiCompleti).toBe(true);
  });

  it("con una voce venduta senza costo non c'è margine: «null», non il 100%", () => {
    const a = costruisci([...VOCI, voce("d", "Generale", "Tubazioni", { prezzo_unitario: 800 })]);
    expect(a.impresa?.margine).toBeNull();
    expect(a.impresa?.marginePct).toBeNull();
    expect(a.impresa?.costiCompleti).toBe(false);
    expect(a.impresa?.righeSenzaCosto).toBe(1);
  });
});

describe("anteprimaComputo — la detrazione", () => {
  const conDetrazione = (extra: Partial<ProgettoAnteprimaComputo>, opzioni: Partial<OpzioniAnteprimaComputo> = {}) =>
    costruisci(VOCI, { ...PROGETTO, detrazione_pct: 50, ...extra }, { ...OPZIONI, ...opzioni });

  it("si calcola sull'imponibile netto entro il tetto di spesa", () => {
    const sotto = conDetrazione({ massimale_detrazione: 96000 });
    expect(sotto.detrazione).toMatchObject({ pct: 50, massimale: 96000, oltreMassimale: false });
    expect(sotto.detrazione?.importo).toBeCloseTo(1447.8, 5);
    const oltre = conDetrazione({ massimale_detrazione: 2000 });
    expect(oltre.detrazione).toMatchObject({ importo: 1000, oltreMassimale: true });
  });

  it("senza tetto è la stima sull'imponibile; a 0% o col modello che ha i suoi incentivi non c'è", () => {
    expect(conDetrazione({ massimale_detrazione: null }).detrazione).toMatchObject({ massimale: null, oltreMassimale: false });
    expect(conDetrazione({ detrazione_pct: 0 }).detrazione).toBeNull();
    expect(conDetrazione({}, { senzaDetrazione: true }).detrazione).toBeNull();
  });

  it("senza niente da sommare non si mostra una detrazione di zero euro", () => {
    expect(costruisci([], { ...PROGETTO, detrazione_pct: 50 }).detrazione).toBeNull();
  });
});

describe("anteprimaComputo — la testata", () => {
  it("emittente, codice, data, cliente e cantiere", () => {
    const a = costruisci();
    expect(a).toMatchObject({ emittente: "Bianchi Impianti", codice: "IDR-2026-0031", titolo: "Computo metrico" });
    expect(a.dataEtichetta).toBe("5 ottobre 2026");
    expect(a.cliente).toEqual({ nome: "Mario Rossi", righe: ["347 123 4567", "m.rossi@example.it"] });
    expect(a.cantiere).toBe("Via Roma 4, 36100 Vicenza, VI");
  });

  it("un preventivo da modello porta il nome dell'intervento", () => {
    expect(costruisci(VOCI, PROGETTO, { ...OPZIONI, titolo: "Conto Termico 3.0" }).titolo).toBe("Conto Termico 3.0");
  });

  it("un preventivo appena creato ha solo i dati che ci sono", () => {
    const a = costruisci([], { code: null, cliente_nome: "", sconto_pct: 0 });
    expect(a.cliente).toEqual({ nome: null, righe: [] });
    expect(a.cantiere).toBeNull();
    expect(a.codice).toBeNull();
  });
});
