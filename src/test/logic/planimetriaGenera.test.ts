import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { costruisciPlanimetria, applicaMisuraLocale, applicaMisuraUtente } from "../../../supabase/functions/planimetria-genera/costruisci";
import { controllaGenerata } from "../../../supabase/functions/planimetria-genera/controlloAI";
import { controllaPlanimetria, haErrori } from "../../../shared/planimetrie/controllo";
import { validaPlanimetria, origineMisura } from "../../../shared/planimetrie/modello";
import { calcolaQuantita } from "../../../shared/planimetrie/quantita";
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
  const opz = { ingresso: "documento" as const, larghezzaImmagine: 1000, altezzaImmagine: 800 };

  it("ricava la scala dalle quote, i muri dai locali e passa il controllo della fase 1", () => {
    const { planimetria: p, generazione } = costruisciPlanimetria(BILOCALE, opz);
    expect(validaPlanimetria(p).ok).toBe(true);
    expect(controllaPlanimetria(p)).toEqual([]);
    const f = p.livelli[0].fatto;
    expect(generazione.scala).toMatchObject({ metodo: "quota_letta", da_confermare: false });
    expect(generazione.scala!.cm_per_unita).toBeCloseTo(1, 2);
    // cucina 400 × 300 cm netti (y: 125→500 su 800 px = 300 px)
    expect(area(f.locali[0].contorno) / 10_000).toBeCloseTo(12, 1);
    expect(f.locali[0].origine).toBe("da_documento");
    expect(f.locali[0].altezza).toBe(270);
    expect(origineMisura(f.locali[0], "altezza")).toBe("da_documento");
    // y verso l'alto: la cucina (in alto nell'immagine) ha y più grandi del bagno
    expect(Math.min(...f.locali[0].contorno.map((q) => q.y))).toBeGreaterThan(Math.max(...f.locali[2].contorno.map((q) => q.y)));
    // il muro fra cucina e camera è uno solo, spesso 10, tramezzo
    const divisori = f.muri.filter((m) => Math.abs(m.p1.x - 505) < 1 && Math.abs(m.p2.x - 505) < 1);
    expect(divisori).toHaveLength(1);
    expect(divisori[0]).toMatchObject({ spessore: 10, tipo: "tramezzo" });
    expect(origineMisura(divisori[0], "spessore")).toBe("stimata");
    expect(f.muri.filter((m) => m.tipo === "esterno").length).toBeGreaterThanOrEqual(4);
    expect(f.aperture.map((a) => a.tipo).sort()).toEqual(["finestra", "porta"]);
    expect(f.aperture.every((a) => origineMisura(a, "altezza") === "stimata")).toBe(true);
    expect(generazione.avvisi.some((a) => /porta o finestra non era/.test(a))).toBe(true);
    // le quantità della fase 1 si calcolano e dicono che il pavimento viene dal documento
    const q = calcolaQuantita(p);
    expect(q["fatto:locale:l1.pavimento_mq"]).toMatchObject({ valore: 12, origine: "da_documento" });
  });

  it("senza misure scritte usa le porte, segna tutto stimato e chiede una misura", () => {
    const g = costruisciPlanimetria({ ...BILOCALE, quote: [], aperture: BILOCALE.aperture.slice(1) }, opz);
    expect(g.generazione.scala).toMatchObject({ metodo: "porte", da_confermare: true });
    expect(g.planimetria.livelli[0].fatto.locali.every((l) => l.origine === "stimata")).toBe(true);
    expect(g.generazione.avvisi.join(" ")).toMatch(/misura vera di una parete/);
    // la porta è alta 100 su 1000 di un'immagine alta 800 px = 80 px → 1 px = 1 cm
    expect(g.generazione.scala!.cm_per_unita).toBeCloseTo(1, 2);

    const conferma = applicaMisuraLocale(g, "l1", "x", 500);
    const loc = conferma.planimetria.livelli[0].fatto.locali[0];
    expect(area(loc.contorno) / 10_000).toBeCloseTo(12 * 1.25 * 1.25, 1);
    expect(conferma.generazione.scala).toMatchObject({ metodo: "misura_utente", da_confermare: false });
    expect(loc.origine).toBe("da_documento");
    expect(origineMisura(loc, "altezza")).toBe("da_documento");
    expect(conferma.generazione.avvisi.join(" ")).not.toMatch(/misura vera/);
    expect(haErrori(controllaPlanimetria(conferma.planimetria))).toBe(false);

    const muro = conferma.planimetria.livelli[0].fatto.muri[0];
    const dopo = applicaMisuraUtente(conferma, muro.id, 600);
    const m1 = dopo.planimetria.livelli[0].fatto.muri[0];
    expect(Math.hypot(m1.p2.x - m1.p1.x, m1.p2.y - m1.p1.y)).toBeCloseTo(600, 0);
    expect(m1.origine).toBe("rilevata");
    expect(origineMisura(m1, "spessore")).toBe("stimata");
  });

  it("non conferma la scala su uno schizzo", () => {
    const g = costruisciPlanimetria({ ...BILOCALE, sistema: "metri", locali: [{ ...BILOCALE.locali[0], contorno: [[0, 0], [4, 0], [4, 3], [0, 3]] }], aperture: [], quote: [] }, { ingresso: "schizzo" });
    expect(() => applicaMisuraLocale(g, "l1", "x", 400)).toThrow();
    expect(g.planimetria.livelli[0].fatto.locali[0].origine).toBe("stimata");
  });

  it("il controllo della generazione trova locali sovrapposti, intrecciati e aperture fuori dal muro", () => {
    const { planimetria: p } = costruisciPlanimetria(BILOCALE, opz);
    const f = p.livelli[0].fatto;
    f.locali.push({ ...f.locali[0], id: "lx", nome: "Doppione" });
    f.locali.push({ ...f.locali[0], id: "ly", nome: "Farfalla", contorno: [{ x: 0, y: 0 }, { x: 300, y: 100 }, { x: 300, y: 0 }, { x: 0, y: 200 }] });
    f.aperture[0].offset = 10_000;
    const problemi = controllaGenerata(p);
    expect(problemi.map((e) => e.codice)).toEqual(expect.arrayContaining(["locali_sovrapposti", "locale_contorno_incrociato", "apertura_fuori_parete"]));
    expect(problemi.find((e) => e.codice === "apertura_fuori_parete")!.dettaglio).toMatch(/larga/);
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
    expect(esito.ok && esito.pianta.planimetria.schema).toBe(1);
    expect(esito.tentativi).toHaveLength(2);
    expect(visti).toEqual([2, 4]);
  });

  it("se anche il secondo è rotto non restituisce la pianta", async () => {
    const esito = await generaPlanimetria(richiesta, async () => ({ testo: rotta, modello: "finto" }));
    expect(esito).toMatchObject({ ok: false, codice: "pianta_non_valida" });
    expect(esito.ok === false ? esito.messaggio : "").not.toMatch(/JSON|geometric|poligon/i);
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
    const { planimetria: p, generazione } = planimetriaDaSopralluogo(stanze);
    const locali = p.livelli[0].fatto.locali;
    expect(locali.map((l) => Math.round(area(l.contorno) / 100) / 100)).toEqual([24, 10.5, 5, 14]);
    expect(locali.every((l) => l.origine === "stimata")).toBe(true);
    expect(locali[0].altezza).toBe(280);
    expect(origineMisura(locali[0], "altezza")).toBe("rilevata");
    expect(origineMisura(locali[1], "altezza")).toBe("stimata");
    expect(generazione.avvisi.join(" ")).toMatch(/Una stanza non aveva la superficie/);
    expect(controllaGenerata(p)).toEqual([]);
  });

  it("legge unità e ingombro del DXF senza toccare i disegni", () => {
    const dxf = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "9", "$EXTMIN", "10", "0", "20", "0", "30", "0", "9", "$EXTMAX", "10", "12000", "20", "8000", "30", "0", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES", "0", "ENDSEC", "0", "EOF"].join("\n");
    expect(leggiIntestazioneDxf(dxf)).toEqual({ unita: "mm", estensione: { min: { x: 0, y: 0 }, max: { x: 12000, y: 8000 } } });
    const g = planimetriaConSfondoDxf(dxf, "c/p/rilievo.dxf");
    expect(g.generazione.sfondo_dxf).toMatchObject({ unita: "mm", cm_per_unita: 0.1 });
    expect(validaPlanimetria(g.planimetria).ok).toBe(true);
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
