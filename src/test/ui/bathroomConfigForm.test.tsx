import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { BathroomConfigForm } from "@/components/render-bagno/BathroomConfigForm";
import { DEFAULT_BATHROOM_CONFIG, DEFAULT_TERMOARREDO } from "@/components/render-bagno/defaultBathroomConfig";
import { referenceThumbUrl } from "../../../shared/render-references/thumbs.ts";
import {
  BATHTUB_TYPE_PHOTOS,
  FAUCET_FINISH_PHOTOS,
  SANITARY_COLOUR_PHOTOS,
  SHOWER_GLASS_PHOTOS,
  SHOWER_TYPE_PHOTOS,
  TILE_EFFECT_PHOTOS,
  TOILET_PHOTOS,
  VANITY_STYLE_PHOTOS,
  VANITY_TOP_PHOTOS,
} from "../../../shared/render-references/bathroomReferences.ts";
import type { PhotoTable } from "../../../shared/render-references/referencePicker.ts";

function renderForm(onChange: ReturnType<typeof vi.fn>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <BathroomConfigForm
        value={structuredClone(DEFAULT_BATHROOM_CONFIG)}
        onChange={onChange}
      />,
    );
  });

  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function getButtonByText(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll("button"))
    .find((item) => item.textContent?.includes(text));
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}

function getByLabel(container: HTMLElement, label: string) {
  const el = container.querySelector(`[aria-label="${label}"]`);
  if (!el) throw new Error(`Element not found: ${label}`);
  return el as HTMLElement;
}

