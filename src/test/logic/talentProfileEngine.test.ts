import { describe, expect, it } from "vitest";
import { DOMANDE } from "@/features/talent-profile/data/questionario";
import { calcolaProfiloV5, CONTROL_QUESTIONS, SPECIAL_SCORING, type RispostaInputV5 } from "@/features/talent-profile/lib/scoringV5";
import { ROLE_PROFILES_V5, RUOLI_V5, calculateAllRolesCompatibilityV5 } from "@/features/talent-profile/lib/roleMatchingV5";
import { TRAIT_LABELS, type TraitCode } from "@/features/talent-profile/types";

describe("Talent Profile engine", () => {
  it("espone tutte le 242 domande V5 senza buchi di ordinamento", () => {
    expect(DOMANDE).toHaveLength(242);
    expect(DOMANDE.map((domanda) => domanda.id)).toEqual(Array.from({ length: 242 }, (_, index) => index + 1));
    expect(DOMANDE.map((domanda) => domanda.ordine)).toEqual(DOMANDE.map((domanda) => domanda.id));
    expect(new Set(DOMANDE.map((domanda) => domanda.testo.trim().toLowerCase())).size).toBe(DOMANDE.length);
    expect(new Set(DOMANDE.map((domanda) => domanda.blocco_tematico))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
  });

  it("mantiene domande speciali e controlli di attendibilita del modello originale", () => {
    expect(Object.keys(SPECIAL_SCORING).map(Number).sort((a, b) => a - b)).toEqual([72, 73, 211, 212, 213, 228]);
    expect(CONTROL_QUESTIONS).toEqual([238, 239, 240, 241, 242]);
    expect(DOMANDE.filter((domanda) => domanda.polarita === "S").map((domanda) => domanda.id)).toEqual([72, 73, 211, 212, 213, 228]);
    expect(DOMANDE.filter((domanda) => domanda.polarita === "C").map((domanda) => domanda.id)).toEqual([238, 239, 240, 241, 242]);
  });

  it("usa solo scale, polarita e risposte compatibili con il motore V5", () => {
    const validTraits = new Set(Object.keys(TRAIT_LABELS) as TraitCode[]);
    const validPolarities = new Set(["+", "-", "S", "C"]);

    for (const domanda of DOMANDE) {
      expect(validTraits.has(domanda.scala_primaria)).toBe(true);
      expect(validPolarities.has(domanda.polarita)).toBe(true);

      if (domanda.polarita === "S") {
        expect(domanda.risposte_custom).toEqual(expect.objectContaining({ a: expect.any(String), b: expect.any(String), c: expect.any(String) }));
      }
    }
  });

  it("espone ruoli completi, verticali per edilizia, univoci e con domande colloquio operative", () => {
    expect(RUOLI_V5).toEqual(Object.keys(ROLE_PROFILES_V5));
    expect(RUOLI_V5.length).toBeGreaterThanOrEqual(30);
    expect(RUOLI_V5).toEqual(expect.arrayContaining([
      "Capocantiere",
      "Tecnico Preventivista",
      "Posatore Serramenti",
      "Commerciale Cantieri",
      "Responsabile Commesse",
      "Installatore Fotovoltaico",
    ]));

    const validTraits = new Set(Object.keys(TRAIT_LABELS) as TraitCode[]);
    const roleIds = new Set<string>();

    for (const [roleName, profile] of Object.entries(ROLE_PROFILES_V5)) {
      expect(profile.nome).toBe(roleName);
      expect(profile.id).toMatch(/^[a-z0-9_]+$/);
      expect(roleIds.has(profile.id)).toBe(false);
      roleIds.add(profile.id);
      expect(profile.requisiti.length).toBeGreaterThanOrEqual(3);
      expect(profile.trattiFondamentali.length).toBeGreaterThanOrEqual(2);
      expect(profile.domandeColloquio.length).toBeGreaterThanOrEqual(3);

      for (const requirement of profile.requisiti) {
        expect(validTraits.has(requirement.trait)).toBe(true);
      }

      for (const trait of profile.trattiFondamentali) {
        expect(validTraits.has(trait)).toBe(true);
      }
    }
  });

  it("calcola profilo V5, attendibilita e compatibilita su 24 ruoli", () => {
    const risposte: RispostaInputV5[] = DOMANDE.map((domanda) => ({
      domanda_id: domanda.id,
      valore: domanda.polarita === "-" ? "C" : "A",
    }));

    const profilo = calcolaProfiloV5(risposte, DOMANDE, true);
    const matching = calculateAllRolesCompatibilityV5("Venditore/Commerciale", profilo.traits_v5);

    expect(profilo.assessment_version).toBe("v5");
    expect(profilo.reliability_index).toBe("YES");
    expect(Object.keys(profilo.traits_v5).sort()).toContain("ORG");
    expect(Object.keys(ROLE_PROFILES_V5).length).toBeGreaterThanOrEqual(30);
    expect(matching.tuttiRuoli.length).toBeGreaterThanOrEqual(30);
    expect(matching.ruoloRichiesto.ruolo).toBe("Venditore/Commerciale");
  });
});
