import { useMemo } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { TRAIT_LABELS, MACRO_AREA_TRAITS, type TraitCode } from "../types";
import type { SyndromeResult } from "../lib/syndromes";
import { calculateMappaInteriore, getDimensioniChartData } from "../lib/mappaInteriore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Compass, Target } from "lucide-react";

const BRAND_BLUE = "#1E3A5F";
const BRAND_ORANGE = "#F97316";

type HeroReportVisualProps = {
  candidate: { nome: string; cognome: string; sesso?: string | null; eta?: number | null };
  traits: Record<string, number>;
  syndromes: SyndromeResult[];
  macroAreas: { essere: number; fare: number; avere: number };
  fitPct: number;
  fitVerdict?: string;
  profileLabel: string;
  decisionLabel: string;
  decisionTone: "emerald" | "amber" | "red";
  reliability: string;
  // Optional: target trait profile to overlay on radar (from role match)
  targetTraits?: Record<string, number>;
};

const TRAIT_DISPLAY_ORDER: TraitCode[] = [
  "ORG", "AUT", "GP",
  "ADS", "DET", "VEN", "HRM",
  "LDR", "PRO", "COM", "ESP",
  "FIN", "SUC", "PRI", "RC",
];

function clamp(n: number) {
  return Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
}

function FitGauge({ value, label, tone }: { value: number; label: string; tone: string }) {
  const data = [{ name: "fit", value: clamp(value), fill: tone }];
  return (
    <div className="relative flex flex-col items-center">
      <ResponsiveContainer width={180} height={180}>
        <RadialBarChart cx="50%" cy="50%" innerRadius="72%" outerRadius="100%" barSize={18} data={data} startAngle={90} endAngle={-270}>
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar background={{ fill: "#F1F5F9" }} dataKey="value" cornerRadius={20} angleAxisId={0} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold tabular-nums text-slate-900">{clamp(value)}%</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      </div>
    </div>
  );
}

function MacroAreaGauge({ label, value, color, detail }: { label: string; value: number; color: string; detail: string }) {
  const v = clamp(value);
  const data = [{ name: label, value: v, fill: color }];
  return (
    <div className="relative flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-3">
      <div className="relative h-[110px] w-[110px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart cx="50%" cy="50%" innerRadius="70%" outerRadius="100%" barSize={12} data={data} startAngle={90} endAngle={-270}>
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar background={{ fill: "#F1F5F9" }} dataKey="value" cornerRadius={10} angleAxisId={0} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold tabular-nums text-slate-900">{v}%</span>
        </div>
      </div>
      <p className="mt-2 text-sm font-semibold text-slate-900">{label}</p>
      <p className="text-center text-[10px] leading-tight text-slate-500">{detail}</p>
    </div>
  );
}

