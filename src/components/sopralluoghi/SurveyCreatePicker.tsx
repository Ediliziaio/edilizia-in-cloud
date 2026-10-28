import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export function SurveyCreatePicker({
  id,
  label,
  value,
  options,
  emptyLabel,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string | null;
  options: { id: string; label: string }[];
  emptyLabel: string;
  disabled?: boolean;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          disabled={disabled}
          className="min-h-11 w-full justify-between gap-2 rounded-xl bg-white px-3 font-normal"
        >
          <span className="truncate">
            {selected?.label ||
              (value ? "Collegamento selezionato · da verificare" : emptyLabel)}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(92vw,440px)] rounded-2xl p-1.5 shadow-lg"
      >
        <Command>
          <CommandInput
            placeholder={`Cerca ${label.toLowerCase()}…`}
            aria-label={`Cerca ${label.toLowerCase()}`}
          />
          <CommandList className="max-h-64 overscroll-contain">
            <CommandEmpty>Nessun risultato. Prova un altro nome.</CommandEmpty>
            {[{ id: "none", label: emptyLabel }, ...options].map((o) => (
              <CommandItem
                key={o.id}
                value={`${o.label} ${o.id}`}
                className="min-h-11 rounded-lg"
                onSelect={() => {
                  onChange(o.id === "none" ? null : o.id);
                  setOpen(false);
                }}
              >
                <Check
                  className={`mr-2 h-4 w-4 shrink-0 ${o.id === (value || "none") ? "opacity-100" : "opacity-0"}`}
                />
                <span className="break-words">{o.label}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
