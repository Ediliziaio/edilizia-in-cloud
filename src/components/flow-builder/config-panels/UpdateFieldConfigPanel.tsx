import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomFieldInput } from "@/components/shared/CustomFieldInput";
import { useAutomationFieldDefinitions } from "@/hooks/useAutomationFieldDefinitions";
import {
  AUTOMATION_CUSTOM_OBJECTS,
  AUTOMATION_ENTITY_TYPES,
  AUTOMATION_NATIVE_FIELDS,
  customFieldId,
} from "../../../../supabase/functions/_shared/automationFieldContract";
import { VariablePicker } from "./VariablePicker";
const labels: Record<string, string> = {
  contacts: "Contatto",
  opportunities: "Opportunità",
  tickets: "Ticket",
  tasks: "Task",
  orders: "Commessa",
  invoices: "Fattura",
  appointments: "Appuntamento",
  employees: "Dipendente",
  warehouse_stock: "Magazzino",
  quotes: "Preventivo",
  ordini_variazione: "Variante",
  giornale_lavori: "Giornale lavori",
  duvri_documents: "DUVRI",
};
const fieldLabels: Record<string, string> = {
  first_name: "Nome",
  last_name: "Cognome",
  phone: "Telefono",
  email: "Email",
  city: "Città",
  province: "Provincia",
  region: "Regione",
  address: "Indirizzo",
  postal_code: "CAP",
  company_name: "Ragione sociale",
  notes: "Note",
  source: "Provenienza",
  name: "Nome",
  value: "Valore",
  subject: "Oggetto",
  description: "Descrizione",
  priority: "Priorità",
  title: "Titolo",
  due_date: "Scadenza",
  internal_notes: "Note interne",
};
export function UpdateFieldConfigPanel(
  { config, onPatch, companyId }: {
    config: Record<string, any>;
    onPatch: (patch: Record<string, unknown>) => void;
    companyId?: string;
  },
) {
  const table = String(config.tabella ?? "contacts");
  const objectType = AUTOMATION_ENTITY_TYPES[table];
  const { data: fields = [], isError, isLoading } =
    useAutomationFieldDefinitions(
      companyId,
      AUTOMATION_CUSTOM_OBJECTS.has(objectType) ? objectType : null,
    );
  const field = String(config.campo ?? config.field_name ?? "");
  const selected = fields.find((f) => f.id === customFieldId(field));
  const value = config.valore ?? config.field_value ?? "";
  const [variableMode, setVariableMode] = useState(false);
  const setValue = (next: unknown) =>
    onPatch({ field_value: undefined, valore: next });
  const known = (AUTOMATION_NATIVE_FIELDS[table] ?? []).includes(field) ||
    !!selected;
  return (
    <div className="space-y-4">
      <Label htmlFor="update-field-entity">Entità da aggiornare</Label>
      <select
        id="update-field-entity"
        className="w-full rounded border bg-background p-2 text-sm"
        value={table}
        onChange={(e) =>
          onPatch({
            tabella: e.target.value,
            campo: "",
            field_name: "",
            valore: "",
            field_value: undefined,
          })}
      >
        {Object.entries(labels).map(([id, label]) => (
          <option key={id} value={id}>{label}</option>
        ))}
      </select>
      <Label htmlFor="update-field-destination">Campo da aggiornare</Label>
      <select
        id="update-field-destination"
        className="w-full rounded border bg-background p-2 text-sm"
        value={field}
        onChange={(e) =>
          onPatch({
            campo: e.target.value,
            field_name: "",
            valore: "",
            field_value: undefined,
          })}
      >
        <option value="">Scegli un campo</option>
        {!known && field && (
          <option value={field} disabled>Campo non disponibile: {field}</option>
        )}
        <optgroup label="Campi standard">
          {(AUTOMATION_NATIVE_FIELDS[table] ?? []).map((f) => (
            <option key={f} value={f}>{fieldLabels[f] ?? f}</option>
          ))}
        </optgroup>
        <optgroup label="Campi personalizzati">
          {fields.filter((f) => f.field_type !== "file").map((f) => (
            <option key={f.id} value={`cf:${f.id}`}>{f.name}</option>
          ))}
        </optgroup>
      </select>
      {isLoading && (
        <p className="text-xs text-muted-foreground">Caricamento campi…</p>
      )}
      {isError && (
        <p role="alert" className="text-xs text-destructive">
          Impossibile leggere i campi personalizzati. Riprova prima di
          pubblicare.
        </p>
      )}
      {field && !known && !isLoading && (
        <p role="alert" className="text-xs text-destructive">
          Scegli un campo disponibile. Stati, assegnazioni e importi protetti
          richiedono le azioni dedicate.
        </p>
      )}
      <div className="flex items-center justify-between">
        <Label htmlFor="update-field-value">Nuovo valore</Label>
        <VariablePicker
          companyId={companyId}
          onInsert={(v) => {
            setVariableMode(true);
            setValue(String(value) + v);
          }}
        />
      </div>
      {selected && !variableMode && !String(value).includes("{{")
        ? (
          <CustomFieldInput
            fieldId={`automation-${selected.id}`}
            label={selected.name}
            type={selected.field_type}
            options={selected.options as string[] | null}
            value={value}
            onChange={setValue}
          />
        )
        : (
          <Input
            id="update-field-value"
            value={String(value)}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
      <p className="text-xs text-muted-foreground">
        Usa il record che ha avviato il flusso o quello realmente collegato. Un
        campo mancante o un valore non valido ferma il passo, senza dichiarare
        un salvataggio riuscito.
      </p>
    </div>
  );
}
