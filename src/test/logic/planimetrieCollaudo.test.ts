/**
 * Progetto di collaudo con misure note: i valori attesi sono calcolati a mano e scritti qui.
 * Percorre tutto il giro: misure → lavorazioni della variante → prezzi proposti → importo.
 */
import { describe, expect, it } from "vitest";
import { calcolaQuantita } from "../../../shared/planimetrie/quantita";
import { importiLavorazioni, studioVariante } from "@/lib/planimetrie/studioImmobiliare";
import { attinenza, conPrezziProposti, FONTE_INDICATIVA, proponiPrezzo, tipiDaCercare, tipoLavorazione, type FontiPrezzi } from "@/lib/planimetrie/prezziProposti";
import { extraPredefiniti, previsioneLavori } from "@/lib/planimetrie/previsioneLavori";
import { costoDellaProposta } from "@/lib/planimetrie/costoProposta";
import { escludiDalPavimentoComune, stanzeConPavimentoAParte } from "../../../shared/planimetrie/materialiProgetto";
import { piantaCollaudo, piantaCollaudoConVariante } from "../fixtures/piantaCollaudo";

const q = (mappa: ReturnType<typeof calcolaQuantita>, chiave: string) => mappa[chiave]?.valore;

describe("progetto di collaudo: misure", () => {
  const mappa = calcolaQuantita(piantaCollaudo());

  it.each([
    // locale, pavimento m², perimetro m, pareti lorde m² (perimetro × 2,70), volume m³, battiscopa m (perimetro − porte)
    ["l1", 20, 18, 48.6, 54, 15.4],        // 5,00 × 4,00 · porte 0,90 + 0,80 + 0,90
    ["l2", 16, 16, 43.2, 43.2, 15.1],      // 4,00 × 4,00 · porta 0,90
    ["l3", 7.44, 11, 29.7, 20.088, 10.3],  // 2,40 × 3,10 · porta 0,70
    ["l4", 7.75, 11.2, 30.24, 20.925, 8.9],// 2,50 × 3,10 · porte 0,80 + 0,70 + 0,80
    ["l5", 10, 13.1231, 35.4324, 27, 12.3231], // trapezio 4,00 × (2,00 + 3,00) / 2 · lato obliquo √(4² + 1²) = 4,1231
  ])("%s: superficie, perimetro, pareti, volume e battiscopa", (id, pavimento, perimetro, pareti, volume, battiscopa) => {
    expect(q(mappa, `fatto:locale:${id}.pavimento_mq`)).toBe(pavimento);
    expect(q(mappa, `fatto:locale:${id}.perimetro_ml`)).toBe(perimetro);
    expect(q(mappa, `fatto:locale:${id}.pareti_lorde_mq`)).toBe(pareti);
    expect(q(mappa, `fatto:locale:${id}.volume_mc`)).toBe(volume);
    expect(q(mappa, `fatto:locale:${id}.battiscopa_ml`)).toBe(battiscopa);
  });

  it("la parete di 4,00 × 2,70 con una porta 0,90 × 2,10: 10,80 m² vuoto per pieno, 8,91 m² detraendo", () => {
    expect(q(mappa, "fatto:muro:t1.superficie_mq")).toBe(10.8);
    expect(q(mappa, "fatto:apertura:p1.superficie_mq")).toBe(1.89);
    expect(q(calcolaQuantita(piantaCollaudo(), { sogliaDeduzioneMq: 0 }), "fatto:muro:t1.superficie_mq")).toBe(8.91);
  });
});

