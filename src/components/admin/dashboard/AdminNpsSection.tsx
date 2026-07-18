import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Star, TrendingUp, TrendingDown, Minus, Download, AlertTriangle } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { it } from "date-fns/locale";
import { exportToCSV } from "@/lib/csvExport";

interface NpsSurveyRow {
  id: string;
  company_id: string;
  score: number;
  feedback_text: string | null;
  responded_at: string;
  company_name: string | null;
}

interface NpsChartPoint {
  month: string;
  nps: number;
  responses: number;
}

function calcNps(responses: { score: number }[]): number {
  if (responses.length === 0) return 0;
  const promoters = responses.filter((r) => r.score >= 9).length;
  const detractors = responses.filter((r) => r.score <= 6).length;
  return Math.round(((promoters - detractors) / responses.length) * 100);
}

function NpsScoreDisplay({ nps }: { nps: number }) {
  const color = nps >= 50 ? "text-emerald-600 dark:text-emerald-400" : nps >= 0 ? "text-amber-600 dark:text-amber-400" : "text-destructive";
  const Icon = nps >= 0 ? (nps >= 50 ? TrendingUp : Minus) : TrendingDown;
  return (
    <div className="flex items-center gap-3">
      <span className={`text-4xl font-bold tabular-nums ${color}`}>{nps}</span>
      <div>
        <Icon className={`h-5 w-5 ${color}`} />
        <p className="text-xs text-muted-foreground mt-0.5">
          {nps >= 50 ? "Eccellente" : nps >= 0 ? "Buono" : "Da migliorare"}
        </p>
      </div>
    </div>
  );
}

