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
 *
 * Telefono: una riga (titolo e «Passo · 2/6») e la barra sottile; niente
 * riquadro scuro, «Indietro» (c'è la freccia in alto), badge, occhiello,
 * descrizione né etichette dei passi che si accavallavano.
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
  const totalSteps = Math.max(stepLabels.length, 1);
  const safeCurrentStep = Math.min(Math.max(currentStep, 1), totalSteps);
  const visibleStepLabels = stepLabels.length > 0 ? stepLabels : ["Step"];
  const progressValue = visibleStepLabels.length > 1
    ? ((safeCurrentStep - 1) / (visibleStepLabels.length - 1)) * 100
    : 0;

  return (
    <div className="mb-6 overflow-hidden rounded-b-2xl bg-gradient-to-br from-slate-800 to-slate-700 px-4 py-5 text-white sm:px-5 max-md:mb-3 max-md:rounded-none max-md:bg-none max-md:bg-transparent max-md:p-0 max-md:text-foreground">
      <div className="flex flex-wrap items-center justify-between gap-2 max-md:hidden">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="flex min-h-9 items-center gap-1 rounded-md px-1 text-xs opacity-70 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Indietro
          </button>
        ) : (
          <span />
        )}
        <Badge variant="secondary" className="max-w-full gap-1 bg-white/15 text-white hover:bg-white/20">
          <Zap className="h-3 w-3" />
          <span className="truncate">{badgeLabel}</span>
        </Badge>
      </div>

      <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between max-md:mt-0 max-md:flex-row max-md:items-center max-md:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-widest opacity-70 max-md:hidden">
            {eyebrow}
          </div>
          <div className="text-2xl font-bold leading-tight break-words max-md:truncate max-md:text-lg">{title}</div>
          {description && (
            <div className="mt-1 max-w-2xl text-sm text-white/70 max-md:hidden">{description}</div>
          )}
        </div>
        <div className="rounded-xl bg-white/10 px-3 py-2 text-xs text-white/80 shrink-0 max-md:rounded-full max-md:bg-muted max-md:px-2.5 max-md:py-1 max-md:text-[11px] max-md:font-medium max-md:text-muted-foreground">
          <span className="max-md:hidden">Step {safeCurrentStep} / {totalSteps}</span>
          <span className="md:hidden">
            {visibleStepLabels[safeCurrentStep - 1]} · {safeCurrentStep}/{totalSteps}
          </span>
        </div>
      </div>

      <div className="mt-4 max-md:mt-2">
        <Progress value={progressValue} className="h-1.5 bg-white/20 max-md:h-1 max-md:bg-slate-200" />
        <div
          className="mt-2 grid gap-2 max-md:hidden"
          style={{ gridTemplateColumns: `repeat(${visibleStepLabels.length}, minmax(0, 1fr))` }}
        >
          {visibleStepLabels.map((label, index) => (
            <div key={`${label}-${index}`} className="min-w-0 text-center">
              <div
                className={cn(
                  "mx-auto mb-1 h-2 w-2 rounded-full transition-colors",
                  safeCurrentStep >= index + 1 ? dotClass : "bg-white/30",
                )}
              />
              <div
                className={cn(
                  "truncate text-[10px] font-semibold leading-tight",
                  safeCurrentStep >= index + 1 ? "text-white" : "text-white/40",
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
