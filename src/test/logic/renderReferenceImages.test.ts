import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { getReferenceImageUrl } from "../../../shared/render-window/catalog.ts";
import * as catalogo from "../../../shared/render-window/catalog.ts";

/**
 * Ogni `referenceImage` del catalogo deve esistere davvero su disco.
 *
 * Quattro riferimenti erano dichiarati nel catalogo ma non erano mai stati
 * committati: cerniere a vista, cerniere a scomparsa, traverso mantieni e
 * traverso rimuovi. Sono le lavorazioni piu' difficili da rendere, e proprio
 * quelle giravano SENZA la foto guida — il fetch tornava 404, l'edge lo
 * registrava come warning e proseguiva. Nessuno se ne accorgeva perche' il
 * render usciva comunque, solo peggio.
 *
 * Questo test rende il guasto impossibile da reintrodurre in silenzio: chi
 * aggiunge una referenceImage senza il file vede fallire la suite.
 */

// `import.meta.url` sotto vitest e' un URL servito da vite (/@fs/...), non un
// percorso di filesystem: la radice si prende da process.cwd(), che vitest
// fissa alla root del progetto.
const RADICE_ASSET = join(process.cwd(), "public", "render-references");

function cartellaDa(url: string): string {
  // getReferenceImageUrl produce .../render-references/<categoria>/<file>
  const dopo = url.split("/render-references/")[1] ?? "";
  return dopo;
}

function raccogliRiferimenti(): Array<{ origine: string; file: string }> {
  const trovati: Array<{ origine: string; file: string }> = [];
  for (const [nomeExport, valore] of Object.entries(catalogo)) {
    if (!Array.isArray(valore)) continue;
    for (const voce of valore) {
      if (!voce || typeof voce !== "object") continue;
      const ref = (voce as { referenceImage?: unknown }).referenceImage;
      if (typeof ref === "string" && ref.length > 0) {
        const id = (voce as { id?: unknown }).id;
        trovati.push({ origine: `${nomeExport}.${String(id ?? "?")}`, file: ref });
      }
    }
  }
  return trovati;
}

describe("foto di riferimento del catalogo infissi", () => {
  const riferimenti = raccogliRiferimenti();

  it("il catalogo dichiara almeno un riferimento", () => {
    expect(riferimenti.length).toBeGreaterThan(0);
  });

  it("ogni riferimento dichiarato esiste in public/render-references", () => {
    const mancanti = riferimenti
      .filter(({ file }) => {
        const url = getReferenceImageUrl(file);
        if (!url) return true;
        return !existsSync(join(RADICE_ASSET, cartellaDa(url)));
      })
      .map(({ origine, file }) => `${origine} -> ${file}`);

    expect(mancanti).toEqual([]);
  });
});

import { readTraversoMode, resolveTraversoRef, resolveProfileRef } from "../../../shared/render-window/windowReferenceImages.ts";

describe("riferimenti profilo e traverso (infissi)", () => {
  it("il modo traverso si legge da nuovo_infisso (dove lo salva il wizard), con ripiego su legacy_config", () => {
    expect(readTraversoMode({ nuovo_infisso: { traverso_mode: "aggiungi" } })).toBe("aggiungi");
    expect(readTraversoMode({ legacy_config: { traverso_mode: "rimuovi" } })).toBe("rimuovi");
    expect(readTraversoMode({ nuovo_infisso: {} })).toBeNull();
    expect(readTraversoMode(null)).toBeNull();
  });
  it("aggiungi → foto con traverso; rimuovi → finestra pulita; auto/mantieni → nessuna foto", () => {
    expect(resolveTraversoRef("aggiungi")?.filename).toBe("Finestra-2ante-Con-Traverso-Orizzontale-Santorini.webp");
    expect(resolveTraversoRef("aggiungi")?.label).toMatch(/ONE horizontal transom bar/);
    expect(resolveTraversoRef("rimuovi")?.filename).toBe("Finestra-2ante-Cerniere-Scomparsa-Montante-Pulito.png");
    expect(resolveTraversoRef("auto")).toBeNull();
    expect(resolveTraversoRef("mantieni")).toBeNull();
  });
  it("il profilo porta la sezione reale per pvc/legno/legno_alluminio e nulla per alluminio/minimal", () => {
    const spec = (profileId: string) => ({ profileId } as unknown as Parameters<typeof resolveProfileRef>[0]);
    expect(resolveProfileRef(spec("pvc"))?.filename).toBe("Profilo-PVC-5-Camere-Sezione-Bianco.webp");
    expect(resolveProfileRef(spec("legno"))?.label).toMatch(/cut sample, NOT a window/);
    expect(resolveProfileRef(spec("alluminio"))).toBeNull();
    expect(resolveProfileRef(spec("minimal"))).toBeNull();
  });
});
