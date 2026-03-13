import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Variable } from "lucide-react";

const COMMON_VARIABLES = [
  { key: "contact.first_name", label: "Nome contatto" },
  { key: "contact.last_name", label: "Cognome contatto" },
  { key: "contact.email", label: "Email contatto" },
  { key: "contact.phone", label: "Telefono contatto" },
  { key: "contact.company_name", label: "Azienda contatto" },
  { key: "opportunity.name", label: "Nome opportunità" },
  { key: "opportunity.value", label: "Valore opportunità" },
  { key: "appointment.date", label: "Data appuntamento" },
  { key: "appointment.time", label: "Ora appuntamento" },
  { key: "system.today", label: "Data odierna" },
  { key: "system.company_name", label: "Nome azienda" },
];

interface VariablePickerProps {
  onInsert: (variable: string) => void;
}

export function VariablePicker({ onInsert }: VariablePickerProps) {
  const [search, setSearch] = useState("");
  const filtered = COMMON_VARIABLES.filter(
    (v) => v.label.toLowerCase().includes(search.toLowerCase()) || v.key.includes(search.toLowerCase())
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6" title="Inserisci variabile">
          <Variable className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <Input
          placeholder="Cerca variabile..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 text-xs mb-2"
        />
        <ScrollArea className="max-h-48">
          <div className="space-y-0.5">
            {filtered.map((v) => (
              <button
                key={v.key}
                onClick={() => onInsert(`{{${v.key}}}`)}
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-accent transition-colors"
              >
                <span>{v.label}</span>
                <code className="text-[10px] text-muted-foreground">{`{{${v.key}}}`}</code>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">Nessuna variabile trovata</p>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
