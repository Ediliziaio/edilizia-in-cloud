import { describe, expect, it } from "vitest";
import { bozzaVuota, voceVuota } from "@/lib/computo/editorNativo";
import { analizzaEconomia, giornoIncasso, pianiPredefiniti } from "@/lib/computo/economiaComputo";
import { calcolaSconto } from "@/lib/computo/scontoComputo";
import { generaComputoPdf } from "@/lib/computo/esportaComputo";
import { vociDaBozza } from "@/lib/computo/editorNativo";

/**
 * Il passo «Economia» del preventivo con computo (29/10/2026): sconto prima
 * dell'IVA, piano dei pagamenti con SAL, margini sul costo stimato e flusso
 * di cassa sul cronoprogramma.
 */
const senzaRitenuta = { percentuale: "", su: "sal" as const, svincolo: "collaudo" as const, mesi: 12 };
const voce = (capitolo: string, quantita: string, prezzo: string, costo = "") => ({ ...voceVuota(), capitolo, descrizione: capitolo, unita: "mq", quantita, prezzo, costo });
const base = () => ({ ...bozzaVuota(), titolo: "Campo", voci: [voce("Scavi", "100", "10", "7"), voce("Manto", "100", "30", "20")] });

describe("sconto", () => {
  it("in percentuale e in euro, mai oltre il totale", () => {
    expect(calcolaSconto(4000, { tipo: "percentuale", valore: "5", descrizione: "" }).importo).toBe(200);
    expect(calcolaSconto(4000, { tipo: "importo", valore: "500", descrizione: "" })).toMatchObject({ importo: 500, percentuale: 12.5 });
    expect(calcolaSconto(4000, { tipo: "importo", valore: "5000", descrizione: "" }).errore).toMatch(/supera/);
    expect(calcolaSconto(4000, { tipo: "percentuale", valore: "abc", descrizione: "" }).errore).toMatch(/numero/);
  });
  it("gli oneri della sicurezza non si scontano", () => {
    expect(calcolaSconto(4000, { tipo: "percentuale", valore: "10", descrizione: "" }, 1000).importo).toBe(300);
    expect(calcolaSconto(4000, { tipo: "importo", valore: "3500", descrizione: "" }, 1000).errore).toMatch(/soggetti a ribasso/);
    const b = { ...base(), sconto: { tipo: "percentuale" as const, valore: "10", descrizione: "" }, voci: [...base().voci, { ...voce("Sicurezza", "1", "500"), sicurezza: true }] };
    expect(analizzaEconomia(b).sconto).toBe(400); // il 10% di 4.000, non di 4.500
  });
});

describe("margini", () => {
  it("sul netto dello sconto, per capitolo, con le voci senza costo segnalate", () => {
    const b = { ...base(), sconto: { tipo: "percentuale" as const, valore: "10", descrizione: "" }, voci: [...base().voci, voce("Extra", "1", "100")] };
    const a = analizzaEconomia(b);
    expect(a.totaleLavori).toBe(4100); expect(a.netto).toBe(3690); expect(a.costo).toBe(2700);
    expect(a.margine).toBe(990); expect(a.vociSenzaCosto).toBe(1);
    expect(a.perCapitolo.get("Manto")).toMatchObject({ costo: 2000, ricavo: 3000 });
    expect(a.rischi.map(r => r.testo).join(" ")).toMatch(/senza costo stimato/);
  });
});

