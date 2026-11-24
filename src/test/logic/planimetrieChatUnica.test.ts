import { describe, expect, it } from "vitest";
import { aPlanimetria, piantaVuota } from "@/components/planimetrie/editor/adattatore";
import { comandiDaChatDisegno } from "@/components/planimetrie/editor/comandiChat";
import { anteprimaDaChatProgetto } from "@/lib/planimetrie/chatProgetto";
import { modificaIntervento } from "@/components/planimetrie/editor/interventiChat";
import { ambientiNominati, aggiornaRevisioneDisegno, annullaUltimoDisegno, eAnnullaUltimo, eseguiDisegnoSullaScheda, nomiAmbientiDelPiano, selezionePerDomanda, sembraDomanda, unisciAlDisegno } from "@/lib/planimetrie/chatUnicaPlanimetria";
import { PAVIMENTI_STANZA } from "../../../shared/planimetrie/finiture";
import { validaPlanimetria } from "../../../shared/planimetrie/modello";

function casa() {
  const esito = comandiDaChatDisegno(piantaVuota(), "fatto", "Soggiorno 5,00 x 4,00 m\nCucina 3,00 x 4,00 m a destra di Soggiorno");
  expect(esito.avvisi).toEqual([]);
  const documento = aPlanimetria(esito.passi.at(-1)!.pianta);
  const piano = documento.livelli[0];
  return { documento, piano, selezione: { livelloId: piano.id, ambito: "fatto", localeId: "" } };
}

