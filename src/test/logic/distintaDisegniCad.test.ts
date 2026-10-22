import { describe, expect, it } from "vitest";
import { LettoreDxf, leggiDxf, lunghezzaTratto, nomeVersione, pulisciMtext, riconosciFormato } from "@/lib/distinta/cad/leggiDxf";
import {
  SENZA_LOCALE, chiaveCerchio, contaSimboli, localeDi, lunghezzePerLayer, metriPerUnita, misuraLunghezze, trovaLocali,
} from "@/lib/distinta/cad/contaDisegno";
import { righeConteggio, scelteIniziali, suggerisciSimbolo, vociDaSalvare } from "@/lib/distinta/cad/mappaBlocchi";

// Disegno SINTETICO costruito qui: due stanze inventate (Cucina 4×3 m e
// Bagno 2×3 m, in millimetri), prese, luci, un rivelatore come blocco
// dinamico (nome anonimo *U7), un corrugato, cerchi sciolti come nei disegni
// importati da PDF. I conteggi attesi sono noti per costruzione.

const coppie = (...v: (string | number)[]) => {
  const righe: string[] = [];
  for (let i = 0; i < v.length; i += 2) righe.push(String(v[i]).padStart(3, " "), String(v[i + 1]));
  return righe;
};
const insert = (nome: string, layer: string, x: number, y: number, extra: (string | number)[] = []) =>
  coppie(0, "INSERT", 5, "1F", 8, layer, 100, "AcDbBlockReference", 2, nome, 10, x, 20, y, 30, 0, ...extra);
const rettangolo = (layer: string, x: number, y: number, w: number, h: number) =>
  coppie(0, "LWPOLYLINE", 8, layer, 90, 4, 70, 1, 10, x, 20, y, 10, x + w, 20, y, 10, x + w, 20, y + h, 10, x, 20, y + h);

