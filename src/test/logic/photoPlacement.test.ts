import { describe, expect, it } from "vitest";
import {
  PHOTO_COMPONENTS,
  photoPlacementCaption,
  surveyPhotoPlacement,
  constrainPlacement,
  equipmentArtwork,
  placementBox,
  type PhotoComponentKind,
  type PhotoPlacement,
} from "@/lib/surveys/photoPlacement";
const item: PhotoPlacement = {
  id: "one",
  kind: "split",
  x: 0.5,
  y: 0.5,
  width: 0.32,
  rotation: 0,
  label: "Clima sopra porta",
};
describe("Proposte di posizionamento foto", () => {
  it("abilita anche i tipi clima storici e personalizzati senza cambiare gli schemi aziendali", () => {
    expect(surveyPhotoPlacement("climatizzazione", "unita_interna")).toEqual({
      enabled: true,
      kind: "split",
    });
    expect(surveyPhotoPlacement("climatizzazione", "unita_esterna")).toEqual({
      enabled: true,
      kind: "outdoor",
    });
    expect(surveyPhotoPlacement("climatizzazione", "tipo_custom").enabled).toBe(
      true,
    );
    expect(surveyPhotoPlacement("fotovoltaico", "en_falda")).toEqual({
      enabled: true,
      kind: "panel",
    });
    expect(surveyPhotoPlacement("infissi", "unita_interna").enabled).toBe(
      false,
    );
  });
  it("riporta note leggibili in galleria e PDF, limitando metadata non validi", () => {
    expect(
      photoPlacementCaption({
        kind: "equipment-placement",
        items: [{ label: "Split parete nord" }, null],
        note: "Verificare scarico condensa",
      }),
    ).toEqual([
      "Posizionamento proposto - non in scala",
      "1. Split parete nord",
      "Note: Verificare scarico condensa",
    ]);
    expect(photoPlacementCaption({ kind: "other", note: "ignora" })).toEqual(
      [],
    );
  });
  for (const kind of Object.keys(PHOTO_COMPONENTS) as PhotoComponentKind[]) {
    it(`${kind}: mantiene l’intero ingombro ruotato nella foto verticale e orizzontale`, () => {
      for (const aspect of [0.55, 1, 1.8, 3])
        for (const rotation of [-45, 0, 45]) {
          const p = constrainPlacement(
            { ...item, kind, rotation, width: 0.75, x: -1, y: 8 },
            aspect,
          );
          const b = placementBox(p, aspect),
            a = (rotation * Math.PI) / 180;
          const ex =
            (Math.abs(b.width * Math.cos(a)) +
              Math.abs(b.height * Math.sin(a))) /
            2;
          const ey =
            (Math.abs(b.height * Math.cos(a)) +
              Math.abs(b.width * Math.sin(a))) /
            2;
          expect(p.x - ex).toBeGreaterThanOrEqual(-1e-8);
          expect(p.x + ex).toBeLessThanOrEqual(1 + 1e-8);
          expect(p.y - ey).toBeGreaterThanOrEqual(-1e-8);
          expect(p.y + ey).toBeLessThanOrEqual(1 + 1e-8);
        }
    });
  }
  it("limita valori non finiti, rotazione e testo senza assumere quote reali", () => {
    const p = constrainPlacement(
      { ...item, x: NaN, y: Infinity, rotation: 100, label: "a".repeat(200) },
      1.5,
    );
    expect(Number.isFinite(p.x)).toBe(true);
    expect(p.rotation).toBe(45);
    expect(p.label).toHaveLength(70);
    expect(p).not.toHaveProperty("metri");
  });
  it("simboli autonomi senza risorse esterne e diversi per le varie apparecchiature", () => {
    const artworks = Object.keys(PHOTO_COMPONENTS).map((kind) =>
      equipmentArtwork(kind as PhotoComponentKind),
    );
    expect(new Set(artworks).size).toBeGreaterThanOrEqual(5);
    for (const svg of artworks) {
      expect(svg).toContain("<svg");
      expect(svg).not.toMatch(/<script|<image|https?:\/\/(?!www.w3.org)/);
    }
  });
});
