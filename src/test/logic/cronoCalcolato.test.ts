import { describe, expect, it, vi } from "vitest";
import { calcolaCrono, lavorazioneDellaVoce, preparaCrono, type VoceCrono } from "../../../shared/piano-cantiere/cronoCalcolato.ts";
import { durataComplessiva, fasiDaCalcolo } from "@/lib/preventivi/cronoprogramma";

const ore = (descrizione: string, ore_previste: number, capitolo: string | null = null): VoceCrono => ({ descrizione, ore_previste, capitolo, quantita: 1 });
const ip = { costoOrario: 30, oreGiorno: 8, resaPct: 85 };
const fase = (r: ReturnType<typeof calcolaCrono>, nome: string) => r.fasi.find((f) => f.nome === nome)!;

describe("le voci vanno nella loro lavorazione", () => {
  it.each([
    ["Demolizione massetti", "Demolizioni e rimozioni"], ["Rimozione manto di copertura", "Demolizioni e rimozioni"],
    ["Massetto sabbia e cemento", "Massetti e sottofondi"], ["Posa gres", "Pavimenti e rivestimenti"],
    ["Impianto elettrico completo", "Impianti"], ["Punti luce e quadro", "Impianti"], ["Tramezzi in laterizio", "Murature e tramezzi"],
    ["Posa serramenti", "Serramenti e porte"], ["Porte interne", "Serramenti e porte"], ["Tinteggiatura", "Tinteggiature"],
    ["Cappotto termico EPS", "Cappotto"], ["Finestra in PVC a taglio termico", "Serramenti e porte"], ["Intonaco a calce idraulica", "Intonaci e rasature"],
    ["Intonaco civile su muratura", "Intonaci e rasature"], ["Massetto su solaio", "Massetti e sottofondi"], ["Massetto in calcestruzzo alleggerito", "Massetti e sottofondi"],
    ["Posa pavimento su massetto esistente", "Pavimenti e rivestimenti"], ["Tinteggiatura pareti in cartongesso", "Tinteggiature"],
    ["Lavabo con piletta di scarico", "Sanitari e rubinetterie"], ["Vaso wc con cassetta di scarico", "Sanitari e rubinetterie"], ["Trasporto a discarica macerie", "Demolizioni e rimozioni"],
    ["Porta interna tamburata", "Serramenti e porte"], ["Opere murarie", "Murature e tramezzi"], ["Caldaia a condensazione", "Impianti"], ["Climatizzatore dual split", "Impianti"], ["Travi in legno", "Strutture"],
    ["Cappotto EPS 12 cm", "Cappotto"], ["Lattonerie", "Copertura"], ["Montaggio sanitari", "Sanitari e rubinetterie"],
  ])("%s → %s", (descrizione, atteso) => {
    expect(lavorazioneDellaVoce({ descrizione })?.nome).toBe(atteso);
  });
  it("non si lascia ingannare: manto erboso, impermeabilizzazione del bagno", () => {
    expect(lavorazioneDellaVoce({ descrizione: "Manto erboso sintetico" })).toBeNull();
    expect(lavorazioneDellaVoce({ descrizione: "Impermeabilizzazione box doccia" })?.nome).toBe("Sanitari e rubinetterie");
  });
  it("una voce generica prende il capitolo", () => {
    expect(lavorazioneDellaVoce({ descrizione: "Voce numero 12", capitolo: "Impianti" })?.nome).toBe("Impianti");
    expect(lavorazioneDellaVoce({ descrizione: "Voce numero 12", capitolo: "Varie" })).toBeNull();
  });
});

