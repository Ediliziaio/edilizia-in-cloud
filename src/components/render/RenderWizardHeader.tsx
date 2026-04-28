import { ArrowLeft, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export interface RenderWizardHeaderProps {
  /** Optional handler for the "Indietro" link. If omitted, the link is hidden. */
  onBack?: () => void;
  /** Small uppercase eyebrow text above the main title. */
  eyebrow: string;
  /** Big bold title. */
  title: string;
  /** Subtitle / description below the title. */
  description?: string;
  /** Right-side pill, e.g. "Render AI — Tetti". */
  badgeLabel: string;
  /** Step labels rendered as the bottom stepper. Keep them short (1 word). */
  stepLabels: ReadonlyArray<string>;
  /** Current step (1-based). */
  currentStep: number;
  /** Accent color used for the progress dots. Defaults to orange. */
  accent?: "orange" | "red" | "blue" | "amber" | "emerald" | "violet" | "rose";
}

const ACCENT_DOT: Record<NonNullable<RenderWizardHeaderProps["accent"]>, string> = {
  orange: "bg-orange-400",
  red: "bg-red-400",
  blue: "bg-blue-400",
  amber: "bg-amber-400",
  emerald: "bg-emerald-400",
  violet: "bg-violet-400",
  rose: "bg-rose-400",
};

/**
 * Unified hero header for all "render AI" wizards: dark gradient banner with
 * back link, badge, title, description, and step indicator.
 */
export function RenderWizardHeader({
  onBack,
  eyebrow,
  title,
  description,
  badgeLabel,
  stepLabels,
  currentStep,
  accent = "orange",
}: RenderWizardHeaderProps) {
  const dotClass = ACCENT_DOT[accent];
  const progressValue = stepLabels.length > 1
    ? ((currentStep - 1) / (stepLabels.length - 1)) * 100
    : 0;

  return (
    <div className="mb-6 rounded-b-2xl bg-gradient-to-br from-slate-800 to-slate-700 px-5 py-5 text-white">
      <div className="flex items-center justify-between">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-xs opacity-70 transition hover:opacity-100"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Indietro
          </button>
        ) : (
          <span />
        )}
        <Badge variant="secondary" className="gap-1 bg-white/15 text-white hover:bg-white/20">
          <Zap className="h-3 w-3" />
          {badgeLabel}
        </Badge>
      </div>

      <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-widest opacity-70">
            {eyebrow}
          </div>
          <div className="text-2xl font-bold leading-tight">{title}</div>
          {description && (
            <div className="mt-1 max-w-2xl text-sm text-white/70">{description}</div>
          )}
        </div>
        <div className="rounded-xl bg-white/10 px-3 py-2 text-xs text-white/80 shrink-0">
          Step {currentStep} / {stepLabels.length}
        </div>
      </div>

      <div className="mt-4">
        <Progress value={progressValue} className="h-1.5 bg-white/20" />
        <div
          className="mt-2 grid gap-2"
          style={{ gridTemplateColumns: `repeat(${stepLabels.length}, minmax(0, 1fr))` }}
        >
          {stepLabels.map((label, index) => (
            <div key={`${label}-${index}`} className="text-center">
              <div
                className={cn(
                  "mx-auto mb-1 h-2 w-2 rounded-full transition-colors",
                  currentStep >= index + 1 ? dotClass : "bg-white/30",
                )}
              />
              <div
                className={cn(
                  "text-[10px] font-semibold leading-tight",
                  currentStep >= index + 1 ? "text-white" : "text-white/40",
                )}
              >
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
