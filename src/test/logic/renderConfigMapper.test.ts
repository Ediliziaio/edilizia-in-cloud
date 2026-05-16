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
  tipoManiglia: "q_moderna",
  coloreHw: "cromo",
  traverso: "auto",
  cerniere: "visibili",
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

  it("PVC + manigliaCentrale=true → materiale PVC (NON alluminio), stile nodo_asimmetrico_maniglia_centrale", () => {
    const out = mapWizardToConfig({ ...baseState, profilo: "pvc", manigliaCentrale: true });
    expect(out.nuovo_infisso.materiale).toBe("pvc");
    expect(out.nuovo_infisso.stile_telaio).toBe("nodo_asimmetrico_maniglia_centrale");
  });

  // v8.2: legno classico NON supporta più nodo asimmetrico/maniglia centrale
  // (vedi PROFILI_NODO_ASIMMETRICO_COMPATIBILI in catalog.ts — legno escluso).
  // Il fallback è lo stile_telaio default del profilo legno = classico_arrotondato.
  it("Legno + manigliaCentrale=true → materiale legno, fallback stile classico (v8.2 disabilita nodo per legno)", () => {
    const out = mapWizardToConfig({ ...baseState, profilo: "legno", manigliaCentrale: true });
    expect(out.nuovo_infisso.materiale).toBe("legno");
    expect(out.nuovo_infisso.stile_telaio).toBe("classico_arrotondato");
  });

  it("Alluminio + manigliaCentrale=true → alluminio, stile nodo_asimmetrico_maniglia_centrale", () => {
    const out = mapWizardToConfig({ ...baseState, profilo: "alluminio", manigliaCentrale: true });
    expect(out.nuovo_infisso.materiale).toBe("alluminio");
    expect(out.nuovo_infisso.stile_telaio).toBe("nodo_asimmetrico_maniglia_centrale");
  });

  it("Minimal + manigliaCentrale=true → alluminio, stile nodo_asimmetrico_maniglia_centrale (override di minimal_squadrato)", () => {
    const out = mapWizardToConfig({ ...baseState, profilo: "minimal", manigliaCentrale: true });
    expect(out.nuovo_infisso.materiale).toBe("alluminio");
    expect(out.nuovo_infisso.stile_telaio).toBe("nodo_asimmetrico_maniglia_centrale");
  });

  it("PROFILI_MANIGLIA_CENTRALE_COMPATIBILI contiene solo id presenti in WIZARD_PROFILI", () => {
    const ids = WIZARD_PROFILI.map((p) => p.id);
    for (const c of PROFILI_MANIGLIA_CENTRALE_COMPATIBILI) {
      expect(ids).toContain(c);
    }
  });
});
