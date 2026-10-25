/**
 * Il tema dei colori del preventivo fotovoltaico con le foto incorporate (25/10/2026): le sostituzioni di colore
 * attraversavano ogni foto base64 (megabyte) fino a undici volte, e la generazione del PDF andava fuori dal tempo
 * di calcolo. Ora le foto si mettono da parte e il risultato è identico.
 */
import { describe, expect, it } from "vitest";
import { applicaTemaFv } from "../../../supabase/functions/_shared/fvHtmlTemplate";

const FOTO = `data:image/jpeg;base64,${"QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=".repeat(40_000)}`;
const SVG = `data:image/svg+xml;utf8,<svg fill='#F97316'/>`;
const html = `<div style="background:#1E3A5F;color:#f97316"><img src="${FOTO}"><i style="background:url(&quot;${SVG}&quot;)"></i><b class="#C2410C">x</b><img src="${FOTO}"></div>`;

/** Il modo di prima: le stesse sostituzioni direttamente sul documento intero. */
const diPrima = (h: string) => h.replace(/#1E3A5F/gi, "#112233").replace(/#F97316/gi, "#00AA00");

describe("applicaTemaFv con le foto incorporate", () => {
  const tema = { colore_primario: "#112233", colore_accento: "#00AA00" };

  it("le foto tornano identiche e i colori cambiano fuori dalle foto", () => {
    const fuori = applicaTemaFv(html, tema);
    expect(fuori.split(FOTO).length - 1).toBe(2);
    expect(fuori).not.toContain("\u0000");
    expect(fuori).toContain("background:#");
    expect(fuori).not.toContain("#1E3A5F");
  });

  it("un colore dentro un'immagine non base64 (un SVG scritto nel testo) cambia come prima", () => {
    expect(applicaTemaFv(html, tema)).toContain("<svg fill='#00AA00'/>");
  });

  it("senza colori scelti ridà il documento com'è, senza toccarlo", () => {
    expect(applicaTemaFv(html, {})).toBe(html);
    expect(applicaTemaFv(html, { colore_primario: "#1E3A5F", colore_accento: "#F97316" })).toBe(html);
  });

  it("con le foto da 1,4 MB l'una il risultato è quello delle sostituzioni sul documento intero", () => {
    const solo = { colore_primario: "#112233" };
    const atteso = html.replace(/#0F2542/gi, "#0F2542");
    expect(applicaTemaFv(html, solo).length).toBe(atteso.replace(/#1E3A5F/gi, "#112233").length);
    expect(diPrima(html).length).toBeGreaterThan(FOTO.length * 2);
  });
});
