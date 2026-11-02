import { describe, expect, it } from "vitest";
import { calcolaPiano, IPOTESI_PREDEFINITE, oreDellaVoce, chiaveLavorazione, type FaseCantiere, type VoceCantiere } from "../../../shared/piano-cantiere/calcolo.ts";
import { conIncidenzaPrezzario, fasiDellaCommessa, testiSenzaManodopera, vociDellaCommessa } from "../../../shared/piano-cantiere/vociCommessa.ts";
import { marginePrevisto } from "../../../shared/piano-cantiere/margine.ts";
import { risorsePerPiano } from "../../../shared/piano-cantiere/risorse.ts";
import { correzioniDalloStorico, prevediFine } from "../../../shared/piano-cantiere/previsione.ts";
import { regioneDaProvincia } from "../../../shared/piano-cantiere/regioni.ts";
import { chiudiBuchi, fasiDelComputo, limitaSquadre } from "../../../shared/piano-cantiere/cronoprogramma.ts";
import type { ContestoRisorse } from "../../../shared/silvio-commessa/risorse.ts";

const voce = (o: Partial<VoceCantiere>): VoceCantiere => ({ fase: null, capitolo: null, descrizione: "Lavoro", unita: "m2", quantita: 1, importo: null, costo_manodopera: null, costo_materiali: null, ore_previste: null, incidenza: null, origine: "computo", ...o });
const fase = (o: Partial<FaseCantiere>): FaseCantiere => ({ nome: "Murature", dal: null, al: null, percentuale: 0, completata: false, ditta: null, ...o });
const ip = { ...IPOTESI_PREDEFINITE, costoOrario: 27 };

describe("le ore di una voce", () => {
  it("costo di manodopera ÷ costo orario", () => {
    expect(oreDellaVoce(voce({ costo_manodopera: 100, quantita: 10 }), ip)?.ore).toBeCloseTo(37.04, 1);
  });
  it("percentuale di manodopera sull'importo, con l'intervallo", () => {
    const o = oreDellaVoce(voce({ importo: 1000, incidenza: { frazione: 0.4, min: 0.2, max: 0.6 } }), ip)!;
    expect(o.ore).toBeCloseTo(14.81, 1);
    expect(o.min).toBeCloseTo(7.41, 1);
    expect(o.max).toBeCloseTo(22.22, 1);
    expect(o.fonte).toBe("prezzario");
  });
  it("le ore scritte vincono su tutto, poi la resa dell'azienda", () => {
    expect(oreDellaVoce(voce({ ore_previste: 12, costo_manodopera: 100, quantita: 10 }), ip)).toMatchObject({ ore: 12, fonte: "scritte" });
    const rese = [{ chiave: chiaveLavorazione("Posa gres"), ore_per_unita: 0.5 }];
    expect(oreDellaVoce(voce({ descrizione: "Posa gres", quantita: 10, costo_manodopera: 100 }), { ...ip, rese })).toMatchObject({ ore: 5, fonte: "azienda" });
  });
  it("una voce senza dati non vale zero", () => {
    expect(oreDellaVoce(voce({ importo: 1000 }), ip)).toBeNull();
  });
});

