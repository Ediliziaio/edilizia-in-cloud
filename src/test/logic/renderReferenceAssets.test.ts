import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { thumbFilename, thumbPath, referenceThumbUrl } from "../../../shared/render-references/thumbs.ts";
import { scartoCromatico } from "../lib/referenceGuards";

/**
 * Le 310 foto del set di riferimento (04/10/2026) stanno in public/render-references.
 * Il manifest (scripts/render-references/manifest.json) dice, per ogni foto, quali
 * file esistono: motore in bianco e nero («-BN.webp», per le foto di FORMA), motore
 * a colori (per le foto di MATERIA) e miniatura a colori per l'interfaccia.
 *
 * Qui si verifica ciò che un errore a mano romperebbe in silenzio:
 *  - ogni file dichiarato esiste;
 *  - i file «-BN» sono DAVVERO in scala di grigi (regola di progetto 7a2a49b33: la
 *    forma arriva dalla foto, il colore dal testo; una foto verde faceva uscire
 *    marrone un «nero intenso»);
 *  - nessun file «-BN» è a colori e nessun file di materia porta il suffisso «-BN»;
 *  - i pesi restano contenuti (le foto viaggiano come data URL dentro ogni render): il limite
 *    non serve a stringere, serve a fermare un PNG non convertito finito per sbaglio nella cartella.
 */
const RADICE = join(process.cwd(), "public", "render-references");
const MANIFEST = JSON.parse(readFileSync(join(process.cwd(), "scripts", "render-references", "manifest.json"), "utf8")) as {
  foto: Record<string, { src: string; slug: string; cartella: string; colore: string | null; bn: string | null; thumb: string }>;
  voci: Array<{ modulo: string; dim: string; valore: string; classe: "FORMA" | "MATERIA"; file: string[]; thumb: string[] }>;
};
const FOTO = Object.entries(MANIFEST.foto);

// Mediana reale 46 KB (motore) e 7 KB (miniatura); i massimi (intonaci graffiati, pietre) arrivano a 237 e 36 KB.
const MAX_MOTORE_BYTES = 256 * 1024;
const MAX_THUMB_BYTES = 40 * 1024;

