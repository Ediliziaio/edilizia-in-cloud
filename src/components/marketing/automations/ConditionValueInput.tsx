import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { TriggerFieldDef } from "@/types/automationBuilder";
import { NO_VALUE_OPERATORS } from "@/types/automationBuilder";

interface Props {
  field: TriggerFieldDef | undefined;
  operator: string;
  value: any;
  onChange: (value: any) => void;
  hasError?: boolean;
}

export function ConditionValueInput({ field, operator, value, onChange, hasError }: Props) {
  if (!field || !operator || NO_VALUE_OPERATORS.includes(operator)) {
    return null;
  }

  const errorClass = hasError ? "border-destructive" : "";

  // Date: "between" needs two dates
  if (field.type === "date" && operator === "between") {
    const dates = value || { from: "", to: "" };
    return (
      <div className="flex gap-1.5">
        <DatePickerInput
          value={dates.from}
          onChange={(d) => onChange({ ...dates, from: d })}
          placeholder="Da"
          hasError={hasError}
        />
        <DatePickerInput
          value={dates.to}
          onChange={(d) => onChange({ ...dates, to: d })}
          placeholder="A"
          hasError={hasError}
        />
      </div>
    );
  }

  // Date: in_last_x_days / in_next_x_days
  if (field.type === "date" && (operator === "in_last_x_days" || operator === "in_next_x_days")) {
    return (
      <Input
        type="number"
        min={1}
        value={value || ""}
        onChange={(e) => onChange(parseInt(e.target.value) || "")}
        placeholder="Giorni..."
        className={cn("h-8 text-xs", errorClass)}
      />
    );
  }

  // Date: single picker
  if (field.type === "date") {
    return <DatePickerInput value={value} onChange={onChange} hasError={hasError} />;
  }

  // Number: "between"
  if (field.type === "number" && operator === "between") {
    const vals = value || { from: "", to: "" };
    return (
      <div className="flex gap-1.5">
        <Input
          type="number"
          value={vals.from ?? ""}
          onChange={(e) => onChange({ ...vals, from: e.target.value })}
          placeholder="Da"
          className={cn("h-8 text-xs", errorClass)}
        />
        <Input
          type="number"
          value={vals.to ?? ""}
          onChange={(e) => onChange({ ...vals, to: e.target.value })}
          placeholder="A"
          className={cn("h-8 text-xs", errorClass)}
        />
      </div>
    );
  }

  // Number
  if (field.type === "number") {
    return (
      <Input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Valore..."
        className={cn("h-8 text-xs", errorClass)}
      />
    );
  }

  // Select
  if (field.type === "select" && field.options?.length) {
    return (
      <Select value={value || ""} onValueChange={onChange}>
        <SelectTrigger className={cn("h-8 text-xs", errorClass)}>
          <SelectValue placeholder="Seleziona..." />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // Tags (simple text input for now – could be enhanced with multi-select)
  if (field.type === "tags") {
    return (
      <Input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Nome tag..."
        className={cn("h-8 text-xs", errorClass)}
      />
    );
  }

  // User (simple text for now – could load from profiles)
  if (field.type === "user") {
    return (
      <Input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="ID o nome utente..."
        className={cn("h-8 text-xs", errorClass)}
      />
    );
  }

  // Default: text input
  return (
    <Input
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Valore..."
      className={cn("h-8 text-xs", errorClass)}
    />
  );
}

function DatePickerInput({ value, onChange, placeholder, hasError }: { value: string; onChange: (v: string) => void; placeholder?: string; hasError?: boolean }) {
  const date = value ? new Date(value) : undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-8 text-xs justify-start font-normal min-w-[120px]",
            !date && "text-muted-foreground",
            hasError && "border-destructive"
          )}
        >
          <CalendarIcon className="h-3 w-3 mr-1" />
          {date ? format(date, "dd/MM/yyyy", { locale: it }) : placeholder || "Seleziona..."}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => onChange(d ? d.toISOString() : "")}
          className="p-3 pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}
