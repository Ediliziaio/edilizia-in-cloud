import type { TraitCode } from "../types";
import type { MappaInterioreResult } from "./mappaInteriore";
import type { SyndromeResult } from "./syndromes";
import { calculateMappaInteriore } from "./mappaInteriore";
import { getPersonalizedManagementTips, getPersonalizedClosingText } from "./managementTipsV5";
import { personalizzaTesto, getFascia, getTraitNarrative } from "./traitNarrativesV5";

export const CACHE_VERSION = 1;

export type ManagementTipCached = { testo: string; isPriorityOne: boolean };
export type TraitNarrativeCached = { fascia: string; testo: string };

export type CachedDerivedReport = {
  mappa_interiore: MappaInterioreResult | null;
  management_tips: ManagementTipCached[];
  management_closing: string;
  trait_narratives: Record<string, TraitNarrativeCached>;
};

const TRAIT_ORDER: TraitCode[] = [
  "ORG", "AUT", "GP", "ADS", "DET", "VEN", "HRM",
  "LDR", "PRO", "COM", "ESP", "RC", "FIN", "SUC", "PRI",
];

export function computeDerivedReport(input: {
  traits: Record<string, number>;
  candidateName: string;
  candidateSesso?: string | null;
  candidateEta?: number | null;
  syndromes: SyndromeResult[];
}): CachedDerivedReport {
  const { traits, candidateName, candidateSesso, candidateEta, syndromes } = input;
  const traitMap = traits as Record<TraitCode, number>;

  let mappa: MappaInterioreResult | null = null;
  try {
    mappa = calculateMappaInteriore(traitMap, candidateName, candidateSesso ?? null, syndromes, candidateEta ?? undefined);
  } catch {
    mappa = null;
  }

  let tips: ManagementTipCached[] = [];
  let closing = "";
  try {
    const raw = getPersonalizedManagementTips(traitMap, candidateName, candidateSesso ?? null, syndromes.map((s) => s.code));
    tips = raw.map((t) => ({ testo: t.testo, isPriorityOne: Boolean(t.tip?.isPriorityOne) }));
    closing = getPersonalizedClosingText(candidateName, candidateSesso ?? null);
  } catch {
    /* keep empty defaults */
  }

  const narratives: Record<string, TraitNarrativeCached> = {};
  try {
    for (const code of TRAIT_ORDER) {
      const value = Math.max(0, Math.min(100, Math.round(traitMap[code] || 0)));
      const fascia = getFascia(value);
      const tpl = getTraitNarrative(code, fascia);
      if (tpl) {
        narratives[code] = { fascia, testo: personalizzaTesto(tpl, candidateName, candidateSesso ?? null) };
      }
    }
  } catch {
    /* partial narratives are still useful */
  }

  return {
    mappa_interiore: mappa,
    management_tips: tips,
    management_closing: closing,
    trait_narratives: narratives,
  };
}
