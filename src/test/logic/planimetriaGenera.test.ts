import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { costruisciPlanimetria, applicaMisuraLocale, applicaMisuraUtente } from "../../../supabase/functions/planimetria-genera/costruisci";
import { controllaPlanimetria } from "../../../supabase/functions/planimetria-genera/controlloProvvisorio";
import { generaPlanimetria, type ChiamaModello } from "../../../supabase/functions/planimetria-genera/genera";
import { leggiRispostaAI, estraiJson, numero, destinazioneDa, type RispostaAI } from "../../../supabase/functions/planimetria-genera/rispostaAI";
import { planimetriaDaSopralluogo, stanzeDaAreeSopralluogo } from "../../../supabase/functions/planimetria-genera/daSopralluogo";
import { leggiIntestazioneDxf, planimetriaConSfondoDxf } from "../../../supabase/functions/planimetria-genera/sfondoDxf";
import { dimensioniPdf } from "../../../supabase/functions/planimetria-genera/dimensioniPdf";
import { area } from "../../../supabase/functions/planimetria-genera/geometria";

// Bilocale su un'immagine 1000×800 px, 1 px = 1 cm: cucina 400×300 netti,
// camera 300×300 accanto (muro di 10), bagno sotto.
const BILOCALE: RispostaAI = {
  sistema: "immagine",
  leggibile: true,
  motivo_non_leggibile: null,
  altezza_m: 2.7,
  locali: [
    { nome: "Cucina", destinazione: "cucina", contorno: [[100, 125], [500, 125], [500, 500], [100, 500]], superficie_scritta_mq: null, altezza_scritta_m: null, misure_lette: false },
    { nome: "Camera", destinazione: "camera", contorno: [[510, 125], [810, 125], [810, 500], [510, 500]], superficie_scritta_mq: null, altezza_scritta_m: null, misure_lette: false },
    { nome: "Bagno", destinazione: "bagno", contorno: [[100, 512.5], [810, 512.5], [810, 750], [100, 750]], superficie_scritta_mq: null, altezza_scritta_m: null, misure_lette: false },
  ],
  aperture: [
    { tipo: "porta", da: [500, 300], a: [510, 300] }, // troppo corta: scartata
    { tipo: "porta", da: [505, 250], a: [505, 350] },
    { tipo: "finestra", da: [200, 125], a: [320, 125] },
  ],
  quote: [{ valore_m: 4, da: [100, 125], a: [500, 125] }, { valore_m: 3, da: [510, 125], a: [810, 125] }],
};

