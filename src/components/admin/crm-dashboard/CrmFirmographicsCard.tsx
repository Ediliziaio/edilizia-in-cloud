/**
 * CrmFirmographicsCard — cluster dei contatti per SETTORE (codice ATECO) e per
 * DIMENSIONE azienda (company_size). Completa il cluster per mestiere/zona.
 *
 * I conteggi li fa il database su tutti i contatti (useCrmSegmenti); empty-state
 * se ATECO e dimensione non sono compilati.
 */
import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Factory, Users, Building, Loader2 } from "lucide-react";
import { useCrmSegmenti } from "./useCrmSegmenti";

interface Row {
  label: string;
  value: number;
}

function Bars({ rows, color }: { rows: Row[]; color: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="flex flex-col gap-2.5 text-[13px]">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex justify-between gap-2">
            <span className="truncate">{r.label}</span>
            <span className="shrink-0 text-muted-foreground">{r.value}</span>
          </div>
          <div className="h-2 rounded bg-muted">
            <div className="h-2 rounded" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CrmFirmographicsCard({ companyId }: { companyId: string }) {
  // Conta il database su TUTTI i contatti (prima: campione di 5.000).
  const q = useCrmSegmenti(companyId);

  const { ateco, sizes } = useMemo(
    () => ({
      ateco: (q.data?.ateco ?? []).map((a) => ({ label: a.ateco, value: a.n })),
      sizes: (q.data?.dimensioni ?? []).map((d) => ({ label: d.dimensione, value: d.n })),
    }),
    [q.data],
  );

  const empty = ateco.length === 0 && sizes.length === 0;

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Factory className="h-4 w-4" aria-hidden="true" /> Settore (ATECO) e dimensione
          <span className="ml-auto text-xs font-normal text-muted-foreground">oggi, indipendente dal periodo</span>
        </div>
        {q.isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : empty ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            ATECO e dimensione non ancora compilati sui contatti.
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Building className="h-3.5 w-3.5" aria-hidden="true" /> Per settore (ATECO)
              </div>
              {ateco.length ? <Bars rows={ateco} color="hsl(var(--chart-4))" /> : <p className="text-xs text-muted-foreground">—</p>}
            </div>
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Users className="h-3.5 w-3.5" aria-hidden="true" /> Per dimensione
              </div>
              {sizes.length ? <Bars rows={sizes} color="hsl(var(--chart-1))" /> : <p className="text-xs text-muted-foreground">—</p>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
