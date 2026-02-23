import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, X, Check, ChevronsUpDown } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import type { TriggerFieldDef } from "@/types/automationBuilder";
import { NO_VALUE_OPERATORS } from "@/types/automationBuilder";

interface Props {
  field: TriggerFieldDef | undefined;
  operator: string;
  value: any;
  onChange: (value: any) => void;
  hasError?: boolean;
  companyId?: string;
}

export function ConditionValueInput({ field, operator, value, onChange, hasError, companyId }: Props) {
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

  // Tags – multi-select from marketing_tags
  if (field.type === "tags") {
    return <TagMultiSelect value={value} onChange={onChange} companyId={companyId} hasError={hasError} />;
  }

  // User – select from profiles
  if (field.type === "user") {
    return <UserSelect value={value} onChange={onChange} companyId={companyId} hasError={hasError} />;
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

// ── Tag Multi-Select ──
function TagMultiSelect({ value, onChange, companyId, hasError }: { value: any; onChange: (v: any) => void; companyId?: string; hasError?: boolean }) {
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<{ id: string; name: string; color: string }[]>([]);
  const [search, setSearch] = useState("");

  const selectedTags: string[] = Array.isArray(value) ? value : value ? [value] : [];

  useEffect(() => {
    if (!companyId) return;
    supabase
      .from("marketing_tags")
      .select("id, name, color")
      .eq("company_id", companyId)
      .order("name")
      .then(({ data }) => {
        if (data) setTags(data);
      });
  }, [companyId]);

  const toggleTag = (tagName: string) => {
    const next = selectedTags.includes(tagName)
      ? selectedTags.filter((t) => t !== tagName)
      : [...selectedTags, tagName];
    onChange(next.length > 0 ? next : "");
  };

  const removeTag = (tagName: string) => {
    const next = selectedTags.filter((t) => t !== tagName);
    onChange(next.length > 0 ? next : "");
  };

  const filtered = tags.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-1">
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedTags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[10px] h-5 gap-0.5 pr-1">
              {tag}
              <button onClick={() => removeTag(tag)} className="ml-0.5 hover:text-destructive">
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn("h-8 text-xs w-full justify-between font-normal", hasError && "border-destructive")}
          >
            Seleziona tag...
            <ChevronsUpDown className="h-3 w-3 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Cerca tag..." value={search} onValueChange={setSearch} className="h-8 text-xs" />
            <CommandList>
              <CommandEmpty className="text-xs p-2 text-center text-muted-foreground">Nessun tag trovato</CommandEmpty>
              <CommandGroup>
                <ScrollArea className="max-h-[160px]">
                  {filtered.map((tag) => (
                    <CommandItem key={tag.id} value={tag.name} onSelect={() => toggleTag(tag.name)} className="text-xs">
                      <Check className={cn("h-3 w-3 mr-1.5", selectedTags.includes(tag.name) ? "opacity-100" : "opacity-0")} />
                      <span
                        className="w-2 h-2 rounded-full mr-1.5 shrink-0"
                        style={{ backgroundColor: tag.color || "hsl(var(--primary))" }}
                      />
                      {tag.name}
                    </CommandItem>
                  ))}
                </ScrollArea>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ── User Select ──
function UserSelect({ value, onChange, companyId, hasError }: { value: any; onChange: (v: any) => void; companyId?: string; hasError?: boolean }) {
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!companyId) return;
    supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .eq("company_id", companyId)
      .then(({ data }) => {
        if (data) {
          setUsers(data.map((u) => ({ id: u.id, name: `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.id })));
        }
      });
  }, [companyId]);

  return (
    <Select value={value || ""} onValueChange={onChange}>
      <SelectTrigger className={cn("h-8 text-xs", hasError && "border-destructive")}>
        <SelectValue placeholder="Seleziona utente..." />
      </SelectTrigger>
      <SelectContent>
        {users.map((u) => (
          <SelectItem key={u.id} value={u.id} className="text-xs">
            {u.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
