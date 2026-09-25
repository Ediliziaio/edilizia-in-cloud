import { describe, expect, it } from "vitest";
import { coverStyleOnly, detectCoverStyle } from "@/lib/preventivi/templateCoverStyle";
import { COVER_PRESETS as bagni } from "@/components/bagni/coverPresets";
import { COVER_PRESETS as serramenti } from "@/components/serramenti/coverPresets";
import { COVER_PRESETS as fotovoltaico } from "@/components/fotovoltaico/coverPresets";
import { COVER_PRESETS as ristrutturazione } from "@/components/ristrutturazione/coverPresets";
import { COVER_PRESETS as tetti } from "@/components/tetti/coverPresets";
import { COVER_PRESETS as climatizzazione } from "@/components/climatizzazione/coverPresets";
import { COVER_PRESETS as elettrico } from "@/components/elettrico/coverPresets";
import { COVER_PRESETS as termoidraulico } from "@/components/termoidraulico/coverPresets";
import { COVER_PRESETS as pavimenti } from "@/components/pavimenti/coverPresets";
import { COVER_PRESETS as piscine } from "@/components/piscine/coverPresets";

for (const [area, presets] of Object.entries({ bagni, serramenti, fotovoltaico, ristrutturazione, tetti, climatizzazione, elettrico, termoidraulico, pavimenti, piscine })) {
  describe(`stili copertina: ${area}`, () => {
    for (const preset of presets) {
      it(`${preset.id}: conserva foto, rimozione esplicita e testi`, () => {
        const originalPatch = JSON.stringify(preset.patch);
        for (const image of ["/foto-personale.jpg", null, ""]) {
          const original = { pdf_cover_image_url: image, cover_image_url: image, pdf_cover_title: "Titolo aziendale", note: "Dato aggiuntivo" };
          const styled = { ...original, ...coverStyleOnly(preset.patch) };
          expect(styled).toMatchObject(original);
          expect(detectCoverStyle(styled, [preset])).toBe(preset.id);
        }
        expect(JSON.stringify(preset.patch)).toBe(originalPatch);
      });
    }
  });
}