describe("progetto di collaudo: spostare il tramezzo di 40 cm", () => {
  const righe = studioVariante(piantaCollaudoConVariante(), "A").righe;
  const riga = (id: string) => righe.find((r) => r.id === id)!;

  it("genera demolizione, nuova parete e le lavorazioni che si portano dietro, con la formula", () => {
    expect(righe.map((r) => [r.id, r.quantita, r.unita])).toEqual([
      ["t1", 10.8, "m²"], ["n1", 10.8, "m²"], ["p1", 1, "cad"], ["pn", 1, "cad"],
      ["t1-macerie", 1, "a corpo"], ["t1-ripristino", 0.4, "m²"],
      ["n1-intonaco", 21.6, "m²"], ["n1-tinteggiatura", 21.6, "m²"], ["n1-battiscopa", 6.2, "m"],
    ]);
    expect(riga("t1-macerie").criterio).toBe("1,08 m³ di macerie · 4 m × 2,7 m × 10 cm");
    expect(riga("t1-ripristino").criterio).toBe("4 m × 10 cm di traccia");
    expect(riga("n1-battiscopa").criterio).toBe("2 lati × (4 m − 0,9 m di porte)");
  });

  it("senza listino quota tutto con prezzi indicativi dichiarati, e dà un totale", () => {
    const quotate = conPrezziProposti(righe);
    expect(quotate.every((r) => r.prezzo?.fonte === FONTE_INDICATIVA)).toBe(true);
    // 10,8×28 + 10,8×58 + 60 + 480 + 350 + 0,4×60 + 21,6×24 + 21,6×9 + 6,2×14
    expect(importiLavorazioni(quotate)).toEqual({ importo: 2642.4, daQuotare: 0, daMisurare: 0 });
  });

  const fonti: FontiPrezzi = {
    listino: [
      { codice: "DEM.01", descrizione: "Demolizione di tramezzi interni", unita: "mq", prezzo: 32.2 },
      { codice: "MUR.01", descrizione: "Realizzazione di tramezzi in laterizio forato", unita: "mq", prezzo: 52.5 },
      { codice: "MUR.02", descrizione: "Realizzazione di contropareti in cartongesso", unita: "mq", prezzo: 37.5 },
      { codice: "DEM.09", descrizione: "Trasporto e smaltimento macerie in discarica autorizzata", unita: "corpo", prezzo: 550 },
      { codice: "PAV.01", descrizione: "Fornitura e posa pavimento in gres porcellanato 80x80 cm", unita: "mq", prezzo: 80 },
      { codice: "PAV.02", descrizione: "Fornitura e posa massetto di sottofondo", unita: "mq", prezzo: 25.2 },
    ],
    prezzarioNome: "Lombardia 2026",
    prezzario: {
      intonaco: [
        { codice: "A.1", descrizione: "Intonaco civile per interni, a due strati", unita: "m²", prezzo: 21 },
        { codice: "A.2", descrizione: "Intonaco civile per interni premiscelato", unita: "m²", prezzo: 26 },
        { codice: "A.3", descrizione: "Intonaco deumidificante per murature umide", unita: "m²", prezzo: 61 },
        { codice: "A.4", descrizione: "Demolizione di intonaco interno", unita: "m²", prezzo: 9 },
        { codice: "A.5", descrizione: "Intonaco rustico interno", unita: "m²", prezzo: 18 },
      ],
    },
  };

  it("prende dal listino dell'azienda la voce giusta, non una che le somiglia", () => {
    expect(proponiPrezzo(riga("t1"), fonti)).toEqual({ importo: 32.2, unita: "m²", fonte: "Listino aziendale", tariffa: "DEM.01" });
    expect(proponiPrezzo(riga("n1"), fonti)).toEqual({ importo: 52.5, unita: "m²", fonte: "Listino aziendale", tariffa: "MUR.01" });
    expect(proponiPrezzo(riga("t1-macerie"), fonti)).toMatchObject({ importo: 550, fonte: "Listino aziendale" });
    expect(attinenza("nuovo_tramezzo", "Demolizione di tramezzi interni")).toBe(0);
    expect(attinenza("pavimento", "Fornitura e posa massetto di sottofondo")).toBe(0);
  });

  it("dove il listino non arriva usa il prezzario di zona: la voce di mezzo fra quelle pertinenti", () => {
    // pertinenti: 18, 21, 26 (non il deumidificante né la demolizione) → mediana 21
    expect(proponiPrezzo(riga("n1-intonaco"), fonti)).toEqual({ importo: 21, unita: "m²", tariffa: "A.1", fonte: "Prezzario Lombardia 2026 · voce mediana di 3, da confermare" });
    expect(proponiPrezzo(riga("n1-tinteggiatura"), fonti)?.fonte).toBe(FONTE_INDICATIVA);
  });

  it("non tocca un prezzo già scritto e dice cosa cercare nel prezzario", () => {
    const mio = { importo: 99, unita: "m²" as const, fonte: "Prezzo inserito", tariffa: "" };
    const quotate = conPrezziProposti(righe.map((r) => (r.id === "t1" ? { ...r, prezzo: mio } : r)), fonti);
    expect(quotate.find((r) => r.id === "t1")!.prezzo).toBe(mio);
    expect(tipiDaCercare(righe)).toEqual(["battiscopa", "demolizione_tramezzo", "intonaco", "macerie", "nuovo_tramezzo", "porta", "rimozione_serramento", "ripristino", "tinteggiatura"]);
    expect(tipoLavorazione({ id: "x", descrizione: "Adeguamento elettrico del nuovo bagno" })).toBeNull();
  });
});

