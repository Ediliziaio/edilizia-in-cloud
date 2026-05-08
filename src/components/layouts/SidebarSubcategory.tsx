import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarSubcategoryProps {
  label: string;
  /** Icona opzionale a sinistra del label — aiuta riconoscimento visivo */
  icon?: React.ComponentType<{ className?: string }>;
  /** Badge numerico opzionale (es. count totale items con notifiche) */
  badge?: number;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

/**
 * Subcategory accordion nella sidebar SuperAdmin.
 * Migliorata UX: label più leggibile, icona opzionale, badge aggregato,
 * chevron lateral (non sopra) per indicare gerarchia.
 */
export function SidebarSubcategory({
  label,
  icon: Icon,
  badge,
  isOpen,
  onToggle,
  children,
}: SidebarSubcategoryProps) {
  return (
    <div className="mb-0.5">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-1.5 cursor-pointer rounded-md",
          "hover:bg-muted/60 transition-colors duration-150 group/sub"
        )}
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 text-muted-foreground/50 transition-transform duration-200 shrink-0",
            "group-hover/sub:text-muted-foreground",
            isOpen && "rotate-90"
          )}
        />
        {Icon && (
          <Icon className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0 group-hover/sub:text-muted-foreground" />
        )}
        <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 group-hover/sub:text-foreground transition-colors text-left">
          {label}
        </span>
        {typeof badge === "number" && badge > 0 && (
          <span
            className={cn(
              "inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full px-1.5",
              "text-[10px] font-bold leading-none shrink-0",
              "bg-sidebar-primary/15 text-sidebar-primary"
            )}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </button>
      <div
        className="grid transition-all duration-200 ease-in-out"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden min-h-0">
          <div className="pl-2 pt-0.5">{children}</div>
        </div>
      </div>
    </div>
  );
}
