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
import { BadgeGenerale, RigaAppartenenza } from "@/components/orders/generali/BadgeGerarchia";
import { COLONNE_GERARCHIA, conGenerali, eGenerale, raggruppaPerGenerale, type RigaGerarchia } from "@/lib/orders/generali/gerarchiaScelta";

export interface CommessaScelta extends RigaGerarchia {
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

/** Codice e nome delle generali delle figlie in elenco. */
async function leggiGenerali(ids: string[]) {
  const { data, error } = await supabase.from("orders").select("id, order_code, description").in("id", ids);
  if (error) throw error;
  return data ?? [];
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
        .select(`id, order_code, description, client_name, work_address, ${COLONNE_GERARCHIA}`)
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
      return conGenerali((data ?? []) as unknown as CommessaScelta[], leggiGenerali);
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
        .select(`id, order_code, description, client_name, work_address, ${COLONNE_GERARCHIA}`)
        .eq("id", value!)
        .eq("company_id", effectiveCompany!.id)
        .single();
      if (error) throw error;
      const [conNome] = await conGenerali([data as unknown as CommessaScelta], leggiGenerali);
      return conNome;
    },
    enabled: !!value && !!effectiveCompany?.id,
    staleTime: 60_000,
  });

  const etichetta = value
    ? selezionata
      ? `${selezionata.order_code ?? "Commessa"}${selezionata.description ? ` — ${selezionata.description.slice(0, 40)}` : ""}${eGenerale(selezionata) ? " (generale)" : ""}`
      : "Commessa collegata"
    : nessunaLabel;

  return (
    <Popover open={open} onOpenChange={next => { setOpen(next); if (next) setRicerca(""); }}>
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
            {commesse.length === 0 && (
              <p role="status" className="px-3 py-3 text-sm text-muted-foreground">
                {isFetching ? "Ricerca in corso…" : isError ? "Ricerca non disponibile. Riapri il menu per riprovare." : "Nessuna commessa trovata."}
              </p>
            )}
            <CommandGroup>
              {!ricerca.trim() && <CommandItem
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
              </CommandItem>}
              {raggruppaPerGenerale(commesse).map(({ riga: c, annidata }) => {
                const titolo = (eGenerale(c) ? c.description || c.client_name : c.client_name || c.description)?.trim() || "Commessa";
                const dettagli = [...new Set([c.description, c.client_name, c.work_address].map(t => t?.trim()).filter(t => t && t !== titolo))].join(" · ");
                return (
                <CommandItem
                  key={c.id}
                  className={cn("grid grid-cols-[7rem_minmax(0,1fr)_1rem] gap-2 rounded-md", annidata && "border-l-2 border-indigo-200")}
                  value={c.id}
                  onSelect={() => {
                    onChange(c.id);
                    onSelection?.(c);
                    setOpen(false);
                  }}
                >
                  <span className="flex min-w-0 flex-col items-start gap-0.5">
                    <span title={c.order_code ?? undefined} className="max-w-full truncate font-mono text-xs text-primary">{c.order_code ?? "—"}</span>
                    <BadgeGenerale riga={c} />
                  </span>
                  <span className="min-w-0 text-slate-600">
                    <span title={titolo} className="block truncate font-medium text-foreground">{titolo}</span>
                    <RigaAppartenenza riga={c} nascondi={annidata} />
                    {dettagli && <span title={dettagli} className="block truncate text-xs text-muted-foreground">{dettagli}</span>}
                  </span>
                  <Check
                    className={cn(
                      "ml-auto h-4 w-4",
                      value === c.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
