import { describe, expect, it } from "vitest";

import { bridgeTechnicalConfig } from "../../../shared/render-technical/bridge";
import { buildGardenPrompt } from "../../../shared/render-garden/gardenPromptBuilder";
import { buildExteriorFloorPrompt } from "../../../shared/render-exterior-floor/exteriorFloorPromptBuilder";
import { buildInteriorDoorPrompt } from "../../../shared/render-interior-door/interiorDoorPromptBuilder";
import { buildSecurityDoorPrompt } from "../../../shared/render-security-door/securityDoorPromptBuilder";
import { technicalRenderModuleSpecs } from "@/lib/render/technicalRenderModules";

/**
 * Il ponte generico->ricco deve produrre, per OGNI preset di OGNI modulo, una
 * configurazione che la libreria di prompt giudica valida. Non e' pignoleria:
 * l'edge tecnica abortisce il render quando `validation.is_valid` e' falso,
 * quindi un preset che produce una config invalida e' un modulo che non
 * funziona per quel preset — e nessuno se ne accorgerebbe fino al primo
 * cliente.
 * Verifica anche che il testo libero dell'utente arrivi nel prompt: l'audit
 * ha trovato due campi raccolti dal form e mai letti (persiane, pergole); qui
 * ci si assicura che non succeda per i moduli tecnici.
 */
const builders = {
  giardini: buildGardenPrompt,
  "pavimenti-esterni": buildExteriorFloorPrompt,
  "porte-interne": buildInteriorDoorPrompt,
  "porte-blindate": buildSecurityDoorPrompt,
} as const;

const generico = {
  targetArea: "la zona davanti al deck di legno",
  materialOrSystem: "sistema richiesto dal cliente",
  colorAndFinish: "grigio caldo opaco",
  technicalDetails: "bordi in acciaio corten",
  preserveNotes: "casa, deck in legno, ulivo a sinistra",
  intensity: "media",
};

describe("ponte config generica -> librerie di prompt dei moduli tecnici", () => {
  for (const modulo of Object.keys(builders) as Array<keyof typeof builders>) {
    const presets = technicalRenderModuleSpecs[modulo].presets.map((p) => p.value);

    it(`${modulo}: ha preset da coprire`, () => {
      expect(presets.length).toBeGreaterThan(0);
    });

    for (const preset of presets) {
      it(`${modulo} / ${preset}: config valida e testo libero nel prompt`, () => {
        const ricca = bridgeTechnicalConfig(modulo, { ...generico, interventionPreset: preset });
        const built = builders[modulo](ricca as Record<string, unknown>);
        expect(built.validation.isValid, JSON.stringify(built.validation)).toBe(true);
        const prompt = `${built.systemPrompt}\n${built.userPrompt}`;
        expect(prompt).toContain("ulivo a sinistra");
        expect(prompt).toContain("corten");
      });
    }
  }
});
