/**
 * Form riusabile per l'editing dei campi personalizzati di un'entità catalogo.
 * Legge le definizioni via useCompanyCustomFields e renderizza N CustomFieldInput.
 *
 * Uso:
 *   <CustomFieldValuesForm
 *     objectType="product"
 *     values={article.custom_field_values}
 *     onChange={(next) => setArticle({ ...article, custom_field_values: next })}
 *   />
 */
import { CustomFieldInput } from "./CustomFieldInput";
import {
  useCompanyCustomFields,
  setCustomFieldValue,
  getCustomFieldValue,
  type CatalogObjectType,
} from "@/hooks/useCompanyCustomFields";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings2 } from "lucide-react";
import { Link } from "react-router-dom";

export interface CustomFieldValuesFormProps {
  objectType: CatalogObjectType;
  values: Record<string, unknown> | null | undefined;
  onChange: (next: Record<string, unknown>) => void;
  disabled?: boolean;
  /** Se true non mostra il link "configura" quando non ci sono campi */
  hideEmptyHint?: boolean;
  /** Layout colonne (default 2) */
  columns?: 1 | 2 | 3;
}

export function CustomFieldValuesForm({
  objectType,
  values,
  onChange,
  disabled,
  hideEmptyHint,
  columns = 2,
}: CustomFieldValuesFormProps) {
  const { data: defs = [], isLoading } = useCompanyCustomFields(objectType);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-5 w-40" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    );
  }

  if (defs.length === 0) {
    if (hideEmptyHint) return null;
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <Settings2 className="h-3 w-3" />
        Nessun campo personalizzato configurato.{" "}
        <Link
          to="/azienda/impostazioni/campi-personalizzati"
          className="underline hover:text-foreground"
        >
          Configuralo in Impostazioni
        </Link>
      </p>
    );
  }

  const gridCls =
    columns === 1
      ? "grid grid-cols-1 gap-3"
      : columns === 3
      ? "grid grid-cols-1 md:grid-cols-3 gap-3"
      : "grid grid-cols-1 md:grid-cols-2 gap-3";

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        Campi personalizzati
      </p>
      <div className={gridCls}>
        {defs.map((field) => (
          <CustomFieldInput
            key={field.id}
            fieldId={field.id}
            label={field.name}
            type={field.field_type}
            options={field.options}
            value={getCustomFieldValue(values, field.id)}
            disabled={disabled}
            onChange={(v) => onChange(setCustomFieldValue(values, field.id, v))}
          />
        ))}
      </div>
    </div>
  );
}