describe("il piano", () => {
  const oggi = "2026-11-02";
  it("200 ore in 10 giorni a 8 ore con resa 85% = 3 operai", () => {
    const p = calcolaPiano([voce({ fase: "Murature", ore_previste: 200 })], [fase({})], ip, { oggi, al: "2026-11-13" });
    expect(p.giorniDisponibili).toBe(10);
    expect(p.fasi[0].operaiNecessari).toBe(3);
    expect(p.fattibile).toBe(true);
  });
  it("le fasi stanno una dopo l'altra entro la data", () => {
    const p = calcolaPiano(
      [voce({ fase: "Demolizioni", ore_previste: 40 }), voce({ fase: "Finiture", ore_previste: 40 })],
      [fase({ nome: "Demolizioni" }), fase({ nome: "Finiture" })], ip, { oggi, al: "2026-11-13" });
    expect(p.fasi.map((f) => f.giorni)).toEqual([5, 5]);
    expect(p.fasi[0].al! < p.fasi[1].dal!).toBe(true);
    expect(p.fasi[1].al).toBe("2026-11-13");
  });
  it("conta solo il lavoro che resta", () => {
    const p = calcolaPiano([voce({ fase: "Murature", ore_previste: 100 })], [fase({ percentuale: 75 })], ip, { oggi, al: "2026-11-13" });
    expect(p.oreTotali).toBe(25);
  });
  it("una fase della ditta non chiede operai dell'azienda", () => {
    const p = calcolaPiano([voce({ fase: "Murature", ore_previste: 200 })], [fase({ ditta: "Rossi Srl" })], ip, { oggi, al: "2026-11-13" });
    expect(p.fasi[0].operaiNecessari).toBe(0);
  });
  it("data già passata: non fattibile e lo dice", () => {
    const p = calcolaPiano([voce({ fase: "Murature", ore_previste: 200 })], [fase({})], ip, { oggi, al: "2026-10-01" });
    expect(p.fattibile).toBe(false);
    expect(p.avvisi.join(" ")).toContain("già passata");
  });
  it("salta le feste: l'8 dicembre non conta", () => {
    expect(calcolaPiano([voce({ fase: "Murature", ore_previste: 10 })], [fase({})], ip, { oggi: "2026-12-07", al: "2026-12-09" }).giorniDisponibili).toBe(2);
  });
  it("commessa senza voci: dice cosa manca, non zero ore e basta", () => {
    const p = calcolaPiano([], [fase({})], ip, { oggi, al: "2026-11-13" });
    expect(p.fattibile).toBe(false);
    expect(p.avvisi.join(" ")).toContain("non ha voci");
  });
  it("le voci a corpo senza dati restano contate e la copertura lo mostra", () => {
    const p = calcolaPiano([voce({ fase: "Murature", importo: 1000 }), voce({ fase: "Murature", importo: 1000, ore_previste: 10 })], [fase({})], ip, { oggi, al: "2026-11-13" });
    expect(p.vociSenzaDato).toBe(1);
    expect(p.coperturaPct).toBe(50);
  });
  it("le voci senza fase si dividono sulle fasi di lavoro, non sul collaudo", () => {
    const p = calcolaPiano([voce({ descrizione: "Xyz", ore_previste: 100 })],
      [fase({ nome: "Opere", dal: "2026-11-02", al: "2026-11-06" }), fase({ nome: "Collaudo", dal: "2026-11-09", al: "2026-11-10" })], ip, { oggi, al: "2026-11-13" });
    expect(p.fasi[0].ore).toBe(100);
    expect(p.fasi[1].ore).toBe(0);
    expect(p.fasi[0].conOreDivise).toBe(true);
    expect(p.fasi[1].operaiNecessari).toBe(0);
  });
  it("«Allestimento e demolizioni» è lavoro vero; le ore divise non vanno al collaudo", () => {
    const p = calcolaPiano([voce({ descrizione: "Xyz", ore_previste: 100 })],
      [fase({ nome: "Allestimento e demolizioni" }), fase({ nome: "Collaudo e consegna" })], ip, { oggi, al: "2026-11-13" });
    expect(p.fasi[0].ore).toBe(100);
    expect(p.fasi[1].ore).toBe(0);
  });
  it("non sfora mai la data se c'è spazio, anche con le fasi senza ore", () => {
    const p = calcolaPiano([voce({ descrizione: "Xyz", ore_previste: 500 })],
      ["Demolizioni", "Murature", "Impianti", "Posa", "Finiture", "Collaudo"].map((nome) => fase({ nome })), ip, { oggi, al: "2026-12-14" });
    expect(p.fasi.at(-1)!.al! <= "2026-12-14").toBe(true);
    expect(p.fasi.reduce((t, f) => t + f.giorni, 0)).toBeLessThanOrEqual(p.giorniDisponibili);
  });
  it("più fasi che giorni: lo dice", () => {
    const p = calcolaPiano([voce({ descrizione: "Xyz", ore_previste: 10 })], ["A", "B", "C"].map((nome) => fase({ nome })), ip, { oggi, al: "2026-11-03" });
    expect(p.avvisi.join(" ")).toContain("in parallelo");
  });
  it("una correzione dallo storico cambia le ore della fase", () => {
    const correzioni = new Map([[chiaveLavorazione("Murature"), 1.5]]);
    expect(calcolaPiano([voce({ fase: "Murature", ore_previste: 100 })], [fase({})], { ...ip, correzioni }, { oggi, al: "2026-11-13" }).oreTotali).toBe(150);
  });
});

