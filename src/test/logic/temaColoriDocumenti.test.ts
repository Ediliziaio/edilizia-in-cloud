import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  COLORE_DI_FABBRICA_MARCHIO, coloreDelDocumento, contrasto, fondoPerTestoBianco, marchioScelto, mescola,
  normalizzaHex, testoSopra, testoSuChiaro, testoSuScuro,
} from "../../../supabase/functions/_shared/temaColori";
import { cssDelMarchio } from "../../../supabase/functions/_shared/srHtmlTemplate";
import { condizioniStandard } from "../../../supabase/functions/_shared/condizioniStandard";
import { tipografiaDaModello } from "@/components/preventivi/pdf/temaDocumento";
import { applicaTemaFv } from "../../../supabase/functions/_shared/fvHtmlTemplate";
import { fmtEur, fmtNum } from "../../../supabase/functions/_shared/fvCalcoli";

const leggi = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), "utf8");

describe("temaColori: il colore dell'azienda resta leggibile", () => {
  it("normalizza gli esadecimali e scarta il resto", () => {
    expect(normalizzaHex("#abc")).toBe("#AABBCC");
    expect(normalizzaHex("1e3a5f")).toBe("#1E3A5F");
    expect(normalizzaHex("rosso")).toBeNull();
    expect(normalizzaHex(null)).toBeNull();
  });

  it("un blu scuro resta com'è, un lime viene scurito finché il bianco si legge", () => {
    expect(fondoPerTestoBianco("#1E3A5F")).toBe("#1E3A5F");
    const daLime = fondoPerTestoBianco("#C8E600");
    expect(daLime).not.toBe("#C8E600");
    expect(contrasto(daLime, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });

  it("ricava un inchiostro per il fondo chiaro e uno per il fondo scuro", () => {
    expect(contrasto(testoSuChiaro("#FDE047"), "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(contrasto(testoSuScuro("#1E3A5F", "#0F172A"), "#0F172A")).toBeGreaterThanOrEqual(4.5);
    expect(testoSopra("#C8E600")).toBe("#0F172A");
    expect(testoSopra("#7A1F1F")).toBe("#FFFFFF");
  });

  it("mescola è lineare ai due estremi", () => {
    expect(mescola("#000000", "#FFFFFF", 0)).toBe("#000000");
    expect(mescola("#000000", "#FFFFFF", 1)).toBe("#FFFFFF");
  });
});

describe("Fotovoltaico: i colori scelti nell'editor arrivano nel documento", () => {
  const html = `<style>.a{color:#1E3A5F;background:#F97316}.b{background:rgba(249,115,22,0.4)}</style>`;

  it("coi colori di serie non cambia nulla", () => {
    expect(applicaTemaFv(html, { colore_primario: "#1E3A5F", colore_accento: "#F97316" })).toBe(html);
    expect(applicaTemaFv(html, {})).toBe(html);
    expect(applicaTemaFv(html, null)).toBe(html);
  });

  it("col marchio dell'azienda sostituisce blu e arancio ovunque", () => {
    const out = applicaTemaFv(html, { colore_primario: "#9B1C1C", colore_accento: "#0EA5E9" });
    expect(out).toContain("#9B1C1C");
    expect(out).toContain("#0EA5E9");
    expect(out).toContain("rgba(14,165,233,0.4)");
    expect(out).not.toContain("#1E3A5F");
    expect(out).not.toContain("#F97316");
  });

  it("un primario chiaro viene scurito: il testo bianco sopra resta leggibile", () => {
    const out = applicaTemaFv(html, { colore_primario: "#C8E600" });
    const usato = /color:(#[0-9A-F]{6})/.exec(out)?.[1] ?? "";
    expect(contrasto(usato, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("Numeri nei documenti: il punto delle migliaia anche a quattro cifre", () => {
  it("Fotovoltaico", () => {
    expect(fmtEur(9000)).toMatch(/^9\.000/);
    expect(fmtNum(7400)).toBe("7.400");
  });

  it("preventivo generico: formato euro e quantità", () => {
    const src = leggi("supabase/functions/generate-quote-pdf/index.ts");
    expect(src).toMatch(/FORMATO_EURO = new Intl\.NumberFormat\("it-IT", \{[^}]*useGrouping: "always"/s);
    expect(src).toContain("FORMATO_QUANTITA.format(Number(item.quantity ?? 0))");
  });
});

describe("Preventivo generico: il filetto non passa sopra il testo", () => {
  const src = leggi("supabase/functions/generate-quote-pdf/index.ts");

  it("il filetto fra le righe sta sul confine (y + 12), non sulla riga dopo (y + 4)", () => {
    expect(src).toContain("start: { x: itemLeftX, y: y + 12 }, end: { x: itemLeftX + itemWidth, y: y + 12 }");
    expect(src).not.toContain("start: { x: itemLeftX, y: y + 4 }");
  });

  it("il filetto sopra i totali sta sopra le maiuscole di SUBTOTALE", () => {
    expect(src).toContain("start: { x: totX, y: y + 14 }");
  });

  it("le impaginazioni alternative non vanno più sempre a pagina nuova prima della tabella", () => {
    expect(src).not.toContain("if (!classicPremium || y < 280)");
  });
});

describe("Fotovoltaico: niente marchi nei disegni segnaposto, niente «Pagina N» negli occhielli", () => {
  it("i disegni di inverter e batteria non nominano un produttore", () => {
    const svg = leggi("supabase/functions/_shared/fvSvgCharts.ts");
    expect(svg).not.toMatch(/<text[^>]*>HUAWEI<\/text>/);
  });

  it("gli occhielli non ripetono il numero di pagina", () => {
    const tpl = leggi("supabase/functions/_shared/fvHtmlTemplate.ts");
    expect(tpl).not.toContain("Pagina ${pageN}");
  });

  it("niente emoji a colori: le disegna il computer che stampa, e su un server sono quadratini", () => {
    const tpl = leggi("supabase/functions/_shared/fvHtmlTemplate.ts");
    expect(tpl).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(tpl).toContain('filaDiPittogrammi("albero"');
  });

  it("nei riquadri solo il primo grassetto va a capo", () => {
    const tpl = leggi("supabase/functions/_shared/fvHtmlTemplate.ts");
    expect(tpl).toContain(".callout > div > strong:first-child { display: block;");
    expect(tpl).not.toContain(".callout strong { display: block;");
  });
});

describe("kit del marchio: una regola sola per tutti i documenti", () => {
  it("il blu con cui nasce companies.brand_primary_color non è una scelta", () => {
    expect(COLORE_DI_FABBRICA_MARCHIO).toBe("#1E40AF");
    expect(marchioScelto("#1e40af")).toBeNull();
    expect(marchioScelto(null)).toBeNull();
    expect(marchioScelto("#CBA87E")).toBe("#CBA87E");
  });

  it("il modello rimasto al colore di fabbrica prende il colore del marchio, se scelto", () => {
    // Serramenti (verde), Fotovoltaico ed edili (blu notte): stessa regola, fabbrica diversa.
    expect(coloreDelDocumento("#2D7D5C", "#B91C1C", "#2D7D5C")).toBe("#B91C1C");
    expect(coloreDelDocumento("#1E3A5F", "#B91C1C", "#1E3A5F")).toBe("#B91C1C");
    expect(coloreDelDocumento("#2D7D5C", "#1E40AF", "#2D7D5C")).toBe("#2D7D5C");
    expect(coloreDelDocumento(null, null, "#2D7D5C")).toBeNull();
  });

  it("un colore scelto nel modello vince sempre", () => {
    expect(coloreDelDocumento("#C8E600", "#B91C1C", "#2D7D5C")).toBe("#C8E600");
  });

  it("le funzioni che generano i documenti passano dalla regola, non dal colore nudo", () => {
    expect(leggi("supabase/functions/fv-genera-pdf/index.ts")).toMatch(/colore_primario: coloreDelDocumento\(/);
    expect(leggi("supabase/functions/sr-genera-pdf/index.ts")).toMatch(/colore_primario: coloreDelDocumento\(/);
    expect(leggi("src/components/serramenti/SerramentoPDF.tsx")).toMatch(/const primaryColor = coloreDelDocumento\(/);
  });
});

describe("Serramenti: la pagina online del preventivo prende il colore dell'azienda", () => {
  const VERDI = /#2D7D5C|#1F5B43|#4D6F5D|#C6E1D3|#E8F3EE|#F1F7F4/i;

  it("col verde di fabbrica il foglio di stile non cambia", () => {
    expect(cssDelMarchio("#2D7D5C")).toBe(cssDelMarchio(null));
    expect(cssDelMarchio("#2D7D5C")).toMatch(VERDI);
  });

  it("con un altro colore non resta nemmeno un verde", () => {
    for (const colore of ["#C8E600", "#CBA87E", "#050505", "#00ADEF", "#B91C1C"]) {
      expect(cssDelMarchio(colore)).not.toMatch(VERDI);
    }
  });

  it("titoli, prezzo e note restano leggibili anche con un marchio chiaro", () => {
    for (const colore of ["#C8E600", "#CBA87E", "#FDE047", "#00ADEF"]) {
      const css = cssDelMarchio(colore);
      const titoli = /--sr-green: (#[0-9A-Fa-f]{6})/.exec(css)?.[1] ?? "";
      const riquadro = /--sr-green-light: (#[0-9A-Fa-f]{6})/.exec(css)?.[1] ?? "";
      const prezzo = /\.big-price \{[^}]*color: (#[0-9A-Fa-f]{6})/.exec(css)?.[1] ?? "";
      const nota = /\.kpi-hint \{[^}]*color: (#[0-9A-Fa-f]{6})/.exec(css)?.[1] ?? "";
      expect(contrasto(titoli, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
      expect(contrasto(prezzo, riquadro)).toBeGreaterThanOrEqual(4.5);
      expect(contrasto(nota, riquadro)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("Serramenti: la copertina del PDF segue il marchio", () => {
  const src = leggi("src/components/serramenti/SerramentoPDF.tsx");

  it("il fondo di serie nasce dal colore dell'azienda, non da un verde petrolio fisso", () => {
    expect(src).not.toContain('const COVER_BG = "#0F2A2E"');
    expect(src).toContain("coverBg: fondoCopertinaDiSerie(safePrimary)");
  });

  it("l'occhiello senza colore scelto si schiarisce finché si legge (marchio nero su fondo scuro)", () => {
    expect(src).not.toContain("normalizeHexColor(tpl.pdf_cover_eyebrow_color, C.primary) ?? C.primary");
    expect(src).toContain("testoSuScuro(C.primary, fondoSottoIlTesto, 4.5)");
    expect(contrasto(testoSuScuro("#050505", "#1F2937", 4.5), "#1F2937")).toBeGreaterThanOrEqual(4.5);
  });

  it("nessun bordo abbreviato con rgba(): react-pdf lo disegnava verde", () => {
    expect(src).not.toMatch(/solid rgba\(/);
  });
});

describe("tipografia del documento: una scelta che cambia davvero il PDF", () => {
  it("i valori vecchi e i caratteri del web ricadono sul lineare", () => {
    // Inter e Roboto non si possono incorporare qui: il motore, per farlo, li
    // deve riscrivere, e sui woff2 del sito si rompe.
    expect(tipografiaDaModello("helvetica")).toBe("lineare");
    expect(tipografiaDaModello("inter")).toBe("lineare");
    expect(tipografiaDaModello("roboto")).toBe("lineare");
    expect(tipografiaDaModello(null)).toBe("lineare");
    expect(tipografiaDaModello("editoriale")).toBe("editoriale");
    expect(tipografiaDaModello("times")).toBe("classica");
  });

  it("ogni tipografia usa solo caratteri che il PDF ha già dentro", () => {
    const dentro = ["Helvetica", "Helvetica-Bold", "Times-Roman", "Times-Bold", "Times-Italic"];
    const src = leggi("src/components/preventivi/pdf/temaDocumento.ts");
    const usati = src.match(/"(Helvetica|Times)[A-Za-z-]*"/g) ?? [];
    for (const u of usati) expect(dentro).toContain(u.replaceAll('"', ""));
    // I caratteri del web si nominano solo nel commento che spiega perché non ci sono.
    const codice = src.split("\n").filter((r) => !r.trimStart().startsWith("*")).join("\n");
    expect(codice).not.toMatch(/"Inter"|"Roboto"|\.woff/);
  });

  it("il documento non ha più caratteri scritti a mano: segue la scelta", () => {
    const src = leggi("src/components/preventivi/pdf/DocumentoEdilePDF.tsx");
    expect(src).not.toMatch(/const SANS = "Helvetica"/);
    expect(src).toContain("tema.caratteri.titolo");
    expect(src).toContain("tipografia: modello.tipografia");
  });
});

describe("condizioni di base: nessun preventivo esce senza contratto", () => {
  it("ogni settore ha il suo articolo, e tutti hanno le clausole da firmare", () => {
    const attese: Array<[Parameters<typeof condizioniStandard>[0], RegExp]> = [
      ["tetti", /amianto/i], ["serramenti", /misure definitive/i], ["fotovoltaico", /connessione/i],
      ["piscine", /scavo/i], ["elettrico", /D\.M\. 37\/2008/], ["generico", /stato dei luoghi/i],
    ];
    for (const [settore, atteso] of attese) {
      const testo = condizioniStandard(settore);
      expect(testo).toMatch(atteso);
      expect(testo).toContain("Clausole da approvare specificamente");
      expect(testo).toMatch(/Art\. 15 — Legge applicabile e foro competente/);
    }
  });

  it("il testo di base non promette detrazioni né risultati", () => {
    const testo = condizioniStandard("fotovoltaico");
    expect(testo).toMatch(/non ne garantisce il riconoscimento/);
    expect(testo).toMatch(/non un risultato garantito/);
  });

  it("i motori dei documenti ricadono sul testo di base quando manca quello dell'azienda", () => {
    expect(leggi("supabase/functions/generate-quote-pdf/index.ts")).toMatch(/condizioniStandard\("generico"\)/);
    expect(leggi("supabase/functions/sr-genera-pdf/index.ts")).toMatch(/condizioniStandard\("serramenti"\)/);
    expect(leggi("src/components/serramenti/SerramentoPDF.tsx")).toMatch(/condizioniStandard\("serramenti"\)/);
  });
});
