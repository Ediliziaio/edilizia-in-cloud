import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useDebounce } from "@/hooks/useDebounce";
import {
  cercaCollegamentiPianta,
  caricaContestoCollegamenti,
  DEFINIZIONI_COLLEGAMENTI,
  type TipoCollegamento,
  type SceltaCollegamento,
} from "@/lib/planimetrie/collegamenti";

interface Props {
  tipo: TipoCollegamento;
  value: string;
  onChange: (value: string) => void;
  companyId?: string;
  scelta?: SceltaCollegamento;
  className?: string;
}
export function RicercaSchedaFiltro({
  tipo,
  value,
  onChange,
  companyId,
  scelta,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 250);
  const queryClient = useQueryClient();
  const label = DEFINIZIONI_COLLEGAMENTI[tipo].titolo;
  const key = ["planimetrie-filtro-scheda", companyId, tipo, value];
  const concrete = !!value && value !== "presenti" && value !== "nessuno";
  const selected = useQuery({
    queryKey: key,
    queryFn: async () => {
      const accessi = {
        cliente: false,
        contatto: false,
        preventivo: false,
        commessa: false,
        computo: false,
        [tipo]: true,
      };
      const data = await caricaContestoCollegamenti(
        companyId!,
        { [tipo]: { id: value, nome: "" } },
        accessi,
      );
      return data[tipo][value] || null;
    },
    enabled: !!companyId && concrete && !scelta,
    staleTime: 60_000,
    retry: 1,
  });
  const results = useQuery({
    queryKey: ["planimetrie-ricerca-filtro", companyId, tipo, debounced],
    queryFn: () => cercaCollegamentiPianta(companyId!, tipo, debounced),
    enabled: open && !!companyId,
    staleTime: 30_000,
    retry: 1,
  });
  const choose = (id: string, option?: SceltaCollegamento) => {
    if (option)
      queryClient.setQueryData(
        ["planimetrie-filtro-scheda", companyId, tipo, id],
        option,
      );
    onChange(id);
    setOpen(false);
  };
  const name = scelta?.nome || selected.data?.nome;
  const caption = !value
    ? label
    : value === "presenti"
      ? `Con ${label.toLocaleLowerCase("it")}`
      : value === "nessuno"
        ? `Senza ${label.toLocaleLowerCase("it")}`
        : name || `${label} selezionato`;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-label={`Filtra per ${label.toLocaleLowerCase("it")}`}
          aria-expanded={open}
          disabled={!companyId}
          className={`h-9 min-w-0 justify-between px-3 text-xs font-normal shadow-none ${className || "w-full"}`}
        >
          <span className="truncate" title={caption}>
            {caption}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverPrimitive.Content
        aria-label={`Ricerca ${label.toLocaleLowerCase("it")}`}
        align="start"
        sideOffset={4}
        className="z-50 w-[--radix-popover-trigger-width] min-w-[260px] max-w-[calc(100vw-2rem)] rounded-md border bg-popover p-0 text-popover-foreground shadow-md outline-none"
      >
        <Command
          shouldFilter={false}
          label={`Cerca ${label.toLocaleLowerCase("it")}`}
        >
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={`Cerca ${label.toLocaleLowerCase("it")} per nome…`}
            aria-label={`Cerca ${label.toLocaleLowerCase("it")}`}
          />
          <CommandList className="max-h-72">
            <CommandGroup>
              <CommandItem onSelect={() => choose("")}>
                Qualsiasi {label.toLocaleLowerCase("it")}
                {!value && <Check className="ml-auto h-4 w-4" />}
              </CommandItem>
              <CommandItem onSelect={() => choose("nessuno")}>
                Senza {label.toLocaleLowerCase("it")}
                {value === "nessuno" && <Check className="ml-auto h-4 w-4" />}
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="Schede esistenti">
              {results.isFetching || search !== debounced ? (
                <div
                  role="status"
                  className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground"
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Ricerca…
                </div>
              ) : results.isError ? (
                <div role="alert" className="p-3 text-xs">
                  Ricerca non disponibile.
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => void results.refetch()}
                  >
                    Riprova
                  </Button>
                </div>
              ) : !results.data?.length ? (
                <div
                  role="status"
                  className="px-3 py-4 text-center text-xs text-muted-foreground"
                >
                  Nessun risultato. Prova un altro nome.
                </div>
              ) : (
                results.data.map((option) => (
                  <CommandItem
                    key={option.id}
                    value={option.id}
                    onSelect={() => choose(option.id, option)}
                  >
                    <div className="min-w-0">
                      <p className="truncate">{option.nome}</p>
                      {option.sottotitolo && (
                        <p className="truncate text-[11px] text-muted-foreground">
                          {option.sottotitolo}
                        </p>
                      )}
                    </div>
                    {value === option.id && (
                      <Check className="ml-auto h-4 w-4 shrink-0" />
                    )}
                  </CommandItem>
                ))
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverPrimitive.Content>
    </Popover>
  );
}