describe("planimetria-genera: lettura della risposta del modello", () => {
  it("legge numeri all'italiana e JSON dentro i backtick", () => {
    expect(numero("4,20 m")).toBe(4.2);
    expect(numero("h 2,70")).toBe(2.7);
    expect(estraiJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(estraiJson('Ecco: {"a":2} fine')).toEqual({ a: 2 });
  });
  it("riconosce le destinazioni dai nomi delle piante", () => {
    expect(destinazioneDa(null, "W.C.")).toBe("bagno");
    expect(destinazioneDa("", "Letto 2")).toBe("camera");
    expect(destinazioneDa(undefined, "Dis.")).toBe("disimpegno");
    expect(destinazioneDa("cucina", "Angolo cottura")).toBe("cucina");
  });
  it("completa un rettangolo dato con due angoli e scarta gli elementi rotti", () => {
    const r = leggiRispostaAI({ locali: [{ nome: "A", contorno: [[0, 0], [10, 5]] }, { nome: "B", contorno: "x" }], aperture: [{ tipo: "boh", da: [0, 0], a: [1, 1] }] }, "metri");
    expect(r.locali[0].contorno).toHaveLength(4);
    expect(r.locali[1].contorno).toHaveLength(0);
    expect(r.aperture).toHaveLength(0);
    expect(r.sistema).toBe("metri");
  });
});

describe("planimetria-genera: costruzione e controllo", () => {
  it("ricava la scala dalle quote, i muri dai locali e passa il controllo", () => {
    const p = costruisciPlanimetria(BILOCALE, { ingresso: "documento", larghezzaImmagine: 1000, altezzaImmagine: 800 });
    const l = p.livelli[0];
    expect(p.scala).toMatchObject({ metodo: "quota_letta", da_confermare: false });
    expect(p.scala!.cm_per_unita).toBeCloseTo(1, 2);
    // cucina 400 × 300 cm (y: 125→500 su 800 px = 300 px)
    expect(area(l.locali[0].contorno) / 10_000).toBeCloseTo(12, 1);
    expect(l.locali[0].origine_forma).toBe("da_documento");
    expect(l.locali[0].altezza).toEqual({ valore: 270, origine: "da_documento" });
    // il muro fra cucina e camera è uno solo, spesso 10
    const divisori = l.muri.filter((m) => Math.abs(m.p1.x - 505) < 1 && Math.abs(m.p2.x - 505) < 1);
    expect(divisori).toHaveLength(1);
    expect(divisori[0].spessore.valore).toBeCloseTo(10, 0);
    expect(l.aperture.map((a) => a.tipo).sort()).toEqual(["finestra", "porta"]);
    expect(l.aperture.every((a) => a.altezza.origine === "stimata")).toBe(true);
    expect(p.avvisi.some((a) => /porta o finestra non era/.test(a))).toBe(true);
    expect(controllaPlanimetria(p)).toEqual([]);
  });

  it("senza misure scritte usa le porte, segna tutto stimato e chiede una misura", () => {
    const p = costruisciPlanimetria({ ...BILOCALE, quote: [], aperture: BILOCALE.aperture.slice(1) }, { ingresso: "documento", larghezzaImmagine: 1000, altezzaImmagine: 800 });
    expect(p.scala).toMatchObject({ metodo: "porte", da_confermare: true });
    expect(p.livelli[0].locali.every((l) => l.origine_forma === "stimata")).toBe(true);
    expect(p.avvisi.join(" ")).toMatch(/misura vera di una parete/);
    // la porta è alta 100 su 1000 di un'immagine alta 800 px = 80 px → 1 px = 1 cm
    expect(p.scala!.cm_per_unita).toBeCloseTo(1, 2);

    const conferma = applicaMisuraLocale(p, "l1", "x", 400);
    expect(area(conferma.livelli[0].locali[0].contorno) / 10_000).toBeCloseTo(12, 1);
    expect(conferma.scala).toMatchObject({ metodo: "misura_utente", da_confermare: false });
    expect(conferma.livelli[0].locali[0].origine_forma).toBe("da_documento");
    expect(conferma.avvisi.join(" ")).not.toMatch(/misura vera/);

    const muro = conferma.livelli[0].muri[0];
    const dopo = applicaMisuraUtente(conferma, muro.id, 500);
    expect(dopo.livelli[0].muri[0].lunghezza).toEqual({ valore: 500, origine: "rilevata" });
  });

  it("non conferma la scala su uno schizzo", () => {
    const p = costruisciPlanimetria({ ...BILOCALE, sistema: "metri", locali: [{ ...BILOCALE.locali[0], contorno: [[0, 0], [4, 0], [4, 3], [0, 3]] }], aperture: [], quote: [] }, { ingresso: "schizzo" });
    expect(() => applicaMisuraLocale(p, "l1", "x", 400)).toThrow();
    expect(p.livelli[0].locali[0].origine_forma).toBe("stimata");
  });

  it("il controllo trova locali sovrapposti, intrecciati e aperture fuori dal muro", () => {
    const p = costruisciPlanimetria(BILOCALE, { ingresso: "documento", larghezzaImmagine: 1000, altezzaImmagine: 800 });
    const l = p.livelli[0];
    l.locali.push({ ...l.locali[0], id: "lx", nome: "Doppione" });
    l.locali.push({ ...l.locali[0], id: "ly", nome: "Farfalla", contorno: [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 }] });
    l.aperture[0].posizione = 10_000;
    const codici = controllaPlanimetria(p).map((e) => e.codice);
    expect(codici).toEqual(expect.arrayContaining(["locali_sovrapposti", "locale_intrecciato", "apertura_fuori_muro"]));
  });
});