describe("il cronoprogramma calcolato", () => {
  const appartamento = [ore("Tinteggiatura", 40), ore("Demolizione tramezzi", 60), ore("Massetto", 30), ore("Impianto elettrico", 50), ore("Posa gres", 40)];

  it("stesse voci, stesso risultato, sempre", () => {
    expect(calcolaCrono(appartamento, ip)).toEqual(calcolaCrono(appartamento, ip));
  });
  it("segue la sequenza di cantiere, in qualunque ordine siano scritte le voci", () => {
    expect(calcolaCrono(appartamento, ip).fasi.map((f) => f.nome)).toEqual([
      "Allestimento cantiere", "Demolizioni e rimozioni", "Impianti", "Massetti e sottofondi", "Stagionatura massetto",
      "Pavimenti e rivestimenti", "Tinteggiature", "Pulizia e consegna",
    ]);
  });
  it("durata = ore ÷ (persone × ore utili): 60 ore, 3 persone, 6,8 ore = 3 giorni", () => {
    expect(fase(calcolaCrono(appartamento, ip, { personePerSquadra: 3 }), "Demolizioni e rimozioni").durata).toBe(3);
    expect(fase(calcolaCrono(appartamento, ip, { personePerSquadra: 1 }), "Demolizioni e rimozioni").durata).toBe(9);
  });
  it("la stagionatura è un'attesa: i pavimenti partono dopo", () => {
    const r = calcolaCrono(appartamento, ip);
    const s = fase(r, "Stagionatura massetto");
    expect(s).toMatchObject({ durata: 5, attesa: true });
    expect(fase(r, "Pavimenti e rivestimenti").inizio).toBe(s.inizio + 5);
  });
  it("con una squadra le lavorazioni dello stesso momento vanno una dopo l'altra, con due insieme", () => {
    const voci = [ore("Impianto elettrico", 40), ore("Tramezzi", 40)];
    const una = calcolaCrono(voci, ip, { squadre: 1 });
    expect(fase(una, "Murature e tramezzi").inizio).toBeGreaterThan(fase(una, "Impianti").inizio);
    const due = calcolaCrono(voci, ip, { squadre: 2 });
    expect(fase(due, "Murature e tramezzi").inizio).toBe(fase(due, "Impianti").inizio);
    expect(due.giorni).toBeLessThan(una.giorni);
  });
  it("mai più lavorazioni insieme delle squadre, attese escluse", () => {
    const voci = [ore("Impianto", 40), ore("Tramezzi", 40), ore("Copertura", 40), ore("Massetto", 40), ore("Cappotto", 40)];
    const r = calcolaCrono(voci, ip, { squadre: 2 });
    for (let g = 1; g <= r.giorni; g++) {
      expect(r.fasi.filter((f) => !f.attesa && g >= f.inizio && g < f.inizio + f.durata).length).toBeLessThanOrEqual(2);
    }
  });
  it("non inventa lavorazioni: senza scavi nel computo, niente scavi", () => {
    expect(calcolaCrono(appartamento, ip).fasi.some((f) => /scav/i.test(f.nome))).toBe(false);
  });
  it("dal costo di manodopera e dalla stima del prezzario, dichiarata con l'intervallo", () => {
    const r = calcolaCrono([
      { descrizione: "Posa gres", quantita: 10, costo_manodopera: 30 },
      { descrizione: "Tinteggiatura", importo: 3000, incidenza: { frazione: 0.5, min: 0.25, max: 0.75 } },
    ], ip);
    expect(r.ore).toBe(60);
    expect(r.oreMin).toBe(35);
    expect(r.oreMax).toBe(85);
    expect(r.vociStimate).toBe(1);
    expect(r.avvisoInterno).toContain("prezzario");
  });
  it("una voce senza dati non vale zero in silenzio", () => {
    const r = calcolaCrono([{ descrizione: "Posa gres", importo: 100 }], ip);
    expect(r.vociSenzaDati).toBe(1);
    expect(fase(r, "Pavimenti e rivestimenti").durata).toBe(1);
    expect(r.avvisoInterno).toContain("Da controllare");
    expect(r.avvisoInterno).toContain("non ha");
  });
  it("una voce non riconosciuta resta col suo capitolo e lo dice", () => {
    const r = calcolaCrono([ore("Xyz", 10, "Lavori speciali")], ip);
    expect(r.fasi.map((f) => f.nome)).toContain("Lavori speciali");
    expect(r.avvisoInterno).toContain("non è stata riconosciuta");
  });
  it("nel PDF del cliente non finiscono ore, stime né avvisi per l'impresa", () => {
    const r = calcolaCrono([{ descrizione: "Massetto", importo: 3000, incidenza: { frazione: 0.5 } }, { descrizione: "Xyz", importo: 100 }], ip);
    const perCliente = r.fasi.map((f) => f.nota).join(" ");
    expect(perCliente).not.toMatch(/ore|prezzario|dati|controllare/i);
    expect(r.fasi.find((f) => f.attesa)?.nota).toBe("Tempo tecnico di attesa.");
    expect(fasiDaCalcolo(r.fasi).map((f) => f.descrizione).join(" ")).not.toMatch(/prezzario|ore di/i);
  });
  it("oneri, percentuali e detrazioni non sono giorni di cantiere", () => {
    const r = calcolaCrono([
      { descrizione: "Oneri della sicurezza", importo: 1000, unita: "corpo", incidenza: { frazione: 0.5 } },
      { descrizione: "Spese generali", importo: 1000, unita: "%", incidenza: { frazione: 0.5 } },
      { descrizione: "A detrarre: rimozione ponteggio", importo: -500, incidenza: { frazione: 0.5 } },
      { descrizione: "Ponteggio", importo: 1000, sicurezza: true, incidenza: { frazione: 0.5 } },
      ore("Tinteggiatura", 10),
    ], ip);
    expect(r.voci).toBe(1);
    expect(r.fasi.some((f) => /ponteg|oneri/i.test(f.nome))).toBe(false);
  });
  it("la sola fornitura non ha ore; fornitura e posa sì", () => {
    const r = calcolaCrono([
      { descrizione: "Fornitura di serramenti", importo: 5000, incidenza: { frazione: 0.5 } },
      { descrizione: "Sanitari", quantita: 2, costo_manodopera: 0, costo_materiali: 300 },
      { descrizione: "Fornitura e posa di gres", importo: 3000, incidenza: { frazione: 0.5 } },
    ], ip);
    expect(r.vociSoloFornitura).toBe(2);
    expect(r.ore).toBe(50);
    expect(r.fasi.map((f) => f.nome)).toEqual(["Allestimento cantiere", "Pavimenti e rivestimenti", "Pulizia e consegna"]);
  });
  it("una voce del capitolo «Pulizia e consegna» allunga la fase finale, non ne apre una seconda", () => {
    const r = calcolaCrono([ore("Tinteggiatura", 40), ore("Voce 12", 34, "Pulizia e consegna"), ore("Trasporti vari", 34, "Allestimento cantiere")], ip);
    expect(r.fasi.filter((f) => f.nome === "Pulizia e consegna")).toHaveLength(1);
    expect(r.fasi.filter((f) => f.nome === "Allestimento cantiere")).toHaveLength(1);
    expect(fase(r, "Pulizia e consegna").durata).toBe(3);
    expect(r.fasi.at(-1)?.nome).toBe("Pulizia e consegna");
    expect(r.ore).toBe(108);
  });
  it("«Demolizione» nel capitolo «Pulizia» resta una demolizione", () => {
    expect(calcolaCrono([ore("Demolizione tramezzi", 40, "Pulizia e consegna")], ip).fasi.map((f) => f.nome)).toContain("Demolizioni e rimozioni");
  });
  it("computo vuoto: nessuna fase", () => {
    expect(calcolaCrono([], ip)).toMatchObject({ fasi: [], giorni: 0 });
  });
  it("col ponteggio c'è lo smontaggio alla fine", () => {
    expect(calcolaCrono([ore("Ponteggio di facciata", 40)], ip).fasi.at(-1)?.nome).toContain("Smontaggio");
  });
});

