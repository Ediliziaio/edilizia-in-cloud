import { describe, expect, it } from "vitest";
import { normalizzaMaterialeSerramento } from "@/lib/preventivi/verticalWizardDraft";

/**
 * Provato dal vivo il 26/10/2026 su Demo 2: l'AI proponeva «PVC» e «Rivedi e applica» restava
 * spento con «Materiale non supportato», perché il configuratore vuole «pvc» minuscolo.
 */
describe("materiale del serramento scritto dall'AI o a mano", () => {
  it.each([
    ["PVC", "pvc"], ["pvc", "pvc"], ["  Pvc ", "pvc"], ["Alluminio", "alluminio"], ["LEGNO", "legno"],
    ["Alluminio-legno", "alluminio_legno"], ["alluminio legno", "alluminio_legno"], ["Legno/Alluminio", "alluminio_legno"],
    ["Acciaio", "acciaio"], ["Misto", "misto"],
  ])("«%s» diventa %s", (scritto, atteso) => {
    expect(normalizzaMaterialeSerramento(scritto)).toBe(atteso);
  });

  it("vuoto o assente: nessun materiale, non un errore", () => {
    expect(normalizzaMaterialeSerramento(null)).toBeNull();
    expect(normalizzaMaterialeSerramento(undefined)).toBeNull();
    expect(normalizzaMaterialeSerramento("   ")).toBeNull();
  });

  it("un materiale sconosciuto resta rifiutato", () => {
    expect(normalizzaMaterialeSerramento("plastica")).toBeUndefined();
    expect(normalizzaMaterialeSerramento("PVC bianco")).toBeUndefined();
  });
});