describe("foto di riferimento: set da 310", () => {
  it("il manifest descrive 310 foto e almeno una voce per ogni modulo del render", () => {
    expect(FOTO).toHaveLength(310);
    const moduli = new Set(MANIFEST.voci.map((v) => v.modulo));
    for (const m of ["bagno", "pavimento", "facciata", "tetto", "persiane", "pergola", "piscina", "porta_interna", "porta_blindata", "esterno", "stanza"]) {
      expect(moduli.has(m), m).toBe(true);
    }
  });

  it("ogni file dichiarato esiste (motore B/N, motore a colori, miniatura)", () => {
    const mancanti: string[] = [];
    for (const [n, f] of FOTO) {
      for (const rel of [f.bn, f.colore, f.thumb]) {
        if (rel && !existsSync(join(RADICE, rel))) mancanti.push(`#${n} ${rel}`);
      }
    }
    expect(mancanti).toEqual([]);
  });

  it("ogni foto ha almeno un file per il motore e la sua miniatura", () => {
    const senza = FOTO.filter(([, f]) => !f.bn && !f.colore).map(([n, f]) => `#${n} ${f.slug}`);
    expect(senza).toEqual([]);
  });

  it("il suffisso «-BN» coincide con la classe: forma → B/N, materia → colori", () => {
    const sbagliati: string[] = [];
    for (const [n, f] of FOTO) {
      if (f.bn && !/-BN\.webp$/.test(f.bn)) sbagliati.push(`#${n} bn senza suffisso: ${f.bn}`);
      if (f.colore && /-BN\.webp$/.test(f.colore)) sbagliati.push(`#${n} colore con suffisso BN: ${f.colore}`);
      if (f.thumb && /-BN\.webp$/.test(f.thumb)) sbagliati.push(`#${n} miniatura con suffisso BN: ${f.thumb}`);
    }
    expect(sbagliati).toEqual([]);
  });

  it("le voci puntano a file che esistono e la classe combacia col file scelto", () => {
    const errori: string[] = [];
    for (const v of MANIFEST.voci) {
      const id = `${v.modulo}.${v.dim}=${v.valore}`;
      if (v.file.length === 0) errori.push(`${id}: nessun file`);
      for (const rel of v.file) {
        if (!existsSync(join(RADICE, rel))) errori.push(`${id}: manca ${rel}`);
        const bn = /-BN\.webp$/.test(rel);
        if (v.classe === "FORMA" && !bn) errori.push(`${id}: FORMA ma il file non è B/N (${rel})`);
        if (v.classe === "MATERIA" && bn) errori.push(`${id}: MATERIA ma il file è B/N (${rel})`);
      }
      for (const rel of v.thumb) if (!existsSync(join(RADICE, rel))) errori.push(`${id}: manca la miniatura ${rel}`);
    }
    expect(errori).toEqual([]);
  });

  it("i file «-BN» sono davvero in scala di grigi", async () => {
    const colorati: string[] = [];
    for (const [n, f] of FOTO) {
      if (!f.bn) continue;
      const scarto = await scartoCromatico(f.bn);
      if (scarto > 10) colorati.push(`#${n} ${f.bn} (scarto ${scarto})`);
    }
    expect(colorati).toEqual([]);
  }, 60_000);

  it("i pesi restano contenuti: motore ≤ 256 KB, miniatura ≤ 40 KB", () => {
    const pesanti: string[] = [];
    for (const [n, f] of FOTO) {
      for (const rel of [f.bn, f.colore]) {
        if (rel && statSync(join(RADICE, rel)).size > MAX_MOTORE_BYTES) pesanti.push(`#${n} ${rel}`);
      }
      if (statSync(join(RADICE, f.thumb)).size > MAX_THUMB_BYTES) pesanti.push(`#${n} ${f.thumb}`);
    }
    expect(pesanti).toEqual([]);
  });
});

/** Le cartelle delle foto che finiscono nei render (non «profiles», «accessories»… degli infissi). */
const CARTELLE_RENDER = ["bathroom", "floors", "facades", "roofs", "shutters", "outdoor", "pergolas", "pools", "doors", "exterior", "lighting"];

describe("miniature per l'interfaccia", () => {
  it("il nome della miniatura è quello del file senza il suffisso «-BN»", () => {
    expect(thumbFilename("Doccia-Walk-In-BN.webp")).toBe("Doccia-Walk-In.webp");
    expect(thumbFilename("Marmo-Carrara.webp")).toBe("Marmo-Carrara.webp");
    expect(thumbFilename("Una-BNota.webp")).toBe("Una-BNota.webp");
    expect(thumbPath("pools", "Scala-Inox-BN.webp")).toBe("thumbs/pools/Scala-Inox.webp");
  });

  it("l'URL usa la stessa base delle foto del motore e codifica il nome", () => {
    expect(referenceThumbUrl("pools", "Scala-Inox-BN.webp")).toMatch(/\/render-references\/thumbs\/pools\/Scala-Inox\.webp$/);
  });

  it("ogni foto delle cartelle dei render ha la sua miniatura (anche le preesistenti)", () => {
    const senza: string[] = [];
    for (const cartella of CARTELLE_RENDER) {
      if (!existsSync(join(RADICE, cartella))) continue; // «lighting» nasce con la prima foto di luci
      for (const file of readdirSync(join(RADICE, cartella)).filter((f) => f.endsWith(".webp"))) {
        if (!existsSync(join(RADICE, thumbPath(cartella, file)))) senza.push(`${cartella}/${file}`);
      }
    }
    expect(senza, "aggiungi la miniatura (320 px, a colori) in thumbs/<cartella>/ — vedi scripts/render-references/genera.py").toEqual([]);
  });
});