describe("le voci della commessa", () => {
  const riga = { descrizione: "Posa", quantita: 2, importo: 100 };
  it("usa una fonte sola: fasi, poi computo, poi preventivo", () => {
    expect(vociDellaCommessa({ voci_fase: [riga], voci_computo: [riga, riga], righe_preventivo: [riga] })).toHaveLength(1);
    expect(vociDellaCommessa({ voci_computo: [riga, riga], righe_preventivo: [riga] })[0].origine).toBe("computo");
    expect(vociDellaCommessa({ righe_preventivo: [riga] })[0].origine).toBe("preventivo");
    expect(vociDellaCommessa({})).toEqual([]);
  });
  it("lascia fuori le voci opzionali e senza testo", () => {
    expect(vociDellaCommessa({ voci_computo: [{ ...riga, opzionale: true }, { descrizione: "  " }] })).toEqual([]);
  });
  it("capisce la percentuale scritta come 40 o come 0,4", () => {
    expect(vociDellaCommessa({ voci_computo: [{ ...riga, incidenza: 40 }] })[0].incidenza?.frazione).toBe(0.4);
    expect(vociDellaCommessa({ voci_computo: [{ ...riga, incidenza: 0.4 }] })[0].incidenza?.frazione).toBe(0.4);
  });
  it("chiede al prezzario solo chi non ha dati, e aggiunge la stima solo a loro", () => {
    const voci = [voce({ descrizione: "Senza", importo: 100 }), voce({ descrizione: "Con", importo: 100, costo_manodopera: 5 }), voce({ descrizione: "Gratis" })];
    expect(testiSenzaManodopera(voci)).toEqual(["senza"]);
    const dopo = conIncidenzaPrezzario(voci, new Map([["senza", { frazione: 0.3 }], ["con", { frazione: 0.9 }]]));
    expect(dopo[0].incidenza?.frazione).toBe(0.3);
    expect(dopo[1].incidenza).toBeNull();
  });
  it("una fase completata vale 100%", () => {
    expect(fasiDellaCommessa([{ nome: "A", status: "completata", percentuale: 10 }])[0]).toMatchObject({ completata: true, percentuale: 100 });
  });
});

describe("il margine", () => {
  const oggi = "2026-11-02";
  const piano = calcolaPiano([voce({ fase: "Murature", ore_previste: 100, costo_materiali: 10, quantita: 100 })], [fase({})], ip, { oggi, al: "2026-11-13" });
  const voci = [voce({ fase: "Murature", ore_previste: 100, costo_materiali: 10, quantita: 100 })];
  const zero = { manodopera: 0, materiali: 0, ditte: 0, altri: 0 };
  it("completo: ricavi meno manodopera e materiali", () => {
    const m = marginePrevisto(piano, voci, ip, { ricavi: 10000, registrati: zero, ditte: [] });
    expect(m.costi.manodopera).toBe(2700);
    expect(m.costi.materiali).toBe(1000);
    expect(m.margine).toBe(6300);
    expect(m.percentuale).toBe(63);
  });
  it("i materiali già comprati non si contano due volte con quelli previsti", () => {
    expect(marginePrevisto(piano, voci, ip, { ricavi: 10000, registrati: { ...zero, materiali: 1500 }, ditte: [] }).costi.materiali).toBe(1500);
  });
  it("la manodopera già pagata si somma alle ore che restano", () => {
    expect(marginePrevisto(piano, voci, ip, { ricavi: 10000, registrati: { ...zero, manodopera: 500 }, ditte: [] }).costi.manodopera).toBe(3200);
  });
  it("una ditta senza costo: niente cifra certa, solo «al massimo», e dice cosa manca", () => {
    const m = marginePrevisto(piano, voci, ip, { ricavi: 10000, registrati: zero, ditte: [{ nome: "Rossi", costo: null }] });
    expect(m.margine).toBeNull();
    expect(m.margineMassimo).toBe(6300);
    expect(m.mancano.join(" ")).toContain("Rossi");
  });
  it("senza materiali lo dice", () => {
    const senza = [voce({ fase: "Murature", ore_previste: 100 })];
    expect(marginePrevisto(piano, senza, ip, { ricavi: 10000, registrati: zero, ditte: [] }).mancano).toContain("il costo dei materiali");
  });
});

