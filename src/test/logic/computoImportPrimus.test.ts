import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { leggiComputoPrimus, type PdfPaginaPosizionata } from "@/lib/computo/primusPdf";
import { leggiComputoXpwe } from "@/lib/computo/xpwe";
import { applicaImportComputo, bozzaDaComputoStrutturato, dataItaliana, titoloDaOggetto } from "@/lib/computo/importaComputo";
import { arrotondaDecimale, bozzaVuota, calcolaVoce, misuraVuota, quantitaMisura, voceVuota } from "@/lib/computo/editorNativo";
import type { ComputoStrutturato, ComputoVoceStrutturata } from "@/lib/computo/computoStrutturato";

/**
 * Un computo scritto in PriMus deve arrivare nell'editor con gli stessi numeri
 * del documento, al centesimo. Il 29/10/2026 non era così, per tre motivi che
 * nessun test vedeva: l'unità «%» moltiplicava senza dividere per 100, le
 * righe di misura non si arrotondavano come in PriMus, e il prezzo negativo
 * (che PriMus usa per spostare importi) mandava la voce in errore.
 */

function pagineGenzano(): PdfPaginaPosizionata[] {
  const pagine: PdfPaginaPosizionata[] = [];
  for (const riga of readFileSync(resolve(__dirname, "../fixtures/computoPrimusGenzano.tsv"), "utf8").split("\n")) {
    if (!riga || riga.startsWith("# ")) continue;
    if (riga.startsWith("### ")) { pagine.push({ page: Number(riga.slice(4)), items: [] }); continue; }
    const [x, right, y, ...testo] = riga.split("\t");
    pagine.at(-1)!.items.push({ x: Number(x), right: Number(right), y: Number(y), text: testo.join("\t") });
  }
  return pagine;
}

const voceDoc = (p: Partial<ComputoVoceStrutturata>): ComputoVoceStrutturata => ({
  numero_ordine: "1", codici: [], codice_tariffa: "", descrizione: "Voce di prova", descrizione_troncata: false,
  unita_misura: "mq", quantita: 1, prezzo_unitario: 10, importo: 10, sezione: null,
  super_categoria: null, categoria: null, sotto_categoria: null,
  is_sicurezza: false, is_detrazione: false, a_corpo: false, misure: [], pagina: 1, avvisi: [], ...p,
});
const computo = (voci: ComputoVoceStrutturata[], p: Partial<ComputoStrutturato> = {}): ComputoStrutturato => ({
  formato: "primus_pdf", metadata: {}, voci, totale_dichiarato: null, riepiloghi: [], prezzari: [], avvisi: [], ...p,
});

describe("il PriMus vero di Genzano entra nell'editor al centesimo", () => {
  const letto = leggiComputoPrimus(pagineGenzano());
  const esito = bozzaDaComputoStrutturato(letto);

  it("porta tutte le 226 voci con le loro righe di misura", () => {
    expect(esito.voci).toHaveLength(226);
    expect(esito.voci.reduce((s, v) => s + v.misure.length, 0)).toBe(letto.voci.reduce((s, v) => s + v.misure.length, 0));
  });

  it("il totale ricalcolato è quello del documento", () => {
    expect(esito.totaleDocumento).toBe(2642936.35);
    expect(esito.totaleRicalcolato).toBe(2642936.35);
    expect(esito.scostamenti).toEqual([]);
  });

  it("ogni voce ha l'importo del documento, nessuna è in errore", () => {
    const diverse = esito.voci.flatMap((v, i) => {
      const r = calcolaVoce(v);
      return r.errori.length || r.importo !== letto.voci[i].importo ? [{ voce: i + 1, editor: r.importo, documento: letto.voci[i].importo, errori: r.errori }] : [];
    });
    expect(diverse).toEqual([]);
  });

  it("la voce in percentuale divide per 100 (voce 66, sovrapprezzo)", () => {
    const v = esito.voci[65];
    expect(v.unita).toBe("%");
    expect(calcolaVoce(v).importo).toBe(6352.39);
  });

  it("il prezzo negativo diventa una detrazione con lo stesso importo (voce 30)", () => {
    const v = esito.voci[29];
    expect(v.detrazione).toBe(true);
    expect(v.prezzo).toBe("1");
    expect(calcolaVoce(v).importo).toBe(-153873.55);
  });

  it("le formule di PriMus restano scritte accanto alla descrizione", () => {
    expect(esito.voci[2].misure[0].descrizione).toContain("(par.ug.=2*13)");
    expect(quantitaMisura(esito.voci[2].misure[0])).toBe(26);
  });

  it("le descrizioni abbreviate dal PDF sono contate una volta, non un avviso per voce", () => {
    expect(esito.descrizioniTroncate).toBe(82);
    expect(esito.avvisi).toEqual([]);
  });

  it("i capitoli sono le super-categorie del documento, non un capitolo unico", () => {
    expect(new Set(esito.voci.map(v => v.capitolo)).size).toBeGreaterThan(1);
    expect(esito.voci.every(v => v.capitolo.trim())).toBe(true);
  });
});

