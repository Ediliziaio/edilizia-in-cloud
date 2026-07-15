import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Variable, Zap, Sparkles } from "lucide-react";
import { TRIGGER_MAP } from "@/lib/flow-node-catalog";

interface VarEntry {
  key: string;
  label: string;
}

interface VarGroup {
  label: string;
  icon?: "trigger" | "custom";
  vars: VarEntry[];
}

/** Replica esatta di toSnakeCase del backend (contactCustomFields.ts):
 *  i campi personalizzati si risolvono come {{contact.<snake_case_del_nome>}}. */
function toSnakeCase(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

const CONTACT_VARIABLES: VarEntry[] = [
  { key: "contatto.full_name", label: "Nome completo" },
  { key: "contact.first_name", label: "Nome contatto" },
  { key: "contact.last_name", label: "Cognome contatto" },
  { key: "contact.email", label: "Email contatto" },
  { key: "contact.phone", label: "Telefono contatto" },
  { key: "contact.city", label: "Città" },
  { key: "contact.province", label: "Provincia" },
  { key: "contact.region", label: "Regione" },
  { key: "contact.address", label: "Indirizzo" },
  { key: "contact.postal_code", label: "CAP" },
  { key: "contact.company_name", label: "Azienda contatto" },
  { key: "contact.source", label: "Fonte contatto" },
];

const OTHER_VARIABLES: VarEntry[] = [
  { key: "opportunity.name", label: "Nome opportunità" },
  { key: "opportunity.value", label: "Valore opportunità" },
  { key: "appointment.date", label: "Data appuntamento" },
  { key: "appointment.time", label: "Ora appuntamento" },
  { key: "system.today", label: "Data odierna" },
  { key: "system.company_name", label: "Nome azienda" },
];

interface VariablePickerProps {
  onInsert: (variable: string) => void;
  /** Item id del trigger del flusso: le sue variabili di output compaiono in cima. */
  triggerItemId?: string;
  /** Azienda corrente: abilita il gruppo "Campi personalizzati" del contatto. */
  companyId?: string;
}

export function VariablePicker({ onInsert, triggerItemId, companyId }: VariablePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Campi personalizzati contatto dell'azienda → {{contact.<snake_case>}}
  const { data: customFields = [] } = useQuery({
    queryKey: ["variable-picker-custom-fields", companyId],
    enabled: open && !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_custom_fields")
        .select("id, name")
        .eq("company_id", companyId!)
        .eq("object_type", "contact")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const groups = useMemo<VarGroup[]>(() => {
    const out: VarGroup[] = [];
    // Le variabili del TRIGGER sono le più utili (si risolvono sempre dal
    // payload dell'evento) → in cima, senza dover scrollare.
    const trigger = triggerItemId ? TRIGGER_MAP[triggerItemId] : undefined;
    if (trigger?.outputVariables?.length) {
      out.push({
        label: `Dal trigger: ${trigger.label}`,
        icon: "trigger",
        vars: trigger.outputVariables.map((v) => ({ key: v.id, label: v.label })),
      });
    }
    out.push({ label: "Contatto", vars: CONTACT_VARIABLES });
    if (customFields.length > 0) {
      out.push({
        label: "Campi personalizzati",
        icon: "custom",
        vars: customFields.map((f: { id: string; name: string }) => ({
          key: `contact.${toSnakeCase(f.name)}`,
          label: f.name,
        })),
      });
    }
    out.push({ label: "Altro", vars: OTHER_VARIABLES });
    return out;
  }, [triggerItemId, customFields]);

  const q = search.trim().toLowerCase();
  const filtered = groups
    .map((g) => ({
      ...g,
      vars: q
        ? g.vars.filter((v) => v.label.toLowerCase().includes(q) || v.key.toLowerCase().includes(q))
        : g.vars,
    }))
    .filter((g) => g.vars.length > 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6" title="Inserisci variabile">
          <Variable className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="border-b p-2">
          <Input
            autoFocus
            placeholder="Cerca variabile… (es. nome, città, campagna)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {filtered.map((g) => (
            <div key={g.label} className="mb-1.5">
              <p className="sticky top-0 z-10 flex items-center gap-1 bg-popover px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {g.icon === "trigger" && <Zap className="h-3 w-3 text-emerald-600" />}
                {g.icon === "custom" && <Sparkles className="h-3 w-3 text-violet-600" />}
                {g.label}
              </p>
              {g.vars.map((v) => (
                <button
                  key={v.key}
                  onClick={() => { onInsert(`{{${v.key}}}`); setOpen(false); }}
                  className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent transition-colors"
                >
                  <span className="truncate">{v.label}</span>
                  <code className="shrink-0 text-[10px] text-muted-foreground">{`{{${v.key}}}`}</code>
                </button>
              ))}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="py-6 text-center text-xs text-muted-foreground">Nessuna variabile trovata</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
