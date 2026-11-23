import type { ReactNode } from "react";
import { Info } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
export function OperationalHelp({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("Informazioni sul flusso")}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded px-2 text-xs text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Info className="h-3.5 w-3.5" />
          {t("Come funziona")}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-xs leading-relaxed">
        {children}
      </PopoverContent>
    </Popover>
  );
}