describe("chat unica della scheda planimetria", () => {
  it("riconosce le domande e gli ambienti nominati", () => {
    for (const d of ["quanti metri quadri ha il bagno?", "Qual è la superficie della cucina", "si può aprire una porta?", "È conforme l'altezza"]) expect([d, sembraDomanda(d)]).toEqual([d, true]);
    for (const c of ["fammi una porticina da ottanta fra camera e corridoio", "Porta tra cucina e soggiorno da 80 cm", "allarga il bagno"]) expect([c, sembraDomanda(c)]).toEqual([c, false]);
    const { piano } = casa();
    expect(ambientiNominati(piano.fatto.locali, "quanto è grande la cucina?").map(l => l.nome)).toEqual(["Cucina"]);
  });

  it("senza una stanza scelta chiede a Silvio della stanza nominata, o di tutto il piano", () => {
    const { piano, selezione } = casa();
    const [soggiorno, cucina] = piano.fatto.locali;
    expect(selezionePerDomanda(selezione, piano.fatto.locali, "quanti metri quadri ha la cucina?")).toMatchObject({ localeId: cucina.id, altri: [] });
    expect(selezionePerDomanda(selezione, piano.fatto.locali, "quanti metri quadri in tutto?")).toMatchObject({ localeId: soggiorno.id, altri: [{ localeId: cucina.id }] });
    expect(selezionePerDomanda({ ...selezione, localeId: soggiorno.id }, piano.fatto.locali, "e la cucina?")).toMatchObject({ localeId: soggiorno.id, altri: [{ localeId: cucina.id }] });
  });

  it("un comando del disegno diventa una variante nuova, senza toccare lo stato di fatto", () => {
    const { documento, piano, selezione } = casa();
    const esito = eseguiDisegnoSullaScheda(documento, selezione, "Porta tra Cucina e Soggiorno da 80 cm");
    expect(esito.capito).toBe(true);
    expect(esito.avvisi).toEqual([expect.stringMatching(/sopralluogo/)]);
    const a = esito.anteprima!;
    expect(a.ambito).toBe("progetto:A");
    expect(a.disegno).toBe(true);
    expect(a.modifiche).toHaveLength(1);
    expect(a.evidenzaMuri).toHaveLength(1);
    const variante = a.documento.livelli[0].proposte.find(p => p.id === "A")!;
    expect(variante.aperture.filter(x => x.tipo === "porta")).toHaveLength(1);
    expect(a.documento.livelli[0].fatto).toEqual(piano.fatto);
    expect(documento.livelli[0].proposte).toEqual([]);
    expect(validaPlanimetria(a.documento)).toMatchObject({ ok: true });
    expect(nomiAmbientiDelPiano(documento, piano.id, "fatto")).toEqual(["Soggiorno", "Cucina"]);
  });

  it("i comandi successivi si sommano nella stessa variante", () => {
    const { documento, selezione } = casa();
    const prima = eseguiDisegnoSullaScheda(documento, selezione, "Porta tra Cucina e Soggiorno da 80 cm").anteprima!;
    const dopo = eseguiDisegnoSullaScheda(documento, selezione, "Finestra Cucina sul lato alto da 120 cm", prima).anteprima!;
    expect(dopo.ambito).toBe(prima.ambito);
    expect(dopo.documento.livelli[0].proposte).toHaveLength(1);
    expect(dopo.modifiche).toHaveLength(2);
    expect(dopo.documento.livelli[0].proposte[0].aperture.map(x => x.tipo).sort()).toEqual(["finestra", "porta"]);
  });

  it("una misura risponde senza anteprima, una frase sconosciuta non è capita", () => {
    const { documento, selezione } = casa();
    const misura = eseguiDisegnoSullaScheda(documento, selezione, "Misura Cucina");
    expect(misura).toMatchObject({ capito: true, anteprima: null });
    expect(misura.fatti.length).toBeGreaterThan(0);
    expect(eseguiDisegnoSullaScheda(documento, selezione, "fammi una porticina da ottanta fra camera e corridoio")).toMatchObject({ capito: false, anteprima: null });
  });

  it("Silvio sopra un'anteprima del disegno lascia una variante sola con tutte le modifiche", () => {
    const { documento, piano, selezione } = casa();
    const disegno = eseguiDisegnoSullaScheda(documento, selezione, "Porta tra Cucina e Soggiorno da 80 cm").anteprima!;
    const cucina = piano.fatto.locali[1];
    const sopra = { ...selezione, ambito: disegno.ambito, localeId: cucina.id };
    const silvio = anteprimaDaChatProgetto(disegno.documento, sopra, { testo: "Ecco", modifiche: [{ tipo: "pavimento", valore: PAVIMENTI_STANZA[0].id }] }, "parquet")!;
    expect(silvio.ambito).not.toBe(disegno.ambito);
    const unita = unisciAlDisegno(disegno, silvio);
    expect(unita.ambito).toBe(disegno.ambito);
    expect(unita.documento.livelli[0].proposte.map(p => [p.id, p.nome])).toEqual([["A", disegno.nomeVariante]]);
    const variante = unita.documento.livelli[0].proposte[0];
    expect(variante.aperture.some(x => x.tipo === "porta")).toBe(true);
    expect(variante.locali.find(l => l.id === cucina.id)?.finiture?.pavimento).toBe(PAVIMENTI_STANZA[0].descrizione);
    expect(unita.modifiche).toHaveLength(2);
  });

  it("ogni comando è un intervento: si toglie la spunta, si annulla l'ultimo", () => {
    const { documento, selezione } = casa();
    const prima = eseguiDisegnoSullaScheda(documento, selezione, "Porta tra Cucina e Soggiorno da 80 cm").anteprima!;
    const dopo = eseguiDisegnoSullaScheda(documento, selezione, "Finestra Cucina sul lato alto da 120 cm", prima).anteprima!;
    const rd = dopo.revisioneDisegno!;
    expect(rd.revisione.interventi.map(i => i.richiesta.frase)).toEqual(["Porta tra Cucina e Soggiorno da 80 cm", "Finestra Cucina sul lato alto da 120 cm"]);
    // Senza la porta resta la sola finestra, nella stessa variante.
    const contesto = { documento: rd.partenza, livelloId: rd.livelloId, propostaId: rd.id };
    const senzaPorta = aggiornaRevisioneDisegno(dopo, modificaIntervento(rd.revisione, "progetto", contesto, rd.revisione.interventi[0].richiesta.id, { selezionata: false }))!;
    expect(senzaPorta.documento.livelli[0].proposte[0].aperture.map(a => a.tipo)).toEqual(["finestra"]);
    expect(senzaPorta.modifiche).toHaveLength(1);
    // «Annulla l'ultimo» toglie la finestra; poi la porta; poi non resta niente.
    const unoMeno = annullaUltimoDisegno(dopo);
    expect(unoMeno.tolto).toBe("Finestra Cucina sul lato alto da 120 cm");
    expect(unoMeno.anteprima!.documento.livelli[0].proposte[0].aperture.map(a => a.tipo)).toEqual(["porta"]);
    expect(annullaUltimoDisegno(unoMeno.anteprima!).anteprima).toBeNull();
    for (const f of ["annulla", "Annulla l'ultimo", "togli l’ultimo comando.", "annulla ultima modifica"]) expect([f, eAnnullaUltimo(f)]).toEqual([f, true]);
    expect(eAnnullaUltimo("annulla la porta in cucina")).toBe(false);
  });

  it("i prezzi scritti a mano nel computo entrano nella variante", () => {
    const { documento, selezione } = casa();
    const a = eseguiDisegnoSullaScheda(documento, selezione, "Porta tra Cucina e Soggiorno da 80 cm").anteprima!;
    const rd = a.revisioneDisegno!;
    const conPrezzo = aggiornaRevisioneDisegno(a, { ...rd.revisione, prezzi: { "voce-di-prova": { importo: 10, unita: "cad", fonte: "Prezzo inserito", tariffa: "" } } })!;
    expect(conPrezzo.revisioneDisegno!.revisione.prezzi).toBeDefined();
    expect(conPrezzo.ambito).toBe(a.ambito);
  });

  it("«Tutto il piano» lascia il comando senza stanza scelta, come nell'editor senza selezione", () => {
    const { documento, piano, selezione } = casa();
    const [soggiorno, cucina] = piano.fatto.locali;
    const gruppo = { ...selezione, localeId: soggiorno.id, altri: [{ livelloId: piano.id, localeId: cucina.id }] };
    const esito = eseguiDisegnoSullaScheda(documento, gruppo, "Arreda tutte le stanze");
    expect(esito.anteprima?.revisioneDisegno?.revisione.interventi[0].richiesta.riferimento).toBeNull();
    const sola = eseguiDisegnoSullaScheda(documento, { ...selezione, localeId: cucina.id }, "Arreda Cucina");
    expect(sola.anteprima?.revisioneDisegno?.revisione.interventi[0].richiesta.riferimento).toEqual({ tipo: "locale", id: cucina.id });
  });
});
