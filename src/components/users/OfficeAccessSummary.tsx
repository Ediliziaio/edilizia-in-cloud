import type { StaffPermissions } from "./PermissionsDialog";
import { officeAccessSummary } from "@/lib/users/officeAccessSummary";

export function OfficeAccessSummary({ permissions, administrator = false, fieldAccess = false }: { permissions: StaffPermissions; administrator?: boolean; fieldAccess?: boolean }) {
  const s = officeAccessSummary(permissions);
  if (administrator) return <section aria-label="Riepilogo accessi alla commessa" className="rounded-lg border bg-muted/30 p-3 text-sm"><h3 className="font-medium">Amministratore aziendale</h3><p>Il ruolo concede accesso completo nell’azienda. Per limitarlo a un reparto, usa un ruolo operativo con i relativi permessi.</p></section>;
  const orderScope = fieldAccess ? "Cantieri assegnati" : s.scope;
  const yesNo = (value: boolean) => value ? "Consentito" : "Non consentito";
  const rows = [
    ["Commesse", s.orders ? orderScope : "Non consentite"],
    ["Modifica commesse", yesNo(s.editOrders)],
    ["Venduto e importi nella commessa", yesNo(s.amounts)],
    ["Stato degli incassi", yesNo(s.paymentStatus)],
    ["Costi", yesNo(s.costs)],
    ["Margini", yesNo(s.margins)],
    ["Dati individuali del personale", yesNo(s.payroll)],
    ["Tariffa dalla scheda personale", yesNo(s.individualRates)],
    ["Fatture e pagamenti in Finanza", yesNo(s.invoices)],
  ];
  return <section aria-label="Riepilogo accessi alla commessa" className="rounded-lg border bg-muted/30 p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-medium">Riepilogo degli accessi</h3>
      <span className="text-xs text-muted-foreground">Segue le modifiche in bozza</span>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      {[['Commesse', s.orders ? (fieldAccess ? orderScope : permissions.only_my_warehouse ? s.scope : 'Tutte in azienda') : 'Nessun accesso'], ['Venduto', yesNo(s.amounts)], ['Costi', yesNo(s.costs)], ['Margini', yesNo(s.margins)]].map(([label,value]) => <span key={label} className="rounded-md border bg-background px-2 py-1 text-xs"><span className="text-muted-foreground">{label}: </span>{value}</span>)}
    </div>
    <details className="mt-3">
    <summary className="cursor-pointer text-xs font-medium">Dettaglio commesse, incassi e personale</summary>
    <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-2">
      {rows.map(([label, value]) => <div key={label} className="contents"><dt className="text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value}</dd></div>)}
    </dl>
    </details>
    {s.warnings.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-amber-900">{s.warnings.map(w => <li key={w}>{w}</li>)}</ul>}
  </section>;
}
