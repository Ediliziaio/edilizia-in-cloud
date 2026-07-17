import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

type DashboardPageHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  leftAccessory?: ReactNode;
  toolbar?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /**
   * Su mobile nasconde il blocco titolo+icona: utile quando sopra c'è già un
   * DashboardSelectorBar che mostra lo stesso nome (evita il titolo doppio e
   * recupera spazio verticale). Su ≥sm il titolo torna visibile.
   */
  compactTitle?: boolean;
};

export function DashboardPageHeader({
  title,
  subtitle,
  icon: Icon,
  leftAccessory,
  toolbar,
  actions,
  className,
  compactTitle = false,
}: DashboardPageHeaderProps) {
  const hasControls = Boolean(toolbar || actions);

  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-6 sm:py-5 print:border-0 print:shadow-none",
        className,
      )}
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className={cn("flex min-w-0 items-start gap-3", compactTitle && "hidden sm:flex")}>
          {Icon && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
              <Icon className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">
                {title}
              </h1>
              {leftAccessory}
            </div>
            {subtitle && (
              <p className="mt-0.5 hidden text-sm leading-5 text-slate-500 sm:block">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {hasControls && (
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 xl:w-auto xl:max-w-[74%] xl:justify-end print:hidden">
            {toolbar}
            {actions && (
              <div className="flex flex-wrap items-center gap-2">
                {actions}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
