import { useId } from "react";
import type { StaffPermissions } from "./PermissionsDialog";
import { officeAccessSummary } from "@/lib/users/officeAccessSummary";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function OrderDataPermissions({ permissions, disabled, onChange, onFindPurchasing }: {
  permissions: StaffPermissions;
  disabled?: boolean;
  onChange: (key: "can_view_order_amounts" | "can_view_order_payment_status" | "can_view_costs" | "can_view_margins", value: boolean) => void;
  onFindPurchasing: () => void;
}) {
  const id = useId();
  const effective = officeAccessSummary(permissions);
  const items = [
    {key:"can_view_order_amounts" as const, label:"Venduto e importi", value:effective.amounts, note:"Importi e prezzi di vendita in commesse, rate e preventivi autorizzati."},
    {key:"can_view_order_payment_status" as const, label:"Stato degli incassi", value:effective.paymentStatus, inherited:effective.amounts, note:effective.amounts ? "Incluso negli importi di vendita. Senza venduto, puoi concedere il solo stato: pagato o da incassare." : "Pagato o da incassare, senza mostrare importi o fatture."},
    {key:"can_view_costs" as const, label:"Costi", value:effective.costs, inherited:!!permissions.can_manage_purchasing, note:permissions.can_manage_purchasing ? "Inclusi nel permesso Gestione acquisti. Per nasconderli, rimuovi prima quel permesso." : "Costi aziendali e delle commesse, incluso il totale del personale. Le tariffe individuali richiedono anche l’accesso al personale."},
    {key:"can_view_margins" as const, label:"Margini", value:effective.margins, note:"Differenza tra venduto e costi. Con venduto e margini è possibile ricavare i costi."},
  ];
  return <section aria-label="Dati economici delle commesse" className="space-y-3">
    <div><h3 className="text-sm font-semibold">Dati economici</h3><p className="mt-1 text-xs text-muted-foreground">Valgono anche per elenchi, report e documenti autorizzati. L’accesso a fatture e pagamenti in Finanza si gestisce nei relativi moduli.</p></div>
    <div className="grid gap-2 lg:grid-cols-2">{items.map(item => <div key={item.key} className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3"><Label htmlFor={`${id}-${item.key}`} className="text-sm font-medium">{item.label}</Label><Switch id={`${id}-${item.key}`} aria-describedby={`${id}-${item.key}-note`} checked={item.value} disabled={disabled || item.inherited} onCheckedChange={value => onChange(item.key,value)} /></div>
      <p id={`${id}-${item.key}-note`} className="mt-1.5 text-xs text-muted-foreground">{item.note}</p>
      {item.key === "can_view_costs" && item.inherited && <button type="button" className="mt-2 text-xs font-medium text-primary underline underline-offset-2" onClick={onFindPurchasing}>Trova Gestione acquisti</button>}
    </div>)}</div>
  </section>;
}
