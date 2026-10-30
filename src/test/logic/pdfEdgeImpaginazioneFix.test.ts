import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Test contratto — fix impaginazione/encoding PDF edge (audit geometria Helvetica).
 *
 * Le StandardFonts di pdf-lib codificano SOLO WinAnsi: un carattere fuori set
 * (spunte, simboli matematici, emoji) fa lanciare drawText e fallire l'intero
 * export. Questi test leggono i sorgenti delle edge function e verificano che:
 * 1. cg-export-ce-pdf non contenga caratteri non-WinAnsi hardcoded e abbia la
 *    difesa winAnsiSafe;
 * 2. cg-export-pacchetto-banca idem (il carattere di spunta crashava quando i
 *    conti QUADRAVANO);
 * 3. generate-quote-pdf sanitizzi in un punto unico tutti i drawText (i campi
 *    arrivano anche dall'AI);
 * 4. genera-pdf-rapportino ridisegni l'intestazione tabella materiali al salto
 *    pagina (drawTableHeader).
 */

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

describe("fix impaginazione/encoding PDF edge (audit)", () => {
  describe("cg-export-pacchetto-banca", () => {
    const source = read("supabase/functions/cg-export-pacchetto-banca/index.ts");

    it("non contiene il carattere di spunta U+2713 (crashava con SP quadrato)", () => {
      expect(source).not.toContain("✓");
    });

    it("ha la difesa in profondità winAnsiSafe sul drawText", () => {
      expect(source).toContain("winAnsiSafe");
      expect(source).toContain("patchDrawTextSafe");
    });
  });

  describe("generate-quote-pdf", () => {
    // Dal 27/10/2026 questa funzione non disegna più niente a mano: compone il documento
    // React condiviso (`_shared/preventivoRenderer.mjs`, costruito da scripts/preventivi-render)
    // e gli passa i dati. Le guardie di impaginazione che stavano qui — fondo pagina, colonna
    // prezzo, box finanziamento, intestazione orfana — riguardavano codice che non c'è più; le
    // regole dell'IVA vivono in `_shared/riepilogoIvaPreventivo.ts` e sono provate col
    // comportamento in riepilogoIvaPreventivo.test.ts (riga nascosta nel suo scaglione, riga
    // omaggio a zero, residuo sull'aliquota maggiore, 6.000 preventivi contro il database).
    // Qui resta l'unica cosa che quel cambio può far tornare indietro: una seconda strada di
    // disegno dentro la edge, che uscirebbe diversa dal documento di tutti gli altri preventivi.
    const source = read("supabase/functions/generate-quote-pdf/index.ts");

    it("non disegna il PDF a mano: lo compone il documento condiviso", () => {
      expect(source).toContain('import { renderGenerico } from "../_shared/preventivoRenderer.mjs";');
      expect(source).toMatch(/renderGenerico\(\{[\s\S]*?\n\s+quote: \{\n\s+\.\.\.quote,[\s\S]*?\n\s+\},\n\s+righePerIva,/);
      // Niente pdf-lib per scrivere testo o righe: la pagina la fa il documento React.
      expect(source).not.toContain("drawText");
      expect(source).not.toContain("drawRectangle");
      expect(source).not.toContain("StandardFonts");
      // Il QR della firma online non si stampa (deciso il 25/09/2026): si firma dal link.
      expect(source).not.toContain("qrcode(");
    });
  });

  describe("genera-pdf-rapportino", () => {
    // Dal 06/10/2026 il documento è a blocchi (render.ts): una sola funzione tabella() per tutte le tabelle,
    // quelle dei materiali di ogni fase, gli altri materiali e la squadra. L'intestazione delle colonne si
    // ridisegna a ogni salto pagina; la prova vera (documento disegnato, pagina per pagina) è in
    // rapportinoPdfBlocchi.test.ts: qui resta il contratto sul sorgente.
    const source = read("supabase/functions/genera-pdf-rapportino/render.ts");

    it("ridisegna l'intestazione della tabella al salto pagina", () => {
      expect(source).toContain("const intestazione = () => {");
      expect(source).toContain("const tabella = (etichette: string[], larghezze: number[], valori: string[][]");
      // una riga normale che non ci sta passa intera alla pagina dopo, con l'intestazione
      expect(source).toContain("if (rowHeight <= H - 54 - bottom - 18 && y - rowHeight < bottom) { nextPage(); intestazione(); }");
      // una riga più alta di una pagina si spezza, e ogni pezzo riparte con l'intestazione
      expect(source).toContain("if (y - 24 < bottom) { nextPage(); intestazione(); }");
      expect(source).toContain("if (offset < count) { nextPage(); intestazione(); }");
    });

    it("i materiali passano da quella tabella: nella scheda della fase e tra gli altri", () => {
      expect(source).toMatch(/tabella\(\["Materiale", "Quantità", "Unità"\]/);
      expect(source).toMatch(/sezione\(blocchi\.fasi\.length \? "Altri materiali" : "Materiali utilizzati", 100\);\s*tabella\(\["Materiale", "Quantità", "Unità", "Registrazione"\]/);
    });

    it("un titolo di sezione viaggia con il primo pezzo del suo corpo: mai solo in fondo a una pagina", () => {
      expect(source).toContain("if (titolo) sezione(titolo, minimo + 36); else ensure(minimo + 10);");
    });

    it("emoji e simboli fuori dal set WinAnsi diventano «?» una volta sola per simbolo (flag u)", () => {
      expect(source).toContain('/[^\\x20-\\x7E\\xA0-\\xFF\\n‘’“”…€]/gu');
    });
  });
});
