import { describe, expect, it } from "vitest";
import { faseDellaVoce, fasiPerIlDatabase, proponiFasi, ultimoGiorno } from "@/lib/orders/generali/fasiDalPiano";
import type { VocePiano } from "@/lib/orders/generali/pianoConti";

/**
 * Le fasi del cantiere dal piano (lotto 6, 14/11/2026). Le voci vere di Via Callimaco 28
 * (URBAN VISION): costruzione da dicembre 2026 per 9 mesi.
 */
const CALLIMACO: [string, string, number][] = [
  ["Opere civili secondo computo", "costruzione", 300000], ["Palificazioni", "costruzione", 70000],
  ["Impianti idraulici e termici", "costruzione", 55000], ["Impianti elettrici", "costruzione", 50000],
  ["Costo operai interni alla società", "manodopera", 90000], ["Tetto sostituzione", "costruzione", 15000],
  ["Impermeabilizzazioni", "costruzione", 10000], ["Costi opere in fabbro", "costruzione", 25000],
  ["Costi opere in lattoneria", "costruzione", 10000], ["Finestre", "costruzione", 35000],
  ["Cassonetti e tapparelle", "costruzione", 15000], ["Soglie", "costruzione", 5000], ["Porte interne", "costruzione", 4000],
  ["Sanitari, lavandini, piatti doccia", "costruzione", 5000], ["Opere precedenti alla posa delle betonelle", "costruzione", 8000],
  ["Pavimenti", "costruzione", 6000], ["Rivestimenti", "costruzione", 5000], ["Cassette postali", "costruzione", 600],
  ["Betonelle", "costruzione", 15000], ["Magazzini edili limtrofi", "costruzione", 50000],
  ["Sistemazioni esterne (vialetti, marciapiede)", "costruzione", 8000], ["Aree verdi, piantumazioni, irrigazioni", "costruzione", 3000],
  ["Parcheggi, box e autorimesse", "costruzione", 0], ["Scale interne e esterne in marmo compresa la posa", "costruzione", 13000],
  ["Bascule box", "costruzione", 2200], ["Piscine", "costruzione", 40000], ["Reti acque meteoriche e reflue", "costruzione", 3000],
  ["Impianto di illuminazione esterna", "costruzione", 2000], ["Acquisto e montaggio portone condominiali", "costruzione", 4200],
  ["Allestimento e servizi cantiere", "costruzione", 1000], ["Sicurezza di cantiere e DPI", "sicurezza", 0],
  ["Personale di cantiere e custodia", "manodopera", 0], ["Nolo macchinari e attrezzature", "noli", 0],
  ["Trasporto materiali e logistica", "materiali", 0], ["Smaltimento rifiuti da costruzione", "costruzione", 5000],
  ["Locazione ufficio di cantiere / sede operativa", "costruzione", 0],
  ["Assicurazioni (R.C., decennale postuma, rischi di cantiere)", "costruzione", 10000],
];
const voci: VocePiano[] = CALLIMACO.map(([descrizione, categoria, importo], i): VocePiano => ({
  id: `v${i}`, tipo: "costo", categoria: categoria as VocePiano["categoria"], descrizione, importo, mese: "2026-12", durataMesi: 9,
  figliaId: null, categorieCosto: [], aFinire: null, nota: null, ordine: i * 10, origineId: null,
}));
const vendita: VocePiano = { ...voci[0], id: "r1", tipo: "ricavo", categoria: "vendite", descrizione: "Unità 1", importo: 365000 };

describe("fasi del cantiere dal piano", () => {
  const p = proponiFasi([...voci, vendita]);
  const di = (chiave: string) => p.fasi.find((f) => f.chiave === chiave)!;
  const nomi = (chiave: string) => di(chiave).voci.map((v) => v.descrizione);

  it("ogni lavoro va nella sua fase", () => {
    expect(nomi("allestimento")).toEqual(["Allestimento e servizi cantiere"]);
    expect(nomi("scavi")).toEqual(["Palificazioni"]);
    expect(nomi("strutture")).toEqual(["Opere civili secondo computo"]);
    expect(nomi("coperture")).toEqual(["Tetto sostituzione", "Impermeabilizzazioni", "Costi opere in lattoneria"]);
    expect(nomi("impianti")).toEqual(["Impianti idraulici e termici", "Impianti elettrici", "Impianto di illuminazione esterna"]);
    expect(nomi("serramenti")).toEqual(["Costi opere in fabbro", "Finestre", "Cassonetti e tapparelle", "Porte interne", "Bascule box", "Acquisto e montaggio portone condominiali"]);
    expect(nomi("finiture")).toEqual(["Soglie", "Sanitari, lavandini, piatti doccia", "Pavimenti", "Rivestimenti", "Scale interne e esterne in marmo compresa la posa"]);
    expect(nomi("esterni")).toEqual(["Opere precedenti alla posa delle betonelle", "Cassette postali", "Betonelle", "Sistemazioni esterne (vialetti, marciapiede)",
      "Aree verdi, piantumazioni, irrigazioni", "Parcheggi, box e autorimesse", "Piscine", "Reti acque meteoriche e reflue"]);
  });

  it("i costi che non sono un lavoro restano sulla generale; i ricavi non entrano", () => {
    expect(p.restano.map((v) => v.descrizione)).toEqual([
      "Costo operai interni alla società", "Magazzini edili limtrofi", "Sicurezza di cantiere e DPI", "Personale di cantiere e custodia",
      "Nolo macchinari e attrezzature", "Trasporto materiali e logistica", "Smaltimento rifiuti da costruzione",
      "Locazione ufficio di cantiere / sede operativa", "Assicurazioni (R.C., decennale postuma, rischi di cantiere)",
    ]);
    expect(p.fasi.flatMap((f) => f.voci).concat(p.restano)).toHaveLength(voci.length);
  });

  it("le date vengono dal calendario della costruzione, in sequenza con sovrapposizioni", () => {
    expect(p.finestra).toEqual({ inizio: "2026-12", fine: "2027-08" });
    expect([di("allestimento").inizio, di("allestimento").fine]).toEqual(["2026-12", "2026-12"]);
    expect([di("strutture").inizio, di("strutture").fine]).toEqual(["2027-01", "2027-04"]);
    expect([di("esterni").inizio, di("esterni").fine]).toEqual(["2027-07", "2027-08"]);
  });

  it("senza mesi nel piano niente date, ma le fasi ci sono", () => {
    const senza = proponiFasi(voci.map((v): VocePiano => ({ ...v, mese: null })));
    expect(senza.finestra).toBeNull();
    expect(senza.fasi.every((f) => f.inizio === null && f.fine === null)).toBe(true);
  });

  it("per il database: primo e ultimo giorno del mese, solo gli id delle voci", () => {
    expect(ultimoGiorno("2027-02")).toBe("2027-02-28");
    expect(ultimoGiorno("2028-02")).toBe("2028-02-29");
    expect(fasiPerIlDatabase([{ nome: " Strutture ", inizio: "2027-01", fine: "2027-04", voci: [{ id: "v0" }] }, { nome: " ", inizio: null, fine: null, voci: [] }]))
      .toEqual([{ nome: "Strutture", inizio: "2027-01-01", fine: "2027-04-30", voci: ["v0"] }]);
    expect(faseDellaVoce("Strutture in cemento armato")).toBe("strutture");
  });
});
