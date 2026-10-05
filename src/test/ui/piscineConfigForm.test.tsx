import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { PiscineConfigForm } from "@/components/render-piscine/PiscineConfigForm";
import { DEFAULT_PISCINE_CONFIG } from "@/components/render-piscine/defaultPiscineConfig";
import { OpzioneConFoto, fotoOpzionePiscina, type DimensioneFotoPiscina } from "@/components/render-piscine/fotoOpzioniPiscina";
import type { ConfigurazionePiscine } from "@/modules/render-piscine/lib/types";
import {
  POOL_ACCESS_REFERENCES,
  POOL_COPING_REFERENCES,
  POOL_EDGE_SYSTEM_REFERENCES,
  POOL_FEATURE_REFERENCES,
  POOL_INTERIOR_FINISH_REFERENCES,
  POOL_RESTORED_SURFACE_REFERENCES,
  POOL_SURROUND_REFERENCES,
  POOL_TYPE_REFERENCES,
  POOL_WATER_COLOUR_REFERENCES,
} from "../../../shared/render-references/poolReferences.ts";
import { referenceThumbUrl } from "../../../shared/render-references/thumbs.ts";
import type { PhotoTable } from "../../../shared/render-references/referencePicker.ts";

function monta(elemento: ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(elemento));
  return {
    container,
    smonta: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function form(value: ConfigurazionePiscine, onChange = vi.fn()) {
  return { ...monta(<PiscineConfigForm value={value} onChange={onChange} />), onChange };
}

const TABELLE: Record<DimensioneFotoPiscina, PhotoTable> = {
  tipo: POOL_TYPE_REFERENCES,
  sistema_bordo: POOL_EDGE_SYSTEM_REFERENCES,
  rivestimento: POOL_INTERIOR_FINISH_REFERENCES,
  colore_acqua: POOL_WATER_COLOUR_REFERENCES,
  coping: POOL_COPING_REFERENCES,
  area_perimetrale: POOL_SURROUND_REFERENCES,
  accesso: POOL_ACCESS_REFERENCES,
  accessori: POOL_FEATURE_REFERENCES,
  superficie_ripristino: POOL_RESTORED_SURFACE_REFERENCES,
};

describe("form piscine: miniature delle opzioni", () => {
  it("ogni opzione con foto mostra la miniatura della foto che il motore allega (a colori anche per quelle in B/N)", () => {
    for (const [dimensione, tabella] of Object.entries(TABELLE) as Array<[DimensioneFotoPiscina, PhotoTable]>) {
      for (const [valore, entry] of Object.entries(tabella)) {
        expect(fotoOpzionePiscina(dimensione, valore), `${dimensione}=${valore}`).toBe(entry);
        const { container, smonta } = monta(<OpzioneConFoto dimensione={dimensione} valore={valore} label="Etichetta" />);
        const img = container.querySelector("img");
        expect(img?.getAttribute("src"), `${dimensione}=${valore}`).toBe(referenceThumbUrl(entry.folder, entry.filename));
        expect(img?.getAttribute("alt")).toBe("Etichetta");
        smonta();
      }
    }
  });

  it("un'opzione senza foto resta col solo nome", () => {
    // dal 05/10/2026 tutte le tipologie e tutti gli accessori hanno la foto: restano senza lo skimmer (la vasca normale) e «nessun accesso»
    expect(fotoOpzionePiscina("sistema_bordo", "skimmer")).toBeUndefined();
    expect(fotoOpzionePiscina("accesso", "nessuno")).toBeUndefined();
    expect(fotoOpzionePiscina("accessori", "toString")).toBeUndefined();
    const { container, smonta } = monta(<OpzioneConFoto dimensione="area_perimetrale" valore="mantieni_esistente" label="Mantieni esistente" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("Mantieni esistente");
    smonta();
  });

  it("le card degli accessori: miniatura da 40 px, selezione, e la recinzione in vetro con la sua foto di forma (miniatura a colori)", () => {
    const { container, onChange, smonta } = form(structuredClone(DEFAULT_PISCINE_CONFIG));
    const card = (testo: string) => Array.from(container.querySelectorAll("button")).find((b) => b.textContent === testo);
    const lama = card("Lama d'acqua");
    const entry = POOL_FEATURE_REFERENCES.lama_dacqua;
    expect(lama?.querySelector("img")?.getAttribute("src")).toBe(referenceThumbUrl(entry.folder, entry.filename));
    expect(lama.getAttribute("aria-pressed")).toBe("false");
    const recinzione = POOL_FEATURE_REFERENCES.recinzione_vetro;
    expect(card("Recinzione in vetro")?.querySelector("img")?.getAttribute("src")).toBe(referenceThumbUrl(recinzione.folder, recinzione.filename));
    expect(referenceThumbUrl(recinzione.folder, recinzione.filename)).toMatch(/\/thumbs\/pools\/Recinzione-Di-Sicurezza-In-Vetro-Per-Piscina\.webp$/);
    act(() => {
      lama?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ comfort: expect.objectContaining({ accessori: ["lama_dacqua"] }) }));
    smonta();
  });

  it("le tendine mostrano il nome della scelta, senza immagine nel bottone", () => {
    const { container, smonta } = form(structuredClone(DEFAULT_PISCINE_CONFIG));
    const bottoni = Array.from(container.querySelectorAll("button[role='combobox']"));
    const testi = bottoni.map((b) => b.textContent);
    expect(testi).toEqual(expect.arrayContaining(["Interrata rettangolare", "Mosaico grigio", "Travertino", "Prato raccordato", "Cristallina chiara", "Skimmer premium"]));
    for (const b of bottoni) expect(b.querySelector("img")).toBeNull();
    smonta();
  });
});

describe("form piscine: elementi nuovi", () => {
  it("rimozione: compare «Al posto della piscina»; con le scelte in contraddizione compare l'avviso", () => {
    const rimozione = form({ ...structuredClone(DEFAULT_PISCINE_CONFIG), operazione: "remove_existing_pool" });
    expect(rimozione.container.textContent).toContain("Al posto della piscina");
    rimozione.smonta();
    const base = form(structuredClone(DEFAULT_PISCINE_CONFIG));
    expect(base.container.textContent).not.toContain("Al posto della piscina");
    expect(base.container.querySelector("[role='status']")).toBeNull();
    base.smonta();
    const conflitto = form({
      ...structuredClone(DEFAULT_PISCINE_CONFIG),
      finiture: { ...DEFAULT_PISCINE_CONFIG.finiture, rivestimento_interno: "liner_scuro" },
      piscina: { ...DEFAULT_PISCINE_CONFIG.piscina, colore_acqua: "turchese" },
    });
    expect(conflitto.container.querySelector("[role='status']")?.textContent).toContain("il render segue il rivestimento");
    conflitto.smonta();
  });

  it("misure reali: si scrivono all'italiana e arrivano al config come numero", () => {
    const { container, onChange, smonta } = form(structuredClone(DEFAULT_PISCINE_CONFIG));
    const input = container.querySelector<HTMLInputElement>("#piscina-lunghezza");
    expect(input).not.toBeNull();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "8,5");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ piscina: expect.objectContaining({ lunghezza_m: 8.5 }) }));
    smonta();
  });

  it("il rivestimento esterno compare solo con una vasca rialzata", () => {
    const interrata = form(structuredClone(DEFAULT_PISCINE_CONFIG));
    expect(interrata.container.textContent).not.toContain("Rivestimento esterno vasca");
    interrata.smonta();
    const fuoriTerra = form({
      ...structuredClone(DEFAULT_PISCINE_CONFIG),
      piscina: { ...DEFAULT_PISCINE_CONFIG.piscina, tipo: "fuori_terra_premium" },
      inserimento: { ...DEFAULT_PISCINE_CONFIG.inserimento, quota_bordo: "fuori_terra" },
    });
    expect(fuoriTerra.container.textContent).toContain("Rivestimento esterno vasca");
    fuoriTerra.smonta();
  });
});
