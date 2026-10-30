import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { PDFDocument, PDFRawStream, PDFArray, PDFRef } from "pdf-lib";
import { controllaPlanimetria, haErrori } from "../../../shared/planimetrie/controllo.ts";
import { validaPlanimetria } from "../../../shared/planimetrie/modello.ts";
import { pavimentoDaFinitura, rotazioneVista, tipoElemento, vistaDaPlanimetria } from "@/lib/planimetrie/esporta/adattatore";
import { allegatoPreventivo, nomeFilePianta } from "@/lib/planimetrie/esporta/allegato";
import { aziendaDelCartiglio, tipoImmagine } from "@/lib/planimetrie/esporta/cartiglio";
import { esportaDxf } from "@/lib/planimetrie/esporta/dxf";
import { codificaCp1252, MotoreDxfR12 } from "@/lib/planimetrie/esporta/dxf/r12";
import { MotoreDxfCadcraft } from "@/lib/planimetrie/esporta/dxf/cadcraft";
import { PIANTA_ESEMPIO } from "@/lib/planimetrie/esporta/esempio";
import { dentro, puntoEtichetta, ritagliaSegmento } from "@/lib/planimetrie/esporta/geometria";
import {
  dimensioniFoglio, ErroreImpaginazione, impagina, MM_IN_PUNTI, passoBarraScala, risolviScala, spazioUtile,
} from "@/lib/planimetrie/esporta/impaginazione";
import { esportaPdf, pianificaPdf, rgb01 } from "@/lib/planimetrie/esporta/pdf";
import { dimensioniPng, LATO_MASSIMO_PX } from "@/lib/planimetrie/esporta/png";
import { allungamenti, costruisciScena, intervalliAperture, pezziMuro } from "@/lib/planimetrie/esporta/scena";
import { esportaSvg } from "@/lib/planimetrie/esporta/svg";
import { texturaPavimento } from "@/lib/planimetrie/esporta/texture";
import type { DatiCartiglio, LocaleVista, VistaPianta } from "@/lib/planimetrie/esporta/tipi";

const cartiglio: DatiCartiglio = {
  azienda: { nome: "Edil Prova S.r.l.", indirizzo: "Via Prova 1, Milano", partitaIva: "01234567890", colore: "#1E6B52" },
  cliente: "Mario Bianchi",
  indirizzoCantiere: "Via Roma 12, Monza",
  data: "2026-10-30",
  versione: "v3",
};

const confronto = () => vistaDaPlanimetria(PIANTA_ESEMPIO, { modo: "confronto" });
const progetto = () => vistaDaPlanimetria(PIANTA_ESEMPIO, { modo: "progetto" });
const fatto = () => vistaDaPlanimetria(PIANTA_ESEMPIO, { modo: "fatto" });

/** Una vista minima: una stanza 4 × 3 m al filo interno, muri da 20. */
function stanza(): VistaPianta {
  const m = (id: string, x1: number, y1: number, x2: number, y2: number) =>
    ({ id, p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, spessore: 20, stato: "esistente" as const });
  return {
    titolo: "Stanza",
    muri: [m("a", 0, 0, 420, 0), m("b", 420, 0, 420, 320), m("c", 420, 320, 0, 320), m("d", 0, 320, 0, 0)],
    aperture: [{ id: "p", muroId: "a", tipo: "porta", distanza: 100, larghezza: 80, stato: "esistente" }],
    locali: [{ id: "l", nome: "Camera", contorno: [{ x: 10, y: 10 }, { x: 410, y: 10 }, { x: 410, y: 310 }, { x: 10, y: 310 }], superficieMq: 12 }],
    elementi: [], quote: [], testi: [],
  };
}

