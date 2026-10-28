import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
  CommandGroup,
} from "@/components/ui/command";

/** Uses the same focus/layer stack as Dialog, including on Escape. The installed
 * Select package has a different Radix stack and must not trap this modal. */
export function ViaggioSelect({
  label,
  id,
  value,
  onValueChange,
  options,
  disabled = false,
  emptyMessage = "Nessuna corrispondenza. Cerca altri cantieri o conducenti dal modulo.",
}: {
  id?: string;
  disabled?: boolean;
  emptyMessage?: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          disabled={disabled}
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          variant="outline"
          className="w-full min-w-0 justify-between rounded-xl font-normal shadow-sm"
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
            }
          }}
        >
          <span className="min-w-0 truncate">
            {selected?.label ?? "Seleziona…"}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] rounded-2xl p-1 shadow-xl motion-reduce:animate-none"
      >
        <Command
          label={`Cerca ${label}`}
          filter={(_value, search, keywords) => {
            const normalizza = (v: string) =>
              v
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase();
            const text = normalizza((keywords ?? []).join(" "));
            return normalizza(search)
              .trim()
              .split(/\s+/)
              .every((term) => text.includes(term))
              ? 1
              : 0;
          }}
          defaultValue={value || "__vuoto__"}
          loop
        >
          <CommandInput
            aria-label={`Cerca ${label}`}
            placeholder="Cerca tra le opzioni…"
          />
          <CommandList label={label} className="max-h-60">
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value || "__vuoto__"}
                  value={option.value || "__vuoto__"}
                  keywords={[option.label]}
                  onSelect={() => {
                    onValueChange(option.value);
                    setOpen(false);
                  }}
                  className="min-h-11 rounded-xl px-3 py-2 data-[selected=true]:bg-blue-50 data-[selected=true]:text-blue-950"
                >
                  <span className="min-w-0 flex-1">{option.label}</span>
                  {option.value === value && (
                    <Check className="ml-2 h-4 w-4 shrink-0" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
