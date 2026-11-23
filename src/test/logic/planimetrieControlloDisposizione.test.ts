import { describe, expect, it } from "vitest";
import { controllaDisposizione } from "../../../shared/planimetrie/controlloDisposizione";
import trilocale from "../../../shared/planimetrie/esempi/trilocale.json";
import bilocale from "../../../shared/planimetrie/esempi/bilocale.json";
import type { Planimetria } from "../../../shared/planimetrie/modello";
import { piantaAiPorteSbagliate } from "../fixtures/piantaAiPorteSbagliate";

describe("controllore della disposizione", () => {
  it("sulla pianta vera del 23/11 trova il bagno e la cameretta con la porta che dà fuori", () => {
    const problemi = controllaDisposizione(piantaAiPorteSbagliate());
    const bagno = problemi.find((p) => p.localeId === "l5")!;
    expect(bagno.codice).toBe("porta_su_esterno");
    expect(bagno.dettaglio).toMatch(/«Bagno».*esterno.*«Soggiorno con cucina»/);
    expect(problemi.find((p) => p.localeId === "l4")?.codice).toBe("porta_su_esterno");
    // soggiorno, disimpegno e camera matrimoniale comunicano: nessuna segnalazione
    expect(problemi.filter((p) => ["l1", "l2", "l3"].includes(p.localeId ?? ""))).toEqual([]);
  });

  it("confronta le superfici con quelle dettate (oltre il 10%)", () => {
    const problemi = controllaDisposizione(piantaAiPorteSbagliate(), [
      { nome: "disimpegno", mq: 3.6 }, { nome: "Soggiorno con cucina", mq: 21 }, { nome: "cameretta", mq: 8.4 },
    ]);
    const misure = problemi.filter((p) => p.codice === "misura_diversa");
    expect(misure.map((p) => p.localeId)).toEqual(["l2"]);
    expect(misure[0].dettaglio).toMatch(/3,6 m².*5,17/);
  });

  it("le piante d'esempio disegnate bene non hanno problemi", () => {
    expect(controllaDisposizione(trilocale as unknown as Planimetria)).toEqual([]);
    expect(controllaDisposizione(bilocale as unknown as Planimetria)).toEqual([]);
  });

  it("senza nessuna porta sul perimetro manca l'ingresso; una finestra fra due stanze è un errore", () => {
    const p = piantaAiPorteSbagliate();
    const fatto = p.livelli[0].fatto;
    fatto.aperture = fatto.aperture.filter((a) => !["a1", "a8", "a6"].includes(a.id));
    fatto.aperture.push({ ...fatto.aperture.find((a) => a.id === "a2")!, id: "f9", muroId: "m2", offset: 300 });
    const codici = controllaDisposizione(p).map((x) => x.codice);
    expect(codici).toContain("senza_ingresso");
    expect(codici).toContain("finestra_interna");
    expect(codici).toContain("stanza_isolata");
  });
});

