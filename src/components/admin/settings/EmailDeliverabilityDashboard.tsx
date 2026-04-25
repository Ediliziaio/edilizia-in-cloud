// ============================================================================
// EmailDeliverabilityDashboard — Email Dual-Provider FASE 11
// ============================================================================
// Dashboard SuperAdmin per monitorare salute deliverability:
//   - KPI aggregati: totale inviate, delivered, bounce rate, spam rate
//   - Breakdown per stream (transactional/marketing)
//   - Breakdown per provider (resend/elastic_email/sendgrid/brevo/mailgun)
//   - Top 10 aziende per volume
//
// Fonte dati: public.email_delivery_log (tabella unificata, riga per recipient)
// ============================================================================

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, TrendingDown, AlertTriangle, RefreshCw } from "lucide-react";
import { formatError } from "@/lib/errors";
import {
  aggregateDeliveryRows,
  bounceRatePct,
  deliveryRatePct,
  rangeToCutoff,
  rate,
  spamRatePct,
  type AggregateBucket,
  type DeliveryRow,
  type Range,
} from "@/lib/email/deliverabilityAggregation";

export function EmailDeliverabilityDashboard() {
  const [range, setRange] = useState<Range>("30d");

  const query = useQuery({
    queryKey: ["admin-email-deliverability", range],
    queryFn: async () => {
      const cutoff = rangeToCutoff(range);
      const { data, error } = await supabase
        .from("email_delivery_log")
        .select("stream, provider, status, company_id, sent_at")
        .gte("sent_at", cutoff)
        .order("sent_at", { ascending: false })
        .limit(50000); // safety cap; if overflow we'll still show partial
      if (error) throw error;
      return (data ?? []) as DeliveryRow[];
    },
    staleTime: 60_000,
  });

  const buckets = useMemo(
    () => aggregateDeliveryRows(query.data ?? []),
    [query.data],
  );

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  if (query.error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between gap-3 flex-wrap">
          <span>Errore caricamento deliverability: {formatError(query.error)}</span>
          <Button size="sm" variant="outline" onClick={() => query.refetch()} className="h-7 gap-1 text-xs">
            <RefreshCw className="h-3 w-3" /> Riprova
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const g = buckets.global;
  const bounceRate   = bounceRatePct(g);
  const spamRate     = spamRatePct(g);
  const deliveryRate = deliveryRatePct(g);

  return (
    <div className="space-y-6">
      {/* Range selector */}
      <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
        <TabsList>
          <TabsTrigger value="7d">Ultimi 7 giorni</TabsTrigger>
          <TabsTrigger value="30d">Ultimi 30 giorni</TabsTrigger>
          <TabsTrigger value="90d">Ultimi 90 giorni</TabsTrigger>
        </TabsList>
        <TabsContent value={range} />
      </Tabs>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Totale invii" value={g.total.toLocaleString("it-IT")} />
        <KpiCard
          label="Delivery rate"
          value={`${deliveryRate.toFixed(1)}%`}
          trend={deliveryRate >= 95 ? "up" : deliveryRate >= 90 ? "neutral" : "down"}
          hint={deliveryRate < 95 ? "Sotto soglia 95%" : "Salute OK"}
        />
        <KpiCard
          label="Bounce rate"
          value={`${bounceRate.toFixed(2)}%`}
          trend={bounceRate < 2 ? "up" : bounceRate < 5 ? "neutral" : "down"}
          hint={bounceRate >= 5 ? "Alto: investiga!" : bounceRate < 2 ? "Ottimo" : "Monitora"}
        />
        <KpiCard
          label="Spam complaint rate"
          value={`${spamRate.toFixed(3)}%`}
          trend={spamRate < 0.1 ? "up" : spamRate < 0.3 ? "neutral" : "down"}
          hint={spamRate >= 0.3 ? "Oltre limite provider (0.3%)" : "Entro soglia"}
        />
      </div>

      {/* Breakdown by stream */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per stream</CardTitle>
          <CardDescription>
            Transactional (Resend default) vs Marketing (Elastic Email). Stream diversi
            hanno soglie bounce/spam diverse.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BreakdownTable
            labelHeader="Stream"
            rows={Object.entries(buckets.byStream).map(([k, b]) => ({ label: k, ...b }))}
          />
        </CardContent>
      </Card>

      {/* Breakdown by provider */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per provider</CardTitle>
          <CardDescription>
            Distribuzione volume per provider attivo. Utile per evidenziare sbilanciamenti
            (es. transactional vuoto su Resend → check API key).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BreakdownTable
            labelHeader="Provider"
            rows={Object.entries(buckets.byProvider).map(([k, b]) => ({ label: k, ...b }))}
          />
        </CardContent>
      </Card>

      {/* Top 10 companies */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top 10 aziende per volume</CardTitle>
          <CardDescription>
            Per spot-check dei top sender e controllo preventivo deliverability per cliente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BreakdownTable
            labelHeader="Company ID"
            rows={buckets.topCompanies.map((c) => ({ label: c.id, ...c }))}
          />
        </CardContent>
      </Card>

      {query.data && query.data.length >= 50000 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Risultati troncati a 50.000 righe. Per analisi complete del periodo usa
            un'interrogazione SQL diretta o esporta da Supabase.
          </AlertDescription>
        </Alert>
      )}

      {query.isFetching && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Aggiornamento in corso…
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  trend,
  hint,
}: {
  label: string;
  value: string;
  trend?: "up" | "down" | "neutral";
  hint?: string;
}) {
  const icon =
    trend === "up" ? (
      <TrendingUp className="h-4 w-4 text-green-600" />
    ) : trend === "down" ? (
      <TrendingDown className="h-4 w-4 text-destructive" />
    ) : null;

  return (
    <Card>
      <CardContent className="p-4 space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{label}</p>
          {icon}
        </div>
        <p className="text-2xl font-bold font-mono">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function BreakdownTable({
  labelHeader,
  rows,
}: {
  labelHeader: string;
  rows: Array<{ label: string } & AggregateBucket>;
}) {
  const sorted = [...rows].sort((a, b) => b.total - a.total);

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Nessun dato per il periodo selezionato.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground border-b">
            <th className="py-2 pr-4">{labelHeader}</th>
            <th className="py-2 pr-4 text-right">Totale</th>
            <th className="py-2 pr-4 text-right">Delivered</th>
            <th className="py-2 pr-4 text-right">Bounce</th>
            <th className="py-2 pr-4 text-right">Spam</th>
            <th className="py-2 pr-4 text-right">Dropped</th>
            <th className="py-2 text-right">Delivery %</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const okCount = r.sent + r.delivered;
            const delivery = rate(okCount, r.total);
            const bounceHigh = r.bounced > 0 && r.total > 0 && r.bounced / r.total >= 0.05;
            return (
              <tr key={r.label} className="border-b last:border-b-0 hover:bg-muted/40">
                <td className="py-2 pr-4 font-mono text-xs truncate max-w-[260px]">{r.label}</td>
                <td className="py-2 pr-4 text-right font-mono">{r.total.toLocaleString("it-IT")}</td>
                <td className="py-2 pr-4 text-right font-mono">{okCount.toLocaleString("it-IT")}</td>
                <td className="py-2 pr-4 text-right font-mono">
                  {bounceHigh ? (
                    <Badge variant="destructive" className="font-mono text-xs">
                      {r.bounced.toLocaleString("it-IT")}
                    </Badge>
                  ) : (
                    r.bounced.toLocaleString("it-IT")
                  )}
                </td>
                <td className="py-2 pr-4 text-right font-mono">{r.spam.toLocaleString("it-IT")}</td>
                <td className="py-2 pr-4 text-right font-mono">{r.dropped.toLocaleString("it-IT")}</td>
                <td className="py-2 text-right font-mono">{delivery}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
