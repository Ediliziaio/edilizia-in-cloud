import type { ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
export function OperationalExtraFilters({ count = 0, children }: { count?: number; children: ReactNode }) {
  return <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 text-xs" aria-label="Filtri avanzati"><SlidersHorizontal className="h-3.5 w-3.5" />Filtri{count > 0 && <span className="rounded-full bg-orange-100 px-1.5 text-orange-800">{count}</span>}</Button></PopoverTrigger>
    <PopoverContent align="end" className="w-[min(560px,calc(100vw-24px))] max-h-[75dvh] overflow-y-auto p-4" aria-label="Filtri avanzati">
      <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Filtri avanzati</h3><PopoverClose asChild><Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Chiudi filtri"><X className="h-4 w-4" /></Button></PopoverClose></div>
      <div className="space-y-3 [&_select]:max-w-full">{children}</div>
    </PopoverContent></Popover>;
}