describe("coordinatore della generazione: disegnatore, controllore, correttore", async () => {
  const { generaPlanimetria } = await import("../../../supabase/functions/planimetria-genera/genera");
  type Chiama = import("../../../supabase/functions/planimetria-genera/genera").ChiamaModello;
  const risposta = (portaBagno: object, bagnoLargo = 2.4) => JSON.stringify({
    sistema: "metri", leggibile: true, altezza_m: 2.7,
    locali: [
      { nome: "Soggiorno", destinazione: "soggiorno", contorno: [[0, 0], [5, 0], [5, 4], [0, 4]], misure_lette: false },
      { nome: "Bagno", destinazione: "bagno", contorno: [[5, 0], [5 + bagnoLargo, 0], [5 + bagnoLargo, 2.1], [5, 2.1]], misure_lette: false },
    ],
    aperture: [{ tipo: "porta", da: [0, 1], a: [0, 1.9] }, { tipo: "finestra", da: [1.5, 0], a: [2.7, 0] }, portaBagno],
    quote: [], elementi: [], aree: [],
  });
  const FUORI = { tipo: "porta", da: [5.8, 0], a: [6.6, 0] }, DENTRO = { tipo: "porta", da: [5, 0.6], a: [5, 1.4] };
  const req = { ingresso: "descrizione" as const, testo: "Soggiorno 5 x 4 m, bagno 2,40 x 2,10 m", attese: [{ nome: "Bagno", mq: 5.04 }] };

  it("pianta giusta al primo colpo: una sola chiamata, nessun avviso di correzione", async () => {
    const chiamate: number[] = [];
    const chiama: Chiama = async (_m, n) => { chiamate.push(n); return { testo: risposta(DENTRO), modello: "finto" }; };
    const esito = await generaPlanimetria(req, chiama);
    expect(esito.ok).toBe(true);
    expect(chiamate).toEqual([1]);
    if (esito.ok) expect(esito.pianta.generazione.controllo_disposizione).toBeUndefined();
  });

  it("bagno con la porta verso fuori: il correttore riceve il difetto e la seconda versione è quella consegnata", async () => {
    const messaggiVisti: string[] = [];
    const chiama: Chiama = async (m, n) => { messaggiVisti.push(String(m.at(-1)!.content)); return { testo: risposta(n === 1 ? FUORI : DENTRO), modello: "finto" }; };
    const esito = await generaPlanimetria(req, chiama);
    expect(messaggiVisti).toHaveLength(2);
    expect(messaggiVisti[1]).toMatch(/«Bagno».*esterno.*«Soggiorno»/s);
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.pianta.generazione.controllo_disposizione).toEqual({ giri: 2, rimasti: 0 });
    expect(esito.pianta.generazione.avvisi.join(" ")).toMatch(/ricontrollato porte/);
    expect(esito.tentativi[0].errori).toContain("porta_su_esterno");
  });

  it("se il correttore non ci riesce, si consegna la versione con meno difetti e si dice cosa resta", async () => {
    const chiama: Chiama = async () => ({ testo: risposta(FUORI, 3.6), modello: "finto" });
    const esito = await generaPlanimetria(req, chiama);
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.pianta.generazione.controllo_disposizione).toEqual({ giri: 2, rimasti: 2 });
    const avvisi = esito.pianta.generazione.avvisi.join(" ");
    expect(avvisi).toMatch(/Da sistemare nell'editor \(2\)/);
    expect(avvisi).toMatch(/5,04 m²/);
  });

  it("se la correzione rompe la pianta, resta la prima versione invece di un errore", async () => {
    const chiama: Chiama = async (_m, n) => ({ testo: n === 1 ? risposta(FUORI) : "non è json", modello: "finto" });
    const esito = await generaPlanimetria(req, chiama);
    expect(esito.ok).toBe(true);
    if (esito.ok) expect(esito.pianta.generazione.controllo_disposizione?.rimasti).toBe(1);
  });
});

describe("dividere una stanza senza porta nel tramezzo", async () => {
  const { accessiDopoLaDivisione } = await import("@/lib/planimetrie/chatProgetto");
  const { frazionaContorno, inserisciFrazionamento } = await import("@/lib/planimetrie/frazionamento");

  it("il soggiorno con l'ingresso tagliato fuori dal resto non risulta più «collegato»", () => {
    const fatto = piantaAiPorteSbagliate().livelli[0].fatto;
    const soggiorno = fatto.locali.find((l) => l.id === "l1")!;
    const taglio = frazionaContorno(fatto, soggiorno, "x", [50]);
    if (!taglio.ok) throw new Error("taglio non valido");
    const dopo = inserisciFrazionamento({ ...structuredClone(fatto), id: "A", nome: "A" } as never, soggiorno, taglio, [{ nome: "Soggiorno 1" }, { nome: "Soggiorno 2" }]);
    const esiti = accessiDopoLaDivisione(fatto, dopo, dopo.frazionamenti!.at(-1)!.parti);
    expect(esiti).toHaveLength(2);
    expect(esiti.every((e) => e.esito === "da_verificare")).toBe(true);
    expect(esiti[0].dettaglio).toMatch(/porta nel tramezzo/);
  });
});