describe("chi e con che cosa", () => {
  const ctx = (o: Partial<ContestoRisorse> = {}): ContestoRisorse => ({
    oggi: "2026-11-02",
    dipendenti: [{ id: "a", nome: "Anna", attivo: true }, { id: "b", nome: "Bruno", attivo: true }, { id: "u", nome: "Ufficio", attivo: true }],
    storicoDipendenti: [], impegniDipendenti: [], assenze: [], staff: [], capomastri: [], ditte: [], storicoDitte: [], documentiDitte: [],
    mezzi: [{ id: "m", nome: "Miniescavatore", stato: "disponibile", gestione: "singola", quantita_totale: null }, { id: "r", nome: "Rotto escavatore", stato: "fuori_servizio", gestione: "singola", quantita_totale: null }],
    storicoMezzi: [], impegniMezzi: [], fornitori: [], storicoAcquisti: [], ...o,
  } as ContestoRisorse);
  const ruoli = new Map([["a", { role_type: "operaio", area: "cantiere" }], ["b", { role_type: "operaio", area: "cantiere" }], ["u", { role_type: "staff_interno", area: "amministrazione" }]]);
  const piano = (ore: number) => calcolaPiano([voce({ fase: "Demolizioni", ore_previste: ore })], [fase({ nome: "Demolizioni" })], ip, { oggi: "2026-11-02", al: "2026-11-13" });

  it("3 necessari e 2 liberi: ne propone 2 e dice che ne manca uno; mai l'ufficio", () => {
    const r = risorsePerPiano(piano(200), ctx(), ruoli);
    expect(r.persone.map((p) => p.employee_id).sort()).toEqual(["a", "b"]);
    expect(r.mancano).toEqual([{ fase: "Demolizioni", persone: 1 }]);
  });
  it("chi è in ferie o su un'altra commessa nelle stesse date non si propone", () => {
    const r = risorsePerPiano(piano(60), ctx({
      assenze: [{ employee_id: "a", dal: "2026-11-01", al: "2026-11-30", tipo: "ferie" }],
      impegniDipendenti: [{ employee_id: "b", commessa: "X", dal: "2026-11-01", al: "2026-11-30" }],
    }), ruoli);
    expect(r.persone).toEqual([]);
    expect(r.mancano[0].persone).toBe(1);
  });
  it("chi ha fatto fasi simili viene prima, e il motivo non inventa esperienza", () => {
    const r = risorsePerPiano(piano(60), ctx({ storicoDipendenti: [{ employee_id: "b", fase: "Demolizioni" }] }), ruoli);
    expect(r.persone[0]).toMatchObject({ employee_id: "b", motivo: "ha fatto una fase simile" });
    const s = risorsePerPiano(piano(60), ctx(), ruoli);
    expect(s.persone[0].motivo).toBe("è libero in queste date");
  });
  it("chi è già assegnato conta fra quelli che servono e non si propone due volte", () => {
    const r = risorsePerPiano(piano(60), ctx(), ruoli, [{ employee_id: "b", fase: "Demolizioni" }]);
    expect(r.persone).toHaveLength(1);
    expect(r.persone[0]).toMatchObject({ employee_id: "b", gia: true });
  });
  it("il mezzo è uno vero e libero; se è occupato dice cosa manca", () => {
    expect(risorsePerPiano(piano(60), ctx(), ruoli).mezzi[0]).toMatchObject({ mezzo_id: "m" });
    const occupato = risorsePerPiano(piano(60), ctx({ impegniMezzi: [{ mezzo_id: "m", commessa: "X", dal: "2026-11-01", al: "2026-11-30", quantita: 1 }] }), ruoli);
    expect(occupato.mezzi).toEqual([]);
    expect(occupato.mezziMancanti[0].fase).toBe("Demolizioni");
  });
});

