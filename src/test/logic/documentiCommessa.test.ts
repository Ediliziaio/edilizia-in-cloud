import { describe, expect, it } from "vitest";
import {
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

describe("riduzione foto", () => {
  it("solo JPEG/WebP pesanti", () => {
    const mb = 1024 * 1024;
    expect(fotoDaRidurre({ name: "a.jpg", type: "image/jpeg", size: 4 * mb })).toBe(true);
    expect(fotoDaRidurre({ name: "a.jpg", type: "image/jpeg", size: 0.5 * mb })).toBe(false);
    expect(fotoDaRidurre({ name: "a.heic", type: "image/heic", size: 4 * mb })).toBe(false);
    expect(fotoDaRidurre({ name: "a.pdf", type: "application/pdf", size: 9 * mb })).toBe(false);
    expect(fotoDaRidurre({ name: "a.png", type: "image/png", size: 9 * mb })).toBe(false);
  });
  it("proporzioni", () => {
    expect(dimensioniRidotte(4032, 3024)).toEqual({ w: 2560, h: 1920 });
    expect(dimensioniRidotte(3024, 4032)).toEqual({ w: 1920, h: 2560 });
    expect(dimensioniRidotte(1600, 1200)).toEqual({ w: 1600, h: 1200 });
  });
});
