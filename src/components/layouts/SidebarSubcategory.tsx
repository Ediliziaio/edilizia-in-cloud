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
    <div
      className={cn(
        "mb-1 transition-colors duration-150",
        isOpen && "bg-muted/60 dark:bg-muted/30 rounded-lg overflow-hidden"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex w-full items-center justify-between px-3 py-2 cursor-pointer rounded-lg transition-colors duration-150",
          isOpen
            ? "text-foreground"
            : "text-foreground hover:bg-muted/40"
        )}
      >
        <span className="text-[11px] font-bold">
          {label}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
            isOpen ? "rotate-0" : "-rotate-180"
          )}
        />
      </button>
      <div
        className="grid transition-all duration-200 ease-in-out"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="px-2 pb-1 pl-2">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
