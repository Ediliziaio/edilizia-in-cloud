// src/components/orders/generali/ScegliCliente.tsx
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyCustomers, type CompanyCustomer } from "@/hooks/useCompanyCustomers";
import { cn } from "@/lib/utils";

const nomeCliente = (c: Pick<CompanyCustomer, "first_name" | "last_name" | "email">) =>
  [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.email || "Cliente senza nome";

/** Un cliente dell'azienda, cercato per nome. Facoltativo: si può togliere. */
export function ScegliCliente({ id, valore, onCambia }: { id: string; valore: string | null; onCambia: (id: string | null) => void }) {
  const { effectiveCompany } = useAuth();
  const { data: clienti = [], isLoading } = useCompanyCustomers(effectiveCompany?.id);
  const [aperto, setAperto] = useState(false);
  const scelto = useMemo(() => clienti.find((c) => c.id === valore) ?? null, [clienti, valore]);

  return (
    <div className="flex gap-1.5">
      <Popover open={aperto} onOpenChange={setAperto}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={aperto} className="h-9 min-w-0 flex-1 justify-between font-normal">
            <span className={cn("truncate", !scelto && "text-muted-foreground")}>
              {scelto ? nomeCliente(scelto) : isLoading ? "Carico i clienti…" : "Cerca tra i clienti"}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Nome del cliente…" />
            <CommandList>
              <CommandEmpty>Nessun cliente con questo nome.</CommandEmpty>
              <CommandGroup>
                {clienti.map((c) => (
                  <CommandItem key={c.id} value={`${nomeCliente(c)} ${c.email ?? ""} ${c.id}`} onSelect={() => { onCambia(c.id); setAperto(false); }}>
                    <Check className={cn("mr-2 h-4 w-4", c.id === valore ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{nomeCliente(c)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {scelto && (
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Togli il cliente" onClick={() => onCambia(null)}>
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
