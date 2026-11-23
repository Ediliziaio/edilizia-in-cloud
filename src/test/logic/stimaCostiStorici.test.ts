import { describe, expect, it } from "vitest";
import { analisiCostiSchema, analisiVuota, analizzaPreventivo, risorsaVuota, type PianoTrasferta, type VoceAnalisi } from "@/lib/preventivi/analisiCosti";
import { aggiornaTrasferta, confrontaStorico, stimaLavorazione, stimaTrasferta, verificaStimeDaiConsuntivi, type RiferimentoStorico } from "@/lib/preventivi/stimaCostiStorici";
import { copiaComposizioneCosti, motivoVoceDaCompletare, proponiCostiDaiConsuntivi, risorseReplicabili } from "@/lib/preventivi/proposteAnalisiCosti";

const voce: VoceAnalisi = {
  id: "preventivo", codice: "SERR-01", descrizione: "Fornitura e posa di serramenti",
  fase: "Infissi", quantita: 10, unita: "pz", prezzo: 400, vendita: 4000, costoUnitario: null, inclusa: true,
};
function storico(i: number, dati: Partial<RiferimentoStorico> = {}): RiferimentoStorico {
  return {
    id: `00000000-0000-4000-8000-${i.toString().padStart(12, "0")}`,
    commessaId: `11111111-0000-4000-8000-${i.toString().padStart(12, "0")}`,
    numero: `COMM-${i}`, codice: "SERR-01", descrizione: "Fornitura e posa di serramenti",
    tipoLavoro: "Serramenti", unita: "cad", quantita: 10, completataIl: "2026-01-10T08:00:00Z",
    stessoCodice: true, ore: 20, kmAndata: 10, kmRimborsati: 20, tariffaKm: 0.52, vendutoUnitario: 380,
    costi: { acquisti: 1600, operai: 600, ditte: 500, mezzi: 120, altri: 30, trasporti: 348 },
    ...dati,
  };
}
const piano: PianoTrasferta = {
  metodo: "km", distanza: "22,5", viaggi: "4", veicoli: "2", tariffaKm: "0,60",
  consegne: "95", minuti: "30", persone: "2", tariffaOra: "31",
};

describe("stima da consuntivi", () => {
  it("verifica costo e ore con soli lavori precedenti e confronta i costi in euro", () => {
    const precedente = storico(1);
    const secondo = storico(2, { completataIl: "2026-02-10T08:00:00Z" });
    const terzo = storico(3, { completataIl: "2026-03-10T08:00:00Z", ore: 25,
      costi: { ...precedente.costi, acquisti: precedente.costi.acquisti + 150, trasporti: 2000 } });
    const verifica = verificaStimeDaiConsuntivi([terzo, precedente, secondo]);
    expect(verifica).toEqual({ costo: 0.05, ore: 0.2, casiCosto: 1, casiOre: 1 });
    expect(verificaStimeDaiConsuntivi([precedente, terzo])).toMatchObject({ casiCosto: 0, casiOre: 0 });
  });

  it("confronta la stessa unità e lo stesso perimetro su commesse distinte, escludendo dati successivi alla data di stima", () => {
    const prima = storico(1);
    const seconda = storico(2, { quantita: 8 });
    const campione = confrontaStorico(voce, [
      prima, seconda, { ...prima, id: storico(3).id },
      storico(4, { unita: "mq" }), storico(5, { unita: "" }), storico(6, { quantita: 30 }),
      storico(7, { descrizione: "Posa serramenti" }), storico(8, { tipoLavoro: "Ristrutturazione" }),
      storico(9, { completataIl: "2026-12-01T10:00:00Z" }),
      storico(10, { descrizione: "Fornitura e posa 20 serramenti" }),
    ], { esecuzione: "mista", tipoLavoro: "serramenti", al: "2026-10-01T00:00:00Z" });
    expect(campione.map(r => r.numero)).toEqual(["COMM-1", "COMM-2"]);
    expect(confrontaStorico({ ...voce, unita: "%" }, [prima])).toEqual([]);
  });

  it("richiede una scelta esplicita per descrizioni simili e tiene separati interni, ditte, misti", () => {
    const simile = storico(1, { stessoCodice: false, descrizione: "Fornitura e posa di serramenti esterni" });
    const misto = storico(2);
    const interno = storico(3, { costi: { ...misto.costi, ditte: 0 } });
    expect(confrontaStorico(voce, [simile])).toEqual([]);
    expect(confrontaStorico(voce, [simile], { simili: true })[0]?.motivo).toBe("Descrizione simile");
    expect(confrontaStorico(voce, [misto, interno], { esecuzione: "interna" }).map(r => r.numero)).toEqual(["COMM-3"]);
  });

  it("calcola ore previste e costi al netto dei trasporti storici e accetta tariffe attuali", () => {
    const primo = storico(1);
    const secondo = storico(2, {
      quantita: 20, ore: 40, vendutoUnitario: 400,
      costi: { acquisti: 3200, operai: 1200, ditte: 1000, mezzi: 240, altri: 60, trasporti: 780 },
    });
    const campione = confrontaStorico(voce, [primo, secondo]);
    expect(stimaLavorazione(campione, 10, "pz")).toMatchObject({
      costo: 285000, ore: 20, minimo: 285000, massimo: 285000, vendutoStorico: 3900, tariffaKmStorica: 0.52,
    });
    const stima = stimaLavorazione(campione, 10, "pz", { costoOra: 31, offertaDitta: 550 });
    expect(stima?.costo).toBe(292000);
    expect(stima?.risorse.find(r => r.tipo === "subappalto")).toMatchObject({ base: "totale", prezzo: "550" });
    expect(stima?.risorse.find(r => r.tipo === "manodopera")).toMatchObject({ quantita: "2", prezzo: "31", base: "unitaria" });
    expect(stimaLavorazione(campione, 10, "pz", { costoOra: 0 })?.risorse.find(r => r.tipo === "manodopera")).toMatchObject({ prezzo: "0" });
  });

  it("usa le stesse ore pianificate per il costo della manodopera e la fascia di previsione", () => {
    const stima = stimaLavorazione(confrontaStorico(voce, [storico(1)]), 10, "pz", { oreTotali: 36, costoOra: 31 });
    expect(stima).toMatchObject({ ore: 36, costo: 336600, minimo: 336600, massimo: 336600 });
    expect(stima?.risorse.find(r => r.tipo === "manodopera")).toMatchObject({ quantita: "3.6", prezzo: "31", base: "unitaria" });
  });
});

