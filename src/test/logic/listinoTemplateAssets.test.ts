import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Copertura delle immagini di serie del listino (`public/templates/<area>/`).
 *
 * Ogni tipologia del listino standard è rappresentata da DUE file con lo stesso
 * slug `tipologia-<slug>`:
 * - la scena ambientata 1600×900 in `tipologie/tipologia-<slug>.jpg`
 * - il packshot di categoria 800×800 in `products/tipologia-<slug>.webp`
 *
 * Se ne esiste uno senza l'altro, in un'area il selettore mostra un buco: il
 * 27/09/2026 mancavano 4 packshot (pavimenti/pietre-e-pavimenti-esterni,
 * ristrutturazione/sistemi-a-secco, tetti/lattoneria, tetti/membrane-e-teli).
 * Questo test li avrebbe intercettati; d'ora in poi tiene la coppia allineata.
 *
 * Nota: verifica solo la coerenza tra i due lati (nessuna dipendenza dai dati
 * del listino), quindi non è fragile rispetto ai nomi-file "sinonimo".
 */
const ROOT = "public/templates";

const areas = readdirSync(ROOT).filter((a) => statSync(join(ROOT, a)).isDirectory());

const tipologie = (area: string, sub: "products" | "tipologie", ext: string) => {
  const dir = join(ROOT, area, sub);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.startsWith("tipologia-") && f.endsWith(ext));
};

describe("Immagini di categoria del listino: scena ↔ packshot", () => {
  it.each(areas)("%s — ogni scena tipologia ha il suo packshot 800×800", (area) => {
    const mancanti = tipologie(area, "tipologie", ".jpg")
      .map((jpg) => jpg.replace(/\.jpg$/, ".webp"))
      .filter((webp) => !existsSync(join(ROOT, area, "products", webp)));
    expect(mancanti, `packshot mancanti in ${area}/products`).toEqual([]);
  });

  it.each(areas)("%s — ogni packshot di categoria ha la sua scena", (area) => {
    const mancanti = tipologie(area, "products", ".webp")
      .map((webp) => webp.replace(/\.webp$/, ".jpg"))
      .filter((jpg) => !existsSync(join(ROOT, area, "tipologie", jpg)));
    expect(mancanti, `scene mancanti in ${area}/tipologie`).toEqual([]);
  });

  it("nel complesso le due sponde hanno lo stesso numero di tipologie", () => {
    const scene = areas.reduce((n, a) => n + tipologie(a, "tipologie", ".jpg").length, 0);
    const packshot = areas.reduce((n, a) => n + tipologie(a, "products", ".webp").length, 0);
    expect(scene).toBeGreaterThan(0);
    expect(packshot).toBe(scene);
  });
});
