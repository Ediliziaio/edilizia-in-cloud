import { describe, expect, it } from "vitest";
import { vincoliDalTestoUtente } from "@/lib/silvio-commessa/vincoliTesto";
import { applica, fondi, pianoVuoto } from "../../../shared/silvio-commessa/fondi.ts";
import { frammentoDaRispostaAI } from "../../../shared/silvio-commessa/letturaAI.ts";
import { scritturaDalPiano } from "@/lib/silvio-commessa/scrittura";

describe("Le scadenze esplicite delle rate arrivano alla scrittura", () => {
  const testo = "Acconto 3.300 euro alla firma il 12/11/2026; saldo 7.700 euro il 20/11/2026.";
  const leggi = (data = "2026-11-12") => frammentoDaRispostaAI({ aree: { pagamenti: { "pagamenti.rate": {
    valore: [{ label: "Acconto", type: "deposit", amount: 3300, expected_date: data, trigger_evento: "firma_contratto" },
      { label: "Saldo", type: "balance", amount: 7700, expected_date: "2026-11-20", trigger_evento: "fine_lavori" }],
    citazione: testo, dove: "testo", fiducia: 0.95,
  } } } }, { fonte: { tipo: "testo", etichetta: "Prova" }, testo });
  it("mantiene data ed evento, senza perdere le scadenze nel JSON per la RPC", () => {
    const piano = fondi(pianoVuoto("azienda"), leggi());
    const s = scritturaDalPiano(piano);
    expect(s.rate).toMatchObject([{ expected_date: "2026-11-12", trigger_evento: "firma_contratto", amount: 3300 },
      { expected_date: "2026-11-20", trigger_evento: "fine_lavori", amount: 7700 }]);
  });
  it.each(["2026-02-30", "2026-12-01", "domani"])("non salva la data inventata o non valida %s", (data) => {
    const p = fondi(pianoVuoto("azienda"), leggi(data));
    expect(scritturaDalPiano(p).rate[0]).not.toHaveProperty("expected_date");
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
