/**
 * CrmChannelRoi — il ROI per canale alla Dan Kennedy: per ogni fonte, Spesa →
 * Lead → CPL → Ricavo → ROAS, ordinato per ROAS. Verde = scala, rosso = taglia.
 *
 * Dati reali: campaign_costs (spesa per fonte), marketing_contacts (lead per
 * fonte), opportunità vinte (ricavo, attribuito alla fonte del contatto).
 * Scoped a companyId + periodo. Fail-open onesto.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Radar, Loader2 } from "lucide-react";

const eur0 = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Math.round(n || 0));
const DAY = 24 * 60 * 60 * 1000;
const prettify = (s: string) => s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();

interface Row {
  source: string;
  spend: number;
  leads: number;
  revenue: number;
}

export function CrmChannelRoi({ companyId, days }: { companyId: string; days: number }) {
  const [nowMs] = useState(() => Date.now());
  const sinceIso = useMemo(() => new Date(nowMs - days * DAY).toISOString(), [nowMs, days]);

  const q = useQuery({
    queryKey: ["crm-dash", "channel-roi", companyId, sinceIso],
    staleTime: 60_000,
    queryFn: async (): Promise<Row[]> => {
      // Prima: contatti scaricati con limit 5000 (su 89k+ = campione arbitrario)
      // e SENZA filtro periodo, mentre la spesa era per-periodo -> CPL e lead
      // per canale sballati. Ora: revenue = vinte NEL periodo con fonte del
      // contatto (batch .in sugli id, poche righe); lead = COUNT esatto per
      // fonte NEL periodo (una head-query per fonte mostrata, <=10).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const [costs, won] = await Promise.all([
        sb.from("campaign_costs").select("source,spend_amount,date").eq("company_id", companyId).gte("date", sinceIso.slice(0, 10)),
        supabase.from("marketing_opportunities").select("value,contact_id").eq("company_id", companyId).eq("status", "won").gte("updated_at", sinceIso).limit(5000),
      ]);

      const wonRows = (won.data ?? []) as { value: number | null; contact_id: string | null }[];
      const contactIds = [...new Set(wonRows.map((w) => w.contact_id).filter(Boolean))] as string[];
      const srcByContact = new Map<string, string>();
      if (contactIds.length > 0) {
        const { data: cRows } = await supabase
          .from("marketing_contacts")
          .select("id,source,attr_source")
          .in("id", contactIds);
        for (const c of (cRows ?? []) as { id: string; source: string | null; attr_source: string | null }[]) {
          srcByContact.set(c.id, (c.source || c.attr_source || "Diretto").trim() || "Diretto");
        }
      }

      const m = new Map<string, Row>();
      const get = (s: string) => {
        const key = s || "Diretto";
        if (!m.has(key)) m.set(key, { source: key, spend: 0, leads: 0, revenue: 0 });
        return m.get(key)!;
      };
      for (const k of (costs.error ? [] : costs.data ?? []) as { source: string | null; spend_amount: number | null }[]) {
        get((k.source || "Diretto").trim() || "Diretto").spend += k.spend_amount ?? 0;
      }
      for (const w of wonRows) {
        const s = (w.contact_id && srcByContact.get(w.contact_id)) || "Diretto";
        get(s).revenue += w.value ?? 0;
      }

      // Lead nel periodo per ciascuna fonte con spesa o ricavo (count esatto).
      const sources = [...m.keys()];
      const leadCounts = await Promise.all(
        sources.map((src) => {
          const q = supabase
            .from("marketing_contacts")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .gte("created_at", sinceIso);
          return src === "Diretto" ? q.is("source", null) : q.eq("source", src);
        }),
      );
      sources.forEach((src, i) => {
        const r = leadCounts[i];
        m.get(src)!.leads = r.error ? 0 : r.count ?? 0;
      });
      return [...m.values()].sort((a, b) => {
        const ra = a.spend > 0 ? a.revenue / a.spend : a.revenue > 0 ? Infinity : -1;
        const rb = b.spend > 0 ? b.revenue / b.spend : b.revenue > 0 ? Infinity : -1;
        return rb - ra;
      });
    },
  });

  const rows = (q.data ?? []).filter((r) => r.spend > 0 || r.revenue > 0 || r.leads > 0).slice(0, 7);
  const anyCost = (q.data ?? []).some((r) => r.spend > 0);

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Radar className="h-4 w-4" aria-hidden="true" /> ROI per canale
          <span className="ml-auto text-xs font-normal text-muted-foreground">scala i verdi · taglia i rossi</span>
        </div>

        {q.isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nessun canale con dati nel periodo.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2 font-medium">Canale</th>
                    <th className="pb-2 text-right font-medium">Spesa</th>
                    <th className="hidden pb-2 text-right font-medium sm:table-cell">Lead</th>
                    <th className="hidden pb-2 text-right font-medium sm:table-cell">CPL</th>
                    <th className="pb-2 text-right font-medium">Ricavo</th>
                    <th className="pb-2 text-right font-medium">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const roas = r.spend > 0 ? r.revenue / r.spend : null;
                    const cpl = r.leads > 0 && r.spend > 0 ? r.spend / r.leads : null;
                    const color = roas == null ? "hsl(var(--muted-foreground))" : roas >= 3 ? "hsl(160 84% 39%)" : roas >= 1 ? "hsl(43 96% 56%)" : "hsl(0 84% 60%)";
                    return (
                      <tr key={r.source} className="border-b last:border-0">
                        <td className="py-2 pr-2 font-medium">{prettify(r.source)}</td>
                        <td className="py-2 text-right tabular-nums">{r.spend > 0 ? eur0(r.spend) : "—"}</td>
                        <td className="hidden py-2 text-right tabular-nums text-muted-foreground sm:table-cell">{r.leads}</td>
                        <td className="hidden py-2 text-right tabular-nums text-muted-foreground sm:table-cell">{cpl != null ? eur0(cpl) : "—"}</td>
                        <td className="py-2 text-right tabular-nums">{r.revenue > 0 ? eur0(r.revenue) : "—"}</td>
                        <td className="py-2 text-right">
                          {roas != null ? (
                            <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: color }}>
                              {roas.toFixed(1)}×
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!anyCost && (
              <p className="mt-2 text-[11px] text-muted-foreground">Aggiungi le spese per canale in campaign_costs per calcolare CPL e ROAS.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
