/**
 * BrandPageHeader — intestazione "quadro direzionale" del brand (navy #173b67 +
 * icona in box arancione→ambra), lo stesso linguaggio del Cruscotto Aziendale.
 * Riutilizzabile su tutte le pagine admin per un'identità coerente.
 *
 *   <BrandPageHeader icon={Users} eyebrow="Piattaforma" title="Aziende"
 *      subtitle="…" actions={<Button/>}>…children opzionali (KPI/filtri)…</BrandPageHeader>
 */
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { HeroAurora } from "@/components/admin/HeroAurora";

interface BrandPageHeaderProps {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function BrandPageHeader({
  icon: Icon,
  eyebrow,
  title,
  subtitle,
  actions,
  children,
  className,
}: BrandPageHeaderProps) {
  return (
    <section className={"overflow-hidden rounded-2xl border border-slate-200 shadow-sm dark:border-slate-800 " + (className ?? "")}>
      <div className="relative overflow-hidden bg-[#173b67] p-5 text-white sm:p-6">
        <HeroAurora />
        <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_8px_18px_rgba(249,115,22,0.28)]">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-100">{eyebrow}</p>
              <h1 className="mt-1 text-xl font-semibold leading-tight sm:text-2xl">{title}</h1>
              {subtitle && <p className="mt-1 max-w-2xl text-sm leading-6 text-blue-50/80">{subtitle}</p>}
            </div>
          </div>
          {actions && (
            <div className="flex shrink-0 flex-wrap items-center gap-2 [&_button.bg-background]:!border-white/25 [&_button.bg-background]:!bg-white/10 [&_button.bg-background]:!text-white [&_button.bg-background:hover]:!bg-white/20">
              {actions}
            </div>
          )}
        </div>
        {children && <div className="relative z-10 mt-6">{children}</div>}
      </div>
    </section>
  );
}
