/**
 * CrmTrendCard — andamento settimanale (ultime 12 settimane) di Lead nuovi e
 * Opportunità create. ComposedChart animato in stile Cruscotto (barre a
 * gradiente + linea "Totale" morbida), dati reali (created_at su
 * marketing_contacts / marketing_opportunities). Empty-state se non c'è storia.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, Loader2 } from "lucide-react";
import { BrandTrendChart } from "@/components/admin/BrandTrendChart";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const WEEKS = 12;

// Palette brand: blu (lead), arancione (opportunità), verde (linea totale).
const C_LEAD = "hsl(217 91% 60%)";
const C_OPP = "hsl(24 95% 53%)";
const C_TOT = "hsl(160 84% 39%)";

export function CrmTrendCard({ companyId }: { companyId: string }) {
  const [nowMs] = useState(() => Date.now());
  const sinceIso = useMemo(() => new Date(nowMs - WEEKS * WEEK_MS).toISOString(), [nowMs]);

  const q = useQuery({
    queryKey: ["crm-dash", "trend", companyId, sinceIso],
    staleTime: 60_000,
    queryFn: async () => {
      const [contacts, opps] = await Promise.all([
        supabase.from("marketing_contacts").select("created_at").eq("company_id", companyId).gte("created_at", sinceIso).limit(5000),
        supabase.from("marketing_opportunities").select("created_at").eq("company_id", companyId).gte("created_at", sinceIso).limit(5000),
      ]);
      return {
        contacts: (contacts.data ?? []) as { created_at: string }[],
        opps: (opps.data ?? []) as { created_at: string }[],
      };
    },
  });

  const data = useMemo(() => {
    // Etichetta = inizio settimana in data reale ("12 mag"), non "-Ns" criptico.
    const fmt = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" });
    const buckets = Array.from({ length: WEEKS }, (_, i) => {
      const weeksAgo = WEEKS - 1 - i;
      return {
        label: weeksAgo === 0 ? "questa" : fmt.format(new Date(nowMs - weeksAgo * WEEK_MS)),
        lead: 0,
        opp: 0,
      };
    });
    const idx = (iso: string) => {
      const t = new Date(iso).getTime();
      if (Number.isNaN(t)) return -1;
      const weeksAgo = Math.floor((nowMs - t) / WEEK_MS);
      const i = WEEKS - 1 - weeksAgo;
      return i >= 0 && i < WEEKS ? i : -1;
    };
    for (const c of q.data?.contacts ?? []) {
      const i = idx(c.created_at);
      if (i >= 0) buckets[i].lead++;
    }
    for (const o of q.data?.opps ?? []) {
      const i = idx(o.created_at);
      if (i >= 0) buckets[i].opp++;
    }
    return buckets.map((b) => ({ ...b, tot: b.lead + b.opp }));
  }, [q.data, nowMs]);

  const total = data.reduce((s, d) => s + d.lead + d.opp, 0);

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Activity className="h-4 w-4" aria-hidden="true" /> Andamento · ultime 12 settimane
          <span className="ml-auto flex flex-wrap items-center gap-3 text-[11px] font-normal text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: C_LEAD }} /> Lead</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: C_OPP }} /> Opportunità</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: C_TOT }} /> Totale</span>
          </span>
        </div>
        {q.isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : total === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Nessuna attività nelle ultime 12 settimane.
          </p>
        ) : (
          <BrandTrendChart
            data={data}
            xKey="label"
            height={180}
            bars={[
              { key: "lead", name: "Lead", color: C_LEAD },
              { key: "opp", name: "Opportunità", color: C_OPP },
            ]}
            line={{ key: "tot", name: "Totale", color: C_TOT }}
            yFormatter={(v) => String(Math.round(v))}
          />
        )}
      </CardContent>
    </Card>
  );
}
