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
      <SheetContent side="bottom" className="preventivo-touch flex h-[92dvh] max-h-[92dvh] flex-col gap-2 overflow-hidden rounded-t-2xl p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] xl:hidden [&>button]:flex [&>button]:h-11 [&>button]:w-11 [&>button]:items-center [&>button]:justify-center [&>button]:right-1 [&>button]:top-1">
        <SheetHeader className="shrink-0 space-y-0.5 pr-10 text-left">
          <SheetTitle className="text-base">Anteprima</SheetTitle>
          <SheetDescription className="text-xs">Il preventivo come lo vede il cliente, aggiornato mentre scrivi.</SheetDescription>
        </SheetHeader>
        {/* Scorre solo l'anteprima, senza spazio interno: così il riepilogo fisso in fondo sta davvero in fondo. */}
        <div className="mt-1 min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
