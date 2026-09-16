import { describe, expect, it } from "vitest";
import {
  cartellaDocumentiCliente,
  cartellaSuggerita,
  cartelleMancanti,
  contaPerCartella,
  corrispondeRicerca,
  percorsoDocumento,
  problemaFile,
  type CartellaDocumenti,
} from "@/lib/commesse/documentiCommessa";

const c = (id: string, nome: string, extra: Partial<CartellaDocumenti> = {}): CartellaDocumenti => ({
  id, nome, company_id: "az", posizione: 0, visibile_cliente: false, obbligatoria: false, archiviata_at: null, ...extra,
});

const greenEnergy = [
  c("contratti", "Contratti + Doc. cliente + Reddito + Bollette"),
  c("arch", "Doc. architettonici"),
  c("catasto", "Doc. catastali e visure"),
  c("enel", "Enel I-II-GSE"),
  c("fatture", "Fatture e pagamenti"),
  c("fotoftv", "Foto installazione + Dico Ftv"),
  c("mail", "Mail comunicazioni cliente"),
  c("pos", "Posizionamento"),
  c("pratica", "Pratica edilizia"),
  c("prev", "Preventivi"),
  c("schede", "Schede tecniche"),
  c("sopr", "Sopralluogo"),
  c("studio", "Studio Tecnico"),
  c("varie", "Varie documenti cliente"),
];
const base = ["Contratti", "Documenti cliente", "Preventivi", "Foto", "Fatture e pagamenti", "Pratiche", "Varie"]
  .map((n) => c(n.toLowerCase(), n));

describe("cartella proposta dal nome del file", () => {
  it("Green Energy", () => {
    expect(cartellaSuggerita("Visura_catastale_Rossi.pdf", greenEnergy)).toBe("catasto");
    expect(cartellaSuggerita("fattura 123-2026.pdf", greenEnergy)).toBe("fatture");
    expect(cartellaSuggerita("Bonifico acconto.pdf", greenEnergy)).toBe("fatture");
    expect(cartellaSuggerita("TICA_E-Distribuzione.pdf", greenEnergy)).toBe("enel");
    expect(cartellaSuggerita("Bolletta luce.pdf", greenEnergy)).toBe("contratti");
    expect(cartellaSuggerita("Planimetria piano terra.dwg", greenEnergy)).toBe("arch");
    expect(cartellaSuggerita("CILA protocollata.pdf", greenEnergy)).toBe("pratica");
    expect(cartellaSuggerita("datasheet inverter.pdf", greenEnergy)).toBe("schede");
    expect(cartellaSuggerita("sopralluogo_rossi.pdf", greenEnergy)).toBe("sopr");
    expect(cartellaSuggerita("IMG_4412.HEIC", greenEnergy)).toBe("fotoftv");
    expect(cartellaSuggerita("Re conferma.eml", greenEnergy)).toBe("mail");
    expect(cartellaSuggerita("Carta identità.jpg", greenEnergy)).toBe("contratti");
  });

  it("gruppo base", () => {
    expect(cartellaSuggerita("Contratto firmato.pdf", base)).toBe("contratti");
    expect(cartellaSuggerita("carta identità.jpg", base)).toBe("documenti cliente");
    expect(cartellaSuggerita("foto tetto.jpg", base)).toBe("foto");
    expect(cartellaSuggerita("CILA.pdf", base)).toBe("pratiche");
  });

  it("senza indizi: la cartella aperta, altrimenti «Varie»", () => {
    expect(cartellaSuggerita("scansione 0001.pdf", base, "preventivi")).toBe("preventivi");
    expect(cartellaSuggerita("scansione 0001.pdf", base)).toBe("varie");
    expect(cartellaSuggerita("scansione 0001.pdf", [...greenEnergy, c("fotovarie", "Foto installazione + Dico Varie")])).toBe("varie");
    expect(cartellaSuggerita("scansione 0001.pdf", [c("x", "Contratti")])).toBeNull();
    expect(cartellaSuggerita("x.pdf", [])).toBeNull();
    expect(cartellaSuggerita("fattura.pdf", [c("f", "Fatture", { archiviata_at: "2026-01-01" })])).toBeNull();
  });
});

describe("regole sui file", () => {
  it("formati e peso", () => {
    expect(problemaFile({ name: "a.PDF", size: 10 })).toBeNull();
    expect(problemaFile({ name: "foto.heic", size: 10 })).toBeNull();
    expect(problemaFile({ name: "contratto.pdf.p7m", size: 10 })).toBeNull();
    expect(problemaFile({ name: "virus.exe", size: 10 })).toMatch(/formato/);
    expect(problemaFile({ name: "grande.pdf", size: 51 * 1024 * 1024 })).toMatch(/50 MB/);
    expect(problemaFile({ name: "vuoto.pdf", size: 0 })).toMatch(/vuoto/);
  });

  it("percorso con prefisso della commessa e nome pulito", () => {
    expect(percorsoDocumento("ord1", "Visura però (1).pdf", 5, 0.5)).toBe("orders/ord1/5-500000-Visura_pero__1_.pdf");
  });
});