describe("pianta d'esempio e adattatore", () => {
  it("l'esempio è una pianta valida per il modello della fase 1", () => {
    const esito = validaPlanimetria(PIANTA_ESEMPIO);
    expect(esito.ok).toBe(true);
    expect(haErrori(controllaPlanimetria(PIANTA_ESEMPIO))).toBe(false);
  });

  it("gira la y: il nord del modello (y alta) finisce in alto sul foglio (y negativa)", () => {
    const v = fatto();
    const nord = v.muri.find((m) => m.id === "m-nord")!;
    const sud = v.muri.find((m) => m.id === "m-sud")!;
    expect(nord.p1.y).toBeLessThan(sud.p1.y);
  });

  it("confronto: giallo ciò che si demolisce, rosso ciò che si costruisce", () => {
    const v = confronto();
    expect(v.muri.find((m) => m.id === "t-cucina")?.stato).toBe("da_demolire");
    expect(v.muri.find((m) => m.id === "t-lavanderia")?.stato).toBe("nuovo");
    expect(v.aperture.find((a) => a.id === "f-lavanderia")?.stato).toBe("nuovo");
    expect(v.livello).toContain("Stato comparativo");
  });

  it("progetto: niente di ciò che si demolisce, il nuovo disegnato come esistente", () => {
    const v = progetto();
    expect(v.muri.some((m) => m.id === "t-cucina")).toBe(false);
    expect(v.muri.every((m) => m.stato === "esistente")).toBe(true);
    expect(v.aperture.some((a) => a.id === "p-cucina")).toBe(false);
  });

  it("le superfici vengono dalle quantità della fase 1, con la loro origine", () => {
    const v = confronto();
    const soggiorno = v.locali.find((l) => l.id === "l-soggiorno")!;
    expect(soggiorno.superficieMq).toBeCloseTo(5.4 * 7.1, 4);
    expect(soggiorno.perimetroM).toBeCloseTo(2 * (5.4 + 7.1), 4);
    expect(v.locali.find((l) => l.id === "l-lavanderia")?.origine).toBe("stimata");
  });

  it("rotazioni: il modello (antiorario, retro in basso a 0°) come il 3D", () => {
    expect(rotazioneVista(180)).toBe(0);
    expect(rotazioneVista(0)).toBe(180);
    expect(rotazioneVista(90)).toBe(90);
    expect(tipoElemento("cucina_lineare")).toBe("cucina");
    expect(tipoElemento("Letto matrimoniale")).toBe("letto_matrimoniale");
    expect(tipoElemento("pianoforte")).toBe("generico");
    expect(pavimentoDaFinitura("parquet rovere")).toBe("parquet");
    expect(pavimentoDaFinitura("gres porcellanato")).toBe("gres");
    expect(pavimentoDaFinitura("")).toBeUndefined();
  });
});

describe("scena", () => {
  it("un muro si spezza ai vani delle aperture", () => {
    const v = stanza();
    const a = v.muri[0];
    const pezzi = pezziMuro(a, v.muri, v.aperture);
    expect(pezzi).toHaveLength(2);
    expect(pezzi[0].a).toBe(100);
    expect(pezzi[1].da).toBe(180);
    expect(intervalliAperture(a, v.aperture)).toHaveLength(1);
  });

  it("negli angoli i muri si allungano, nelle T si fermano sul filo dell'altro", () => {
    const v = confronto();
    const nord = v.muri.find((m) => m.id === "m-nord")!;
    expect(allungamenti(nord, v.muri)).toEqual([15, 15]);
    const tramezzo = v.muri.find((m) => m.id === "t-zona-notte")!;
    expect(allungamenti(tramezzo, v.muri)).toEqual([-15, -15]);
  });

  it("presentazione: pavimenti con doghe o fughe, tutte dentro il locale", () => {
    const l: LocaleVista = {
      id: "l", nome: "L", destinazione: "soggiorno", pavimento: "parquet",
      contorno: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 200 }, { x: 200, y: 200 }, { x: 200, y: 400 }, { x: 0, y: 400 }],
    };
    const t = texturaPavimento(l);
    expect(t.linee.length).toBeGreaterThan(20);
    for (const [a, b] of t.linee) expect(dentro({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, l.contorno)).toBe(true);
    const scena = costruisciScena(progetto(), { stile: "presentazione", scala: 50 });
    expect(scena.primitive.filter((p) => p.layer === "PAVIMENTI").length).toBeGreaterThan(100);
    expect(costruisciScena(progetto(), { stile: "tecnico", scala: 50 }).primitive.some((p) => p.layer === "PAVIMENTI")).toBe(false);
  });

  it("ritaglia un segmento su una L e mette l'etichetta dentro", () => {
    const L = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 400 }, { x: 0, y: 400 }];
    const pezzi = ritagliaSegmento({ x: -10, y: 50 }, { x: 500, y: 50 }, L);
    expect(pezzi).toHaveLength(1);
    expect(pezzi[0][0].x).toBeCloseTo(0);
    expect(pezzi[0][1].x).toBeCloseTo(400);
    expect(ritagliaSegmento({ x: 50, y: 200 }, { x: 500, y: 200 }, L)[0][1].x).toBeCloseTo(100);
    expect(dentro(puntoEtichetta(L), L)).toBe(true);
  });

  it("le quote automatiche misurano il filo esterno: 9,90 × 7,70", () => {
    const testi = costruisciScena(fatto(), { scala: 50 }).primitive.filter((p) => p.tipo === "testo" && p.layer === "QUOTE");
    const valori = testi.map((t) => (t.tipo === "testo" ? t.testo : ""));
    expect(valori).toContain("9,90");
    expect(valori).toContain("7,70");
    expect(costruisciScena(fatto(), { scala: 50, unitaQuote: "cm" }).primitive.some((p) => p.tipo === "testo" && p.testo === "990")).toBe(true);
  });
});