describe("BathroomConfigForm", () => {
  it("renders material choices as touch-friendly selectable controls", () => {
    const onChange = vi.fn();
    const { container, cleanup } = renderForm(onChange);

    const selectedWallMaterial = getButtonByText(container, "Marmo Carrara");
    expect(selectedWallMaterial).toHaveAttribute("aria-pressed", "true");

    act(() => {
      getButtonByText(container, "Marmo Calacatta").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        piastrelle_parete: expect.objectContaining({
          effetto: "marmo_calacatta",
        }),
      }),
    );

    cleanup();
  });

  it("keeps free notes editable without resetting the current configuration", () => {
    const onChange = vi.fn();
    const { container, cleanup } = renderForm(onChange);

    const notes = container.querySelector("textarea");
    expect(notes).not.toBeNull();

    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(notes, "Mantieni la luce naturale e non aggiungere decorazioni.");
      notes!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo_intervento: DEFAULT_BATHROOM_CONFIG.tipo_intervento,
        note_libere: "Mantieni la luce naturale e non aggiungere decorazioni.",
      }),
    );

    cleanup();
  });

  it("termoarredo e illuminazione: sezioni nuove, spente e assenti dalla configurazione finché non si accendono", () => {
    expect(DEFAULT_BATHROOM_CONFIG.termoarredo).toBeUndefined();
    expect(DEFAULT_BATHROOM_CONFIG.sostituzione.termoarredo).toBeUndefined();
    const onChange = vi.fn();
    const { container, cleanup } = renderForm(onChange);

    const termoarredo = getByLabel(container, "Cambia il termoarredo");
    expect(termoarredo.getAttribute("aria-checked")).toBe("false");
    act(() => {
      termoarredo.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      sostituzione: expect.objectContaining({ termoarredo: true }),
      termoarredo: { ...DEFAULT_TERMOARREDO, attivo: true },
    }));

    act(() => {
      getByLabel(container, "Cambia l'illuminazione").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      sostituzione: expect.objectContaining({ illuminazione: true }),
      illuminazione_tipo: "faretti_incasso",
    }));

    cleanup();
  });

  it("nicchia e scarico della doccia partono «non indicati»", () => {
    const onChange = vi.fn();
    const { container, cleanup } = renderForm(onChange);
    // Le sezioni Doccia e Vasca sono chiuse: si aprono come farebbe l'utente.
    for (const sezione of ["Doccia", "Vasca"]) {
      const trigger = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.trim() === sezione);
      act(() => {
        trigger!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }
    expect(getByLabel(container, "Nicchia nella parete della doccia").textContent).toContain("Non indicata");
    expect(getByLabel(container, "Scarico della doccia").textContent).toContain("Non indicato");
    // Il default è una vasca freestanding: la parete sopravasca non si offre.
    expect(container.querySelector('[aria-label="Parete doccia sulla vasca"]')).toBeNull();
    cleanup();
  });

  it("le miniature sono le stesse foto che il motore allega: tipi, finiture, colori e tutti gli effetti piastrella con foto", () => {
    const onChange = vi.fn();
    const { container, cleanup } = renderForm(onChange);
    for (const sezione of ["Doccia", "Vasca", "Mobile bagno", "Sanitari", "Rubinetteria"]) {
      const trigger = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.trim() === sezione);
      act(() => {
        trigger!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }
    const thumb = (tabella: PhotoTable, chiave: string) => referenceThumbUrl(tabella[chiave].folder, tabella[chiave].filename);
    const srcDi = (alt: string) => Array.from(container.querySelectorAll("img")).filter((img) => img.getAttribute("alt") === alt).map((img) => img.getAttribute("src"));

    // Tipi: ogni scheda porta la foto della sua chiave (alt = cosa mostra).
    const attese: Array<[string, PhotoTable, string]> = [
      ["Doccia walk-in", SHOWER_TYPE_PHOTOS, "walk_in"], ["Box doccia in nicchia", SHOWER_TYPE_PHOTOS, "nicchia_box"],
      ["Box doccia frontale", SHOWER_TYPE_PHOTOS, "frontale_box"], ["Box doccia angolare", SHOWER_TYPE_PHOTOS, "angolare"],
      ["Box doccia semicircolare", SHOWER_TYPE_PHOTOS, "semicircolare"],
      ["Vasca freestanding ovale", BATHTUB_TYPE_PHOTOS, "freestanding_ovale"], ["Vasca freestanding rettangolare", BATHTUB_TYPE_PHOTOS, "freestanding_rettangolare"],
      ["Vasca back-to-wall", BATHTUB_TYPE_PHOTOS, "back_to_wall"], ["Vasca incassata", BATHTUB_TYPE_PHOTOS, "incassata"], ["Vasca angolare", BATHTUB_TYPE_PHOTOS, "angolare"],
      ["Mobile bagno sospeso moderno", VANITY_STYLE_PHOTOS, "sospeso_moderno"], ["Mobile bagno sospeso minimal", VANITY_STYLE_PHOTOS, "sospeso_minimal"],
      ["Mobile bagno a terra classico", VANITY_STYLE_PHOTOS, "a_terra_classico"], ["Mobile bagno a terra industrial", VANITY_STYLE_PHOTOS, "a_terra_industrial"],
      ["WC sospeso", TOILET_PHOTOS, "sospeso"], ["WC a terra", TOILET_PHOTOS, "a_terra"], ["WC sospeso rimless", TOILET_PHOTOS, "rimless_sospeso"],
      ["Rubinetto cromo", FAUCET_FINISH_PHOTOS, "cromo"], ["Rubinetto nero opaco", FAUCET_FINISH_PHOTOS, "nero_opaco"],
      ["Rubinetto oro spazzolato", FAUCET_FINISH_PHOTOS, "oro_spazzolato"], ["Rubinetto oro rosa", FAUCET_FINISH_PHOTOS, "oro_rosa"],
      ["Rubinetto acciaio spazzolato", FAUCET_FINISH_PHOTOS, "acciaio_spazzolato"],
      ["Sanitario bianco", SANITARY_COLOUR_PHOTOS, "bianco"], ["Sanitario grigio chiaro", SANITARY_COLOUR_PHOTOS, "grigio_chiaro"],
      ["Sanitario nero opaco", SANITARY_COLOUR_PHOTOS, "nero_opaco"], ["Quarzo", VANITY_TOP_PHOTOS, "quarzo"],
    ];
    for (const [alt, tabella, chiave] of attese) expect(srcDi(alt), alt).toEqual([thumb(tabella, chiave)]);

    // Piastrelle: parete e pavimento sono aperte; ognuno dei 22 effetti con foto c'è due volte.
    const srcPiastrelle = Array.from(container.querySelectorAll("img")).map((img) => img.getAttribute("src"));
    for (const chiave of Object.keys(TILE_EFFECT_PHOTOS)) {
      expect(srcPiastrelle.filter((src) => src === thumb(TILE_EFFECT_PHOTOS, chiave)), chiave).toHaveLength(2);
    }
    // Le tinte unite restano campioni disegnati, senza foto.
    const monocromo = Array.from(container.querySelectorAll("button")).filter((b) => b.textContent?.includes("Verde salvia"));
    expect(monocromo).toHaveLength(2);
    for (const scheda of monocromo) expect(scheda.querySelector("img")).toBeNull();

    // Accanto alle tendine dei dettagli: la foto della scelta corrente.
    expect(srcDi("Vetro del box doccia")).toEqual([thumb(SHOWER_GLASS_PHOTOS, DEFAULT_BATHROOM_CONFIG.doccia.box_vetro)]);
    expect(container.querySelectorAll("[data-foto-scelta]").length).toBeGreaterThanOrEqual(9);
    cleanup();
  });
});
