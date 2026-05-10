/**
 * SectionIntro — card di contesto per ogni tab dentro le 3 pagine admin AI
 *
 * Dà al super_admin una guida veloce su cosa fa quel tab + link correlati.
 * Sostituisce le card grigie generiche prima del contenuto vero.
 */
import { type LucideIcon, Info, AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

type Tone = "info" | "success" | "warning" | "neutral";

interface RelatedLink {
  label: string;
  to: string;
}

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Schema colore: info (blu), warning (amber), success (emerald), neutral (gray) */
  tone?: Tone;
  related?: RelatedLink[];
  /** Bullet points opzionali (es. "Cosa fa", "Quando usarlo") */
  bullets?: string[];
}

const TONE_CLASSES: Record<Tone, { bg: string; border: string; iconBg: string; iconColor: string }> = {
  info: {
    bg: "bg-blue-50 dark:bg-blue-950/20",
    border: "border-blue-200 dark:border-blue-900",
    iconBg: "bg-blue-100 dark:bg-blue-900/40",
    iconColor: "text-blue-600 dark:text-blue-400",
  },
  warning: {
    bg: "bg-amber-50 dark:bg-amber-950/20",
    border: "border-amber-200 dark:border-amber-900",
    iconBg: "bg-amber-100 dark:bg-amber-900/40",
    iconColor: "text-amber-600 dark:text-amber-400",
  },
  success: {
    bg: "bg-emerald-50 dark:bg-emerald-950/20",
    border: "border-emerald-200 dark:border-emerald-900",
    iconBg: "bg-emerald-100 dark:bg-emerald-900/40",
    iconColor: "text-emerald-600 dark:text-emerald-400",
  },
  neutral: {
    bg: "bg-muted/40",
    border: "border-muted",
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
  },
};

export function SectionIntro({
  icon: Icon,
  title,
  description,
  tone = "neutral",
  related,
  bullets,
}: Props) {
  const c = TONE_CLASSES[tone];

  return (
    <div
      className={`rounded-lg border ${c.border} ${c.bg} p-4 mb-4 flex items-start gap-3`}
    >
      <div className={`shrink-0 h-9 w-9 rounded-lg ${c.iconBg} flex items-center justify-center`}>
        <Icon className={`h-4 w-4 ${c.iconColor}`} />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <h3 className="text-sm font-semibold leading-tight">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {description}
          </p>
        </div>

        {bullets && bullets.length > 0 ? (
          <ul className="space-y-1 text-xs">
            {bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className={`text-${tone === "neutral" ? "muted-foreground" : tone === "info" ? "blue-500" : tone === "warning" ? "amber-500" : "emerald-500"} mt-0.5`}>
                  •
                </span>
                <span className="text-muted-foreground">{b}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {related && related.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] font-medium text-muted-foreground">Correlati:</span>
            {related.map((r) => (
              <Link
                key={r.to}
                to={r.to}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                {r.label}
                <ExternalLink className="h-2.5 w-2.5" />
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Variante shorthand per messaggi info/warning/success comuni.
 *  NB: HMR fast-refresh segnala che esportiamo sia un componente che un object,
 *  ma è voluto — pattern ergonomico identico a `Card.Header`. Suppress mirato. */
// eslint-disable-next-line react-refresh/only-export-components
export const SectionAlert = {
  info: (props: Omit<Props, "icon" | "tone">) => (
    <SectionIntro {...props} icon={Info} tone="info" />
  ),
  warning: (props: Omit<Props, "icon" | "tone">) => (
    <SectionIntro {...props} icon={AlertTriangle} tone="warning" />
  ),
  success: (props: Omit<Props, "icon" | "tone">) => (
    <SectionIntro {...props} icon={CheckCircle2} tone="success" />
  ),
};