describe("l'XPWE entra con intestazione e voci", () => {
  const esito = bozzaDaComputoStrutturato(leggiComputoXpwe(readFileSync(resolve(__dirname, "../fixtures/computoSintetico.xpwe"))));
  it("legge committente e oggetto", () => {
    expect(esito.intestazione.committente).toBe("Comune di Prova - Ufficio Tecnico");
    expect(esito.intestazione.oggetto).toBe("Manutenzione straordinaria della scuola \"G. Verdi\"");
  });
  it("nessuna voce in errore, nessuno scostamento, testo intero", () => {
    expect(esito.voci).toHaveLength(6);
    expect(esito.descrizioniTroncate).toBe(0);
    expect(esito.voci.filter(v => calcolaVoce(v).errori.length)).toEqual([]);
    expect(esito.scostamenti).toEqual([]);
  });
});

describe("arrotondamento delle righe come PriMus", () => {
  it("la metà va lontano dallo zero, anche dove il binario sbaglia", () => {
    expect(arrotondaDecimale(15.45 * 4.7)).toBe(72.62); // 72,6149999… in binario
    expect(arrotondaDecimale(5.5 * 5.55)).toBe(30.53);
    expect(arrotondaDecimale(1.005)).toBe(1.01);
    expect(arrotondaDecimale(-2.675)).toBe(-2.68);
    expect(arrotondaDecimale(0.1 + 0.2)).toBe(0.3);
  });
  it("una riga di misura si arrotonda prima di sommarsi", () => {
    const voce = { ...voceVuota(), descrizione: "Cappotto", prezzo: "62,65", misure: [
      { ...misuraVuota(), lunghezza: "5,5", altezza: "5,55" },
      { ...misuraVuota(), lunghezza: "15,45", altezza: "4,7" },
    ] };
    expect(calcolaVoce(voce).quantita).toBe(103.15); // 30,53 + 72,62
  });
});

describe("unità percentuale scritta a mano", () => {
  it("il 30% di 21.174,63 € fa 6.352,39 €, non 635.238,90 €", () => {
    const v = { ...voceVuota(), descrizione: "Sovrapprezzo", unita: "%", quantita: "21174,63", prezzo: "30" };
    expect(calcolaVoce(v).importo).toBe(6352.39);
  });
  it("le altre unità non cambiano", () => {
    expect(calcolaVoce({ ...voceVuota(), descrizione: "Posa", unita: "mq", quantita: "10", prezzo: "30" }).importo).toBe(300);
  });
});

describe("intestazione letta dalla copertina", () => {
  // L'oggetto vero della copertina del computo di Genzano (29/10/2026).
  const oggetto = "Legge n.77 del 17 Luglio 2020 e n.108 del 29 Luglio 2021 - Riqualificazione energetica e miglioramento sismico per la struttura in Corso Umberto I n.81. Preazziari: DEI Recupero, ristrutturazione e Manutenzione 2024 - Regionale Basilicata 2023/24";
  it("il titolo si taglia a fine frase, non a metà parola", () => {
    const t = titoloDaOggetto(oggetto);
    expect(t).toBe("Legge n.77 del 17 Luglio 2020 e n.108 del 29 Luglio 2021 - Riqualificazione energetica e miglioramento sismico per la struttura in Corso Umberto I n.81.");
    expect(t).not.toContain("Preazzi");
  });
  it("senza una frase da chiudere taglia all'ultima parola intera, coi puntini", () => {
    const t = titoloDaOggetto("parola ".repeat(40), 30);
    expect(t.endsWith("parola…")).toBe(true);
    expect(t.length).toBeLessThanOrEqual(30);
  });
  it("un oggetto breve resta com'è", () => {
    expect(titoloDaOggetto("Manutenzione della scuola")).toBe("Manutenzione della scuola");
  });
  it("la data ISO diventa italiana, il resto non si tocca", () => {
    expect(dataItaliana("2025-07-16")).toBe("16/07/2025");
    expect(dataItaliana("16/07/2025")).toBe("16/07/2025");
    expect(dataItaliana("luglio 2025")).toBe("luglio 2025");
  });
});

describe("l'import non cancella il lavoro fatto", () => {
  const esito = bozzaDaComputoStrutturato(computo([voceDoc({ descrizione: "Importata" })], {
    metadata: { committente: "Comune", oggetto_lavori: "Scuola", data_computo: "01/10/2026" },
  }));

  it("aggiunge in coda alle voci che ci sono", () => {
    const bozza = { ...bozzaVuota(), voci: [{ ...voceVuota(), descrizione: "Mia" }] };
    const dopo = applicaImportComputo(bozza, esito);
    expect(dopo.voci.map(v => v.descrizione)).toEqual(["Mia", "Importata"]);
  });

  it("riempie solo i campi vuoti, e sostituisce il titolo solo se è quello predefinito", () => {
    const vuota = applicaImportComputo(bozzaVuota(), esito);
    expect(vuota).toMatchObject({ titolo: "Scuola", committente: "Comune", oggetto: "Scuola", dataDocumento: "01/10/2026" });
    const scritta = applicaImportComputo({ ...bozzaVuota(), titolo: "Il mio titolo", committente: "Rossi" }, esito);
    expect(scritta).toMatchObject({ titolo: "Il mio titolo", committente: "Rossi" });
  });

  it("rifiuta prima di toccare la bozza se si supera il limite di voci", () => {
    const piena = { ...bozzaVuota(), voci: Array.from({ length: 5000 }, () => ({ ...voceVuota(), descrizione: "x" })) };
    expect(() => applicaImportComputo(piena, esito)).toThrow(/al massimo 5000/);
  });

  it("un documento senza voci non diventa una bozza vuota in silenzio", () => {
    expect(() => bozzaDaComputoStrutturato(computo([]))).toThrow(/non contiene lavorazioni/);
  });
});
