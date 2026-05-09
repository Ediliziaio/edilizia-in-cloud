/**
 * AIPageHeader — header coerente per le 3 pagine admin AI (Config/Monitor/Operate)
 *
 * Layout: gradient orange + icona grande con glow + titolo + descrizione + breadcrumb
 * + actions slot (es. bottoni di refresh, link veloci).
 */
import { type LucideIcon, ChevronRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

interface QuickLink {
  label: string;
  to: string;
  icon?: LucideIcon;
}

interface Props {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  description?: string;
  /** Link tab/sezioni gemelle (es. da Config link a Monitor e Operate) */
  quickLinks?: QuickLink[];
  /** Slot azioni (es. bottoni Refresh, Salva, ...) */
  actions?: React.ReactNode;
  /** Icone secondarie a destra (es. status indicators) */
  badges?: React.ReactNode;
}

export function AIPageHeader({
  icon: Icon,
  title,
  subtitle,
  description,
  quickLinks,
  actions,
  badges,
}: Props) {
  return (
    <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-orange-50 via-amber-50 to-rose-50 dark:from-orange-950/30 dark:via-amber-950/20 dark:to-rose-950/20 p-5 md:p-6 mb-6">
      {/* Decorative blob */}
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-orange-300/20 dark:bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-12 w-56 h-56 bg-amber-300/20 dark:bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
          <Sparkles className="h-3.5 w-3.5 text-orange-500" />
          <span>AI System</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground font-medium">{subtitle}</span>
        </div>

        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            {/* Icon with glow */}
            <div className="relative shrink-0">
              <div className="absolute inset-0 bg-orange-400 dark:bg-orange-500 rounded-xl blur-md opacity-30 scale-110" />
              <div className="relative h-12 w-12 md:h-14 md:w-14 rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center text-white shadow-lg">
                <Icon className="h-6 w-6 md:h-7 md:w-7" />
              </div>
            </div>

            <div className="min-w-0 space-y-1">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
              {description ? (
                <p className="text-sm text-muted-foreground max-w-2xl">{description}</p>
              ) : null}
              {badges ? <div className="flex flex-wrap gap-1.5 pt-1">{badges}</div> : null}
            </div>
          </div>

          {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
        </div>

        {/* Quick links */}
        {quickLinks && quickLinks.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 mt-4 pt-4 border-t border-orange-200/50 dark:border-orange-800/30">
            <span className="text-xs text-muted-foreground mr-1">Vai a:</span>
            {quickLinks.map((link) => {
              const LinkIcon = link.icon;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full border bg-background/60 hover:bg-background hover:border-orange-300 transition-colors"
                >
                  {LinkIcon ? <LinkIcon className="h-3 w-3" /> : null}
                  {link.label}
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