function disegnoSintetico(): string {
  return [
    ...coppie(999, "disegno sintetico per i test"),
    ...coppie(0, "SECTION", 2, "HEADER", 9, "$ACADVER", 1, "AC1032", 9, "$DIMSTYLE", 2, "Standard", 9, "$INSUNITS", 70, 4, 0, "ENDSEC"),
    ...coppie(0, "SECTION", 2, "TABLES"),
    ...coppie(0, "TABLE", 2, "LAYER", 70, 3),
    ...coppie(0, "LAYER", 2, "A-LOCALI", 70, 0), ...coppie(0, "LAYER", 2, "E-PRESE", 70, 0), ...coppie(0, "LAYER", 2, "E-CORRUGATI", 70, 0),
    ...coppie(0, "ENDTAB"),
    ...coppie(0, "TABLE", 2, "BLOCK_RECORD", 70, 2),
    ...coppie(0, "BLOCK_RECORD", 5, "A1", 100, "AcDbBlockTableRecord", 2, "RIVELATORE_FUMO"),
    ...coppie(0, "BLOCK_RECORD", 5, "B2", 100, "AcDbBlockTableRecord", 2, "*U7", 1001, "AcDbBlockRepBTag", 1070, 1, 1005, "A1"),
    ...coppie(0, "ENDTAB", 0, "ENDSEC"),
    ...coppie(0, "SECTION", 2, "BLOCKS", 0, "BLOCK", 8, "0", 2, "PRESA_10A", 10, 0, 20, 0, 0, "CIRCLE", 8, "0", 10, 0, 20, 0, 40, 50, 0, "ENDBLK", 0, "ENDSEC"),
    ...coppie(0, "SECTION", 2, "ENTITIES"),
    // Stanze e nomi.
    ...rettangolo("A-LOCALI", 0, 0, 4000, 3000),
    ...rettangolo("A-LOCALI", 4000, 0, 2000, 3000),
    ...coppie(0, "TEXT", 8, "A-TESTI", 10, 1500, 20, 1500, 40, 200, 1, "Cucina"),
    ...coppie(0, "MTEXT", 8, "A-TESTI", 10, 4800, 20, 1500, 40, 200, 1, "{\\fArial|b1;Bagno}"),
    ...coppie(0, "MTEXT", 8, "A-TESTI", 10, 4800, 20, 1100, 40, 100, 1, "3,5 m\\P²"),
    // Prese: 3 in cucina, 1 in bagno; una con attributi al seguito.
    ...insert("PRESA_10A", "E-PRESE", 500, 200),
    ...insert("PRESA_10A", "E-PRESE", 1500, 200),
    ...insert("presa_10a", "E-PRESE", 3500, 2800, [66, 1]),
    ...coppie(0, "ATTRIB", 8, "E-PRESE", 10, 3500, 20, 2800, 1, "H=30", 2, "ALTEZZA", 0, "SEQEND"),
    ...insert("PRESA_10A", "E-PRESE", 4500, 200),
    // Luci: una matrice 2×2 in cucina (MINSERT) = 4 pezzi.
    ...insert("PLAFONIERA_LED", "E-LUCI", 1000, 1000, [70, 2, 71, 2, 44, 500, 45, 500]),
    // Rivelatore come blocco dinamico, in bagno.
    ...insert("*U7", "E-RIV", 5000, 2500),
    // Nello spazio carta (cartiglio): non si conta.
    ...insert("PRESA_10A", "E-PRESE", 100, 100, [67, 1]),
    // Corrugato: 4 m dritti in cucina + un arco di mezzo giro (bulge 1) di corda 2 m in bagno.
    ...coppie(0, "LINE", 8, "E-CORRUGATI", 10, 0, 20, 500, 11, 4000, 21, 500),
    ...coppie(0, "LWPOLYLINE", 8, "E-CORRUGATI", 90, 2, 70, 0, 10, 4000, 20, 2000, 42, 1, 10, 6000, 20, 2000),
    // Polilinea vecchio stile: 1 m in cucina.
    ...coppie(0, "POLYLINE", 8, "E-CORRUGATI", 66, 1, 70, 0, 10, 0, 20, 0,
      0, "VERTEX", 8, "E-CORRUGATI", 10, 100, 20, 2500, 0, "VERTEX", 8, "E-CORRUGATI", 10, 1100, 20, 2500, 0, "SEQEND"),
    // Cerchi sciolti: 3 piccoli in cucina, 1 grande.
    ...coppie(0, "CIRCLE", 8, "PDF_Disegno", 10, 300, 20, 300, 40, 25),
    ...coppie(0, "CIRCLE", 8, "PDF_Disegno", 10, 600, 20, 300, 40, 25),
    ...coppie(0, "CIRCLE", 8, "PDF_Disegno", 10, 900, 20, 300, 40, 25),
    ...coppie(0, "CIRCLE", 8, "PDF_Disegno", 10, 900, 20, 900, 40, 100),
    ...coppie(0, "ENDSEC", 0, "EOF"),
  ].join("\r\n");
}

describe("lettura del DXF", () => {
  const d = leggiDxf(disegnoSintetico());

  it("versione, unità e layer", () => {
    expect(d.versione).toBe("AC1032");
    expect(nomeVersione(d.versione)).toBe("AutoCAD 2018");
    expect(d.insunits).toBe(4);
    expect(metriPerUnita(d.insunits)).toBe(0.001);
    expect(d.layer).toEqual(expect.arrayContaining(["A-LOCALI", "E-PRESE", "E-CORRUGATI", "E-LUCI", "E-RIV"]));
  });

  it("blocchi: lo spazio carta escluso, la matrice vale righe × colonne, il blocco dinamico torna al suo nome", () => {
    expect(d.blocchi).toHaveLength(6);
    expect(d.blocchi.find((b) => b.nome === "PLAFONIERA_LED")?.n).toBe(4);
    expect(d.blocchi.some((b) => b.nome === "RIVELATORE_FUMO")).toBe(true);
    expect(d.blocchi.some((b) => b.nome.startsWith("*"))).toBe(false);
  });

  it("testi senza i codici di formato", () => {
    expect(d.testi.map((t) => t.s)).toEqual(["Cucina", "Bagno", "3,5 m ²"]);
    expect(pulisciMtext("\\A1;{\\C1;Locale\\Ptecnico}")).toBe("Locale tecnico");
  });

  it("a pezzi piccoli si legge uguale (il worker legge il file a blocchi)", () => {
    const testo = disegnoSintetico();
    const l = new LettoreDxf();
    for (let i = 0; i < testo.length; i += 7) l.aggiungi(testo.slice(i, i + 7));
    expect(l.fine()).toEqual(d);
  });

  it("riconosce il DWG e il DXF binario dai primi byte", () => {
    const b = (s: string) => new TextEncoder().encode(s);
    expect(riconosciFormato(b("AC1032\0\0\0\0\0"))).toBe("dwg");
    expect(riconosciFormato(b("AutoCAD Binary DXF\r\n\x1a\0"))).toBe("dxf_binario");
    expect(riconosciFormato(b("  0\r\nSECTION\r\n  2\r\nHEADER"))).toBe("dxf");
    expect(riconosciFormato(b("%PDF-1.7"))).toBe("sconosciuto");
  });
});

