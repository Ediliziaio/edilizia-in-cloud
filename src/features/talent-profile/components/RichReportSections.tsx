import { useMemo } from "react";
import { TRAIT_LABELS, type TraitCode, type ProfiloTipoV5, type ReliabilityIndex } from "../types";
import type { SyndromeResult } from "../lib/syndromes";
import { SYNDROMES_V5_DATA } from "../lib/syndromesV5Data";
import { calculateMappaInteriore } from "../lib/mappaInteriore";
import { getPersonalizedManagementTips, getPersonalizedClosingText } from "../lib/managementTipsV5";
import { personalizzaTesto, getFascia, getTraitNarrative } from "../lib/traitNarrativesV5";
import { PROFILI_TIPO_V5_EXTENDED } from "../lib/profiloTipoV5Extended";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, BrainCircuit, Compass, Heart, Lightbulb, ShieldAlert } from "lucide-react";

const SEVERITY_TONE: Record<string, { bg: string; border: string; text: string; label: string }> = {
  RED: { bg: "bg-red-50", border: "border-red-200", text: "text-red-800", label: "Critica" },
  ORANGE: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-800", label: "Attenzione" },
  YELLOW: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800", label: "Vigilare" },
};

const TRAIT_ORDER: TraitCode[] = [
  "ORG", "AUT", "GP", "ADS", "DET", "VEN", "HRM",
  "LDR", "PRO", "COM", "ESP", "RC", "FIN", "SUC", "PRI",
];

type Candidate = {
  nome: string;
  cognome: string;
  sesso?: string | null;
  eta?: number | null;
};

type RichReportSectionsProps = {
  candidate: Candidate;
  traits: Record<string, number>;
  syndromes: SyndromeResult[];
  profileType?: string;
  reliability?: ReliabilityIndex;
};

