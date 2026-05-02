/**
 * Componente generico che renderizza i campi personalizzati per qualsiasi entità.
 * Usato da: OdVSection, GiornaleLavori, SicurezzaCantiere.
 *
 * Props:
 *  - entityType: 'ordini_variazione' | 'giornale_lavori' | 'pos_document' | 'duvri_document'
 *  - entityId: UUID dell'istanza specifica
 */
import { InlineField } from "@/components/marketing/contacts/InlineField";
import { useEntityCustomFields, useEntityFieldValues, useUpsertEntityFieldValues } from "@/hooks/useEntityCustomFields";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings2 } from "lucide-react";
import { Link } from "react-router-dom";

interface EntityCustomFieldsSectionProps {
  entityType: string;
  entityId: string;
}

type EntityCustomFieldDefinition = {
  id: string;
  name: string;
  field_type: string;
  options: string[] | null;
};

export function EntityCustomFieldsSection({ entityType, entityId }: EntityCustomFieldsSectionProps) {
  const { data: fieldDefs = [], isLoading: defsLoading } = useEntityCustomFields(entityType);
  const { data: fieldValues = [], isLoading: valsLoading } = useEntityFieldValues(entityType, entityId);
  const upsert = useUpsertEntityFieldValues();

  if (defsLoading || valsLoading) {
    return (
      <div className="space-y-2 pt-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-7 w-full" />
      </div>
    );
  }

  if (fieldDefs.length === 0) {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1 pt-1">
        <Settings2 className="h-3 w-3" />
        Nessun campo personalizzato.{" "}
        <Link to="/azienda/impostazioni/campi-personalizzati" className="underline hover:text-foreground">
          Configurali in Impostazioni
        </Link>
      </p>
    );
  }

  const getVal = (fieldId: string) =>
    fieldValues.find((fv) => fv.field_id === fieldId)?.value ?? "";

  const handleSave = (fieldId: string, value: string) => {
    upsert.mutate([{ entity_type: entityType, entity_id: entityId, field_id: fieldId, value }]);
  };

  return (
    <div className="space-y-0.5 pt-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
        Campi personalizzati
      </p>
      {(fieldDefs as EntityCustomFieldDefinition[]).map((field) => (
        <InlineField
          key={field.id}
          label={field.name}
          value={getVal(field.id)}
          type={
            field.field_type === "select"
              ? "select"
              : field.field_type === "date"
              ? "date"
              : field.field_type === "number"
              ? "number"
              : "text"
          }
          options={field.field_type === "select" ? field.options : undefined}
          onSave={(val) => handleSave(field.id, val)}
        />
      ))}
    </div>
  );
}
