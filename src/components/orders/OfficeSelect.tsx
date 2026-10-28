import type { ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const EMPTY = "__office_empty__";

/** The platform select, styled locally: no native OS menus or global changes. */
export function OfficeSelect({
  label,
  value,
  onValueChange,
  options,
  disabled,
  className,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly { value: string; label: ReactNode }[];
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select
      value={value || EMPTY}
      onValueChange={(next) => onValueChange(next === EMPTY ? "" : next)}
      disabled={disabled}
    >
      <SelectTrigger
        aria-label={label}
        className={cn(
          "min-w-0 rounded-xl border-border/80 bg-background text-left shadow-sm transition-colors hover:border-blue-300 focus:ring-blue-500/20",
          className,
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72 rounded-2xl border-border/70 p-1 shadow-xl motion-reduce:animate-none">
        {options.map((option) => (
          <SelectItem
            key={option.value || EMPTY}
            value={option.value || EMPTY}
            className="my-0.5 rounded-lg py-2 focus:bg-blue-50 focus:text-blue-950 dark:focus:bg-blue-950 dark:focus:text-blue-100"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