export function HeroReportVisual({
  candidate,
  traits,
  syndromes,
  macroAreas,
  fitPct,
  profileLabel,
  decisionLabel,
  decisionTone,
  reliability,
  targetTraits,
}: HeroReportVisualProps) {
  const traitMap = traits as Record<TraitCode, number>;

  // Radar data: 15 traits
  const radarData = useMemo(() => {
    return TRAIT_DISPLAY_ORDER.map((code) => ({
      trait: TRAIT_LABELS[code].split(" ")[0],
      candidate: clamp(traitMap[code] || 0),
      target: targetTraits ? clamp(targetTraits[code] || 0) : undefined,
    }));
  }, [traitMap, targetTraits]);

  // 5D radar from Mappa Interiore
  const mappa = useMemo(
    () => calculateMappaInteriore(traitMap, candidate.nome, candidate.sesso ?? null, syndromes, candidate.eta ?? undefined),
    [traitMap, candidate.nome, candidate.sesso, candidate.eta, syndromes],
  );

  const radar5D = useMemo(() => {
    if (!mappa) return [];
    try {
      const items = getDimensioniChartData(mappa);
      return items.map((d) => ({
        dim: d.name.replace("-", "/"),
        value: Math.max(0, Math.min(10, Number(d.value) || 0)),
        label: d.label,
        color: d.color,
      }));
    } catch {
      return [];
    }
  }, [mappa]);

  const decisionColors = {
    emerald: { bg: "from-emerald-500 to-emerald-600", border: "border-emerald-200", text: "text-emerald-900", fill: "#16A34A" },
    amber: { bg: "from-amber-500 to-amber-600", border: "border-amber-200", text: "text-amber-900", fill: "#D97706" },
    red: { bg: "from-red-500 to-red-600", border: "border-red-200", text: "text-red-900", fill: "#DC2626" },
  }[decisionTone];

  return (
    <div className="space-y-4">
      {/* Hero score card */}
      <Card className={`overflow-hidden border ${decisionColors.border} shadow-md`}>
        <div className={`h-2 bg-gradient-to-r ${decisionColors.bg}`} />
        <CardContent className="grid gap-4 p-5 lg:grid-cols-[200px_1fr]">
          <div className="flex items-center justify-center">
            <FitGauge value={fitPct} label="Fit ruolo" tone={decisionColors.fill} />
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Decisione</p>
              <p className={`mt-1 text-2xl font-bold ${decisionColors.text}`}>{decisionLabel}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Profilo</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{profileLabel}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Attendibilità</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{reliability}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Sindromi</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{syndromes.length} attive</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Macro aree */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-orange-600" />
            Snapshot macro aree
          </CardTitle>
          <p className="text-sm text-slate-500">Equilibrio del profilo tra spinta personale, azione e relazione.</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <MacroAreaGauge label="Essere" value={macroAreas.essere} color="#1E3A5F" detail="Concentrazione obiettivi" />
            <MacroAreaGauge label="Fare" value={macroAreas.fare} color={BRAND_ORANGE} detail="Azione concreta" />
            <MacroAreaGauge label="Avere" value={macroAreas.avere} color="#7C3AED" detail="Relazione e influenza" />
          </div>
        </CardContent>
      </Card>

      {/* 15 trait radar */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-orange-600" />
            Radar 15 tratti psicometrici
          </CardTitle>
          <p className="text-sm text-slate-500">
            Confronto visivo del profilo {targetTraits ? "candidato (arancio) vs target ruolo (blu)" : "candidato sui 15 tratti V5"}.
          </p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={340}>
            <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
              <PolarGrid stroke="#E2E8F0" />
              <PolarAngleAxis dataKey="trait" tick={{ fill: "#475569", fontSize: 11, fontWeight: 600 }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "#94A3B8", fontSize: 9 }} stroke="#CBD5E1" />
              {targetTraits && <Radar name="Target ruolo" dataKey="target" stroke={BRAND_BLUE} fill={BRAND_BLUE} fillOpacity={0.15} strokeWidth={2} />}
              <Radar name="Candidato" dataKey="candidate" stroke={BRAND_ORANGE} fill={BRAND_ORANGE} fillOpacity={0.45} strokeWidth={2} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12 }} />
            </RadarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 5D Mappa Interiore radar */}
      {radar5D.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Compass className="h-4 w-4 text-rose-600" />
              Mappa interiore — radar 5 dimensioni
            </CardTitle>
            <p className="text-sm text-slate-500">Visualizzazione integrata: come pensa, regola, si lega, si difende e integra.</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radar5D} margin={{ top: 10, right: 40, bottom: 10, left: 40 }}>
                <PolarGrid stroke="#E2E8F0" />
                <PolarAngleAxis dataKey="dim" tick={{ fill: "#475569", fontSize: 12, fontWeight: 600 }} />
                <PolarRadiusAxis angle={90} domain={[0, 10]} tick={{ fill: "#94A3B8", fontSize: 9 }} stroke="#CBD5E1" />
                <Radar name="Mappa interiore" dataKey="value" stroke="#E11D48" fill="#E11D48" fillOpacity={0.4} strokeWidth={2} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12 }} formatter={(v: number) => `${v}/10`} />
              </RadarChart>
            </ResponsiveContainer>
            <div className="mt-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-5">
              {radar5D.map((d) => (
                <div key={d.dim} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{d.dim}</p>
                  <p className="text-xs font-bold text-slate-800">{d.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
