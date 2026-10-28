import { Plus, Trash2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAutomationFieldDefinitions } from "@/hooks/useAutomationFieldDefinitions";
import { CUSTOM_TRIGGER_OBJECTS,customFieldId,customFilterType } from "../../../../supabase/functions/_shared/automationFieldContract";
import { ConditionValueInput } from "@/components/marketing/automations/ConditionValueInput";
import { conditionOperatorAliases } from "../../../../supabase/functions/_shared/automationValidation";

const CAMPI = [
  { value: "contatto.first_name", label: "Nome contatto" },
  { value: "contatto.last_name", label: "Cognome contatto" },
  { value: "contatto.email", label: "Email contatto" },
  { value: "contatto.phone", label: "Telefono contatto" },
  { value: "contatto.city", label: "Città contatto" },
  { value: "contatto.province", label: "Provincia contatto" },
  { value: "contatto.source", label: "Fonte contatto" },
  // I tag sono un elenco: "contiene"/"non contiene" valgono sul tag intero.
  // Senza questa voce le sequenze che si fermano su un tag (il classico
  // «stop nutrimento») non erano scrivibili dal pannello.
  { value: "contatto.tags", label: "Tag contatto" },
  { value: "opportunita.value", label: "Valore opportunità" },
  { value: "opportunita.stage_id", label: "Stage opportunità" },
  { value: "appuntamento.status", label: "Stato appuntamento" },
  { value: "appuntamento.appointment_date", label: "Data appuntamento" },
  { value: "appuntamento.calendar_id", label: "Calendario appuntamento" },
  { value: "ordine.total_amount", label: "Importo ordine" },
  { value: "ticket.priority", label: "Priorità ticket" },
];

const OPERATORI = [
  { value: "uguale", label: "= uguale a" },
  { value: "diverso", label: "≠ diverso da" },
  { value: "contiene", label: "contiene" },
  { value: "non_contiene", label: "non contiene" },
  { value: "inizia_con", label: "inizia con" },
  { value: "vuoto", label: "è vuoto" },
  { value: "non_vuoto", label: "non è vuoto" },
  { value: "maggiore", label: "> maggiore di" },
  { value: "minore", label: "< minore di" },
  { value: "maggiore_uguale", label: "≥ maggiore o uguale" },
  { value: "minore_uguale", label: "≤ minore o uguale" },
  // Per le date (ora italiana): «l'appuntamento è da oggi in poi?»
  { value: "da_oggi", label: "è oggi o dopo (date)" },
  { value: "prima_di_oggi", label: "è prima di oggi (date)" },
];

interface ConditionRow {
  campo: string;
  operatore: string;
  valore: any;
}

interface ConditionConfigPanelProps {
  config: Record<string, any>;
  onChange: (field: string, value: any) => void;
  companyId?: string;
  triggerCategory?: string;
}

export function ConditionConfigPanel({ config, onChange, companyId, triggerCategory }: ConditionConfigPanelProps) {
  const scope=String(config.custom_object_type??CUSTOM_TRIGGER_OBJECTS[triggerCategory??""]??"contact");
  const {data:customFields=[],isError}=useAutomationFieldDefinitions(companyId,scope);
  const condizioni: ConditionRow[] = config.condizioni || [{ campo: "", operatore: "uguale", valore: "" }];
  const logica = config.operatore_logico || "AND";

  const updateCondizioni = (next: ConditionRow[]) => onChange("condizioni", next);

  const updateRow = (i: number, updates: Partial<ConditionRow>) => {
    const next = [...condizioni];
    next[i] = { ...next[i], ...updates };
    updateCondizioni(next);
  };

  const removeRow = (i: number) => {
    if (condizioni.length <= 1) return;
    updateCondizioni(condizioni.filter((_, idx) => idx !== i));
  };

  const addRow = () => {
    updateCondizioni([...condizioni, { campo: "", operatore: "uguale", valore: "" }]);
  };

  const noValueOps = ["vuoto", "non_vuoto", "da_oggi", "prima_di_oggi"];

  return (
    <div className="space-y-4">
      <Label htmlFor="condition-custom-object">Campi personalizzati di</Label><select id="condition-custom-object" className="w-full rounded border bg-background p-2 text-sm" value={scope} onChange={e=>onChange("custom_object_type",e.target.value)}>{Object.entries({contact:"Contatto",opportunity:"Opportunità",appointment:"Appuntamento",order:"Commessa",quote:"Preventivo",task:"Task",employee:"Dipendente",warehouse:"Magazzino",ordini_variazione:"Variante",giornale_lavori:"Giornale lavori",duvri_document:"DUVRI"}).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>
      <p className="text-xs text-muted-foreground">Si legge il record del flusso o quello realmente collegato, non un record arbitrario.</p>
      {isError&&<p role="alert" className="text-xs text-destructive">Impossibile leggere i campi personalizzati. Riprova prima di pubblicare.</p>}
      {/* Logic toggle */}
      <div className="space-y-1.5">
        <Label className="text-xs">Logica</Label>
        <div className="flex rounded-lg border overflow-hidden w-fit">
          {(["AND", "OR"] as const).map(l => (
            <button
              key={l}
              onClick={() => onChange("operatore_logico", l)}
              className={cn(
                "px-5 py-1.5 text-xs font-semibold transition-colors",
                logica === l
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent/50"
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">
          {logica === "AND" ? "Tutte le condizioni devono essere vere" : "Almeno una condizione vera"}
        </p>
      </div>

      {/* Condition rows */}
      <div className="space-y-2">
        {condizioni.map((cond, i) => (
          <div key={i} className="border rounded-lg p-2.5 bg-muted/30 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                {i === 0 ? "SE" : logica === "AND" ? "E" : "OPPURE"}
              </span>
              {condizioni.length > 1 && (
                <button onClick={() => removeRow(i)} className="p-0.5 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
            <Select value={cond.campo || ""} onValueChange={v => updateRow(i, { campo: v })}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Seleziona campo..." />
              </SelectTrigger>
              <SelectContent>
                {cond.campo&&!CAMPI.some(c=>c.value===cond.campo)&&!customFields.some(f=>f.id===customFieldId(cond.campo))&&<SelectItem value={cond.campo} disabled>Campo non disponibile</SelectItem>}
                {CAMPI.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                {customFields.filter(f=>f.field_type!=="file").map(f=><SelectItem key={f.id} value={`custom_field.${f.id}`}>{f.name} · personalizzato</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={cond.operatore} onValueChange={v => updateRow(i, { operatore: v })}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERATORI.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {!noValueOps.includes(cond.operatore) && customFieldId(cond.campo) && customFields.some(f=>f.id===customFieldId(cond.campo)) ? (()=>{
              const field=customFields.find(f=>f.id===customFieldId(cond.campo))!;
              return <ConditionValueInput field={{key:cond.campo,label:field.name,type:customFilterType(field.field_type),group:"Campi personalizzati",options:field.options?.map(v=>({value:v,label:v}))}} operator={conditionOperatorAliases[cond.operatore]??cond.operatore} value={cond.valore} companyId={companyId} onChange={v=>updateRow(i,{valore:v})} />;
            })() : !noValueOps.includes(cond.operatore) && (
              <Input
                value={cond.valore}
                onChange={e => updateRow(i, { valore: e.target.value })}
                placeholder="Valore..."
                className="h-7 text-xs"
              />
            )}
          </div>
        ))}
      </div>

      {/* Add */}
      <Button variant="outline" size="sm" className="w-full text-xs" onClick={addRow}>
        <Plus className="h-3 w-3 mr-1" /> Aggiungi condizione
      </Button>
    </div>
  );
}