describe("impaginazione e scala", () => {
  it("dimensioni dei fogli in mm e in punti PDF", () => {
    expect(dimensioniFoglio("A4", "verticale")).toEqual({ larghezza: 210, altezza: 297 });
    expect(dimensioniFoglio("A3", "orizzontale")).toEqual({ larghezza: 420, altezza: 297 });
    expect(420 * MM_IN_PUNTI).toBeCloseTo(1190.55, 2);
    expect(297 * MM_IN_PUNTI).toBeCloseTo(841.89, 2);
  });

  it("scala automatica: la più grande che entra", () => {
    const misura = (s: number) => {
      const r = costruisciScena(fatto(), { scala: s }).riquadro;
      return { larghezzaCm: r.maxX - r.minX, altezzaCm: r.maxY - r.minY };
    };
    expect(risolviScala(misura, "A3", "orizzontale", "auto")).toBe(50);
    expect(risolviScala(misura, "A4", "verticale", "auto")).toBe(100);
    expect(risolviScala(misura, "A3", "orizzontale", 100)).toBe(100);
  });

  it("una scala che non entra dà un errore che dice cosa scegliere", () => {
    const misura = (s: number) => {
      const r = costruisciScena(fatto(), { scala: s }).riquadro;
      return { larghezzaCm: r.maxX - r.minX, altezzaCm: r.maxY - r.minY };
    };
    try {
      risolviScala(misura, "A4", "verticale", 50);
      throw new Error("doveva fallire");
    } catch (e) {
      expect(e).toBeInstanceOf(ErroreImpaginazione);
      const err = e as ErroreImpaginazione;
      expect(err.message).toContain("A3");
      expect(err.message).toContain("1:100");
      expect(err.fogliChestanno.some((f) => f.formato === "A3")).toBe(true);
      expect(err.scalaPossibile).toBe(100);
    }
  });

  it("il disegno sta dentro il suo riquadro, lontano da cartiglio e colonna", () => {
    for (const [f, o] of [["A4", "verticale"], ["A4", "orizzontale"], ["A3", "verticale"], ["A3", "orizzontale"]] as const) {
      const i = impagina(f, o);
      expect(spazioUtile(i).larghezza).toBeGreaterThan(100);
      expect(i.disegno.x + i.disegno.larghezza).toBeLessThanOrEqual(i.laterale.x + (o === "verticale" ? i.laterale.larghezza : 0) + 1e-9);
      expect(i.cartiglio.y + i.cartiglio.altezza).toBeCloseTo(i.cornice.y + i.cornice.altezza);
    }
  });

  it("barra di scala a numeri tondi", () => {
    expect(passoBarraScala(50)).toBe(0.5);
    expect(passoBarraScala(100)).toBe(1);
    expect(passoBarraScala(20)).toBe(0.25);
  });
});

