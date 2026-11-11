import { Fragment, type ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const EMPTY = "__office_empty__";

export interface OfficeSelectOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
  /** Optional heading: consecutive options sharing it are shown together. */
  group?: string;
}

/**
 * The one menu of the commessa (09/11/2026). Born for the office tab, it is now
 * the single drop-down everywhere under the commessa: the same shape, the same
 * open and the same keyboard, instead of the operating system's own menu next
 * to it. A native <select> here is a leftover, not a choice.
 */
export function OfficeSelect({
  label,
  value,
  onValueChange,
  options,
  disabled,
  className,
  placeholder,
  id,
}: {
  label: string;
  /** Pairs the trigger with an external <Label htmlFor>. */
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly OfficeSelectOption[];
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  // Consecutive options with the same heading become one group.
  const blocks: { group?: string; options: OfficeSelectOption[] }[] = [];
  for (const option of options) {
    const last = blocks[blocks.length - 1];
    if (last && last.group === option.group) last.options.push(option);
    else blocks.push({ group: option.group, options: [option] });
  }
  return (
    <Select
      // Nothing chosen and no "none" option: "" lets the placeholder show
      // (with EMPTY the trigger stayed blank, e.g. «Scegli la ditta», 11/11/2026).
      value={value || (options.some((o) => !o.value) ? EMPTY : "")}
      onValueChange={(next) => onValueChange(next === EMPTY ? "" : next)}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        // With an id the visible <Label htmlFor> names the control: a second
        // aria-label would silently replace the text the person reads.
        aria-label={id ? undefined : label}
        className={cn(
          "min-w-0 rounded-xl border-border/80 bg-background text-left shadow-sm transition-colors hover:border-blue-300 focus:ring-blue-500/20",
          className,
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-72 rounded-2xl border-border/70 p-1 shadow-xl motion-reduce:animate-none">
        {blocks.map((block, i) => {
          const items = block.options.map((option) => (
            <SelectItem
              key={option.value || EMPTY}
              value={option.value || EMPTY}
              disabled={option.disabled}
              className="my-0.5 rounded-lg py-2 focus:bg-blue-50 focus:text-blue-950 dark:focus:bg-blue-950 dark:focus:text-blue-100"
            >
              {option.label}
            </SelectItem>
          ));
          if (!block.group) return <Fragment key={i}>{items}</Fragment>;
          return (
            <SelectGroup key={i}>
              <SelectLabel className="px-2 text-xs font-medium text-muted-foreground">
                {block.group}
              </SelectLabel>
              {items}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}