describe("piano dei pagamenti e cassa", () => {
  it("le rate devono fare 100%", () => {
    const b = { ...base(), pianoPagamenti: { rate: pianiPredefiniti(20)[0].rate().map((r, k) => k === 2 ? { ...r, percentuale: "20" } : r), ritenuta: senzaRitenuta } };
    expect(analizzaEconomia(b).errorePiano).toMatch(/90%/);
  });
  it("tutto a fine lavori su un cantiere di 20 giorni: l'impresa anticipa tutti i costi e Silvio consiglia l'acconto", () => {
    const b = { ...base(), cronoprogramma: { dataInizio: "", nota: "", fasi: [{ id: "1", nome: "Scavi", inizio: 1, durata: 5, nota: "" }, { id: "2", nome: "Manto", inizio: 6, durata: 15, nota: "" }] },
      pianoPagamenti: { rate: pianiPredefiniti(20)[3].rate(), ritenuta: senzaRitenuta } };
    const a = analizzaEconomia(b);
    expect(a.esposizioneMassima).toBeCloseTo(-2566.67, 1); // il giorno 19: il saldo entra il giorno 20
    expect(a.accontoConsigliato).toBe(65);
    expect(a.rischi.some(r => r.livello === "alto" && /Anticipi/.test(r.testo))).toBe(true);
  });
  it("con l'acconto alla firma la cassa parte in positivo", () => {
    const b = { ...base(), cronoprogramma: { dataInizio: "", nota: "", fasi: [{ id: "1", nome: "Scavi", inizio: 1, durata: 20, nota: "" }] }, pianoPagamenti: { rate: pianiPredefiniti(20)[0].rate(), ritenuta: senzaRitenuta } };
    expect(analizzaEconomia(b).cassa![0].saldo).toBe(1200);
  });
  it("i termini di pagamento spostano l'incasso, e i momenti nuovi sanno dove cadono", () => {
    const [acconto, mezzo] = pianiPredefiniti(20)[0].rate();
    expect(giornoIncasso({ ...acconto, termineGiorni: 30 }, 20)).toBe(21);
    // «Al 50% dei lavori» su un cantiere di 20 giorni: il giorno 10, senza che nessuno lo scriva a mano.
    expect(giornoIncasso(mezzo, 20)).toBe(10);
    const fasi = [{ nome: "Strutture", inizio: 1, durata: 8 }, { nome: "Finiture", inizio: 9, durata: 12 }];
    expect(giornoIncasso({ ...acconto, evento: "fase_completata", fasi: ["Strutture"] }, 20, fasi)).toBe(8);
  });
  it("le rate si leggono sul totale IVA inclusa, e senza IVA decisa restano le percentuali", () => {
    const conIva = { ...base(), ivaModalita: "applicata" as const, ivaAliquota: "10",
      pianoPagamenti: { rate: pianiPredefiniti(20)[0].rate(), ritenuta: senzaRitenuta } };
    const a = analizzaEconomia(conIva);
    expect(a.totaleCliente).toBe(4400); // 4.000 di lavori + 10%
    expect(a.rate[0].importo).toBe(1320); // il 30% di quello che paga il cliente
    expect(a.rate[0].importoNetto).toBe(1200); // in cassa entra il netto
    const daDefinire = analizzaEconomia({ ...conIva, ivaModalita: "da-definire" as const });
    expect(daDefinire.totaleCliente).toBeNull();
    expect(daDefinire.rate[0].importo).toBeNull();
    expect(daDefinire.errorePiano).toBe("");
  });
  it("una rata a misura non ha percentuale e il piano non deve fare 100%", () => {
    const rate = pianiPredefiniti(20)[1].rate(); // acconto 20, due SAL a misura, saldo 20
    const b = { ...base(), pianoPagamenti: { rate, ritenuta: { ...senzaRitenuta, percentuale: "5" } } };
    const a = analizzaEconomia(b);
    expect(a.errorePiano).toBe("");
    expect(a.sommaPercentuali).toBe(40);
    expect(a.quotaAMisura).toBe(60);
    expect(a.rate[1].importo).toBeNull();
    // La previsione esiste (serve alla cassa e alla commessa), ma non è un importo del contratto.
    // Senza IVA decisa non c'è totale cliente, quindi nemmeno previsione.
    expect(a.rate[1].stima).toBeNull();
    expect(analizzaEconomia({ ...b, ivaModalita: "non-applicabile" as const }).rate[1].stima).toBe(1200); // il 60% di 4.000 sui due SAL
    // I SAL si spalmano sul cantiere invece di cadere tutti a metà lavori.
    expect(analizzaEconomia({ ...b, cronoprogramma: { dataInizio: "", nota: "", fasi: [{ id: "1", nome: "Scavi", inizio: 1, durata: 30, nota: "" }] } })
      .rate.map(r => r.giorno)).toEqual([0, 10, 20, 30]);
    // La ritenuta del 5% si trattiene sui SAL: il 60% di 4.000 euro di lavori.
    expect(a.ritenuta?.totale).toBe(120);
  });
  it("le rate fisse non possono superare il contratto", () => {
    const rate = [...pianiPredefiniti(20)[1].rate()];
    rate[0] = { ...rate[0], percentuale: "90" };
    const b = { ...base(), pianoPagamenti: { rate, ritenuta: senzaRitenuta } };
    expect(analizzaEconomia(b).errorePiano).toMatch(/non possono superare/);
  });
  it("il piano e lo sconto escono nel PDF", async () => {
    const b = base();
    const pdf = (await generaComputoPdf(vociDaBozza(b), { ...b, presentazione: "preventivo", stato: "", sconto: { tipo: "percentuale", valore: "5", descrizione: "Sconto commerciale" },
      ratePagamento: [{ descrizione: "Acconto", quando: "Alla firma del contratto", percentuale: 30, importo: 1140, termine: "" }] })).output();
    expect(pdf).toContain("Piano dei pagamenti");
    expect(pdf).toContain("Sconto commerciale 5%");
    expect(pdf).toContain("1.140,00");
  }, 30_000);
});
