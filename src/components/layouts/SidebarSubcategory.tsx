import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarSubcategoryProps {
  label: string;
  /** Badge numerico opzionale (es. count totale items con notifiche) */
  badge?: number;
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
  isOpen,
  onToggle,
  children,
}: SidebarSubcategoryProps) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex w-full items-center justify-between px-3 py-1.5 cursor-pointer rounded-md",
          "hover:bg-muted/40 transition-colors duration-150 group/sub"
        )}
      >
        <span
          className={cn(
            "text-[11px] font-semibold uppercase tracking-wider transition-colors text-left",
            isOpen
              ? "text-foreground/80"
              : "text-muted-foreground group-hover/sub:text-foreground/70"
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
                "bg-sidebar-primary/15 text-sidebar-primary"
              )}
            >
              {badge > 99 ? "99+" : badge}
            </span>
          )}
          <ChevronDown
            className={cn(
              "h-3 w-3 transition-all duration-200",
              isOpen
                ? "rotate-0 text-muted-foreground"
                : "-rotate-90 text-muted-foreground/40 group-hover/sub:text-muted-foreground"
            )}
          />
        </span>
      </button>
      {/* v8.6.49 — Fix bug visivo: il pattern grid-template-rows 0fr→1fr
          falliva intermittentemente (esp. dopo HMR / re-render multipli)
          lasciando il subcategory aperto ma con figli invisibili.
          Sostituito con display:block/none guard più aria-hidden per a11y:
          niente animation ma rendering bulletproof. */}
      <div
        className={cn("transition-opacity duration-150", isOpen ? "block opacity-100" : "hidden opacity-0")}
        aria-hidden={!isOpen}
      >
        <div className="pt-0.5 pb-1">{children}</div>
      </div>
    </div>
  );
}
