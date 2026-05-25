import { ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarSubcategoryProps {
  label: string;
  /** Badge numerico opzionale (es. count totale items con notifiche) */
  badge?: number;
  /** Icona opzionale del gruppo — visualizzata accanto al label per coerenza
   *  con le voci flat che mostrano sempre un'icona. */
  icon?: LucideIcon;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

/**
 * Subcategory accordion nella sidebar SuperAdmin — stile minimal Linear/Vercel.
 * Solo label + chevron, nessuna icona (le icone restano sui singoli item).
 * Riduce il rumore visivo e garantisce coerenza tra subcategory.
 */
export function SidebarSubcategory({
  label,
  badge,
  icon: Icon,
  isOpen,
  onToggle,
  children,
}: SidebarSubcategoryProps) {
  return (
    <div className="select-none">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-3 py-2 cursor-pointer mx-0.5",
          "transition-all duration-150 group/sub",
          isOpen
            ? "text-blue-900 dark:text-sidebar-primary"
            : "text-sidebar-foreground/70 hover:bg-blue-50 hover:text-blue-900 dark:hover:bg-sidebar-accent/40 dark:hover:text-sidebar-foreground",
        )}
      >
        {/* Icona del gruppo — coerenza con le voci flat che ne hanno sempre una.
            Quando il gruppo è aperto, l'icona si tinge di arancio (brand accent). */}
        {Icon ? (
          <Icon
            className={cn(
              "h-4 w-4 shrink-0 transition-colors",
              isOpen
                ? "text-orange-500"
                : "text-slate-400 group-hover/sub:text-blue-600",
            )}
          />
        ) : (
          <span className="inline-block h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <span
          className={cn(
            "flex-1 text-left text-sm font-medium transition-colors",
            isOpen
              ? "font-semibold"
              : "group-hover/sub:font-medium",
          )}
        >
          {label}
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {typeof badge === "number" && badge > 0 && (
            <span
              className={cn(
                "inline-flex items-center justify-center min-w-[16px] h-[16px] rounded-full px-1",
                "text-[9px] font-bold leading-none",
                "bg-orange-500 text-white shadow-sm ring-1 ring-orange-300/40",
              )}
            >
              {badge > 99 ? "99+" : badge}
            </span>
          )}
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-all duration-200",
              isOpen
                ? "rotate-0 text-blue-700/70 dark:text-sidebar-primary"
                : "-rotate-90 text-muted-foreground/40 group-hover/sub:text-blue-600",
            )}
          />
        </span>
      </button>
      {/* Children indentati con vertical guide rail come Linear / VSCode */}
      {isOpen && (
        <div className="relative ml-[18px] mt-0.5 mb-1 pl-3 border-l border-slate-200/70 dark:border-sidebar-border/60">
          {children}
        </div>
      )}
    </div>
  );
}