/** Le coppie «x y m» e «x y l» del contenuto della pagina, in punti PDF. */
async function puntiDellaPagina(dati: Uint8Array) {
  const doc = await PDFDocument.load(dati);
  const page = doc.getPage(0);
  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray() : [contents];
  let testo = "";
  for (const s of streams) {
    const stream = (s instanceof PDFRef ? doc.context.lookup(s) : s) as PDFRawStream;
    const grezzo = stream.getContents();
    let decodificato: Buffer;
    try { decodificato = inflateSync(grezzo); } catch { decodificato = Buffer.from(grezzo); }
    testo += decodificato.toString("latin1") + "\n";
  }
  const punti: { x: number; y: number }[] = [];
  for (const m of testo.matchAll(/(-?[\d.]+) (-?[\d.]+) [ml]\b/g)) punti.push({ x: Number(m[1]), y: Number(m[2]) });
  return { doc, page, punti };
}

describe("PDF in scala", () => {
  it("A3 orizzontale 1:50: un metro della pianta sono 20 mm sul foglio", () => {
    const piano = pianificaPdf(confronto(), { formato: "A3", orientamento: "orizzontale", scala: 50 });
    const a = piano.inFoglio({ x: 0, y: 0 }), b = piano.inFoglio({ x: 960, y: 0 });
    expect(b.x - a.x).toBeCloseTo(192, 9);
    expect(piano.scala).toBe(50);
  });

  it("il PDF ha la pagina giusta e i muri esattamente dove dice la scala", async () => {
    const vista = confronto();
    const pdf = await esportaPdf(vista, cartiglio, { formato: "A3", orientamento: "orizzontale", scala: 50 });
    const { page, punti } = await puntiDellaPagina(pdf.dati);
    expect(page.getWidth()).toBeCloseTo(1190.55, 1);
    expect(page.getHeight()).toBeCloseTo(841.89, 1);
    expect(pdf.scala).toBe(50);
    // Gli spigoli esterni del muro nord: (-15, -755) e (975, -755) nella vista (y in basso)
    const piano = pianificaPdf(vista, { formato: "A3", orientamento: "orizzontale", scala: 50 });
    const inPunti = (p: { x: number; y: number }) => {
      const f = piano.inFoglio(p);
      return { x: f.x * MM_IN_PUNTI, y: page.getHeight() - f.y * MM_IN_PUNTI };
    };
    const vicino = (q: { x: number; y: number }) => punti.some((p) => Math.abs(p.x - q.x) < 0.01 && Math.abs(p.y - q.y) < 0.01);
    const sx = inPunti({ x: -15, y: -755 }), dx = inPunti({ x: 975, y: -755 });
    expect(vicino(sx)).toBe(true);
    expect(vicino(dx)).toBe(true);
    // 9,90 m a 1:50 = 198 mm = 561,26 punti
    expect(dx.x - sx.x).toBeCloseTo((198 * 72) / 25.4, 6);
  });

  it("A4 verticale con scala automatica, e l'allegato per il preventivo", async () => {
    const pdf = await esportaPdf(fatto(), cartiglio, { formato: "A4", orientamento: "verticale", scala: "auto" });
    expect(pdf.scala).toBe(100);
    expect(pdf.larghezzaPt).toBeCloseTo(595.28, 1);
    const allegato = await allegatoPreventivo(progetto(), cartiglio);
    expect(allegato.tipo).toBe("application/pdf");
    expect(allegato.nomeFile).toBe("pianta-appartamento-via-roma-12-v3-1-100.pdf");
    expect(new TextDecoder().decode(allegato.dati.slice(0, 5))).toBe("%PDF-");
    expect(nomeFilePianta(progetto(), undefined, 50)).toBe("pianta-appartamento-via-roma-12-1-50.pdf");
  });

  it("presentazione in PDF, con un logo PNG nel cartiglio", async () => {
    // Un PNG 1×1 rosso
    const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64"));
    expect(tipoImmagine(png)).toBe("png");
    const pdf = await esportaPdf(progetto(), { ...cartiglio, azienda: { ...cartiglio.azienda, logo: { dati: png, tipo: "png" } } }, {
      formato: "A3", orientamento: "orizzontale", scala: 50, stile: "presentazione",
    });
    expect(pdf.dati.length).toBeGreaterThan(10_000);
  });

  it("colori: esadecimali e rgba mescolato col bianco", () => {
    expect(rgb01("#FF0000")).toEqual({ r: 1, g: 0, b: 0 });
    const c = rgb01("rgba(0,0,0,0.5)");
    expect(c.r).toBeCloseTo(0.5);
  });

  it("dati dell'azienda dalle colonne di companies e company_branding", () => {
    const a = aziendaDelCartiglio(
      { name: "Edil Rossi", legal_address: "Via dei Mille 8", legal_postal_code: "20121", legal_city: "Milano", legal_province: "MI", vat_number: "0123" },
      { primary_color: "#112233" },
    );
    expect(a.indirizzo).toBe("Via dei Mille 8, 20121 Milano (MI)");
    expect(a.colore).toBe("#112233");
    expect(aziendaDelCartiglio({}).nome).toBe("Impresa");
  });
});