describe("la previsione", () => {
  const oggi = "2026-11-16";
  const f = (o: Partial<FaseCantiere>) => fase({ dal: "2026-11-02", al: "2026-11-20", ...o });
  it("al ritmo attuale sposta la fine e calcola il ritardo", () => {
    const p = prevediFine([f({ percentuale: 50 })], "2026-11-13", oggi);
    expect(p.affidabile).toBe(true);
    expect(p.dataPrevista).toBe("2026-11-30");
    expect(p.ritardoGiorni).toBe(6);
  });
  it("in orario: nessun ritardo", () => {
    expect(prevediFine([f({ percentuale: 90 })], "2026-11-13", oggi).ritardoGiorni).toBe(0);
  });
  it("senza rapportini recenti non dà una data", () => {
    const p = prevediFine([f({ percentuale: 50 })], null, oggi);
    expect(p).toMatchObject({ dataPrevista: null, affidabile: false });
    expect(p.perche).toContain("rapportini");
  });
  it("cantiere fermo a zero: niente data, ma il ritardo già maturato sì", () => {
    const p = prevediFine([fase({ dal: "2026-10-01", al: "2026-11-02", percentuale: 0 })], "2026-11-13", oggi);
    expect(p.dataPrevista).toBeNull();
    expect(p.ritardoGiorni).toBe(10);
  });
  it("corregge solo con almeno 5 fasi chiuse", () => {
    const quattro = Array.from({ length: 4 }, () => ({ nome: "Posa", orePreviste: 10, oreVere: 20 }));
    expect(correzioniDalloStorico(quattro).size).toBe(0);
    expect(correzioniDalloStorico([...quattro, { nome: "posa", orePreviste: 10, oreVere: 20 }]).get("posa")).toBe(2);
    const sporche = Array.from({ length: 5 }, () => ({ nome: "Posa", orePreviste: 1, oreVere: 500 }));
    expect(correzioniDalloStorico(sporche).get("posa")).toBe(3);
  });
});

describe("la regione del prezzario", () => {
  it("dalla sigla, anche minuscola; senza prezzario nessuna regione", () => {
    expect(regioneDaProvincia("to")).toBe("Piemonte");
    expect(regioneDaProvincia("LO")).toBe("Lombardia");
    expect(regioneDaProvincia("RM")).toBeNull();
    expect(regioneDaProvincia(null)).toBeNull();
  });
});

describe("il cronoprogramma dell'AI", () => {
  const f = (nome: string, inizio: number, durata: number) => ({ nome, inizio, durata, nota: "" });
  it("toglie le fasi che nel computo non ci sono, tiene quelle di servizio", () => {
    const fasi = [f("Allestimento cantiere", 1, 2), f("Scavi e preparazione", 3, 2), f("Demolizioni", 5, 3), f("Stagionatura massetto", 8, 5)];
    expect(fasiDelComputo(fasi, "Demolizione pavimenti e massetti").map((x) => x.nome)).toEqual(["Allestimento cantiere", "Demolizioni", "Stagionatura massetto"]);
  });
  it("chiude il buco della fase tolta", () => {
    expect(chiudiBuchi([f("A", 1, 2), f("C", 5, 3)]).map((x) => x.inizio)).toEqual([1, 3]);
  });
  it("con 2 squadre mai 3 fasi di lavoro insieme; le attese non contano", () => {
    const fasi = limitaSquadre([f("A", 1, 5), f("B", 1, 5), f("C", 1, 3), f("Stagionatura", 1, 9)], 2);
    expect(fasi.find((x) => x.nome === "C")?.inizio).toBe(6);
    expect(fasi.find((x) => x.nome === "Stagionatura")?.inizio).toBe(1);
  });
  it("senza squadre indicate non cambia nulla", () => {
    expect(limitaSquadre([f("A", 1, 5), f("B", 1, 5), f("C", 1, 3)], null).map((x) => x.inizio)).toEqual([1, 1, 1]);
  });
});