export function RichReportSections({ candidate, traits, syndromes, profileType }: RichReportSectionsProps) {
  const traitMap = traits as Record<TraitCode, number>;

  const mappaInteriore = useMemo(
    () => calculateMappaInteriore(traitMap, candidate.nome, candidate.sesso ?? null, syndromes, candidate.eta ?? undefined),
    [traitMap, candidate.nome, candidate.sesso, candidate.eta, syndromes],
  );

  const tips = useMemo(() => {
    try {
      return getPersonalizedManagementTips(traitMap, candidate.nome, candidate.sesso ?? null, syndromes.map((s) => s.code));
    } catch {
      return [];
    }
  }, [traitMap, candidate.nome, candidate.sesso, syndromes]);

  const closing = useMemo(() => {
    try {
      return getPersonalizedClosingText(candidate.nome, candidate.sesso ?? null);
    } catch {
      return "";
    }
  }, [candidate.nome, candidate.sesso]);

  const profileExtended = profileType ? PROFILI_TIPO_V5_EXTENDED[profileType as ProfiloTipoV5] : null;

  return (
    <div className="space-y-4">
      {profileExtended && (
        <Card className="border-orange-200 bg-gradient-to-br from-orange-50/50 to-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Compass className="h-4 w-4 text-orange-600" />
              Profilo strategico
              <Badge variant="outline" className="ml-2 border-orange-200 bg-white text-orange-700">{profileExtended.label}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm leading-relaxed text-slate-700">{profileExtended.descrizioneEstesa}</p>
            {profileExtended.strategie && profileExtended.strategie.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Strategie chiave</p>
                <ul className="space-y-1 text-sm text-slate-700">
                  {profileExtended.strategie.slice(0, 4).map((s, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {syndromes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4 text-red-600" />
              Sindromi rilevate
              <Badge variant="outline" className="ml-2">{syndromes.length} attive</Badge>
            </CardTitle>
            <p className="text-sm text-slate-500">Pattern comportamentali che richiedono attenzione in fase di onboarding.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {syndromes.map((s) => {
              const data = SYNDROMES_V5_DATA[s.code as keyof typeof SYNDROMES_V5_DATA];
              const tone = SEVERITY_TONE[s.severity as keyof typeof SEVERITY_TONE] || SEVERITY_TONE.YELLOW;
              return (
                <div key={s.code} className={`rounded-xl border ${tone.border} ${tone.bg} p-3`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-semibold ${tone.text}`}>{data?.label || s.code}</p>
                      {data?.descrizione && <p className="mt-1 text-xs leading-relaxed text-slate-600">{data.descrizione}</p>}
                    </div>
                    <Badge variant="outline" className={`${tone.border} bg-white ${tone.text}`}>{tone.label}</Badge>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {mappaInteriore && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Heart className="h-4 w-4 text-rose-600" />
              Mappa interiore — narrativa
              {mappaInteriore.profiloNarrativoLabel && (
                <Badge variant="outline" className="ml-2">{mappaInteriore.profiloNarrativoLabel}</Badge>
              )}
            </CardTitle>
            <p className="text-sm text-slate-500">Lettura psicologica integrata personalizzata.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {mappaInteriore.narrativa?.chi_e_nel_profondo && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Chi è nel profondo</p>
                {mappaInteriore.narrativa.chi_e_nel_profondo}
              </div>
            )}
            {mappaInteriore.narrativa?.la_chiave && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 text-sm leading-relaxed text-indigo-900">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">La chiave</p>
                {mappaInteriore.narrativa.la_chiave}
              </div>
            )}
            {Array.isArray(mappaInteriore.cosa_motiva) && mappaInteriore.cosa_motiva.length > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">Cosa lo motiva</p>
                <ul className="space-y-1 text-sm text-emerald-900">
                  {mappaInteriore.cosa_motiva.map((m: string, i: number) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {Array.isArray(mappaInteriore.cosa_blocca) && mappaInteriore.cosa_blocca.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">Cosa lo blocca</p>
                <ul className="space-y-1 text-sm text-amber-900">
                  {mappaInteriore.cosa_blocca.map((m: string, i: number) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {Array.isArray(mappaInteriore.cosa_teme) && mappaInteriore.cosa_teme.length > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50/60 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">Cosa teme</p>
                <ul className="space-y-1 text-sm text-red-900">
                  {mappaInteriore.cosa_teme.map((m: string, i: number) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BrainCircuit className="h-4 w-4 text-indigo-600" />
            Narrative tratti chiave
          </CardTitle>
          <p className="text-sm text-slate-500">Lettura discorsiva dei 6 tratti più rilevanti del profilo.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {TRAIT_ORDER.slice()
            .sort((a, b) => Math.abs((traitMap[b] || 0) - 50) - Math.abs((traitMap[a] || 0) - 50))
            .slice(0, 6)
            .map((code) => {
              const value = Math.max(0, Math.min(100, Math.round(traitMap[code] || 0)));
              let testo = "";
              try {
                const fascia = getFascia(value);
                const narrative = getTraitNarrative(code, fascia);
                testo = narrative ? personalizzaTesto(narrative, candidate.nome, candidate.sesso ?? null) : "";
              } catch {
                testo = "";
              }
              if (!testo) return null;
              const tone = value >= 65 ? "border-emerald-200 bg-emerald-50/40" : value >= 40 ? "border-amber-200 bg-amber-50/40" : "border-red-200 bg-red-50/40";
              return (
                <div key={code} className={`rounded-xl border ${tone} p-3`}>
                  <div className="mb-2 flex items-baseline justify-between">
                    <p className="text-sm font-semibold text-slate-900">{TRAIT_LABELS[code]}</p>
                    <Badge variant="outline" className="tabular-nums">{value}</Badge>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-700">{testo}</p>
                </div>
              );
            })}
        </CardContent>
      </Card>

      {tips.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="h-4 w-4 text-amber-600" />
              Management tips personalizzati
            </CardTitle>
            <p className="text-sm text-slate-500">Suggerimenti operativi per il responsabile diretto.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {tips.slice(0, 6).map((t, i) => (
              <div
                key={i}
                className={`rounded-xl border p-3 ${t.tip?.isPriorityOne ? "border-orange-300 bg-orange-50" : "border-slate-200 bg-white"}`}
              >
                <div className="flex items-start gap-2">
                  {t.tip?.isPriorityOne && (
                    <Badge className="shrink-0 bg-orange-600 text-white hover:bg-orange-600">Priority 1</Badge>
                  )}
                  <p className="text-sm leading-relaxed text-slate-700">{t.testo}</p>
                </div>
              </div>
            ))}
            {closing && (
              <p className="mt-3 text-sm italic leading-relaxed text-slate-600">{closing}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Helper for AlertTriangle export to silence unused import linter if branch never renders
export const _unused = AlertTriangle;
