import { describe, expect, it } from "vitest";
import { gzipSync, strFromU8, strToU8 } from "fflate";
import { aPlanimetria, piantaVuota, type Muro, type Pianta } from "@/components/planimetrie/editor/adattatore";
import { comandiDaChatDisegno } from "@/components/planimetrie/editor/comandiChat";
import { anteprimaInterventi, cercaQuoteLibere, modificaIntervento, preparaInterventi, propostaChatApplicabile } from "@/components/planimetrie/editor/interventiChat";
import { decodificaTracciatoDwg } from "@/components/planimetrie/editor/LayerDwg";
import { leggiCoordinata } from "@/components/planimetrie/editor/misure";
import { nuovaPlanimetria, validaPlanimetria } from "../../../shared/planimetrie/modello.ts";

describe("coordinate e layer DWG", () => {
  it("conserva zero, segno e decimali in metri senza passare per la griglia", () => {
    expect(leggiCoordinata("0")).toBe(0);
    expect(leggiCoordinata("-2,1543 m")).toBe(-215.43);
    expect(leggiCoordinata("+0.01")).toBe(1);
    expect(leggiCoordinata("−,25")).toBe(-25);
    expect(leggiCoordinata("Infinity")).toBeNull();
    expect(leggiCoordinata("")).toBeNull();
  });

  it("valida il riferimento vettoriale con i layer originali e il blocco dell'immagine", () => {
    const d = nuovaPlanimetria();
    const p = d.livelli[0];
    p.ricalco = { percorso: "azienda/ricalco/a.png", x: 0, y: 100, larghezzaCm: 100, proporzione: 1, opacita: .3, bloccata: true };
    p.tavolaDwg = { riquadro: { x: 0, y: 0, larghezza: 100, altezza: 100 }, layer: [{ nome: "Muri originali", linee: "M0 0L100 0", campiture: "" }] };
    expect(validaPlanimetria(d).ok).toBe(true);
    p.tavolaDwg.layer[0].linee = "<image>";
    expect(validaPlanimetria(d).ok).toBe(false);
  });

  it("legge le coordinate relative compresse dei layer densi e scarta i tracciati corrotti", () => {
    const comprimi = (d: string) => "gz:" + btoa(strFromU8(gzipSync(strToU8(d)), true));
    const percorso = "M2 1l10 -.25q5 3 10 4c1 1 2 2 3 3Z".repeat(1000);
    expect(decodificaTracciatoDwg(comprimi(percorso))).toBe(percorso);
    expect(decodificaTracciatoDwg(comprimi("<image>"))).toBe("");
    expect(decodificaTracciatoDwg("gz:aaa=")).toBe("");
  });
});

const muro = (id: string, az: number, ay: number, bx: number, by: number, stato: Muro["stato"]): Muro => ({
  id, p1: { x: az, y: ay }, p2: { x: bx, y: by }, spessore: 12, altezza: 270, tipo: "tramezzo", origine: "rilevata", stato,
});

function garage(): Pianta {
  const o = piantaVuota();
  return { ...o, muri: [muro("sx", 0, 0, 0, 400, "esistente"), muro("dx", 600, 0, 600, 400, "esistente"), muro("tramezzo", 0, 140, 600, 140, "nuovo")],
    locali: [{ id: "garage", nome: "3 CAR GARAGE", contorno: [{ x: 6, y: 0 }, { x: 594, y: 0 }, { x: 594, y: 400 }, { x: 6, y: 400 }],
      alFiloInterno: true, altezza: 270, destinazione: "garage", stato: "esistente", origine: "rilevata" }],
    aperture: [{ id: "v", muroId: "dx", tipo: "varco", posizione: 160, larghezza: 20, altezza: 210, davanzale: 0, manovra: "nessuna", verso: { cerniera: "inizio", lato: "sinistra" }, stato: "esistente", origine: "rilevata" }],
    nomiProgetto: { garage: { nome: "3 CAR GARAGE", destinazione: "garage", finiture: { pavimento: "Gres" } } },
  };
}

describe("anteprima CAD di Silvio", () => {
  it("mostra il varco coinvolto e le quantità, consentendo una nuova prova sulla base iniziale", () => {
    const p = garage();
    const d = nuovaPlanimetria(); d.livelli[0].id = "cad-1";
    const contesto = { documento: aPlanimetria(p, d, "cad-1"), livelloId: "cad-1", propostaId: "A" };
    const richiesta = comandiDaChatDisegno(p, "progetto", "Sposta il tramezzo di 20 cm verso il garage; Misura il garage", contesto);
    expect(richiesta.passi).toHaveLength(1);
    const prova = richiesta.passi[0].confrontoTramezzo;
    expect(prova?.dopo.p2).toEqual({ x: 600, y: 160 });
    expect(prova?.interferenze).toEqual([{ punto: { x: 600, y: 160 }, testo: expect.stringContaining("varco") }]);
    expect(prova?.righe).toContainEqual(expect.objectContaining({ id: "tramezzo", prima: 16.2, dopo: 16.2 }));
    expect(prova?.righe.some(r => r.descrizione.startsWith("Posa pavimento") && r.prima !== r.dopo)).toBe(true);
    expect(p.muri[2].p2.y).toBe(140);

    const libera = comandiDaChatDisegno(p, "progetto", "Sposta il tramezzo di 40 cm verso il garage", contesto);
    expect(libera.passi[0].confrontoTramezzo?.dopo.p2.y).toBe(180);
    expect(libera.passi[0].confrontoTramezzo?.interferenze).toEqual([]);
    expect(libera.passi[0].pianta.muri[1]).toBe(p.muri[1]);
    expect(libera.passi[0].pianta.aperture[0]).toBe(p.aperture[0]);
    expect(comandiDaChatDisegno(p, "fatto", "Sposta il tramezzo di 20 cm verso il garage", contesto).passi).toEqual([]);
  });

  it("trova una quota realmente libera continuando a partire dalla geometria valida", () => {
    const base = garage();
    const d = nuovaPlanimetria(); d.livelli[0].id = "cad-1";
    const contesto = { documento: aPlanimetria(base, d, "cad-1"), livelloId: "cad-1", propostaId: "A" };
    const richiesta = "Sposta il tramezzo di 20 cm verso il garage";
    const { revisione } = preparaInterventi(base, "progetto", richiesta, contesto);
    const [spostamento] = revisione.interventi;
    expect(spostamento.passo?.confrontoTramezzo?.interferenze).toHaveLength(1);
    expect(propostaChatApplicabile(anteprimaInterventi(revisione))).toBe(false);
    expect(revisione.piantaValida).toBe(base);
    expect(cercaQuoteLibere(spostamento, 20)).toMatchObject({ quote: expect.arrayContaining([40]), da: 5, a: 80 });
    const corretta = modificaIntervento(revisione, "progetto", contesto, spostamento.richiesta.id,
      { frase: "Sposta il tramezzo di 40 cm verso il garage", riferimento: { tipo: "muro", id: "tramezzo" } });
    const anteprima = anteprimaInterventi(corretta);
    expect(propostaChatApplicabile(anteprima)).toBe(true);
    expect(anteprima.pianta.muri.find(m => m.id === "tramezzo")?.p2.y).toBe(180);
    expect(base.muri.find(m => m.id === "tramezzo")?.p2.y).toBe(140);
    expect(anteprima.pianta.aperture).toEqual(base.aperture);
  });
});
