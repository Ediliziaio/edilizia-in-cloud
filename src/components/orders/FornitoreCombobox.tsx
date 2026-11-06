import { useState } from "react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown } from "lucide-react";
import { emailPerOrdini } from "@/lib/suppliers/anagraficaFornitore";
import type { FornitoreDocumento } from "@/lib/documentiOperativi/fornitore";
export function FornitoreCombobox({
  fornitori,
  value,
  onChange,
}: {
  fornitori: FornitoreDocumento[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const scelto = fornitori.find((s) => s.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label="Fornitore"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {scelto?.name || "Cerca fornitore registrato"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Cerca nome, email o partita IVA…" />
          <CommandList>
            <CommandEmpty>Nessun fornitore trovato.</CommandEmpty>
            <CommandGroup>
              {fornitori
                .filter((s) => s.is_active !== false)
                .map((s) => {
                  const email = emailPerOrdini({
                    ...s,
                    email: s.email ?? null,
                  });
                  return (
                    <CommandItem
                      key={s.id}
                      value={[s.id, s.name, email, s.vat_number]
                        .filter(Boolean)
                        .join(" ")}
                      onSelect={() => {
                        onChange(s.id);
                        setOpen(false);
                      }}
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{s.name}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {email || "Email non registrata"}
                        </span>
                      </span>
                      {s.id === value && <Check className="ml-auto h-4 w-4" />}
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