describe("conteggio dei simboli per locale", () => {
  const d = leggiDxf(disegnoSintetico());

  it("con le stanze disegnate: ogni simbolo nella stanza che lo contiene", () => {
    const locali = trovaLocali(d, { layerLocali: ["A-LOCALI"] });
    expect(locali.stanze.map((s) => s.nome).sort()).toEqual(["Bagno", "Cucina"]);
    const s = contaSimboli(d, locali);
    const prese = s.find((x) => x.chiave === "PRESA_10A");
    expect(prese?.quantita).toBe(4);
    expect(prese?.perLocale).toEqual({ Cucina: 3, Bagno: 1 });
    expect(s.find((x) => x.chiave === "PLAFONIERA_LED")?.perLocale).toEqual({ Cucina: 4 });
    expect(s.find((x) => x.chiave === "RIVELATORE_FUMO")?.perLocale).toEqual({ Bagno: 1 });
  });

  it("senza stanze: il nome del locale scritto più vicino", () => {
    const locali = trovaLocali(d);
    expect(locali.modo).toBe("testo_vicino");
    expect(localeDi(4500, 200, locali)).toBe("Bagno");
    expect(localeDi(500, 200, locali)).toBe("Cucina");
    expect(localeDi(900_000, 900_000, locali)).toBe(SENZA_LOCALE);
  });

  it("i cerchi sciolti si contano solo se richiesto, per layer e diametro", () => {
    const locali = trovaLocali(d, { layerLocali: ["A-LOCALI"] });
    expect(contaSimboli(d, locali).some((x) => x.tipo === "cerchio")).toBe(false);
    const s = contaSimboli(d, locali, { cerchi: true });
    expect(s.find((x) => x.chiave === chiaveCerchio("PDF_Disegno", 25))?.quantita).toBe(3);
    expect(s.find((x) => x.chiave === chiaveCerchio("PDF_Disegno", 100))?.quantita).toBe(1);
  });
});

describe("lunghezze per layer, in metri", () => {
  const d = leggiDxf(disegnoSintetico());
  const arco = lunghezzaTratto(4000, 2000, 6000, 2000, 1); // mezza circonferenza di raggio 1000 mm

  it("l'arco di una polilinea si misura sull'arco, non sulla corda", () => {
    expect(arco).toBeCloseTo(Math.PI * 1000, 6);
  });

  it("somma per layer e per locale, convertita dalle unità del disegno; la maggiorazione si aggiunge", () => {
    expect(lunghezzePerLayer(d)[0].layer).toBe("A-LOCALI");
    const locali = trovaLocali(d, { layerLocali: ["A-LOCALI"] });
    const [c] = misuraLunghezze(d, ["E-CORRUGATI"], locali, { metri: 0.001 });
    expect(c.disegnata).toBeCloseTo(4 + 1 + Math.PI, 2);
    expect(c.perLocale.Cucina).toBeCloseTo(5, 2);
    expect(c.perLocale.Bagno).toBeCloseTo(Math.PI, 2);
    const [m] = misuraLunghezze(d, ["E-CORRUGATI"], locali, { metri: 0.001, maggiorazionePct: 10 });
    expect(m.totale).toBeCloseTo((4 + 1 + Math.PI) * 1.1, 2);
    expect(m.disegnata).toBeCloseTo(c.disegnata, 2);
  });

  it("unità e scala: un disegno in centimetri, o una tavola in scala 1:200", () => {
    expect(metriPerUnita(5)).toBe(0.01);
    expect(metriPerUnita(0)).toBeNull();
    const locali = trovaLocali(d);
    const [c] = misuraLunghezze(d, ["E-CORRUGATI"], locali, { metri: 0.001 * 200 });
    expect(c.disegnata).toBeCloseTo((4 + 1 + Math.PI) * 200, 1);
  });
});