describe("preparaCrono", () => {
  const db = (over: Record<string, unknown> = {}) => {
    const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "piano_cantiere_contesto") return { data: { provincia: "MI", costo_orario: 25, rese: [] }, error: null };
      if ("errore" in over) return { data: null, error: { message: "x" } };
      return { data: (args.p_testi as string[]).filter((t) => t !== "tinta extra").map((testo) => ({ testo, frazione: 0.5, min: 0.3, max: 0.7 })), error: null };
    });
    return { rpc };
  };
  const regione = (p: string | null) => (p === "MI" ? "Lombardia" : null);

  it("usa il costo orario dell'azienda e la regione", async () => {
    const d = db();
    const r = await preparaCrono(d, "c", [{ descrizione: "Tinteggiatura", importo: 1000 }], {}, regione);
    expect(r.ore).toBe(20);
    expect(d.rpc).toHaveBeenCalledWith("piano_cantiere_incidenze", expect.objectContaining({ p_regione: "Lombardia" }));
  });
  it("a gruppi di 10, e le voci oltre le 40 più grandi prendono la media della lavorazione", async () => {
    const d = db();
    const voci = Array.from({ length: 45 }, (_, i) => ({ descrizione: `Tinteggiatura ${i}`, importo: 1000 - i }));
    const r = await preparaCrono(d, "c", voci, {}, regione);
    expect(d.rpc.mock.calls.filter(([fn]) => fn === "piano_cantiere_incidenze")).toHaveLength(4);
    expect(r.vociSenzaDati).toBe(0);
    expect(r.vociStimate).toBe(45);
  });
  it("una voce che il prezzario non trova prende la media del computo, non un giorno solo", async () => {
    const r = await preparaCrono(db(), "c", [{ descrizione: "Tinteggiatura", importo: 1000 }, { descrizione: "Tinta extra", importo: 1000 }, { descrizione: "Posa extra serramenti", importo: 500 }].map((v) => v), {}, regione);
    expect(r.vociSenzaDati).toBe(0);
  });
  it("se il prezzario non risponde va avanti e dice cosa manca", async () => {
    const r = await preparaCrono(db({ errore: true }), "c", [{ descrizione: "Tinteggiatura", importo: 1000 }], {}, regione);
    expect(r.vociSenzaDati).toBe(1);
  });
});

