import type { TraitCode, ProfiloTipoV5, ReliabilityIndex } from "../types";
import type { SyndromeResult } from "../lib/syndromes";
import { PremiumReportPDFButton } from "./PremiumReportPDFButton";

type PremiumReportButtonProps = {
  candidate: {
    nome: string;
    cognome: string;
    sesso?: string | null;
    ruolo_richiesto?: string | null;
    completed_at?: string | null;
    funzione?: string | null;
    eta?: number | null;
  };
  report: {
    traits_v5: Record<string, number>;
    macro_areas: { essere_pct: number; fare_pct: number; avere_pct: number };
    profile_type: string;
    reliability_index: ReliabilityIndex;
    syndromes_detected: unknown[];
  };
};

export function PremiumReportButton({ candidate, report }: PremiumReportButtonProps) {
  return (
    <PremiumReportPDFButton
      candidato={{
        nome: candidate.nome,
        cognome: candidate.cognome,
        sesso: candidate.sesso ?? null,
        ruolo_attuale: candidate.ruolo_richiesto ?? null,
        data_test: candidate.completed_at ?? null,
        funzione: candidate.funzione ?? candidate.ruolo_richiesto ?? null,
        eta: candidate.eta ?? null,
      }}
      traits={report.traits_v5 as Record<TraitCode, number>}
      macroAreas={{
        essere: report.macro_areas.essere_pct,
        fare: report.macro_areas.fare_pct,
        avere: report.macro_areas.avere_pct,
      }}
      profiloTipo={report.profile_type as ProfiloTipoV5}
      reliabilityIndex={report.reliability_index}
      syndromes={(report.syndromes_detected ?? []) as SyndromeResult[]}
    />
  );
}
