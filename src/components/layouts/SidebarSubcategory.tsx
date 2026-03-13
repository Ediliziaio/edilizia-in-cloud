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
        className="flex w-full items-center justify-between px-3 py-1.5 cursor-pointer rounded-md hover:bg-muted/50 transition-colors"
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground text-left">
          {label}
        </span>
        <ChevronDown
          className={cn(
            "h-3 w-3 text-muted-foreground transition-transform duration-200",
            isOpen ? "rotate-0" : "-rotate-90"
          )}
        />
      </button>
      <div
        className="grid transition-all duration-200 ease-in-out"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden min-h-0">
          <div className="pl-2">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