describe("nel preventivo dei moduli", () => {
  const appartamento = [ore("Demolizioni", 60), ore("Tramezzi", 40), ore("Massetto", 60), ore("Intonaco", 90), ore("Posa gres", 40), ore("Tinteggiatura", 40)];
  it("la somma delle fasi è la durata vera, anche con le attese che corrono insieme al lavoro", () => {
    const r = calcolaCrono(appartamento, ip);
    const somma = fasiDaCalcolo(r.fasi).reduce((t, f) => t + Number.parseInt(f.durata!, 10), 0);
    expect(somma).toBe(r.giorni);
  });
  it("le settimane contano 5 giorni lavorativi: 30 giorni sono 6 settimane", () => {
    expect(durataComplessiva([{ fase: "A", durata: "30 giorni lavorativi", descrizione: null }])).toBe("circa 6 settimane");
    expect(durataComplessiva([{ fase: "A", durata: "30 giorni", descrizione: null }])).toBe("circa 4 settimane");
  });
  it("oltre 20 fasi accorpa le centrali e tiene la fase finale", () => {
    const tante = Array.from({ length: 25 }, (_, i) => ({ nome: `F${i}`, inizio: i + 1, durata: 1, nota: "", attesa: false }));
    const f = fasiDaCalcolo(tante);
    expect(f).toHaveLength(20);
    expect(f.at(-1)?.fase).toBe("F24");
    expect(f.at(-2)).toMatchObject({ fase: "Altre lavorazioni", durata: "6 giorni lavorativi" });
  });
  it("prende la forma che il PDF sa stampare", () => {
    expect(fasiDaCalcolo([{ nome: "Posa", inizio: 1, durata: 1, nota: "", attesa: false }, { nome: "Tinte", inizio: 2, durata: 3, nota: "Tempo tecnico di attesa.", attesa: true }])).toEqual([
      { fase: "Posa", durata: "1 giorno lavorativo", descrizione: null }, { fase: "Tinte", durata: "3 giorni lavorativi", descrizione: "Tempo tecnico di attesa." },
    ]);
  });
});
