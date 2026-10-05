import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { FacciataConfigForm } from "@/components/render-facciata/FacciataConfigForm";
import { DEFAULT_FACCIATA_CONFIG } from "@/components/render-facciata/defaultFacciataConfig";
import { DEFAULT_TETTO_CONFIG, TettoConfigForm } from "@/components/render-tetto/TettoConfigForm";
import type { ConfigurazioneFacciata } from "@/modules/render-facciata/lib/types";
import type { ConfigurazioneTetto } from "@/modules/render-tetto/lib/types";
import {
  CLADDING_PATTERN_PHOTOS,
  CLADDING_PHOTOS,
  FACADE_GUTTER_PHOTOS,
  PLASTER_FINISH_PHOTOS,
} from "../../../shared/render-references/facadeReferences";
import {
  GUTTER_MATERIAL_PHOTOS,
  ROOF_COVERING_PHOTOS,
  SKYLIGHT_TYPE_PHOTOS,
  SOLAR_TYPE_PHOTOS,
} from "../../../shared/render-references/roofReferences";
import { referenceThumbUrl } from "../../../shared/render-references/thumbs";
import type { PhotoEntry } from "../../../shared/render-references/referencePicker";

/**
 * Le miniature dei form facciata e tetto mostrano la STESSA foto che il motore allega
 * (stessa tabella, stessa chiave): l'utente sceglie guardando ciò che il modello riceverà.
 */
function monta(elemento: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(elemento));
  const tutte = Array.from(container.querySelectorAll("img")).map((img) => ({ src: img.getAttribute("src") ?? "", alt: img.getAttribute("alt") ?? "" }));
  // La stessa foto può comparire due volte (manto a tegole solari e tegola solare integrata): si cercano tutte.
  const immagini = {
    altDi: (src: string) => tutte.filter((i) => i.src === src).map((i) => i.alt),
    alt: () => tutte.map((i) => i.alt),
  };
  return {
    immagini,
    smonta: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const url = (e: PhotoEntry) => referenceThumbUrl(e.folder, e.filename);

describe("miniature nel form facciata", () => {
  it("finiture, rivestimenti, posa scelta e gronda scelta passano la foto del motore", () => {
    const config: ConfigurazioneFacciata = structuredClone(DEFAULT_FACCIATA_CONFIG);
    config.tipo_intervento = "misto";
    config.rivestimento = { ...config.rivestimento, attivo: true, tipo: "porfido", posa: "opus_incertum" };
    config.elementi.gronde = { azione: "sostituisci", materiale: "rame" };
    const { immagini, smonta } = monta(<FacciataConfigForm config={config} onChange={vi.fn()} />);

    for (const [chiave, e] of Object.entries(PLASTER_FINISH_PHOTOS)) {
      expect(immagini.altDi(url(e)).some((a) => /^Intonaco /.test(a)), chiave).toBe(true);
    }
    for (const [chiave, e] of Object.entries(CLADDING_PHOTOS)) {
      expect(immagini.altDi(url(e)).some((a) => /^Rivestimento /.test(a)), chiave).toBe(true);
    }
    // la posa scelta: miniatura a colori della foto di forma (senza «-BN»)
    expect(url(CLADDING_PATTERN_PHOTOS.opus_incertum)).toMatch(/thumbs\/facades\/Rivestimento-In-Pietra-A-Opus-Incertum\.webp$/);
    expect(immagini.altDi(url(CLADDING_PATTERN_PHOTOS.opus_incertum))).toContain("Posa opus incertum");
    // la gronda scelta: la foto sta in roofs/
    expect(immagini.altDi(url(FACADE_GUTTER_PHOTOS.rame))).toEqual(["Gronda in rame"]);
    smonta();
  });

  it("rivestimento spento: niente miniature di rivestimento e posa", () => {
    const { immagini, smonta } = monta(<FacciataConfigForm config={structuredClone(DEFAULT_FACCIATA_CONFIG)} onChange={vi.fn()} />);
    expect(immagini.alt().some((alt) => alt.startsWith("Rivestimento ") || alt.startsWith("Posa "))).toBe(false);
    smonta();
  });
});

describe("miniature nel form tetto", () => {
  it("manti con foto, grondaia, lucernario e tegola solare scelti passano la foto del motore", () => {
    const value: ConfigurazioneTetto = {
      ...structuredClone(DEFAULT_TETTO_CONFIG),
      grondaie: { attivo: true, materiale: "zinco_titanio", colore_hex: "#7a8b8b" },
      lucernari: { attivo: true, azione: "aggiungi", tipo: "abbaino" },
      pannelli_solari: { attivo: true, tipo: "tegola_solare_integrata", quantita: "medi", posizione: "falda_principale" },
    };
    const { immagini, smonta } = monta(<TettoConfigForm value={value} onChange={vi.fn()} />);

    for (const [chiave, e] of Object.entries(ROOF_COVERING_PHOTOS)) {
      expect(immagini.altDi(url(e)).some((a) => /^Manto /.test(a)), chiave).toBe(true);
    }
    // tegole piane e guaina bituminosa non hanno una foto valida: nessuna miniatura, resta il pallino del colore
    expect(immagini.alt()).not.toContain("Manto Piane");
    expect(immagini.alt()).not.toContain("Manto Guaina bituminosa");
    expect(immagini.altDi(url(GUTTER_MATERIAL_PHOTOS.zinco_titanio))).toEqual(["Grondaia in zinco-titanio"]);
    expect(immagini.altDi(url(SKYLIGHT_TYPE_PHOTOS.abbaino))).toEqual(["Abbaino"]);
    expect(immagini.altDi(url(SOLAR_TYPE_PHOTOS.tegola_solare_integrata))).toContain("Tegole solari integrate");
    smonta();
  });

  it("fotovoltaico con cornice: la miniatura è la foto dei moduli (la stessa per nero e blu), non quella delle tegole solari", () => {
    for (const tipo of ["fotovoltaico_nero", "fotovoltaico_blu"] as const) {
      const value: ConfigurazioneTetto = {
        ...structuredClone(DEFAULT_TETTO_CONFIG),
        pannelli_solari: { attivo: true, tipo, quantita: "medi", posizione: "falda_principale" },
      };
      const { immagini, smonta } = monta(<TettoConfigForm value={value} onChange={vi.fn()} />);
      expect(url(SOLAR_TYPE_PHOTOS[tipo]), tipo).toMatch(/thumbs\/roofs\/Pannelli-Fotovoltaici-Su-Binari\.webp$/);
      expect(immagini.altDi(url(SOLAR_TYPE_PHOTOS[tipo])), tipo).toEqual(["Pannelli fotovoltaici con cornice"]);
      expect(immagini.altDi(url(SOLAR_TYPE_PHOTOS.tegola_solare_integrata)), tipo).not.toContain("Tegole solari integrate");
      smonta();
    }
  });
});
