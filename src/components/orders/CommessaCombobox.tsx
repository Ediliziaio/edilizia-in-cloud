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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

export interface CommessaScelta {
  id: string;
  order_code: string | null;
  description: string | null;
  client_name: string | null;
  work_address: string | null;
}

interface Props {
  onSelection?: (commessa: CommessaScelta | null) => void;
  ariaLabel?: string;
  value: string | null;
  onChange: (orderId: string | null) => void;
  disabled?: boolean;
  /** Etichetta della scelta "nessuna commessa". */
  nessunaLabel?: string;
  className?: string;
}

export function CommessaCombobox({
  value,
  onChange,
  onSelection,
  ariaLabel = "Commessa",
  disabled,
  nessunaLabel = "Acquisto generico (senza commessa)",
  className,
}: Props) {
  const { effectiveCompany } = useAuth();
  const [open, setOpen] = useState(false);
  const [ricerca, setRicerca] = useState("");

  const {
    data: commesse = [],
    isFetching,
    isError,
  } = useQuery({
    queryKey: ["commessa-combobox", effectiveCompany?.id, ricerca],
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select("id, order_code, description, client_name, work_address")
        .eq("company_id", effectiveCompany!.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(20);
      // Virgole e parentesi sono sintassi di .or() in PostgREST: lasciate nel
      // testo di ricerca spaccano la query intera ("Manzoni, lotto 2" → 400).
      const t = ricerca
        .trim()
        .replace(/[,()%_*\\"]/g, " ")
        .trim();
      if (t)
        q = q.or(
          `order_code.ilike.%${t}%,description.ilike.%${t}%,client_name.ilike.%${t}%,work_address.ilike.%${t}%`,
        );
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CommessaScelta[];
    },
    enabled: !!effectiveCompany?.id && open,
    staleTime: 30_000,
  });

  // La commessa selezionata potrebbe non essere fra le 20 in lista: si carica
  // da sola per mostrare il codice giusto sul bottone.
  const { data: selezionata } = useQuery({
    queryKey: ["commessa-combobox-selezionata", effectiveCompany?.id, value],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_code, description, client_name, work_address")
        .eq("id", value!)
        .eq("company_id", effectiveCompany!.id)
        .single();
      if (error) throw error;
      return data as CommessaScelta;
    },
    enabled: !!value && !!effectiveCompany?.id,
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
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{etichetta}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Cerca codice, cliente o cantiere…"
            value={ricerca}
            onValueChange={setRicerca}
          />
          <CommandList>
            <CommandEmpty>
              {isFetching
                ? "Ricerca in corso…"
                : isError
                  ? "Ricerca non disponibile. Riprova."
                  : "Nessuna commessa trovata."}
            </CommandEmpty>
            {isError && (
              <p role="alert" className="px-3 py-2 text-xs text-red-700">
                Impossibile caricare le commesse. Chiudi e riapri la ricerca per
                riprovare.
              </p>
            )}
            <CommandGroup>
              <CommandItem
                value="__nessuna__"
                onSelect={() => {
                  onChange(null);
                  onSelection?.(null);
                  setOpen(false);
                }}
              >
                <Package className="mr-2 h-4 w-4 text-slate-400" />
                <span className="text-slate-600">{nessunaLabel}</span>
                <Check
                  className={cn(
                    "ml-auto h-4 w-4",
                    value == null ? "opacity-100" : "opacity-0",
                  )}
                />
              </CommandItem>
              {commesse.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  onSelect={() => {
                    onChange(c.id);
                    onSelection?.(c);
                    setOpen(false);
                  }}
                >
                  <span className="font-mono text-xs mr-2">
                    {c.order_code ?? "—"}
                  </span>
                  <span className="min-w-0 text-slate-600">
                    <span className="block truncate">
                      {c.client_name || c.description || "Commessa"}
                    </span>
                    <span className="block truncate text-xs text-slate-400">
                      {[
                        c.description === c.client_name ? null : c.description,
                        c.work_address,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <Check
                    className={cn(
                      "ml-auto h-4 w-4",
                      value === c.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
