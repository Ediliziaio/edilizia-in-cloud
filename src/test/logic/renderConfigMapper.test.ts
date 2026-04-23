/**
 * Smoke test per il fix A3 (Supermaster Render): il flag manigliaCentrale è
 * ortogonale al profilo e non forza più materiale=alluminio.
 */
import { describe, it, expect } from "vitest";
import {
  mapWizardToConfig,
  WIZARD_PROFILI,
  PROFILI_MANIGLIA_CENTRALE_COMPATIBILI,
  type WizardState,
} from "@/modules/render/lib/configMapper";

const baseState: WizardState = {
  tipo: "F2A",
  profilo: "pvc",
  manigliaCentrale: false,
  coloreInfisso: "9016",
  tipoManiglia: "classica_dritta",
  coloreHw: "cromo",
  cass: false,
  cassMat: "stesso_colore",
  cassCol: "",
  tapp: "no",
  tappCol: "stesso",
};

describe("configMapper — A3 manigliaCentrale decoupled", () => {
  it("WIZARD_PROFILI non contiene più 'maniglia_centrale'", () => {
    const ids = WIZARD_PROFILI.map((p) => p.id);
    expect(ids).not.toContain("maniglia_centrale");
  });

  it("PVC + manigliaCentrale=false → materiale PVC, stile europeo classico", () => {
    const out = mapWizardToConfig({ ...baseState, profilo: "pvc", manigliaCentrale: false });
    expect(out.nuovo_infisso.materiale).toBe("pvc");
    expect(out.nuovo_infisso.stile_telaio).toBe("europeo_classico");
  });

  it("PVC + manigliaCentrale=true → materiale PVC (NON alluminio), stile nodo_ridotto_maniglia_centrale", () => {
    const out = mapWizardToConfig({ ...baseState, profilo: "pvc", manigliaCentrale: true });
    expect(out.nuovo_infisso.materiale).toBe("pvc");
    expect(out.nuovo_infisso.stile_telaio).toBe("nodo_ridotto_maniglia_centrale");
  });

  it("Legno + manigliaCentrale=true → materiale legno, stile nodo_ridotto_maniglia_centrale", () => {
    const out = mapWizardToConfig({ ...baseState, profilo: "legno", manigliaCentrale: true });
    expect(out.nuovo_infisso.materiale).toBe("legno");
    expect(out.nuovo_infisso.stile_telaio).toBe("nodo_ridotto_maniglia_centrale");
  });

  it("Alluminio + manigliaCentrale=true → alluminio, stile nodo_ridotto_maniglia_centrale", () => {
    const out = mapWizardToConfig({ ...baseState, profilo: "alluminio", manigliaCentrale: true });
    expect(out.nuovo_infisso.materiale).toBe("alluminio");
    expect(out.nuovo_infisso.stile_telaio).toBe("nodo_ridotto_maniglia_centrale");
  });

  it("Minimal + manigliaCentrale=true → alluminio, stile nodo_ridotto_maniglia_centrale (override di minimal_squadrato)", () => {
    const out = mapWizardToConfig({ ...baseState, profilo: "minimal", manigliaCentrale: true });
    expect(out.nuovo_infisso.materiale).toBe("alluminio");
    expect(out.nuovo_infisso.stile_telaio).toBe("nodo_ridotto_maniglia_centrale");
  });

  it("PROFILI_MANIGLIA_CENTRALE_COMPATIBILI contiene solo id presenti in WIZARD_PROFILI", () => {
    const ids = WIZARD_PROFILI.map((p) => p.id);
    for (const c of PROFILI_MANIGLIA_CENTRALE_COMPATIBILI) {
      expect(ids).toContain(c);
    }
  });
});
