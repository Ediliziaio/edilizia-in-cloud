import type { ReactNode } from "react";
import { Info } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
export function OperationalHelp({ children }: { children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Informazioni sul flusso"
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded px-2 text-xs text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Info className="h-3.5 w-3.5" />
          Come funziona
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-xs leading-relaxed">
        {children}
      </PopoverContent>
    </Popover>
  );
}
