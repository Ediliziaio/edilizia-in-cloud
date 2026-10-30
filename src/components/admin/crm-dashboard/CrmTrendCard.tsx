/**
 * CrmTrendCard — andamento nel periodo scelto (per giorno/settimana/mese) di Lead nuovi e
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

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Granularità secondo il periodo scelto in testata: 7 giorni → per giorno,
 * 30/90 giorni → per settimana, 12 mesi → per mese (30 giorni). Al massimo
 * 13 intervalli, così bastano poche COUNT esatte (prima: 5.000 righe scaricate,
 * che con gli import da decine di migliaia di contatti troncavano il grafico).
 */
function intervalli(days: number) {
  if (days <= 7) return { stepMs: DAY_MS, n: days, unita: "giorno" as const };
  if (days <= 90) return { stepMs: 7 * DAY_MS, n: Math.ceil(days / 7), unita: "settimana" as const };
  return { stepMs: 30 * DAY_MS, n: Math.ceil(days / 30), unita: "mese" as const };
}

// Palette brand: blu (lead), arancione (opportunità), verde (linea totale).
const C_LEAD = "hsl(217 91% 60%)";
const C_OPP = "hsl(24 95% 53%)";
const C_TOT = "hsl(160 84% 39%)";

export function CrmTrendCard({ companyId, days }: { companyId: string; days: number }) {
  const [nowMs] = useState(() => Date.now());
  const { stepMs, n, unita } = intervalli(days);

  const q = useQuery({
    queryKey: ["crm-dash", "trend", companyId, days, nowMs],
    staleTime: 60_000,
    queryFn: async () => {
      const ranges = Array.from({ length: n }, (_, i) => {
        const end = nowMs - (n - 1 - i) * stepMs;
        return { start: new Date(end - stepMs).toISOString(), end: new Date(end).toISOString() };
      });
      const cnt = (r: { count: number | null; error: unknown }) => (r.error ? 0 : r.count ?? 0);
      const [lead, opp] = await Promise.all([
        Promise.all(
          ranges.map((r) =>
            supabase
              .from("marketing_contacts")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId)
              .gte("created_at", r.start)
              .lt("created_at", r.end),
          ),
        ),
        Promise.all(
          ranges.map((r) =>
            supabase
              .from("marketing_opportunities")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId)
              .is("deleted_at", null)
              .gte("created_at", r.start)
              .lt("created_at", r.end),
          ),
        ),
      ]);
      return { lead: lead.map(cnt), opp: opp.map(cnt) };
    },
  });

  const data = useMemo(() => {
    // Etichetta = inizio dell'intervallo in data reale ("12 mag").
    const fmt = new Intl.DateTimeFormat("it-IT", unita === "mese" ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" });
    return Array.from({ length: n }, (_, i) => {
      const lead = q.data?.lead[i] ?? 0;
      const opp = q.data?.opp[i] ?? 0;
      const ultimo = i === n - 1;
      return {
        label: ultimo && unita === "giorno" ? "oggi" : ultimo && unita === "settimana" ? "questa" : fmt.format(new Date(nowMs - (n - i) * stepMs)),
        lead,
        opp,
        tot: lead + opp,
      };
    });
  }, [q.data, nowMs, n, stepMs, unita]);

  const total = data.reduce((s, d) => s + d.lead + d.opp, 0);

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Activity className="h-4 w-4" aria-hidden="true" /> Andamento · ultimi {days} giorni, per {unita}
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
            Nessuna attività nel periodo.
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
