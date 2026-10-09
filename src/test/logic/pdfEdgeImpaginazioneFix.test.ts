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
  describe("cg-export-ce-pdf", () => {
    const source = read("supabase/functions/cg-export-ce-pdf/index.ts");

    it("non contiene il carattere di spunta U+2713 (crashava con BEP raggiunto)", () => {
      expect(source).not.toContain("✓");
    });

    it("non contiene il minore-uguale U+2264 (crashava con margine negativo)", () => {
      expect(source).not.toContain("≤");
    });

    it("ha la difesa in profondità winAnsiSafe sul drawText", () => {
      expect(source).toContain("winAnsiSafe");
      expect(source).toContain("patchDrawTextSafe");
    });

    it("colonne Importo e % PIL separate (bordi destri 495 / 552)", () => {
      expect(source).toContain("IMP_RIGHT = 495");
      expect(source).toContain("PCT_RIGHT = 552");
    });

    it("segnala il troncamento dell'elenco voci invece di tagliare in silenzio", () => {
      expect(source).toContain("elenco troncato");
    });
  });

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
    const source = read("supabase/functions/generate-quote-pdf/index.ts");

    it("sanitizza i campi utente/AI con winAnsiSafe (drawText e widthOfTextAtSize)", () => {
      expect(source).toContain("winAnsiSafe");
      // wrapper unico su addPage: ogni pagina esce con drawText sanitizzato
      expect(source).toContain("rawAddPage");
      // anche la misura del testo lancia sugli stessi caratteri
      expect(source).toContain("f.widthOfTextAtSize(winAnsiSafe(s), size)");
    });

    it("guardia fondo pagina prima del box finanziamento; il QR della firma non si stampa più", () => {
      expect(source).toContain("newPageIfNeeded(80)");
      // Dal 25/09/2026 il QR della firma online nel PDF non c'è (deciso da Florin):
      // il cliente firma dal link che riceve.
      expect(source).not.toContain("qrcode(");
    });

    it("footing IVA: totale derivato + residuo sull'aliquota maggiore (mai negativa)", () => {
      // Il conto sta in _shared/riepilogoIvaPreventivo.ts (provato in riepilogoIvaPreventivo.test.ts):
      // il PDF lo chiama e ne stampa le righe.
      const riepilogo = read("supabase/functions/_shared/riepilogoIvaPreventivo.ts");
      expect(source).toContain("ivaToShow");
      expect(source).toContain("subTotShown - scontoShown");
      expect(source).toContain("righeRiepilogoIva({");
      // il residuo di arrotondamento va sulla riga di valore massimo
      expect(riepilogo).toContain("righe[max].valore = arrotondaComePostgres(righe[max].valore + residuo)");
      // clamp IVA ≥ 0: lo scarto ≤1 cent (esente+sconto) è assorbito nello sconto
      expect(riepilogo).toContain("scontoShown = arrotondaComePostgres(scontoShown - ivaToShow)");
    });

    it("colonna prezzo con bordo sinistro garantito (no collisione con U.M.)", () => {
      expect(source).toContain("priceLeftBound");
      expect(source).toContain("priceRight - textW(withDisc, sz(8.5)) >= priceLeftBound");
    });

    it("box finanziamento allineato al contenuto (non sfora la pagina)", () => {
      expect(source).toContain("const finBoxW = (itemLeftX + itemWidth) - finBoxX");
      expect(source).not.toContain("(totValX + 50) - finBoxX + 10");
    });

    it("totali/firme renderizzati anche con 0 righe visibili (header guardato, blocco no)", () => {
      // L'intestazione esce solo se sotto ci sono righe: con «solo totale» le righe non
      // si disegnano, e l'intestazione restava orfana sopra i totali (076ac6259).
      expect(source).toContain("if (items.length > 0 && !soloTotale) drawTableHeader()");
      expect(source).toContain("if (!soloTotale) {\n        for (let idx = 0; idx < items.length; idx++) {");
      // Il blocco di tabella, totali e firme invece resta sempre eseguito.
      expect(source).toContain("// Blocco SEMPRE eseguito: header e righe della tabella sono guardati da");
    });

    it("line_total nullo-sicuro: uno 0 legittimo non ricade sul calcolo qtà×prezzo", () => {
      expect(source).toContain('ltRaw != null && ltRaw !== ""');
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
