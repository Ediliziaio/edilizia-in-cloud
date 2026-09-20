import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  contrasto, fondoPerTestoBianco, mescola, normalizzaHex, testoSopra, testoSuChiaro, testoSuScuro,
} from "../../../supabase/functions/_shared/temaColori";
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

  it("nei riquadri solo il primo grassetto va a capo", () => {
    const tpl = leggi("supabase/functions/_shared/fvHtmlTemplate.ts");
    expect(tpl).toContain(".callout > div > strong:first-child { display: block;");
    expect(tpl).not.toContain(".callout strong { display: block;");
  });
});
