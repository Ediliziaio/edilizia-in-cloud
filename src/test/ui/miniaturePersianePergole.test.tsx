import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PersianeConfigForm } from "@/components/render-persiane/PersianeConfigForm";
import { DEFAULT_PERSIANE_CONFIG } from "@/components/render-persiane/defaultPersianeConfig";
import { PergoleConfigForm } from "@/components/render-pergole/PergoleConfigForm";
import { DEFAULT_PERGOLE_CONFIG } from "@/components/render-pergole/defaultPergoleConfig";
import type { ConfigurazionePergole } from "@/modules/render-pergole/lib/types";
import {
  SHUTTER_MATERIAL_PHOTOS,
  SHUTTER_TYPE_PHOTOS,
  SHUTTER_WOOD_FINISH_PHOTOS,
} from "../../../shared/render-references/shutterReferences.ts";
import {
  PERGOLA_COVER_PHOTOS,
  PERGOLA_LIGHTING_PHOTOS,
  PERGOLA_MATERIAL_PHOTOS,
  PERGOLA_SIDE_PHOTOS,
  PERGOLA_TYPE_PHOTOS,
} from "../../../shared/render-references/pergolaReferences.ts";
import { thumbPath } from "../../../shared/render-references/thumbs.ts";
import type { PhotoEntry } from "../../../shared/render-references/referencePicker.ts";

/**
 * Le miniature dei form mostrano la stessa foto che il motore allega al render
 * (nella versione a colori per l'interfaccia): per ogni opzione con una foto,
 * l'immagine giusta; per le opzioni senza foto, nessuna immagine.
 */
const srcDi = (alt: string) => screen.getAllByRole("img", { name: alt }).map((img) => decodeURIComponent(img.getAttribute("src") ?? ""));
const atteso = (foto: PhotoEntry) => `/render-references/${thumbPath(foto.folder, foto.filename)}`;

describe("miniature nel form persiane", () => {
  it("ogni tipologia mostra la foto del tipo (anche la veneziana esterna, dal 05/10/2026)", () => {
    render(<PersianeConfigForm value={DEFAULT_PERSIANE_CONFIG} onChange={() => {}} />);
    const etichette: Record<string, string> = {
      veneziana_classica: "Veneziana classica", veneziana_esterna: "Veneziana esterna", scuro_pieno: "Scuro pieno", scuro_cornice: "Scuro a cornice",
      gelosia: "Gelosia", avvolgibile_esterno: "Avvolgibile", a_libro: "A libro", griglia_sicurezza: "Griglia sicurezza", brise_soleil: "Brise-soleil",
    };
    for (const [tipo, alt] of Object.entries(etichette)) {
      expect(srcDi(alt), tipo).toContain(atteso(SHUTTER_TYPE_PHOTOS[tipo]));
    }
    expect(srcDi("Veneziana esterna")).toEqual(["/render-references/thumbs/shutters/Veneziana-Esterna-A-Lamelle-Orientabili-Su-Guide.webp"]);
  });

  it("i materiali con foto la mostrano, gli altri no", () => {
    render(<PersianeConfigForm value={DEFAULT_PERSIANE_CONFIG} onChange={() => {}} />);
    expect(srcDi("Legno naturale")).toContain(atteso(SHUTTER_MATERIAL_PHOTOS.legno_naturale));
    expect(srcDi("Fibra di vetro")).toContain(atteso(SHUTTER_MATERIAL_PHOTOS.fibra_vetro));
    expect(srcDi("Alluminio")).toContain(atteso(SHUTTER_MATERIAL_PHOTOS.alluminio));
    expect(screen.queryByRole("img", { name: "PVC" })).toBeNull();
  });

  it("gli effetti legno mostrano la foto dell'essenza; il rovere chiaro resta col campione", () => {
    render(<PersianeConfigForm value={{ ...DEFAULT_PERSIANE_CONFIG, colore_mode: "legno" }} onChange={() => {}} />);
    expect(srcDi("Rovere scuro")).toContain(atteso(SHUTTER_WOOD_FINISH_PHOTOS.rovere_scuro));
    expect(srcDi("Noce nazionale")).toContain(atteso(SHUTTER_WOOD_FINISH_PHOTOS.noce_nazionale));
    expect(srcDi("Castagno")).toContain(atteso(SHUTTER_WOOD_FINISH_PHOTOS.castagno));
    expect(srcDi("Douglas")).toContain(atteso(SHUTTER_WOOD_FINISH_PHOTOS.douglas));
    expect(screen.queryByRole("img", { name: "Rovere chiaro" })).toBeNull();
  });
});

describe("miniature nel form pergole", () => {
  it("default: la foto della tipologia, della copertura e del materiale scelti; niente per chiusure e luci assenti", () => {
    render(<PergoleConfigForm value={DEFAULT_PERGOLE_CONFIG} onChange={() => {}} />);
    expect(srcDi("Bioclimatica addossata")).toEqual([atteso(PERGOLA_TYPE_PHOTOS.bioclimatica_addossata)]);
    expect(srcDi("Lamelle orientabili")).toEqual([atteso(PERGOLA_COVER_PHOTOS.lamelle_orientabili)]);
    expect(srcDi("Alluminio")).toEqual([atteso(PERGOLA_MATERIAL_PHOTOS.alluminio)]);
    expect(screen.getAllByRole("img")).toHaveLength(3);
  });

  it("la miniatura segue la scelta: telo, screen ZIP, strip LED, legno (con l'alluminio di default letto come lamellare)", () => {
    const config: ConfigurazionePergole = {
      ...DEFAULT_PERGOLE_CONFIG,
      installazione: { ...DEFAULT_PERGOLE_CONFIG.installazione, addossata_si_no: false, numero_montanti: 4 },
      struttura: { ...DEFAULT_PERGOLE_CONFIG.struttura, tipo: "legno_autoportante" },
      copertura: { tipo: "telo_retraibile", stato: "telo_disteso" },
      chiusure_laterali: { tipo: "screen_zip", stato: "chiuse" },
      illuminazione: "strip_led_perimetrale",
    };
    render(<PergoleConfigForm value={config} onChange={() => {}} />);
    expect(srcDi("Legno autoportante")).toEqual([atteso(PERGOLA_TYPE_PHOTOS.legno_autoportante)]);
    expect(srcDi("Telo retraibile")).toEqual([atteso(PERGOLA_COVER_PHOTOS.telo_retraibile)]);
    expect(srcDi("Screen ZIP")).toEqual([atteso(PERGOLA_SIDE_PHOTOS.screen_zip)]);
    expect(srcDi("Strip LED perimetrale")).toEqual([atteso(PERGOLA_LIGHTING_PHOTOS.strip_led_perimetrale)]);
    expect(srcDi("Legno lamellare")).toEqual([atteso(PERGOLA_MATERIAL_PHOTOS.legno_lamellare)]);
  });
});
