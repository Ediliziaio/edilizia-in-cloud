/**
 * Colore interno o esterno di una posizione: si sceglie fra i colori del
 * listino, divisi per fascia come nella tendina «Colore», oppure si scrive a
 * mano (una finestra bicolore, una riga fuori listino).
 *
 * Prima era il suggeritore del browser (<datalist>): una tendina grigia, diversa
 * da tutte le altre scelte del preventivo, e senza le fasce.
 */
import { useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface Props {
  value: string | null | undefined;
  /** Il colore scelto o scritto; null per togliere quello scritto sulla riga. */
  onChange: (valore: string | null) => void;
  gruppi: ReadonlyArray<{ titolo: string; voci: readonly string[] }>;
  placeholder?: string;
  className?: string;
  id?: string;
  "aria-label"?: string;
}

export function SceltaColore({
  value, onChange, gruppi, placeholder = "Scegli o scrivi un colore", className, id,
  "aria-label": ariaLabel,
}: Props) {
  const [aperta, setAperta] = useState(false);
  const [testo, setTesto] = useState("");
  const scritto = testo.trim();
  const giaNelListino = gruppi.some((g) => g.voci.some((v) => v.toLowerCase() === scritto.toLowerCase()));

  const scegli = (valore: string | null) => {
    onChange(valore);
    setTesto("");
    setAperta(false);
  };

  return (
    <Popover
      open={aperta}
      onOpenChange={(o) => {
        setAperta(o);
        if (!o) setTesto("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          aria-label={ariaLabel}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-1 rounded-md border border-input bg-background px-3 text-left text-xs",
            "ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            className,
          )}
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>{value || placeholder}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[16rem] p-0">
        <Command>
          <CommandInput value={testo} onValueChange={setTesto} placeholder="Cerca o scrivi un colore…" className="text-xs" />
          <CommandList className="max-h-72">
            <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">
              Nessun colore del listino
            </CommandEmpty>
            {scritto && !giaNelListino && (
              <CommandGroup>
                <CommandItem value={`scritto ${scritto}`} onSelect={() => scegli(scritto)} className="text-xs">
                  Usa «{scritto}»
                </CommandItem>
              </CommandGroup>
            )}
            {value && !scritto && (
              <CommandGroup>
                <CommandItem value="togli il colore scritto" onSelect={() => scegli(null)} className="text-xs italic text-muted-foreground">
                  <X className="mr-2 h-3.5 w-3.5" />
                  Togli il colore scritto
                </CommandItem>
              </CommandGroup>
            )}
            {gruppi.map((g) => (
              <CommandGroup key={g.titolo} heading={g.titolo}>
                {g.voci.map((voce) => (
                  <CommandItem key={voce} value={`${g.titolo} ${voce}`} onSelect={() => scegli(voce)} className="text-xs">
                    <Check className={cn("mr-2 h-3.5 w-3.5", value === voce ? "opacity-100" : "opacity-0")} />
                    {voce}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
