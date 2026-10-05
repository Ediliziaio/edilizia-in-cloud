/**
 * Sotto i 1280 px l'anteprima non ha una colonna: sale dal basso con un tocco
 * (il pulsante col totale nel piede). Stessa anteprima, stessi numeri.
 */
import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface Props {
  aperta: boolean;
  onApertaChange: (aperta: boolean) => void;
  children: ReactNode;
}

export function AnteprimaMobile({ aperta, onApertaChange, children }: Props) {
  return (
    <Sheet open={aperta} onOpenChange={onApertaChange}>
      <SheetContent side="bottom" className="max-h-[88dvh] gap-2 rounded-t-2xl p-3 xl:hidden">
        <SheetHeader className="space-y-0.5 text-left">
          <SheetTitle className="text-base">Anteprima</SheetTitle>
          <SheetDescription className="text-xs">Il preventivo come lo vede il cliente, aggiornato mentre scrivi.</SheetDescription>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}
