/**
 * Scelta della commessa con ricerca, per collegare un ordine d'acquisto.
 *
 * Un Select piatto qui non funziona: le aziende vere hanno centinaia di
 * commesse. Si cerca per codice o descrizione, si vedono le ultime 20, e
 * c'e' sempre la voce "Acquisto generico" — perche' comprare senza commessa
 * (scorte di magazzino, attrezzatura) e' un caso legittimo, non un errore.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface Props {
  value: string | null;
  onChange: (orderId: string | null) => void;
  disabled?: boolean;
  /** Etichetta della scelta "nessuna commessa". */
  nessunaLabel?: string;
  className?: string;
}

export function CommessaCombobox({
  value, onChange, disabled, nessunaLabel = "Acquisto generico (senza commessa)", className,
}: Props) {
  const { effectiveCompany } = useAuth();
  const [open, setOpen] = useState(false);
  const [ricerca, setRicerca] = useState("");

  const { data: commesse = [] } = useQuery({
    queryKey: ["commessa-combobox", effectiveCompany?.id, ricerca],
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select("id, order_code, description")
        .eq("company_id", effectiveCompany!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      const t = ricerca.trim();
      if (t) q = q.or(`order_code.ilike.%${t}%,description.ilike.%${t}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; order_code: string | null; description: string | null }>;
    },
    enabled: !!effectiveCompany?.id && open,
    staleTime: 30_000,
  });

  // La commessa selezionata potrebbe non essere fra le 20 in lista: si carica
  // da sola per mostrare il codice giusto sul bottone.
  const { data: selezionata } = useQuery({
    queryKey: ["commessa-combobox-selezionata", value],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_code, description")
        .eq("id", value!)
        .single();
      if (error) throw error;
      return data as { id: string; order_code: string | null; description: string | null };
    },
    enabled: !!value,
    staleTime: 60_000,
  });

  const etichetta = value
    ? selezionata
      ? `${selezionata.order_code ?? "Commessa"}${selezionata.description ? ` — ${selezionata.description.slice(0, 40)}` : ""}`
      : "Commessa collegata"
    : nessunaLabel;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !value && "text-muted-foreground", className)}
        >
          <span className="truncate">{etichetta}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Cerca per codice o descrizione..."
            value={ricerca}
            onValueChange={setRicerca}
          />
          <CommandList>
            <CommandEmpty>Nessuna commessa trovata.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__nessuna__"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Package className="mr-2 h-4 w-4 text-slate-400" />
                <span className="text-slate-600">{nessunaLabel}</span>
                <Check className={cn("ml-auto h-4 w-4", value == null ? "opacity-100" : "opacity-0")} />
              </CommandItem>
              {commesse.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  onSelect={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                >
                  <span className="font-mono text-xs mr-2">{c.order_code ?? "—"}</span>
                  <span className="truncate text-slate-600">{c.description ?? ""}</span>
                  <Check className={cn("ml-auto h-4 w-4", value === c.id ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
