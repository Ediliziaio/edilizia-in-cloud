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
    const b = { ...base(), pianoPagamenti: { rate: pianiPredefiniti(20)[0].rate().map((r, k) => k === 2 ? { ...r, percentuale: "20" } : r) } };
    expect(analizzaEconomia(b).errorePiano).toMatch(/90%/);
  });
  it("tutto a fine lavori su un cantiere di 20 giorni: l'impresa anticipa tutti i costi e Silvio consiglia l'acconto", () => {
    const b = { ...base(), cronoprogramma: { dataInizio: "", nota: "", fasi: [{ id: "1", nome: "Scavi", inizio: 1, durata: 5, nota: "" }, { id: "2", nome: "Manto", inizio: 6, durata: 15, nota: "" }] },
      pianoPagamenti: { rate: pianiPredefiniti(20)[3].rate() } };
    const a = analizzaEconomia(b);
    expect(a.esposizioneMassima).toBeCloseTo(-2566.67, 1); // il giorno 19: il saldo entra il giorno 20
    expect(a.accontoConsigliato).toBe(65);
    expect(a.rischi.some(r => r.livello === "alto" && /Anticipi/.test(r.testo))).toBe(true);
  });
  it("con l'acconto alla firma la cassa parte in positivo", () => {
    const b = { ...base(), cronoprogramma: { dataInizio: "", nota: "", fasi: [{ id: "1", nome: "Scavi", inizio: 1, durata: 20, nota: "" }] }, pianoPagamenti: { rate: pianiPredefiniti(20)[0].rate() } };
    expect(analizzaEconomia(b).cassa![0].saldo).toBe(1200);
  });
  it("i giorni di pagamento spostano l'incasso", () => {
    const [acconto] = pianiPredefiniti(20)[0].rate();
    expect(giornoIncasso({ ...acconto, giorniPagamento: 30 }, 20)).toBe(21);
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
