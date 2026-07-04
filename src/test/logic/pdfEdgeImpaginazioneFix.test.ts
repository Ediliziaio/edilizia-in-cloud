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

    it("guardia fondo pagina prima di box finanziamento e QR firma", () => {
      expect(source).toContain("newPageIfNeeded(80)");
      expect(source).toContain("newPageIfNeeded(100)");
    });
  });

  describe("genera-pdf-rapportino", () => {
    const source = read("supabase/functions/genera-pdf-rapportino/index.ts");

    it("ridisegna l'intestazione della tabella materiali al salto pagina", () => {
      expect(source).toContain("drawTableHeader");
      expect(source).toContain("if (ensureSpace(16)) drawTableHeader()");
    });
  });
});
