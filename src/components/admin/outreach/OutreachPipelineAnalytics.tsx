import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Briefcase, TrendingUp, Euro, Timer } from "lucide-react";

/**
 * Analytics pipeline — win rate, valore aperto, forecast pesato (value*probability),
 * valore vinto, velocità media (giorni a chiusura). Su marketing_opportunities
 * (esistente). Colma il gap analytics segnalato nell'audit pipeline.
 */

interface Opp { status: string; value: number | null; probability: number | null; created_at: string; updated_at: string; }

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Math.round(n));

export function OutreachPipelineAnalytics({ companyId }: { companyId: string }) {
  const q = useQuery({
    queryKey: ["pipeline-analytics", companyId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_opportunities")
        .select("status,value,probability,created_at,updated_at")
        .eq("company_id", companyId).is("deleted_at", null).limit(5000);
      if (error) throw error;
      return (data ?? []) as Opp[];
    },
  });

  const opps = q.data ?? [];
  const open = opps.filter((o) => o.status === "open");
  const won = opps.filter((o) => o.status === "won");
  const lost = opps.filter((o) => o.status === "lost" || o.status === "abandoned");
  const closedTotal = won.length + lost.length;

  const winRate = closedTotal > 0 ? Math.round((won.length / closedTotal) * 1000) / 10 : null;
  const openValue = open.reduce((s, o) => s + (o.value ?? 0), 0);
  const forecast = open.reduce((s, o) => s + (o.value ?? 0) * ((o.probability ?? 0) / 100), 0);
  const wonValue = won.reduce((s, o) => s + (o.value ?? 0), 0);
  const avgDays = won.length
    ? Math.round(won.reduce((s, o) => s + (new Date(o.updated_at).getTime() - new Date(o.created_at).getTime()) / 86400000, 0) / won.length)
    : null;

  const err = !!q.error;
  const cards = [
    { icon: Trophy, label: "Win rate", value: err ? "—" : winRate == null ? "—" : `${winRate}%`, hint: closedTotal > 0 ? `${won.length}/${closedTotal} chiuse vinte` : "ancora nessuna chiusa", tone: "good" },
    { icon: Briefcase, label: "Opportunità aperte", value: err ? "—" : String(open.length), hint: "in pipeline", tone: "default" },
    { icon: Euro, label: "Valore pipeline", value: err ? "—" : eur(openValue), hint: "aperto, lordo", tone: "default" },
    { icon: TrendingUp, label: "Forecast pesato", value: err ? "—" : eur(forecast), hint: "valore × probabilità", tone: "good" },
    { icon: Trophy, label: "Valore vinto", value: err ? "—" : eur(wonValue), hint: `${won.length} deal`, tone: "good" },
    { icon: Timer, label: "Velocità media", value: err ? "—" : avgDays == null ? "—" : `${avgDays}g`, hint: "giorni a chiusura", tone: "default" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {cards.map((c) => {
        const Icon = c.icon;
        const color = c.tone === "good" ? "text-emerald-600" : "text-foreground";
        return (
          <Card key={c.label}>
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{c.label}</div>
              <div className={`mt-0.5 text-xl font-bold ${color}`}>{c.value}</div>
              <div className="text-[10px] text-muted-foreground">{c.hint}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
