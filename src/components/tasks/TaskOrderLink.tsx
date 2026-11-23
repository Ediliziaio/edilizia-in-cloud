import { useId } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, X } from "lucide-react";
import { OrderSelectCombobox } from "@/components/warehouse/OrderSelectCombobox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/** Link an existing commessa without replacing the independent CRM links. */
export function TaskOrderLink({ companyId, value, onChange, disabled, fixed }: {
  companyId?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  fixed?: boolean;
}) {
  const id = useId();
  const t = useT();
  return <div className="space-y-1.5">
    <Label htmlFor={id}>{t("Commessa")}</Label>
    <div className="flex items-start gap-1.5">
      <OrderSelectCombobox id={id} companyId={companyId} value={value || undefined}
        soloOperative onChange={onChange} disabled={disabled || fixed} filtroIniziale="all"
        placeholder={t("Cerca commessa per codice, cliente o cantiere…")} />
      {value && !disabled && !fixed && <Button type="button" variant="ghost" size="icon" className="h-10 w-8 shrink-0"
        aria-label={t("Togli il collegamento alla commessa")} onClick={() => onChange("")}><X className="h-4 w-4" /></Button>}
    </div>
    {value && <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span>{t("Al salvataggio sarà visibile anche nell’Ufficio della commessa.")}</span>
      <Link className="inline-flex items-center gap-1 text-primary hover:underline"
        to={`/azienda/ordini/${encodeURIComponent(value)}?tab=cantiere&vista_cantiere=ufficio`}>
        {t("Apri ufficio")} <ExternalLink className="h-3 w-3" />
      </Link>
    </div>}
  </div>;
}
