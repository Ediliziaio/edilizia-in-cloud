import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarSubcategoryProps {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export function SidebarSubcategory({ label, isOpen, onToggle, children }: SidebarSubcategoryProps) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-1.5 cursor-pointer rounded-md hover:bg-muted/60 transition-all duration-150 group/sub"
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.10em] text-muted-foreground/60 group-hover/sub:text-muted-foreground/80 transition-colors text-left">
          {label}
        </span>
        <ChevronDown
          className={cn(
            "h-3 w-3 text-muted-foreground/50 transition-transform duration-200 group-hover/sub:text-muted-foreground/80",
            isOpen ? "rotate-0" : "-rotate-90"
          )}
        />
      </button>
      <div
        className="grid transition-all duration-200 ease-in-out"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden min-h-0">
          <div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
