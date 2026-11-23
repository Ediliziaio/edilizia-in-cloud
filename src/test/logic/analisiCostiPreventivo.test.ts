import { describe, expect, it } from "vitest";
import { analizzaPreventivo, analisiVuota, budgetAnalisi, centesimiCosto, prezzoDaCosto, quoteCostiComuni, risorsaVuota, soldi, type VoceAnalisi } from "@/lib/preventivi/analisiCosti";
import { cercaPrezzoAnalisi, simulaPrezzoConCostiComuni } from "@/lib/preventivi/analisiCostiEditor";

const riga = (id: string, vendita: number, quantita = 1, inclusa = true): VoceAnalisi => ({
  id, descrizione: id, fase: "Copertura", quantita, unita: "pz", prezzo: vendita / quantita, vendita,
  costoUnitario: null, inclusa,
});

describe("Analisi dei costi del preventivo", () => {
  it("distingue margine, ricarico e ricavo dopo sconto", () => {
    expect(prezzoDaCosto(800, 25, "ricarico")).toBe(1000);
    expect(prezzoDaCosto(800, 25, "margine")).toBe(1066.67);
    expect(prezzoDaCosto(8_000, 20, "margine")).toBe(10_000);
    expect(prezzoDaCosto(8_000, 20, "ricarico")).toBe(9_600);
    expect(prezzoDaCosto(1_330.55, 50, "ricarico")).toBe(1_995.83);
    expect(prezzoDaCosto(8_000, 100, "margine")).toBeNull();
    const analisi = analisiVuota();
    analisi.voci.a = [{ ...risorsaVuota(), nome: "Manodopera", prezzo: "8000" }];
    expect(analizzaPreventivo(analisi, [riga("a", 9500)], 9500)).toMatchObject({
      costo: 800_000, margine: 150_000, percentuale: expect.closeTo(15.79, 2),
    });
  });

  it("ricalcola il materiale per unità, mantiene il trasporto a corpo e attribuisce i costi comuni una sola volta", () => {
    const analisi = analisiVuota();
    analisi.voci.a = [
      { ...risorsaVuota(), nome: "Materiali", prezzo: "152", base: "unitaria" },
      { ...risorsaVuota("manodopera"), nome: "Posatori", prezzo: "30", quantita: "8", fattore: "2" },
      { ...risorsaVuota("logistica"), nome: "Trasporto", prezzo: "180" },
    ];
    analisi.voci.b = [{ ...risorsaVuota(), nome: "Alternativa", prezzo: "4200" }];
    analisi.fasi.Copertura = [{ ...risorsaVuota("nolo"), nome: "Noleggio", prezzo: "150" }];
    analisi.generali = [{ ...risorsaVuota("spese"), nome: "Spese generali", prezzo: "10", base: "percentuale" }];
    const dieci = analizzaPreventivo(analisi, [riga("a", 3203.8, 10), riga("b", 5100, 1, false)], 3203.8);
    const quindici = analizzaPreventivo(analisi, [riga("a", 3203.8, 15), riga("b", 5100, 1, false)], 3203.8);
    expect(dieci).toMatchObject({ costo: 256_300, comuni: 38_300, incompleto: false });
    expect(quindici.costo).toBe(339_900);
    expect(budgetAnalisi(dieci)).toEqual({ a: 256.3 });
    expect(cercaPrezzoAnalisi(3203.75, prezzo => prezzo * 10, 2)).toBe(320.38);
  });

  it("distingue un costo mancante dallo zero esplicito e mostra le vendite in perdita", () => {
    const analisi = analisiVuota();
    analisi.voci.a = [{ ...risorsaVuota(), nome: "Tariffa da verificare" }];
    expect(analizzaPreventivo(analisi, [riga("a", 50)], 50).incompleto).toBe(true);
    analisi.voci.a[0].prezzo = "0";
    expect(analizzaPreventivo(analisi, [riga("a", 50)], 50).incompleto).toBe(false);
    analisi.voci.a[0].prezzo = "75";
    expect(analizzaPreventivo(analisi, [riga("a", 50)], 50)).toMatchObject({ margine: -2500, percentuale: -50 });
  });

  it("ricalcola le quote comuni sul netto dopo sconto e raggiunge l’obiettivo al centesimo", () => {
    const analisi = analisiVuota();
    analisi.voci.a = [{ ...risorsaVuota(), nome: "Costo voce A", prezzo: "800" }];
    analisi.voci.b = [{ ...risorsaVuota(), nome: "Costo voce B", prezzo: "600" }];
    analisi.fasi.Copertura = [{ ...risorsaVuota("nolo"), nome: "Ponteggio", prezzo: "120" }];
    analisi.generali = [{ ...risorsaVuota("logistica"), nome: "Trasporto", prezzo: "200" }];
    const altre = [riga("b", 1000), riga("opzione", 1500, 1, false)];
    const calcolo = analizzaPreventivo(analisi, [riga("a", 1000), ...altre], 2000);
    const iniziali = quoteCostiComuni(calcolo);
    expect(iniziali.get("a")).toMatchObject({ fase: 6000, preventivo: 10000 });
    expect(iniziali.has("opzione")).toBe(false);

    const proietta = (prezzo: number) => {
      const vendita = soldi(centesimiCosto(prezzo * 0.9));
      return { imponibile: vendita + 1000, voci: [{ ...riga("a", vendita), venditaLorda: prezzo }, ...altre] };
    };
    const esito = simulaPrezzoConCostiComuni(calcolo, "a", 20, "margine", proietta, 2);
    expect(esito).not.toBeNull();
    expect(esito!.netto).toBeGreaterThan(1200);
    expect(esito!.netto).toBeGreaterThanOrEqual(esito!.obiettivo);
    expect(esito!.quota!.fase).toBeGreaterThan(6000);
    expect(esito!.quota!.preventivo).toBeGreaterThan(10000);
    const quote = [...quoteCostiComuni(calcolo, proietta(esito!.prezzo).voci).values()];
    expect(quote.reduce((s, q) => s + q.fase + q.preventivo, 0)).toBe(calcolo.comuni);
    const precedente = proietta(soldi(centesimiCosto(esito!.prezzo) - 1));
    const quotaPrecedente = quoteCostiComuni(calcolo, precedente.voci).get("a")!;
    expect(precedente.voci[0].vendita).toBeLessThan(prezzoDaCosto(800 + soldi(quotaPrecedente.fase + quotaPrecedente.preventivo), 20, "margine")!);
  });

  it("segnala una quota percentuale parziale per una voce venduta e lascia autonoma l’opzione", () => {
    const analisi = analisiVuota();
    analisi.voci.a = [{ ...risorsaVuota(), nome: "Posa", prezzo: "80" }];
    analisi.voci.opzione = [{ ...risorsaVuota(), nome: "Alternativa", prezzo: "75" }];
    analisi.generali = [{ ...risorsaVuota("spese"), nome: "Spese generali", base: "percentuale", prezzo: "10" }];
    const voci = [riga("a", 100), riga("b", 100), riga("opzione", 100, 1, false)];
    const calcolo = analizzaPreventivo(analisi, voci, 200);
    const proietta = (prezzo: number) => ({ imponibile: 200, voci: [voci[0], voci[1], riga("opzione", prezzo, 1, false)] });
    expect(quoteCostiComuni(calcolo).get("a")?.parziale).toBe(true);
    expect(simulaPrezzoConCostiComuni(calcolo, "a", 20, "margine", proietta, 2)).toBeNull();
    expect(simulaPrezzoConCostiComuni(calcolo, "opzione", 20, "margine", proietta, 2)).toMatchObject({ prezzo: 93.75, costo: 7500, imponibile: 200 });
  });
});
