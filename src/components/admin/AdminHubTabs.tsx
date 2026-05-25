/**
 * AdminHubTabs — barra di navigazione a tab orizzontale usata da tutti
 * gli hub admin (Fatturato/CS/AI/Operazioni/Portale/SuperAdmins).
 *
 * Pattern unificato: stesso identico JSX ripetuto in 6+ pagine, estratto qui
 * per coerenza visiva 1:1 e zero drift quando si tweakka lo style.
 *
 * Uso:
 *   <AdminHubTabs
 *     activeTab="revenue"
 *     onChange={(t) => handleTabChange(t)}
 *     ariaLabel="Sezioni fatturato"
 *     tabs={[
 *       { id: "revenue", label: "Revenue", icon: LineChart },
 *       { id: "piani",   label: "Piani",   icon: CreditCard },
 *       // ...
 *     ]}
 *   />
 *
 * Stile attivo: bg-orange-50 + ring arancio (consistente con il design
 * "Commesse" /azienda/ordini). Hover: bg-slate-50.
 */
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AdminHubTab<TId extends string = string> {
  id: TId;
  label: React.ReactNode;
  icon?: LucideIcon;
  /** Tooltip / accessible description. */
  description?: string;
  /** Badge inline numerico (es. 3 azioni in attesa). */
  badge?: number | null;
  /** Tono badge — default neutral. */
  badgeTone?: "neutral" | "warning" | "danger" | "success";
  /** Disabilita la tab (es. permission gating). */
  disabled?: boolean;
}

interface AdminHubTabsProps<TId extends string> {
  activeTab: TId;
  onChange: (tab: TId) => void;
  tabs: AdminHubTab<TId>[];
  /** Aria-label per il <nav role="tablist">. Obbligatorio per a11y. */
  ariaLabel: string;
  /** Classi extra contenitore esterno. */
  className?: string;
}

const BADGE_TONE: Record<NonNullable<AdminHubTab["badgeTone"]>, string> = {
  neutral: "bg-slate-200 text-slate-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-rose-100 text-rose-700",
  success: "bg-emerald-100 text-emerald-700",
};

export function AdminHubTabs<TId extends string>({
  activeTab,
  onChange,
  tabs,
  ariaLabel,
  className,
}: AdminHubTabsProps<TId>) {
  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white p-1 shadow-sm", className)}>
      <nav
        className="flex min-h-0 items-center gap-1 overflow-x-auto scroll-smooth px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label={ariaLabel}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          const tone = tab.badgeTone ?? "neutral";
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`hub-panel-${tab.id}`}
              id={`hub-tab-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => !tab.disabled && onChange(tab.id)}
              disabled={tab.disabled}
              title={tab.description}
              className={cn(
                "relative flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-all sm:px-3.5",
                isActive
                  ? "bg-orange-50 text-slate-950 font-semibold shadow-sm ring-1 ring-orange-100"
                  : tab.disabled
                    ? "text-slate-300 cursor-not-allowed"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              {Icon ? (
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isActive ? "text-orange-500" : "text-slate-400",
                  )}
                  aria-hidden="true"
                />
              ) : null}
              {tab.label}
              {typeof tab.badge === "number" && tab.badge > 0 && (
                <span
                  className={cn(
                    "inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full px-1 text-[10px] font-bold leading-none",
                    BADGE_TONE[tone],
                  )}
                >
                  {tab.badge > 99 ? "99+" : tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
