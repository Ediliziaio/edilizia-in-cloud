/**
 * AnagraficaSelectCombobox — selettore cliente (anagrafica fiscale) per l'uscita
 * merce verso "Cliente finale".
 *
 * In questo gestionale NON esiste una tabella `customers`: il cliente è
 * l'anagrafica fiscale `anagrafiche_native`, la stessa usata dai documenti
 * (DDT/fatture). Restituisce l'intera riga così il chiamante può costruire il
 * cliente_snapshot per il DDT.
 *
 * Ricerca server-side debounced su ragione sociale / nome / cognome / P.IVA.
 */
import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Search, Loader2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export interface AnagraficaOption {
  id: string;
  ragione_sociale: string | null;
  nome: string | null;
  cognome: string | null;
  partita_iva: string | null;
  codice_fiscale: string | null;
  codice_sdi: string | null;
  pec: string | null;
  email: string | null;
  indirizzo_via: string | null;
  indirizzo_cap: string | null;
  indirizzo_comune: string | null;
  indirizzo_provincia: string | null;
  indirizzo_nazione: string | null;
  tipo_cliente: string | null;
}

const SELECT_COLS =
  "id, ragione_sociale, nome, cognome, partita_iva, codice_fiscale, codice_sdi, pec, email, indirizzo_via, indirizzo_cap, indirizzo_comune, indirizzo_provincia, indirizzo_nazione, tipo_cliente";

export function anagraficaDisplayName(a: Pick<AnagraficaOption, "ragione_sociale" | "nome" | "cognome">): string {
  return (
    a.ragione_sociale?.trim() ||
    `${a.nome ?? ""} ${a.cognome ?? ""}`.trim() ||
    "Senza nome"
  );
}

interface Props {
  companyId: string | undefined;
  value: string | undefined;
  onChange: (id: string, anagrafica: AnagraficaOption) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function AnagraficaSelectCombobox({ companyId, value, onChange, disabled, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data: rows = [], isLoading } = useQuery<AnagraficaOption[]>({
    queryKey: ["uscita-anagrafiche", companyId, debouncedSearch],
    enabled: !!companyId && open,
    staleTime: 60_000,
    queryFn: async () => {
      if (!companyId) return [];
      let q = supabase
        .from("anagrafiche_native")
        .select(SELECT_COLS)
        .eq("company_id", companyId);
      if (debouncedSearch) {
        const s = `%${debouncedSearch}%`;
        q = q.or(
          `ragione_sociale.ilike.${s},nome.ilike.${s},cognome.ilike.${s},partita_iva.ilike.${s}`,
        );
      }
      q = q.order("ragione_sociale", { ascending: true, nullsFirst: false }).limit(50);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AnagraficaOption[];
    },
  });

  // Riga selezionata (per il trigger) — lookup separato se non è nella lista corrente
  const [selected, setSelected] = useState<AnagraficaOption | null>(null);
  useEffect(() => {
    if (!value) {
      setSelected(null);
      return;
    }
    const found = rows.find((r) => r.id === value);
    if (found) setSelected(found);
  }, [value, rows]);

  const { data: standalone } = useQuery<AnagraficaOption | null>({
    queryKey: ["uscita-anagrafica-lookup", value],
    enabled: !!value && !selected,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!value) return null;
      const { data } = await supabase
        .from("anagrafiche_native")
        .select(SELECT_COLS)
        .eq("id", value)
        .maybeSingle();
      return (data ?? null) as AnagraficaOption | null;
    },
  });
  useEffect(() => {
    if (standalone && !selected) setSelected(standalone);
  }, [standalone, selected]);

  const handleSelect = useCallback(
    (a: AnagraficaOption) => {
      setSelected(a);
      onChange(a.id, a);
      setOpen(false);
    },
    [onChange],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between text-left font-normal h-auto min-h-10 py-2",
            !selected && "text-muted-foreground",
          )}
        >
          {selected ? (
            <div className="flex flex-col items-start gap-0.5 truncate flex-1 min-w-0">
              <span className="font-medium text-sm truncate w-full">{anagraficaDisplayName(selected)}</span>
              <span className="text-xs text-muted-foreground truncate w-full">
                {selected.partita_iva ? `P.IVA ${selected.partita_iva}` : selected.codice_fiscale ? `CF ${selected.codice_fiscale}` : "—"}
                {selected.indirizzo_comune ? ` · ${selected.indirizzo_comune}` : ""}
              </span>
            </div>
          ) : (
            <span className="truncate">{placeholder ?? "Cerca cliente per nome o P.IVA..."}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <CommandInput
              placeholder="Cerca per nome o P.IVA…"
              value={search}
              onValueChange={setSearch}
              className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground border-0 focus:ring-0"
            />
          </div>
          <CommandList
            className="max-h-[360px] overscroll-contain"
            onWheel={(e) => {
              e.currentTarget.scrollTop += e.deltaY;
            }}
          >
            {isLoading ? (
              <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin mr-2" />
                Caricamento clienti…
              </div>
            ) : rows.length === 0 ? (
              <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
                {debouncedSearch ? `Nessun cliente per "${debouncedSearch}"` : "Nessun cliente trovato"}
              </CommandEmpty>
            ) : (
              <CommandGroup>
                {rows.map((a) => {
                  const isSelected = value === a.id;
                  return (
                    <CommandItem
                      key={a.id}
                      value={a.id}
                      onSelect={() => handleSelect(a)}
                      className="flex flex-col items-start gap-0.5 py-2 cursor-pointer"
                    >
                      <div className="flex items-center gap-2 w-full">
                        <Check className={cn("h-3.5 w-3.5 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
                        <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="font-medium text-sm truncate">{anagraficaDisplayName(a)}</span>
                      </div>
                      <span className="pl-7 text-[11px] text-muted-foreground truncate w-full">
                        {a.partita_iva ? `P.IVA ${a.partita_iva}` : a.codice_fiscale ? `CF ${a.codice_fiscale}` : "Senza P.IVA"}
                        {a.indirizzo_comune ? ` · ${a.indirizzo_comune}${a.indirizzo_provincia ? ` (${a.indirizzo_provincia})` : ""}` : ""}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
