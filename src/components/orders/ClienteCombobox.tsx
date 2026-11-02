import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cercaClienti, emailDaMostrare, nomeCliente, type ClienteDaCercare } from "@/lib/orders/nuovaCommessaProposte";
import { cn } from "@/lib/utils";

interface Props {
  id?: string;
  clienti: ReadonlyArray<ClienteDaCercare>;
  value: string;
  onChange: (id: string) => void;
}

/** Il cliente si cerca scrivendo: la tendina semplice andava scorsa tutta. */
export function ClienteCombobox({ id, clienti, value, onChange }: Props) {
  const [aperto, setAperto] = useState(false);
  const [testo, setTesto] = useState("");
  const scelto = clienti.find((c) => c.id === value);
  const { risultati, altri } = useMemo(() => cercaClienti(clienti, testo), [clienti, testo]);

  return (
    <Popover open={aperto} onOpenChange={(a) => { setAperto(a); if (!a) setTesto(""); }}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={aperto} aria-label="Cliente" className="min-w-0 flex-1 justify-between font-normal">
          <span className={cn("truncate", !scelto && "text-muted-foreground")}>{scelto ? nomeCliente(scelto) : "Seleziona un cliente"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] min-w-[260px] p-0">
        <Command shouldFilter={false}>
          <CommandInput value={testo} onValueChange={setTesto} placeholder="Cerca per nome o email…" />
          <CommandList>
            <CommandEmpty>Nessun cliente trovato. Crealo col pulsante +.</CommandEmpty>
            <CommandGroup>
              {risultati.map((c) => {
                const email = emailDaMostrare(c.email);
                return (
                  <CommandItem key={c.id} value={c.id} onSelect={() => { onChange(c.id); setAperto(false); setTesto(""); }}>
                    <Check className={cn("mr-2 h-4 w-4 shrink-0", c.id === value ? "opacity-100" : "opacity-0")} />
                    <span className="min-w-0">
                      <span className="block truncate">{nomeCliente(c)}</span>
                      {email && <span className="block truncate text-xs text-muted-foreground">{email}</span>}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {altri > 0 && <p className="px-3 py-2 text-xs text-muted-foreground">Altri {altri}: scrivi per restringere la ricerca.</p>}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
