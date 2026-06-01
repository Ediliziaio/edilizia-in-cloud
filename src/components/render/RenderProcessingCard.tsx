import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Brain, CheckCircle2, ImageDown, Image as ImageIcon, Sparkles, Wand2, Zap,
  type LucideIcon,
} from "lucide-react";

export interface RenderProcessingCardProps {
  /** Optional preview of the source photo (objectURL or remote). */
  photoPreview?: string | null;
  /** Elapsed seconds since the render started. */
  elapsedSec: number;
  /** Pulse counter for the dots animation (0-3). */
  dots?: number;
  /** Accent color hue. Defaults to 'red'. */
  accent?: "red" | "orange" | "blue" | "amber" | "emerald" | "violet" | "rose";
  /** Override the default tips. */
  tips?: string[];
  /** Override the default subject (used in the hero label). */
  subjectLabel?: string;
}

const DEFAULT_STAGES: ReadonlyArray<{ id: string; label: string; icon: LucideIcon; until: number }> = [
  { id: "analyze", label: "Analisi della foto", icon: ImageIcon, until: 8 },
  { id: "ai", label: "Elaborazione AI", icon: Brain, until: 35 },
  { id: "compose", label: "Composizione del rendering", icon: Wand2, until: 75 },
  { id: "finalize", label: "Finalizzazione & upload", icon: ImageDown, until: Infinity },
];

const DEFAULT_TIPS = [
  "L'AI riconosce la geometria dalla foto e applica la nuova configurazione preservando luci e ombre.",
  "Più la foto è nitida e in piano, più il render risulterà realistico.",
  "Puoi rigenerare il render con piccoli ritocchi senza dover ricaricare la foto.",
  "Una volta pronto, potrai scaricarlo o inviarlo direttamente al cliente via WhatsApp.",
];

const ACCENT: Record<NonNullable<RenderProcessingCardProps["accent"]>, {
  border: string; bgSoft: string; text: string; ring: string; bar: string;
}> = {
  red:     { border: "border-red-100",     bgSoft: "bg-red-50",     text: "text-red-600",     ring: "border-red-300",     bar: "via-red-400" },
  orange:  { border: "border-orange-100",  bgSoft: "bg-orange-50",  text: "text-orange-600",  ring: "border-orange-300",  bar: "via-orange-400" },
  blue:    { border: "border-blue-100",    bgSoft: "bg-blue-50",    text: "text-blue-600",    ring: "border-blue-300",    bar: "via-blue-400" },
  amber:   { border: "border-amber-100",   bgSoft: "bg-amber-50",   text: "text-amber-600",   ring: "border-amber-300",   bar: "via-amber-400" },
  emerald: { border: "border-emerald-100", bgSoft: "bg-emerald-50", text: "text-emerald-600", ring: "border-emerald-300", bar: "via-emerald-400" },
  violet:  { border: "border-violet-100",  bgSoft: "bg-violet-50",  text: "text-violet-600",  ring: "border-violet-300",  bar: "via-violet-400" },
  rose:    { border: "border-rose-100",    bgSoft: "bg-rose-50",    text: "text-rose-600",    ring: "border-rose-300",    bar: "via-rose-400" },
};

export function RenderProcessingCard({
  photoPreview,
  elapsedSec,
  dots = 0,
  accent = "red",
  tips,
  subjectLabel = "L'AI sta lavorando sulla tua foto",
}: RenderProcessingCardProps) {
  const stages = DEFAULT_STAGES;
  const tipsList = useMemo(() => (tips && tips.length > 0 ? tips : DEFAULT_TIPS), [tips]);

  const stageIdx = useMemo(() => {
    const idx = stages.findIndex((s) => elapsedSec < s.until);
    return idx === -1 ? stages.length - 1 : idx;
  }, [stages, elapsedSec]);
  const tipIdx = Math.floor(elapsedSec / 8) % tipsList.length;
  const progressPct = Math.min((elapsedSec / 90) * 100, 96);
  const a = ACCENT[accent];

  return (
    <Card className={`overflow-hidden ${a.border}`}>
      <CardContent className="p-0">
        {photoPreview && (
          <div className="relative bg-slate-900">
            <img loading="lazy"
              src={photoPreview}
              alt="Foto in elaborazione"
              className="w-full max-h-64 object-cover opacity-50"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />
            <div
              className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent ${a.bar} to-transparent`}
              style={{ animation: "renderScan 2.4s linear infinite" }}
            />
            <div className="absolute bottom-3 left-4 right-4 flex items-center gap-2 text-white">
              <Sparkles className={`h-4 w-4 ${a.text} animate-pulse`} />
              <span className="text-sm font-semibold">{subjectLabel}</span>
            </div>
            <style>{`@keyframes renderScan { 0% { transform: translateY(0); } 100% { transform: translateY(256px); } }`}</style>
          </div>
        )}

        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`h-10 w-10 rounded-full ${a.bgSoft} flex items-center justify-center shrink-0`}>
                <Zap className={`h-5 w-5 ${a.text} animate-pulse`} />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 truncate">
                  {stages[stageIdx].label}{".".repeat(dots)}
                </p>
                {/* v8.6.33 — Messaggio dinamico: dopo 90s il "stima 1-2 min"
                    rassicura mentre la barra resta al 96%. Dopo 150s avviso che
                    è più del solito. */}
                <p className="text-xs text-slate-500">
                  {elapsedSec}s trascorsi
                  {elapsedSec < 90 && " · stima 1-2 min"}
                  {elapsedSec >= 90 && elapsedSec < 150 && " · stiamo finalizzando, ci siamo quasi"}
                  {elapsedSec >= 150 && " · sta impiegando più del previsto, attendere ancora un attimo"}
                </p>
              </div>
            </div>
            <div className={`text-2xl font-bold ${a.text} tabular-nums shrink-0`}>
              {Math.floor(progressPct)}%
            </div>
          </div>

          <Progress value={progressPct} className="h-2" />

          <div className="grid grid-cols-4 gap-2">
            {stages.map((s, i) => {
              const Icon = s.icon;
              const done = i < stageIdx;
              const active = i === stageIdx;
              return (
                <div
                  key={s.id}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 text-center transition-all ${
                    done
                      ? "border-green-200 bg-green-50"
                      : active
                      ? `${a.ring} ${a.bgSoft} shadow-sm`
                      : "border-slate-200 bg-slate-50 opacity-60"
                  }`}
                >
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <Icon className={`h-4 w-4 ${active ? `${a.text} animate-pulse` : "text-slate-400"}`} />
                  )}
                  <span
                    className={`text-[10px] font-medium leading-tight ${
                      done ? "text-green-700" : active ? a.text : "text-slate-500"
                    }`}
                  >
                    {s.label.split(" ")[0]}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 flex gap-2.5">
            <Sparkles className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-900 leading-relaxed">
              <span className="font-semibold">Lo sapevi? </span>
              {tipsList[tipIdx]}
            </p>
          </div>

          <p className="text-[11px] text-center text-slate-400">
            Puoi lasciare aperta questa pagina · ti avviseremo quando il render è pronto
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
