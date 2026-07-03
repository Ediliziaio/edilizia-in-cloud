/**
 * AdminHeroHeader — header riusabile per le pagine admin, stesso linguaggio del
 * Cruscotto Aziendale (brand): fascia navy #173b67, icona in box gradient
 * arancione→ambra, titolo grande, sottotitolo, azioni a destra.
 *
 * Coerenza UX cross-pagina: l'utente impara la shell una volta e la riconosce
 * ovunque (Aziende, Fatturato, Operazioni, CS, AI, …). I bottoni delle actions
 * hanno sfondo proprio (outline chiaro / primary) → restano leggibili su navy.
 */
import type { LucideIcon } from "lucide-react";
import { HeroAurora } from "@/components/admin/HeroAurora";

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
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-[#173b67] p-4 text-white shadow-sm dark:border-slate-800 md:p-5">
      <HeroAurora />
      <div className="relative z-10 flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div
            aria-hidden="true"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_8px_18px_rgba(249,115,22,0.28)]"
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white md:text-xl">{title}</h1>
              {inlineBadge}
            </div>
            {subtitle ? (
              <p className="mt-1 text-sm leading-5 text-blue-50/80">{subtitle}</p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center justify-end gap-2 md:shrink-0 [&_button.bg-background]:!border-white/25 [&_button.bg-background]:!bg-white/10 [&_button.bg-background]:!text-white [&_button.bg-background:hover]:!bg-white/20">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
