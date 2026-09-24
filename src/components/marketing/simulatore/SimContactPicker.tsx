/**
 * SimContactPicker — collega una simulazione a un contatto CRM (marketing_contacts).
 *
 * Combobox compatto a tutta larghezza (Popover + Command), estratto dal dialog
 * "Nuova simulazione" per essere riusato SIA nel dialog SIA nell'header
 * dell'editor. Trigger con icona utente + label; quando un contatto è collegato
 * mostra il nome con una × per scollegare, altrimenti un chevron.
 *
 * È un componente di sola presentazione/selezione: la query su `marketing_contacts`
 * è filtrata per `company_id` (debounce 250ms) e attivata solo a popover aperto.
 *
 * Due varianti di `size`:
 *   - "default" → trigger standard (usato nel dialog), larghezza piena.
 *   - "chip"    → bottone compatto stile chip (usato nell'header editor).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, Check, X, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { filtriRicercaContatti } from "@/lib/ricerca/ricercaContatti";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export interface SimContactLite {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

const simContactLabel = (c: {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}) => `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email || "Senza nome";

interface SimContactPickerProps {
  /** Contatto attualmente selezionato (per render del trigger e del check). */
  value: SimContactLite | null;
  onSelect: (contatto: SimContactLite) => void;
  onClear: () => void;
  /** Variante visiva del trigger. */
  size?: "default" | "chip";
  /** Placeholder del trigger quando nessun contatto è collegato. */
  placeholder?: string;
  className?: string;
}

export function SimContactPicker({
  value,
  onSelect,
  onClear,
  size = "default",
  placeholder = "Collega un contatto dal CRM…",
  className,
}: SimContactPickerProps) {
  const companyId = useEffectiveCompanyId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 250);

  const { data: contatti = [], isFetching } = useQuery({
    queryKey: ["sim-contact-picker", companyId, debounced],
    enabled: !!companyId && open,
    queryFn: async (): Promise<SimContactLite[]> => {
      let q = supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name, email")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .limit(20);
      for (const filtro of filtriRicercaContatti(debounced)) q = q.or(filtro);
      const { data, error } = await q.order("first_name", { nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as SimContactLite[];
    },
  });

  const isChip = size === "chip";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {isChip ? (
          <Button
            type="button"
            variant={value ? "secondary" : "outline"}
            size="sm"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "h-7 max-w-[260px] gap-1.5 rounded-full px-2.5 text-xs font-medium",
              value
                ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 dark:bg-primary/15"
                : "border-dashed text-muted-foreground",
              className,
            )}
          >
            <UserRound className="h-3.5 w-3.5 shrink-0" />
            {value ? (
              <span className="truncate">{simContactLabel(value)}</span>
            ) : (
              <span>Collega cliente</span>
            )}
            {value ? (
              <X
                className="h-3.5 w-3.5 shrink-0 opacity-70 transition hover:opacity-100"
                role="button"
                aria-label="Scollega cliente"
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
              />
            ) : (
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
            )}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn("w-full justify-between font-normal", className)}
          >
            <span className="flex min-w-0 items-center gap-2">
              <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
              {value ? (
                <span className="truncate">{simContactLabel(value)}</span>
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
            </span>
            {value ? (
              <X
                className="h-4 w-4 shrink-0 text-muted-foreground hover:text-foreground"
                role="button"
                aria-label="Scollega cliente"
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
              />
            ) : (
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            )}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        className={cn("p-0", isChip ? "w-72" : "w-[--radix-popover-trigger-width]")}
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Cerca contatto…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {isFetching ? "Ricerca…" : "Nessun contatto trovato"}
            </CommandEmpty>
            <CommandGroup>
              {contatti.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  onSelect={() => {
                    onSelect(c);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value?.id === c.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{simContactLabel(c)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