describe("planimetria-genera: due tentativi, poi un messaggio semplice", () => {
  const buona = JSON.stringify(BILOCALE);
  const rotta = JSON.stringify({ ...BILOCALE, locali: [BILOCALE.locali[0], { ...BILOCALE.locali[0], nome: "Copia" }] });
  const richiesta = { ingresso: "documento" as const, file: { dataUrl: "data:image/png;base64,AAA", mime: "image/png", larghezza: 1000, altezza: 800 } };

  it("al secondo tentativo manda gli errori al modello", async () => {
    const visti: number[] = [];
    const chiama: ChiamaModello = async (messaggi, n) => {
      visti.push(messaggi.length);
      if (n === 2) expect(String(messaggi[messaggi.length - 1].content)).toMatch(/si sovrappongono/);
      return { testo: n === 1 ? rotta : buona, modello: "finto" };
    };
    const esito = await generaPlanimetria(richiesta, chiama);
    expect(esito.ok).toBe(true);
    expect(esito.tentativi).toHaveLength(2);
    expect(visti).toEqual([2, 4]);
  });

  it("se anche il secondo è rotto non restituisce la pianta", async () => {
    const esito = await generaPlanimetria(richiesta, async () => ({ testo: rotta, modello: "finto" }));
    expect(esito).toMatchObject({ ok: false, codice: "pianta_non_valida" });
    expect(esito.ok ? "" : esito.messaggio).not.toMatch(/JSON|geometric|poligon/i);
  });

  it("si ferma subito se il documento non è una pianta", async () => {
    let chiamate = 0;
    const esito = await generaPlanimetria(richiesta, async () => {
      chiamate++;
      return { testo: '{"leggibile":false,"motivo_non_leggibile":"è una fattura"}', modello: "finto" };
    });
    expect(esito).toMatchObject({ ok: false, codice: "non_leggibile" });
    expect(chiamate).toBe(1);
  });

  it("allega i PDF come file e le immagini come immagine", async () => {
    let parti: unknown = null;
    await generaPlanimetria({ ...richiesta, file: { ...richiesta.file, dataUrl: "data:application/pdf;base64,AAA", mime: "application/pdf" } }, async (m) => {
      parti = m[1].content;
      return { testo: buona, modello: "finto" };
    });
    expect(JSON.stringify(parti)).toContain('"type":"file"');
  });
});

describe("planimetria-genera: sopralluogo e DXF", () => {
  it("dal sopralluogo: superfici esatte, forma stimata, altezze rilevate", () => {
    const stanze = stanzeDaAreeSopralluogo([
      { name: "Soggiorno", area_data: { superficie: 24, altezza: 2.8 } },
      { name: "Cucina", area_data: { superficie: "10,5" } },
      { name: "Bagno", area_data: { superficie: 5 } },
      { name: "Camera", area_data: { superficie: 14 } },
      { name: "Terrazzo", area_data: {} },
    ]);
    const p = planimetriaDaSopralluogo(stanze);
    const locali = p.livelli[0].locali;
    expect(locali.map((l) => Math.round(area(l.contorno) / 100) / 100)).toEqual([24, 10.5, 5, 14]);
    expect(locali.every((l) => l.origine_forma === "stimata")).toBe(true);
    expect(locali[0].altezza).toEqual({ valore: 280, origine: "rilevata" });
    expect(locali[1].altezza.origine).toBe("stimata");
    expect(p.avvisi.join(" ")).toMatch(/Una stanza non aveva la superficie/);
    expect(controllaPlanimetria(p)).toEqual([]);
  });

  it("legge unità e ingombro del DXF senza toccare i disegni", () => {
    const dxf = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "9", "$EXTMIN", "10", "0", "20", "0", "30", "0", "9", "$EXTMAX", "10", "12000", "20", "8000", "30", "0", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES", "0", "ENDSEC", "0", "EOF"].join("\n");
    expect(leggiIntestazioneDxf(dxf)).toEqual({ unita: "mm", estensione: { min: { x: 0, y: 0 }, max: { x: 12000, y: 8000 } } });
    const p = planimetriaConSfondoDxf(dxf, "c/p/rilievo.dxf");
    expect(p.riferimenti.sfondo_dxf).toMatchObject({ unita: "mm", cm_per_unita: 0.1 });
    expect(() => leggiIntestazioneDxf("AutoCAD Binary DXF\0")).toThrow(/binario/);
    expect(() => leggiIntestazioneDxf("ciao")).toThrow(/non sembra un DXF/);
  });

  it("legge le proporzioni del foglio da un PDF del banco di prova", () => {
    const pdf = new Uint8Array(readFileSync("scripts/planimetrie-banco/campioni/g06-trilocale-pdf.pdf"));
    const d = dimensioniPdf(pdf)!;
    const verita = JSON.parse(readFileSync("scripts/planimetrie-banco/campioni/g06-trilocale-pdf.json", "utf8"));
    expect(d.larghezza / d.altezza).toBeCloseTo(verita.larghezza_px / verita.altezza_px, 2);
  });
});