describe("progetto di collaudo: previsione di costi, extra e tempi", () => {
  const quotate = conPrezziProposti(studioVariante(piantaCollaudoConVariante(), "A").righe);
  const p = previsioneLavori(quotate);

  it("divide i lavori per fase, con manodopera, materiali e giorni di squadra", () => {
    expect(p.fasi.map((f) => [f.fase, f.importo, f.giorni, f.attesa])).toEqual([
      ["Demolizioni", 712.4, 1.5, 0],            // 302,40 + 60 + 350 · 10,8/20 + 1/8 + 1/2 = 1,165 → 1,5 giorni
      ["Murature", 626.4, 1, 0],                 // 10,8 m² a 12 m² al giorno
      ["Serramenti", 480, 0.5, 0],
      ["Intonaci", 518.4, 1, 0],                 // 21,6 m² a 25 m² al giorno
      ["Pavimenti e rivestimenti", 110.8, 0.5, 0], // ripristino 24 + battiscopa 86,80
      ["Tinteggiature", 194.4, 0.5, 14],         // dopo 14 giorni di asciugatura dell'intonaco
    ]);
    expect(p.lavori).toBe(2642.4);
    expect(p.manodopera + p.materiali).toBeCloseTo(p.lavori, 2);
    expect(p.fasi[0]).toMatchObject({ manodopera: 451.04, materiali: 261.36 }); // 302,4×0,85 + 60×0,9 + 350×0,4
  });

  it("aggiunge i costi extra, ognuno con la sua regola, e la pratica solo se si toccano le pareti", () => {
    expect(p.extra.map((e) => [e.id, e.importo, e.regola])).toEqual([
      ["cantiere", 450, "a corpo"], ["pratica", 1500, "a corpo"], ["sicurezza", 79.27, "3% dei lavori"],
      ["pulizia", 250, "a corpo"], ["imprevisti", 211.39, "8% dei lavori"],
    ]);
    expect(p.totale).toBe(5133.06);
    expect(extraPredefiniti(quotate.filter((r) => r.id.includes("tinteggiatura")))).not.toContain("pratica");
    expect(previsioneLavori(quotate, ["cantiere"]).totale).toBe(3092.4);
  });

  it("dà durata e intervallo, più largo quando i prezzi sono indicativi", () => {
    expect([p.giorniLavoro, p.giorniAttesa, p.giorniCalendario]).toEqual([5, 14, 21]);
    // tutti indicativi: ±25% dei lavori; l'ottimista è anche senza imprevisti
    expect(p.intervallo).toEqual({ minimo: 4261.07, probabile: 5133.06, massimo: 5793.66, incertezzaPct: 25 });
    const dalListino = previsioneLavori(quotate.map((r) => ({ ...r, prezzo: { ...r.prezzo!, fonte: "Listino aziendale" } })));
    expect(dalListino.intervallo.incertezzaPct).toBe(8);
    expect(p.fuori).toEqual({ senzaPrezzo: 0, senzaQuantita: 0, nonStimate: 0 });
  });
});

describe("pavimento comune: bagni ed esterni si chiedono", () => {
  it("elenca le stanze da chiedere e, se la risposta è no, le lascia col loro pavimento", () => {
    const doc = piantaCollaudo();
    expect(stanzeConPavimentoAParte(doc, "fatto")).toEqual([{ id: "l3", nome: "Bagno" }]);
    const dopo = escludiDalPavimentoComune(doc, "fatto", ["l3"]);
    expect(dopo.livelli[0].fatto.locali.map((l) => !!l.finiture?.pavimentoSpecifico)).toEqual([false, false, true, false, false]);
    expect(stanzeConPavimentoAParte(dopo, "fatto")).toEqual([]);
    expect(doc.livelli[0].fatto.locali[2].finiture).toBeUndefined();
  });
});

describe("costo di una proposta prima di salvarla", () => {
  it("confronta la variante proposta con com'era, e senza variante non dice niente", () => {
    const quota = <T extends ReturnType<typeof studioVariante>["righe"]>(r: T) => conPrezziProposti(r) as T;
    expect(costoDellaProposta(piantaCollaudo(), piantaCollaudoConVariante(), "progetto:A", quota))
      .toEqual({ lavorazioni: 9, prima: 0, dopo: 2642.4, daQuotare: 0, daMisurare: 0, indicative: 9 });
    expect(costoDellaProposta(piantaCollaudo(), piantaCollaudo(), "progetto:A", quota)).toBeNull();
    expect(costoDellaProposta(piantaCollaudo(), piantaCollaudoConVariante(), "fatto", quota)).toBeNull();
  });
});