describe("mappa blocco → simbolo dell'azienda", () => {
  const d = leggiDxf(disegnoSintetico());
  const locali = trovaLocali(d, { layerLocali: ["A-LOCALI"] });
  const simboli = contaSimboli(d, locali);

  it("suggerimento dal nome del blocco", () => {
    expect(suggerisciSimbolo("PRESA_10A")).toEqual({ simbolo: "Punto presa 10A", ignora: false });
    expect(suggerisciSimbolo("PLAFONIERA_LED")?.simbolo).toBe("Punto luce");
    expect(suggerisciSimbolo("RIVELATORE_FUMO")?.simbolo).toBe("Rilevatore fumo");
    expect(suggerisciSimbolo("CARTIGLIO_A1")?.ignora).toBe(true);
    expect(suggerisciSimbolo("XYZ123")).toBeNull();
  });

  it("la scelta salvata vince sul suggerimento; le righe sommano blocchi con lo stesso simbolo", () => {
    const scelte = scelteIniziali(simboli, [
      { nome_blocco: "presa_10a", simbolo: "Punto presa 10/16A", descrizione: "Presa bipasso", scomposizione_id: "s-1", ignora: false },
    ]);
    expect(scelte.PRESA_10A).toMatchObject({ simbolo: "Punto presa 10/16A", origine: "mappa", scomposizione_id: "s-1" });
    expect(scelte.PLAFONIERA_LED).toMatchObject({ simbolo: "Punto luce", origine: "suggerito" });
    // Anche il rivelatore diventa «Punto presa 10/16A» per prova: si somma.
    scelte.RIVELATORE_FUMO = { ...scelte.PRESA_10A, chiave: "RIVELATORE_FUMO" };
    const [corrugato] = misuraLunghezze(d, ["E-CORRUGATI"], locali, { metri: 0.001 });
    const righe = righeConteggio(simboli, scelte, [corrugato], { "E-CORRUGATI": "Corrugato Ø20" }, { file: "prova.dxf" });
    const prese = righe.filter((r) => r.simbolo === "Punto presa 10/16A");
    expect(prese.find((r) => r.locale === "Bagno")?.quantita).toBe(2);
    expect(prese.find((r) => r.locale === "Bagno")?.dettaglio.blocchi).toEqual(["PRESA_10A", "RIVELATORE_FUMO"]);
    expect(prese.every((r) => r.unita === "pz" && r.scomposizione_id === "s-1")).toBe(true);
    const metri = righe.filter((r) => r.unita === "m");
    expect(metri.map((r) => r.simbolo)).toEqual(["Corrugato Ø20", "Corrugato Ø20"]);
    expect(metri.reduce((a, r) => a + r.quantita, 0)).toBeCloseTo(4 + 1 + Math.PI, 1);
  });

  it("si salvano solo le scelte con un simbolo o da ignorare, col nome in maiuscolo", () => {
    const v = vociDaSalvare([
      { chiave: "PRESA_10A", simbolo: " Punto presa ", descrizione: "", scomposizione_id: null, ignora: false, origine: "suggerito" },
      { chiave: "BOH", simbolo: "", descrizione: null, scomposizione_id: null, ignora: false, origine: "vuoto" },
      { chiave: "CARTIGLIO", simbolo: "", descrizione: null, scomposizione_id: null, ignora: true, origine: "suggerito" },
    ]);
    expect(v).toEqual([
      { nome_blocco: "PRESA_10A", simbolo: "Punto presa", descrizione: null, scomposizione_id: null, ignora: false },
      { nome_blocco: "CARTIGLIO", simbolo: "CARTIGLIO", descrizione: null, scomposizione_id: null, ignora: true },
    ]);
  });
});
