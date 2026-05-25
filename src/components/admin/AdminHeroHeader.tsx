/**
 * AdminHeroHeader — header riusabile per pagine admin in stile "Commesse"
 * (vedi /azienda/ordini): icona arancio, titolo grande, sottotitolo,
 * azioni allineate a destra.
 *
 * Coerenza UX cross-pagina:
 *   - Stesso aspetto visivo del hero in CompanyHeader/Commesse → l'utente
 *     impara la shell una volta e la riconosce ovunque.
 *   - Icona in box gradient arancio (brand accent) su sfondo bianco.
 *   - Actions a destra: wrap su mobile, all'orizzontale su desktop.
 */
import type { LucideIcon } from "lucide-react";

interface AdminHeroHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  /** Slot per i bottoni (Filtri, Esporta, Nuova X, ecc.). */
  actions?: React.ReactNode;
  /** Slot opzionale per badge/info inline accanto al titolo (es. "33 aziende"). */
  inlineBadge?: React.ReactNode;
}

export function AdminHeroHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
  inlineBadge,
}: AdminHeroHeaderProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div
            aria-hidden="true"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_8px_18px_rgba(249,115,22,0.28)]"
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-slate-900 md:text-xl">{title}</h1>
              {inlineBadge}
            </div>
            {subtitle ? (
              <p className="mt-1 text-sm leading-5 text-slate-500">{subtitle}</p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center justify-end gap-2 md:shrink-0">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
