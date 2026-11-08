/**
 * Computo da Excel con più fogli. Fino al 07/11/2026 veniva rifiutato: 4
 * computi su 22 caricati negli ultimi 120 giorni sono falliti così. Ora si
 * leggono i fogli con l'intestazione di un computo, gli altri si saltano e si
 * dicono (supabase/functions/_shared/computoExcel.ts).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkComputoExtraction } from "../../../supabase/functions/_shared/computoExtractionQuality";
import { fogliDelComputo, trovaIntestazione, vociDelFoglio } from "../../../supabase/functions/_shared/computoExcel";

const copertina = [["COMPUTO METRICO ESTIMATIVO"], ["Committente: Mario Rossi"], ["Data: 01/10/2026"]];
const riepilogo = [["Capitolo", "Importo"], ["Isolamento", 21000], ["Impianti", 18000]];
const isolamento = [
  ["Computo metrico"],
  ["Codice", "Descrizione", "U.M.", "Quantità", "Prezzo", "Importo"],
  ["E.12.010", "Isolamento a cappotto EPS 10 cm", "m²", "412,35", "45,50", "18.761,93"],
  ["E.12.020", "Rasatura armata", "m²", 412.35, 6, 2474.1],
  ["", "TOTALE", "", "", "", 21236.03],
];
const impianti = [
  ["N.", "Descrizione dei lavori", "Unità", "Quantità", "Prezzo unitario", "Importo"],
  ["IMPIANTO TERMICO"],
  ["1", "Impianto radiante a pavimento", "m²", 180.5, 62, 11191],
];

describe("computo da Excel con più fogli", () => {
  it("riconosce l'intestazione del computo e le colonne", () => {
    expect(trovaIntestazione(isolamento)).toMatchObject({ riga: 1, colonne: { codice: 0, descrizione: 1, um: 2, quantita: 3, prezzo: 4, importo: 5 } });
    expect(trovaIntestazione(copertina)).toBeNull();
    expect(trovaIntestazione(riepilogo)).toBeNull();
  });

  it("legge i fogli delle voci e dice quali ha saltato", () => {
    const r = fogliDelComputo([
      { nome: "Copertina", righe: copertina },
      { nome: "Riepilogo", righe: riepilogo },
      { nome: "Isolamento", righe: isolamento },
      { nome: "Impianti", righe: impianti },
      { nome: "Vuoto", righe: [] },
    ]);
    expect(r.daLeggere.map((f) => f.nome)).toEqual(["Isolamento", "Impianti"]);
    expect(r.saltati).toEqual(["Copertina", "Riepilogo"]);
    expect(r.vuoti).toEqual(["Vuoto"]);
  });

  it("un riepilogo con codice, descrizione e importo non si legge come voci (importi doppi)", () => {
    const riepilogoRicco = [
      ["Codice", "Descrizione", "Importo"],
      ["CAP.1", "Isolamento", 21236.03],
      ["CAP.2", "Impianti", 11191],
      ["", "TOTALE", 32427.03],
    ];
    expect(trovaIntestazione(riepilogoRicco)).not.toBeNull();
    const r = fogliDelComputo([
      { nome: "Quadro", righe: riepilogoRicco },
      { nome: "Isolamento", righe: isolamento },
      { nome: "Impianti", righe: impianti },
    ]);
    expect(r.daLeggere.map((f) => f.nome)).toEqual(["Isolamento", "Impianti"]);
    expect(r.saltati).toEqual(["Quadro"]);
  });

  it("un foglio chiamato riepilogo con le colonne di un computo si salta se ci sono altri fogli di voci", () => {
    const r = fogliDelComputo([
      { nome: "Riepilogo generale", righe: isolamento },
      { nome: "Isolamento", righe: isolamento },
    ]);
    expect(r.daLeggere.map((f) => f.nome)).toEqual(["Isolamento"]);
    expect(r.saltati).toEqual(["Riepilogo generale"]);
    // Se è l'unico foglio di voci, si legge.
    expect(fogliDelComputo([{ nome: "Riepilogo", righe: isolamento }]).daLeggere).toHaveLength(1);
  });

  it("le voci con quantità, prezzo e importo all'italiana; il totale non è una voce", () => {
    const f = fogliDelComputo([{ nome: "Isolamento", righe: isolamento }]).daLeggere[0];
    const { voci } = vociDelFoglio(f.righe, f.intestazione, "Isolamento", 1);
    expect(voci).toHaveLength(2);
    expect(voci[0]).toMatchObject({ codice_voce: "E.12.010", unita_misura: "m²", quantita: 412.35, prezzo_unitario: 45.5, importo: 18761.93, capitolo_nome: "Isolamento" });
  });

  it("con più fogli il capitolo parte dal nome del foglio, poi segue le righe di capitolo", () => {
    const f = fogliDelComputo([{ nome: "Impianti", righe: impianti }]).daLeggere[0];
    const { voci, ultimoNumero } = vociDelFoglio(f.righe, f.intestazione, "Impianti", 3);
    expect(voci).toHaveLength(1);
    expect(voci[0]).toMatchObject({ capitolo_nome: "IMPIANTO TERMICO", capitolo_numero: 4, quantita: 180.5 });
    expect(ultimoNumero).toBe(4);
  });
});


describe("il risultato dell'Excel passa il controllo di qualità", () => {
  it("una lettura Excel completa non è scambiata per un PDF tagliato", () => {
    const f = fogliDelComputo([{ nome: "Isolamento", righe: isolamento }]).daLeggere[0];
    const { voci } = vociDelFoglio(f.righe, f.intestazione, "Generale", 1);
    const risultato = {
      metadata: { oggetto_lavori: "Isolamento" },
      capitoli: [{ numero: 1, nome: "Generale", totale: voci.reduce((s, v) => s + (v.importo ?? 0), 0), voci }],
      document_coverage: { complete: true, fogli_letti: ["Isolamento"], fogli_saltati: ["Copertina"] },
    };
    expect(checkComputoExtraction(risultato).errors).toEqual([]);
    // Senza «complete» il controllo la rifiuterebbe: è l'errore trovato in revisione.
    expect(checkComputoExtraction({ ...risultato, document_coverage: { fogli_letti: ["Isolamento"] } }).errors.join(" ")).toMatch(/incompleta/);
  });

  it("la funzione dichiara completa la lettura dell'Excel", () => {
    const src = readFileSync("supabase/functions/computo-ai-extract/index.ts", "utf8");
    expect(src).toContain("document_coverage: { complete: true, fogli_letti:");
  });
});