/** Le entità di un DXF R12 per layer, lette con un parser a coppie codice/valore. */
function entitaPerLayer(dxf: Uint8Array): Record<string, number> {
  const righe = new TextDecoder("latin1").decode(dxf).split(/\r?\n/);
  const conti: Record<string, number> = {};
  let inEntita = false, tipo = "";
  for (let i = 0; i + 1 < righe.length; i += 2) {
    const codice = righe[i].trim(), valore = righe[i + 1];
    if (codice === "2" && valore === "ENTITIES") inEntita = true;
    if (!inEntita) continue;
    if (codice === "0") tipo = valore;
    if (codice === "8" && !["VERTEX", "SEQEND"].includes(tipo)) conti[valore] = (conti[valore] ?? 0) + 1;
  }
  return conti;
}

describe("DXF", () => {
  it("un layer per muri, demolizioni, nuovo, aperture, quote, testi, arredi, locali", () => {
    const v = confronto();
    const dxf = esportaDxf(v, { scala: 50 });
    const conti = entitaPerLayer(dxf.dati);
    expect(conti).toEqual(dxf.conteggio);
    expect(Object.keys(conti).sort()).toEqual(["APERTURE", "ARREDI", "DEMOLIZIONI", "LOCALI", "MURI", "NUOVO", "QUOTE", "TESTI"]);

    // Muri esistenti: ogni pezzo pieno è una polilinea chiusa più un pieno (SOLID)
    const pezzi = (stato: string) => v.muri.filter((m) => m.stato === stato).reduce((s, m) => s + pezziMuro(m, v.muri, v.aperture).length, 0);
    const vaniNuoviInMuriEsistenti = v.aperture.filter((a) => a.stato === "nuovo" && v.muri.find((m) => m.id === a.muroId)?.stato === "esistente").length;
    expect(conti.MURI).toBe(2 * pezzi("esistente"));
    // Giallo: il tramezzo che si demolisce (spezzato dalla sua porta) e i vani delle aperture nuove
    expect(conti.DEMOLIZIONI).toBe(2 * (pezzi("da_demolire") + vaniNuoviInMuriEsistenti));
    expect(conti.NUOVO).toBe(2 * pezzi("nuovo"));
    expect(conti.LOCALI).toBe(v.locali.length);
    // Nome, superficie, altezza per locale, più la riga con unità e scala
    expect(conti.TESTI).toBe(3 * v.locali.length + 1);
    expect(conti.ARREDI).toBeGreaterThan(v.elementi.length);
  });

  it("y verso l'alto e misure vere in cm: il muro nord sta a y = +755", () => {
    const testo = new TextDecoder("latin1").decode(esportaDxf(fatto()).dati);
    expect(testo).toContain("AC1009");
    expect(testo).toMatch(/\r\n 20\r\n755\.0\r\n/);
    const m = esportaDxf(fatto(), { unita: "m" });
    expect(new TextDecoder("latin1").decode(m.dati)).toMatch(/\r\n 20\r\n7\.55\r\n/);
  });

  it("i testi vanno in Windows-1252, il resto come \\U+XXXX", () => {
    expect(Array.from(codificaCp1252("m²"))).toEqual([0x6d, 0xb2]);
    expect(Array.from(codificaCp1252("€"))).toEqual([0x80]);
    expect(new TextDecoder().decode(codificaCp1252("→"))).toBe("\\U+2192");
  });

  it("un motore diverso si passa da fuori: stesse entità, file suo", () => {
    let json = "";
    const finto = (unita: "cm" | "m" | "mm") => new MotoreDxfCadcraft((j) => { json = j; return "0\nEOF\n"; }, unita === "cm" ? 5 : 6);
    const r12 = esportaDxf(confronto());
    const altro = esportaDxf(confronto(), { motore: finto });
    expect(altro.motore).toBe("cadcraft-wasm");
    expect(altro.conteggio).toEqual(r12.conteggio);
    const disegno = JSON.parse(json);
    expect(disegno.unita).toBe(5);
    expect(disegno.layer.map((l: { nome: string }) => l.nome)).toContain("DEMOLIZIONI");
    expect(disegno.entita.filter((e: { tipo: string }) => e.tipo === "pieno").length).toBe(r12.conteggio.MURI / 2 + r12.conteggio.DEMOLIZIONI / 2 + r12.conteggio.NUOVO / 2);
  });

  it("il motore R12 conta le entità che scrive", () => {
    const m = new MotoreDxfR12();
    m.layer({ nome: "MURI", colore: 7 });
    m.linea("MURI", { x: 0, y: 0 }, { x: 1, y: 0 });
    m.pieno("MURI", [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]);
    m.testo("TESTI", { x: 0, y: 0 }, "Bagno", 10, { orizzontale: "centro", verticale: "centro" });
    expect(m.conteggio()).toEqual({ MURI: 2, TESTI: 1 });
    expect(entitaPerLayer(m.chiudi())).toEqual({ MURI: 2, TESTI: 1 });
  });
});

