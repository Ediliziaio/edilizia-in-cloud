/**
 * CrmFirmographicsCard — cluster dei contatti per SETTORE (codice ATECO) e per
 * DIMENSIONE azienda (company_size). Completa il cluster per mestiere/zona.
 *
 * Le colonne ateco_code / company_size non sono nei tipi generati finché la
 * migration non è applicata → query non tipizzata, fail-open (empty-state se
 * mancano o sono vuote). I dati si popolano compilando i contatti.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Factory, Users, Building, Loader2 } from "lucide-react";

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
  const q = useQuery({
    queryKey: ["crm-dash", "firmographics", companyId],
    staleTime: 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("marketing_contacts") as any)
        .select("ateco_code,company_size")
        .eq("company_id", companyId)
        .limit(5000);
      if (error) return [] as { ateco_code: string | null; company_size: string | null }[];
      return (data ?? []) as { ateco_code: string | null; company_size: string | null }[];
    },
  });

  const { ateco, sizes } = useMemo(() => {
    const a = new Map<string, number>();
    const s = new Map<string, number>();
    for (const c of q.data ?? []) {
      const at = (c.ateco_code || "").trim();
      if (at) a.set(at, (a.get(at) ?? 0) + 1);
      const sz = (c.company_size || "").trim();
      if (sz) s.set(sz, (s.get(sz) ?? 0) + 1);
    }
    const top = (m: Map<string, number>): Row[] =>
      [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([label, value]) => ({ label, value }));
    return { ateco: top(a), sizes: top(s) };
  }, [q.data]);

  const empty = ateco.length === 0 && sizes.length === 0;

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Factory className="h-4 w-4" aria-hidden="true" /> Settore (ATECO) e dimensione
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
