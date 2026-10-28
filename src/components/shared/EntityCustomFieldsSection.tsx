/**
 * Componente generico che renderizza i campi personalizzati per qualsiasi entità.
 * Usato da: OdVSection, GiornaleLavori, SicurezzaCantiere.
 *
 * Props:
 *  - entityType: 'ordini_variazione' | 'giornale_lavori' | 'pos_document' | 'duvri_document'
 *  - entityId: UUID dell'istanza specifica
 */
import { CustomFieldValueEditor } from "./CustomFieldValueEditor";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useEntityCustomFields, useEntityFieldValues, useUpsertEntityFieldValues } from "@/hooks/useEntityCustomFields";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings2 } from "lucide-react";
import { Link } from "react-router-dom";

interface EntityCustomFieldsSectionProps {
  entityType: string;
  entityId: string;
  disabled?: boolean;
  definitionType?: string;
}

type EntityCustomFieldDefinition = {
  id: string;
  name: string;
  field_type: string;
  options: string[] | null;
};

export function EntityCustomFieldsSection({ entityType, entityId, definitionType = entityType, disabled = false }: EntityCustomFieldsSectionProps) {
  const { effectiveCompany } = useAuth();
  const p = usePermissions();
  const rights: Record<string, boolean> = {
    appointment: p.canViewCalendar || p.canViewMarketingAppointments,
    task: p.canViewMarketingActivities || p.canEditOrders,
    employee: p.canEditSettingsPeople,
    warehouse: p.canEditWarehouse,
    ordini_variazione: p.canEditOrders,
    giornale_lavori: p.canEditGiornaleLavori,
    duvri_document: p.canViewSicurezzaCantiere,
    order: p.canEditOrders,
  };
  const canEdit = !disabled && !p.isLoading && !p.solaLettura && !!(p.isAdmin || (definitionType === "quote" ? p.canEditPreventivi : rights[entityType]));
  const view: Record<string, boolean> = { appointment: p.canViewCalendar || p.canViewMarketingAppointments, task: p.canViewMarketingActivities || p.canViewOrders, employee: p.canViewSettingsPeople, warehouse: p.canViewWarehouse, ordini_variazione: p.canViewOrders, giornale_lavori: p.canViewGiornaleLavori, duvri_document: p.canViewSicurezzaCantiere, order: p.canViewOrders };
  const canRead = !p.isLoading && !!(p.isAdmin || (definitionType === "quote" ? p.canViewPreventivi : view[entityType]));
  const { data: fieldDefs = [], isLoading: defsLoading, isError: defsError, refetch: refetchDefs } = useEntityCustomFields(definitionType, canRead);
  const { data: fieldValues = [], isLoading: valsLoading, isError: valsError, refetch: refetchValues } = useEntityFieldValues(entityType, entityId, canRead && fieldDefs.length > 0);
  const upsert = useUpsertEntityFieldValues();

  if (p.isLoading || defsLoading || valsLoading) {
    return (
      <div className="space-y-2 pt-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-7 w-full" />
      </div>
    );
  }
  if (!canRead) return <p role="status" className="text-xs text-muted-foreground">Non hai il permesso di leggere i campi di questa scheda.</p>;

  if (defsError || valsError) return <div role="alert" className="space-y-2 rounded-md border border-destructive p-3 text-xs"><p>Impossibile leggere i campi personalizzati. I dati non sono stati modificati.</p><Button variant="outline" size="sm" onClick={() => { void refetchDefs(); void refetchValues(); }}>Riprova</Button></div>;

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
    if (!canEdit) return Promise.reject(new Error("Modifica non consentita"));
    return upsert.mutateAsync([{ entity_type: entityType, entity_id: entityId, field_id: fieldId, value }]);
  };

  return (
    <div className="space-y-0.5 pt-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
        Campi personalizzati
      </p>
      {(fieldDefs as EntityCustomFieldDefinition[]).map((field) => (
        <CustomFieldValueEditor
          key={`${effectiveCompany?.id}:${entityType}:${entityId}:${field.id}`}
          fieldId={field.id}
          label={field.name}
          value={getVal(field.id)}
          type={field.field_type}
          options={field.options}
          disabled={!canEdit}
          onSave={(val) => handleSave(field.id, val)}
        />
      ))}
    </div>
  );
}
