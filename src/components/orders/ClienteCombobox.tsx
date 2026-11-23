import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RigaCliente } from "@/components/orders/RigaCliente";
import { cercaClienti, indirizzoCliente, nomeCliente, type ClienteDaCercare } from "@/lib/orders/nuovaCommessaProposte";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  id?: string;
  clienti: ReadonlyArray<ClienteDaCercare>;
  value: string;
  onChange: (id: string) => void;
  /** Se c'è, in fondo all'elenco compare «Nuovo cliente», col testo già scritto. */
  onNuovo?: (testo: string) => void;
}

/**
 * Il cliente si cerca scrivendo, anche per telefono, indirizzo, città o partita IVA;
 * ogni riga mostra i recapiti, così due clienti col nome simile si distinguono.
 */
export function ClienteCombobox({ id, clienti, value, onChange, onNuovo }: Props) {
  const t = useT();
  const [aperto, setAperto] = useState(false);
  const [testo, setTesto] = useState("");
  const scelto = clienti.find((c) => c.id === value);
  const { risultati, altri } = useMemo(() => cercaClienti(clienti, testo), [clienti, testo]);
  const chiudi = () => { setAperto(false); setTesto(""); };
  const sottotitoloScelto = scelto ? indirizzoCliente(scelto) : null;

  return (
    <Popover open={aperto} onOpenChange={(a) => { setAperto(a); if (!a) setTesto(""); }}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={aperto} aria-label={t("Cliente")} className="min-w-0 flex-1 justify-between font-normal">
          <span className={cn("min-w-0 truncate text-left", !scelto && "text-muted-foreground")}>
            {scelto ? nomeCliente(scelto) : t("Seleziona un cliente")}
            {sottotitoloScelto && <span className="ml-2 text-xs text-muted-foreground">{sottotitoloScelto}</span>}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(40rem,calc(100vw-2rem))] min-w-[var(--radix-popover-trigger-width)] p-0"
      >
        <Command shouldFilter={false}>
          <CommandInput value={testo} onValueChange={setTesto} placeholder={t("Cerca per nome, telefono, indirizzo, email o P.IVA…")} className="h-12 text-base" />
          <CommandList className="max-h-[min(28rem,60vh)]">
            <CommandEmpty className="px-3 py-6 text-center text-sm text-muted-foreground">
              {testo.trim() ? t("Nessun cliente trovato per «{testo}».", { testo: testo.trim() }) : t("Nessun cliente trovato.")}
            </CommandEmpty>
            {risultati.length > 0 && (
              <CommandGroup heading={testo.trim() ? t("{n} trovati", { n: risultati.length + altri }) : t("{n} clienti", { n: clienti.length })}>
                {risultati.map((c) => (
                  <CommandItem key={c.id} value={c.id} onSelect={() => { onChange(c.id); chiudi(); }} className="items-start gap-2 py-2.5">
                    <Check className={cn("mt-0.5 h-4 w-4 shrink-0", c.id === value ? "opacity-100" : "opacity-0")} />
                    <RigaCliente cliente={c} />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {altri > 0 && <p className="px-3 py-2 text-xs text-muted-foreground">{t("Altri {n}: scrivi per restringere la ricerca.", { n: altri })}</p>}
          </CommandList>
          {onNuovo && (
            <div className="border-t p-1.5">
              <Button type="button" variant="ghost" className="h-9 w-full justify-start font-normal" onClick={() => { const scritto = testo; chiudi(); onNuovo(scritto.trim()); }}>
                <Plus className="mr-2 h-4 w-4" /> {testo.trim() ? t("Nuovo cliente «{testo}»", { testo: testo.trim() }) : t("Nuovo cliente")}
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