describe("cartelle obbligatorie, conteggi, ricerca", () => {
  it("mancano solo le obbligatorie vuote", () => {
    const cartelle = [c("a", "A", { obbligatoria: true }), c("b", "B", { obbligatoria: true }), c("x", "X")];
    expect(cartelleMancanti(cartelle, [{ folder_id: "a" }]).map((m) => m.id)).toEqual(["b"]);
  });
  it("conta", () => {
    expect(contaPerCartella([{ folder_id: "a" }, { folder_id: "a" }, { folder_id: null }])).toEqual({ a: 2, "": 1 });
  });
  it("ricerca su nome e cartella, senza accenti", () => {
    expect(corrispondeRicerca("Visura Rossi.pdf", "Doc. catastali", "rossi catastali")).toBe(true);
    expect(corrispondeRicerca("Pratica.pdf", "Varie", "citta")).toBe(false);
    expect(corrispondeRicerca("Città.pdf", "Varie", "citta")).toBe(true);
  });
});

import { dimensioniRidotte, fotoDaRidurre } from "@/lib/commesse/riduciFoto";
import { pdfDaValutare, scalaRender } from "@/lib/commesse/riduciPdf";

describe("riduzione foto", () => {
  it("JPEG/WebP/PNG pesanti, HEIC sempre (per renderle visibili)", () => {
    const mb = 1024 * 1024;
    expect(fotoDaRidurre({ name: "a.jpg", type: "image/jpeg", size: 4 * mb })).toBe(true);
    expect(fotoDaRidurre({ name: "a.jpg", type: "image/jpeg", size: 0.5 * mb })).toBe(false);
    expect(fotoDaRidurre({ name: "a.heic", type: "image/heic", size: 0.4 * mb })).toBe(true);
    expect(fotoDaRidurre({ name: "IMG_1.HEIC", type: "", size: 2 * mb })).toBe(true);
    expect(fotoDaRidurre({ name: "a.pdf", type: "application/pdf", size: 9 * mb })).toBe(false);
    expect(fotoDaRidurre({ name: "a.png", type: "image/png", size: 9 * mb })).toBe(true);
    expect(fotoDaRidurre({ name: "a.png", type: "image/png", size: 0.3 * mb })).toBe(false);
  });
  it("PDF da valutare e scala di render a 150 dpi, massimo 2000 px", () => {
    const mb = 1024 * 1024;
    expect(pdfDaValutare({ name: "scan.pdf", type: "application/pdf", size: 3 * mb })).toBe(true);
    expect(pdfDaValutare({ name: "piccolo.pdf", type: "application/pdf", size: 0.5 * mb })).toBe(false);
    expect(pdfDaValutare({ name: "enorme.pdf", type: "application/pdf", size: 45 * mb })).toBe(false);
    expect(pdfDaValutare({ name: "foto.jpg", type: "image/jpeg", size: 3 * mb })).toBe(false);
    // A4 = 595×842 pt → 150 dpi = 1240×1754 px
    expect(Math.round(842 * scalaRender(595, 842))).toBe(1754);
    // A1 enorme: il lato lungo si ferma a 2000 px
    expect(Math.round(2384 * scalaRender(1684, 2384))).toBe(2000);
  });
  it("proporzioni", () => {
    expect(dimensioniRidotte(4032, 3024)).toEqual({ w: 2560, h: 1920 });
    expect(dimensioniRidotte(3024, 4032)).toEqual({ w: 1920, h: 2560 });
    expect(dimensioniRidotte(1600, 1200)).toEqual({ w: 1600, h: 1200 });
  });
});

import { aggiungiFileCliente, contaFileDocumentiCliente, percorsoDocumentoCliente, togliFileCliente } from "@/lib/clienti/documentiCliente";

describe("documenti personali del cliente", () => {
  it("nella commessa vanno nella cartella documenti cliente", () => {
    expect(cartellaDocumentiCliente(greenEnergy)).toBe("contratti");
    expect(cartellaDocumentiCliente(base)).toBe("documenti cliente");
    expect(cartellaDocumentiCliente([c("v", "Varie")])).toBe("v");
    expect(cartellaDocumentiCliente([])).toBeNull();
  });
  it("più file per tipo, niente doppioni, formati controllati", () => {
    const fronte = new File(["a"], "ci fronte.png", { type: "image/png" });
    const retro = new File(["bb"], "ci retro.png", { type: "image/png" });
    let { valore, scartati } = aggiungiFileCliente({}, "identity", [fronte, retro, fronte]);
    expect(valore.identity?.map((f) => f.name)).toEqual(["ci fronte.png", "ci retro.png"]);
    expect(scartati).toEqual([]);
    ({ valore, scartati } = aggiungiFileCliente(valore, "fiscal_code", [new File(["x"], "virus.exe")]));
    expect(scartati.length).toBe(1);
    expect(contaFileDocumentiCliente(valore)).toBe(2);
    expect(togliFileCliente(valore, "identity", 0).identity?.map((f) => f.name)).toEqual(["ci retro.png"]);
  });
  it("percorso con azienda davanti (lo richiede lo storage)", () => {
    expect(percorsoDocumentoCliente("az", "cl", "identity", "Carta identità.png", 7, 0.25)).toBe("az/cl/identity/7-250000-Carta_identita.png");
  });
});