describe("SVG e PNG", () => {
  it("SVG in scala: larghezza in mm, metà a 1:100 rispetto a 1:50 (a parte i margini fissi)", () => {
    const a = esportaSvg(fatto(), { scala: 50, quoteAutomatiche: false, etichetteLocali: false, margineMm: 0 });
    const b = esportaSvg(fatto(), { scala: 100, quoteAutomatiche: false, etichetteLocali: false, margineMm: 0 });
    expect(a.larghezzaMm).toBeCloseTo(198, 6);
    expect(b.larghezzaMm).toBeCloseTo(99, 6);
    expect(a.svg).toContain('width="198mm"');
    expect(a.svg).toContain('<g id="muri">');
  });

  it("sfondo bianco o trasparente", () => {
    expect(esportaSvg(fatto(), { sfondo: "bianco" }).svg).toMatch(/<\/title>\n<rect [^>]*fill="#FFFFFF"\/>/);
    expect(esportaSvg(fatto(), { sfondo: "trasparente" }).svg).not.toMatch(/<\/title>\n<rect/);
  });

  it("PNG: dimensioni dai dpi, sotto il lato massimo dei browser", () => {
    expect(dimensioniPng(254, 127, 300)).toMatchObject({ larghezzaPx: 3000, altezzaPx: 1500, dpi: 300 });
    const grande = dimensioniPng(2000, 1000, 600);
    expect(grande.larghezzaPx).toBeLessThanOrEqual(LATO_MASSIMO_PX);
    expect(grande.dpi).toBeLessThan(600);
  });
});
