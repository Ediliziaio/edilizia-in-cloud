import { describe, expect, it } from "vitest";
import { vincoliDalTestoUtente } from "@/lib/silvio-commessa/vincoliTesto";
import { applica, fondi, pianoVuoto } from "../../../shared/silvio-commessa/fondi.ts";
import { frammentoDaRispostaAI } from "../../../shared/silvio-commessa/letturaAI.ts";
import { scritturaDalPiano } from "@/lib/silvio-commessa/scrittura";

describe("Le scadenze esplicite delle rate arrivano alla scrittura", () => {
  it("l'indirizzo citato come cantiere non viene copiato nell'anagrafica cliente", () => {
    const fr = frammentoDaRispostaAI({ aree: { cliente: { "cliente.client_address": {
      valore: "Via della Simulazione 31, Milano", citazione: "Cantiere: Via della Simulazione 31, Milano", fiducia: 0.9,
    } }, cantiere: { "cantiere.indirizzo": { valore: "Via della Simulazione 31, Milano", citazione: "Cantiere: Via della Simulazione 31, Milano" } } } },
    { fonte: { tipo: "documento", etichetta: "Foto.heic" }, immagine: true });
    expect(fr.aree.cliente?.["cliente.client_address"]).toBeUndefined();
    expect(fr.aree.cantiere?.["cantiere.indirizzo"]).toBeDefined();
  });
  it("la sede del committente esplicitamente uguale al cantiere resta valida", () => {
    const testo = "Residenza del committente e cantiere: Via della Simulazione 31, Milano";
    const fr = frammentoDaRispostaAI({ aree: { cliente: { "cliente.client_address": { valore: "Via della Simulazione 31, Milano", citazione: testo } } } },
      { fonte: { tipo: "contratto", etichetta: "Prova.pdf" }, testo });
    expect(fr.aree.cliente?.["cliente.client_address"]?.valore).toBe("Via della Simulazione 31, Milano");
  });
  it("se il documento distingue azienda e referente cerca l'azienda committente", () => {
    const piano = fondi(pianoVuoto("azienda"), { fonte: { tipo: "contratto", etichetta: "Contratto" }, aree: {
      cliente: { "cliente.nome": { valore: { client_name: "Mario Referente", client_company: "Collaudo Costruzioni S.r.l." }, stato: "fatto", fiducia: 1 } },
    } });
    expect(scritturaDalPiano(piano).cliente.nome).toBe("Collaudo Costruzioni S.r.l.");
  });
  it("un acconto non viene duplicato come SAL, anche se il modello lo propone", () => {
    const fr = frammentoDaRispostaAI({ aree: { sal_scadenze: { "sal_scadenze.sal": {
      valore: { cadenza: "alla firma", importo_minimo_eur: 3300 }, citazione: "Acconto alla firma: 3.300 euro", fiducia: 0.9,
    } } } }, { fonte: { tipo: "contratto", etichetta: "Prova.pdf" }, testo: "Acconto alla firma: 3.300 euro. Saldo alla fine lavori." });
    expect(fr.aree.sal_scadenze?.["sal_scadenze.sal"]).toBeUndefined();
    expect(fr.avvisi?.join(" ")).toContain("acconto e saldo restano nelle rate");
  });
  const testo = "Acconto 3.300 euro alla firma il 12/11/2026; saldo 7.700 euro il 20/11/2026.";
  const leggi = (data = "2026-11-12") => frammentoDaRispostaAI({ aree: { pagamenti: { "pagamenti.rate": {
    valore: [{ label: "Acconto", type: "deposit", amount: 3300, expected_date: data, trigger_evento: "firma_contratto" },
      { label: "Saldo", type: "balance", amount: 7700, expected_date: "2026-11-20", trigger_evento: "fine_lavori" }],
    citazione: testo, dove: "testo", fiducia: 0.95,
  } } } }, { fonte: { tipo: "testo", etichetta: "Prova" }, testo });
  it("da una foto conserva le date come proposta da verificare visivamente", () => {
    const fr = frammentoDaRispostaAI({ aree: { pagamenti: { "pagamenti.rate": { valore: [
      { label: "Acconto", amount: 1100, expected_date: "2026-12-01", trigger_evento: "firma_contratto" },
      { label: "Saldo", type: "balance", amount: 1100, expected_date: "2026-12-03" },
    ], citazione: "Acconto 1.100 euro il 01/12/2026", fiducia: 0.9 } } } }, { fonte: { tipo: "documento", etichetta: "Foto.heic" }, testo: null });
    const rate = fr.aree.pagamenti?.["pagamenti.rate"];
    expect(rate).toMatchObject({ stato: "proposta", valore: [{ expected_date: "2026-12-01" }, { expected_date: "2026-12-03" }] });
    expect(scritturaDalPiano(fondi(pianoVuoto("azienda"), fr)).rate).toEqual([]);
  });
  it("le date esplicite hanno precedenza sugli eventi che il database ridaterebbe", () => {
    const piano = fondi(pianoVuoto("azienda"), leggi());
    const s = scritturaDalPiano(piano);
    expect(s.rate).toMatchObject([{ expected_date: "2026-11-12", trigger_evento: "data_fissa", amount: 3300 },
      { expected_date: "2026-11-20", trigger_evento: "data_fissa", amount: 7700 }]);
  });
  it.each(["2026-02-30", "2026-12-01", "domani"])("non salva la data inventata o non valida %s", (data) => {
    const p = fondi(pianoVuoto("azienda"), leggi(data));
    expect(scritturaDalPiano(p).rate[0]).not.toHaveProperty("expected_date");
    expect(scritturaDalPiano(p).rate[0].trigger_evento).toBe("firma_contratto");
    expect(scritturaDalPiano(p).rate[1].expected_date).toBe("2026-11-20");
  });
});

describe("I divieti espliciti della persona restano nella bozza", () => {
  it("riconosce persone, ditte e ordini vietati nel primo messaggio", () => {
    const modifiche = vincoliDalTestoUtente("Non assegnare personale o ditte, non creare ordini di acquisto.");
    expect(modifiche.map((m) => "chiave" in m ? m.chiave : "")).toEqual([
      "persone.squadra", "persone.capomastro", "ditte.assegnate", "ditte.contratti", "materiali.acquisti",
    ]);
    let piano = pianoVuoto("azienda");
    for (const m of modifiche) piano = applica(piano, m).piano;
    expect(piano.aree.persone?.["persone.squadra"]).toMatchObject({ fonte: { tipo: "persona" }, valore: null });
    expect(scritturaDalPiano(piano).squadra).toEqual([]);
  });
  it.each(["Assegna personale e ditte", "Non so il prezzo, proponi la squadra", "Non creare confusione, proponi ditte", "Non assegnare il codice ordine"])("non trasforma una frase diversa in un divieto: %s", (testo) => {
    expect(vincoliDalTestoUtente(testo)).toEqual([]);
  });
});