describe("proposte per più lavorazioni", () => {
  it("genera costi documentati da un consuntivo valido senza usare trasporti, unità o perimetri diversi", () => {
    const compatibile = storico(1);
    const proposta = proponiCostiDaiConsuntivi(voce, [
      storico(2, { unita: "mq" }), storico(3, { descrizione: "Posa di serramenti" }), compatibile,
    ]);
    expect(proposta).toMatchObject({ fonti: ["COMM-1"], esito: "Un solo consuntivo · da verificare" });
    expect(proposta.risorse.some(r => r.tipo === "logistica")).toBe(false);
    expect(proposta.risorse.every(r => r.stima?.riferimenti?.[0] === compatibile.commessaId)).toBe(true);
    expect(proponiCostiDaiConsuntivi(voce, []).risorse).toEqual([]);
  });

  it("copia quantità per unità, conserva i costi già compilati e lascia a parte costi fissi e trasferte", () => {
    const materiali = { ...risorsaVuota("materiale"), nome: "Vetro", base: "unitaria" as const, prezzo: "10" };
    const nolo = { ...risorsaVuota("nolo"), nome: "Noleggio condiviso", prezzo: "250" };
    const trasferta = { ...risorsaVuota("logistica"), nome: "Trasferta condivisa", base: "unitaria" as const, prezzo: "15" };
    const analisi = { ...analisiVuota(), voci: { [voce.id]: [materiali, nolo, trasferta] }, generali: [nolo] };
    const nuova = { ...voce, id: "nuova", quantita: 15, unita: "cad" };
    expect(motivoVoceDaCompletare(analisi, voce)).toBe("Costo già presente");
    expect(motivoVoceDaCompletare(analisi, { ...nuova, costoUnitario: 0 })).toBe("Costo già presente");
    const composizione = risorseReplicabili(analisi, voce);
    expect(composizione).toEqual([materiali]);
    const copia = copiaComposizioneCosti(voce, nuova, composizione);
    expect(copia.risorse).toHaveLength(1);
    expect(copia.risorse[0].id).not.toBe(materiali.id);
    expect(copia.risorse[0].fonte).toContain(voce.descrizione);
    expect(analizzaPreventivo({ ...analisi, voci: { ...analisi.voci, nuova: copia.risorse } }, [voce, nuova], 8000).righe[1].costo).toBe(15000);
    expect(copiaComposizioneCosti(voce, { ...nuova, unita: "m²" }, composizione).risorse).toEqual([]);
    expect(analisi.generali).toEqual([nolo]);
  });
});

describe("trasferta condivisa", () => {
  it("usa andata e ritorno, veicoli e viaggi, più tempo pagato e consegne", () => {
    const stima = stimaTrasferta(piano);
    expect(stima?.righe.map(r => [r.nome, r.quantita])).toEqual([
      ["Trasferta sede–cantiere", "360"], ["Tempo di trasferta degli operai", "8"], ["Consegne e altri trasporti", "1"],
    ]);
    expect(stima?.costo).toBe(55900);
    expect(stimaTrasferta({ ...piano, distanza: "" })).toBeNull();
    expect(stimaTrasferta({ ...piano, viaggi: "3,5" })).toBeNull();
    expect(stimaTrasferta({ ...piano, persone: "" })).toBeNull();
    expect(stimaTrasferta({ ...piano, metodo: "forfait", consegne: "0" })?.costo).toBe(0);
  });

  it("salva il piano e lo sostituisce una volta sola conservando trasporti aggiunti a mano", () => {
    const manuale = { ...risorsaVuota("logistica"), nome: "Movimentazione manuale", prezzo: "100" };
    const prima = aggiornaTrasferta([manuale], piano);
    const seconda = aggiornaTrasferta(prima, { ...piano, distanza: "25" });
    const analisi = analisiCostiSchema.parse({ ...analisiVuota(), generali: seconda });
    expect(analisi.generali).toHaveLength(4);
    expect(analisi.generali[0]).toEqual(manuale);
    expect(analisi.generali[1].stima?.piano?.distanza).toBe("25");
    expect(analizzaPreventivo(analisi, [voce, { ...voce, id: "seconda" }], 8000).comuni).toBe(68300);
    expect(aggiornaTrasferta(seconda, { ...piano, metodo: "comuni" })).toEqual(seconda);
    expect(aggiornaTrasferta(seconda, { ...piano, metodo: "compresi" })).toEqual([manuale]);
  });
});