function useNpsDetractorQueue() {
  return useQuery({
    queryKey: ["admin-nps-detractors"],
    queryFn: async () => {
      // cs_alerts created by the NPS detractor trigger
      const { data, error } = await (supabase
        .from("cs_alerts" as never)
        .select("id, company_id, title, description, created_at, resolved_at, companies(name)")
        .eq("alert_type" as never, "nps_detractor")
        .is("resolved_at" as never, null)
        .order("created_at" as never, { ascending: false })
        .limit(20) as unknown as Promise<{
          data: Array<{
            id: string;
            company_id: string;
            title: string;
            description: string;
            created_at: string;
            resolved_at: string | null;
            companies: { name: string } | null;
          }> | null;
          error: { message: string } | null;
        }>);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

function DetractorQueue() {
  const { data: detractors = [], isLoading } = useNpsDetractorQueue();

  if (isLoading) {
    return <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  }

  if (detractors.length === 0) {
    return (
      <p className="text-xs text-center text-muted-foreground py-4">
        Nessun detrattore in coda — ottimo!
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {detractors.map(d => (
        <div key={d.id} className="flex items-start gap-2 p-2 rounded-md border border-destructive/20 bg-destructive/5 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-medium">{d.companies?.name ?? d.company_id.slice(0, 8)}</p>
            <p className="text-muted-foreground truncate">{d.description}</p>
          </div>
          <span className="text-muted-foreground shrink-0">
            {format(new Date(d.created_at), "dd/MM", { locale: it })}
          </span>
        </div>
      ))}
    </div>
  );
}

export function AdminNpsSection() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-nps-dashboard"],
    queryFn: async () => {
      const sixMonthsAgo = subMonths(new Date(), 6).toISOString();

      const { data: surveys, error } = await supabase
        .from("nps_surveys" as never)
        .select(`
          id, score, feedback_text, responded_at, company_id,
          company:companies!company_id(name)
        ` as never)
        .not("responded_at" as never, "is", null)
        .gte("responded_at" as never, sixMonthsAgo)
        .order("responded_at" as never, { ascending: false });

      if (error) throw error;

      const rows: NpsSurveyRow[] = ((surveys || []) as any[]).map((s) => ({
        id: s.id,
        company_id: s.company_id,
        score: s.score,
        feedback_text: s.feedback_text,
        responded_at: s.responded_at,
        company_name: s.company?.name ?? null,
      }));

      const totalNps = calcNps(rows);

      // Monthly trend
      const monthlyData: NpsChartPoint[] = [];
      for (let i = 5; i >= 0; i--) {
        const m = subMonths(new Date(), i);
        const start = startOfMonth(m);
        const end = endOfMonth(m);
        const monthResponses = rows.filter((r) => {
          const d = new Date(r.responded_at);
          return d >= start && d <= end;
        });
        monthlyData.push({
          month: format(m, "MMM yy", { locale: it }),
          nps: calcNps(monthResponses),
          responses: monthResponses.length,
        });
      }

      const promoters = rows.filter((r) => r.score >= 9).length;
      const passives = rows.filter((r) => r.score >= 7 && r.score <= 8).length;
      const detractors = rows.filter((r) => r.score <= 6).length;

      return {
        totalNps,
        totalResponses: rows.length,
        promoters,
        passives,
        detractors,
        monthlyData,
        recentFeedback: rows.filter((r) => r.feedback_text).slice(0, 10),
        allRows: rows,
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const exportCsv = () => {
    if (!data?.allRows.length) return;
    const columns = [
      { key: "company_name", label: "Azienda" },
      { key: "score", label: "Score" },
      { key: "feedback_text", label: "Feedback" },
      { key: "responded_at", label: "Data" },
    ];
    const rows = data.allRows.map((r) => ({
      company_name: r.company_name || "",
      score: String(r.score),
      feedback_text: r.feedback_text || "",
      responded_at: format(new Date(r.responded_at), "dd/MM/yyyy HH:mm"),
    }));
    exportToCSV(rows, columns, `nps-feedback-${format(new Date(), "yyyy-MM-dd")}.csv`);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500" />
            NPS Survey
          </CardTitle>
          {(data?.allRows.length ?? 0) > 0 && (
            <Button size="sm" variant="outline" className="hidden sm:inline-flex h-7 text-xs" onClick={exportCsv}>
              <Download className="h-3 w-3 mr-1" />
              CSV
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (data?.totalResponses ?? 0) === 0 ? (
          <div className="space-y-3">
            <p className="text-xs text-center text-muted-foreground py-4">
              Nessuna risposta NPS ancora ricevuta.
            </p>
            <div className="border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-destructive" />
                Coda Detrattori
              </p>
              <DetractorQueue />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Score + distribution */}
            <div className="flex items-center gap-6">
              <NpsScoreDisplay nps={data!.totalNps} />
              <div className="flex-1 space-y-1.5">
                <div className="flex gap-1 text-xs">
                  <span className="text-emerald-600 font-medium">{data!.promoters} promotori</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-amber-600 font-medium">{data!.passives} passivi</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-destructive font-medium">{data!.detractors} detrattori</span>
                </div>
                <div className="flex h-2 rounded-full overflow-hidden gap-px">
                  <div
                    className="bg-red-500"
                    style={{ width: `${data!.totalResponses > 0 ? (data!.detractors / data!.totalResponses) * 100 : 0}%` }}
                  />
                  <div
                    className="bg-yellow-500"
                    style={{ width: `${data!.totalResponses > 0 ? (data!.passives / data!.totalResponses) * 100 : 0}%` }}
                  />
                  <div
                    className="bg-emerald-500 flex-1"
                  />
                </div>
                <p className="text-xs text-muted-foreground">{data!.totalResponses} risposte totali (6 mesi)</p>
              </div>
            </div>

            {/* Monthly trend */}
            {data!.monthlyData.some((m) => m.responses > 0) && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Trend NPS mensile</p>
                <ResponsiveContainer width="100%" height={80}>
                  <LineChart data={data!.monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis domain={[-100, 100]} tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                      formatter={(v: number) => [v, "NPS"]}
                    />
                    <Line type="monotone" dataKey="nps" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Recent feedback */}
            {data!.recentFeedback.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground">Ultimi feedback</p>
                {data!.recentFeedback.map((f) => (
                  <div key={f.id} className="flex items-start gap-2 text-xs">
                    <Badge
                      variant="outline"
                      className={`shrink-0 text-xs h-5 ${f.score >= 9 ? "border-emerald-500 text-emerald-600" : f.score >= 7 ? "border-yellow-500 text-yellow-600" : "border-destructive text-destructive"}`}
                    >
                      {f.score}
                    </Badge>
                    <div className="min-w-0">
                      <p className="text-muted-foreground truncate">{f.feedback_text}</p>
                      <p className="text-xs text-muted-foreground/60">{f.company_name}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Detractor Queue */}
            <div className="border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-destructive" />
                Coda Detrattori (score &lt; 7)
              </p>
              <DetractorQueue />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
