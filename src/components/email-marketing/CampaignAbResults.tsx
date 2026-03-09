import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Mail, MousePointerClick, Eye } from "lucide-react";

interface Props {
  campaignId: string;
}

interface VariantStats {
  total: number;
  delivered: number;
  opened: number;
  clicked: number;
  failed: number;
}

function calcRate(num: number, den: number) {
  if (den === 0) return "0%";
  return `${((num / den) * 100).toFixed(1)}%`;
}

export function CampaignAbResults({ campaignId }: Props) {
  const { data: campaign } = useQuery({
    queryKey: ["ab-campaign", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_campaigns")
        .select("ab_test_enabled, ab_subject_b, subject, ab_split_percent, ab_winner_criteria, ab_test_duration_hours, ab_winner, completed_at, status")
        .eq("id", campaignId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: stats, isLoading } = useQuery({
    queryKey: ["ab-stats", campaignId],
    enabled: !!campaign?.ab_test_enabled,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data: logs, error } = await supabase
        .from("email_logs")
        .select("ab_variant, status")
        .eq("campaign_id", campaignId);
      if (error) throw error;

      const a: VariantStats = { total: 0, delivered: 0, opened: 0, clicked: 0, failed: 0 };
      const b: VariantStats = { total: 0, delivered: 0, opened: 0, clicked: 0, failed: 0 };

      for (const log of logs || []) {
        const target = (log as any).ab_variant === "B" ? b : a;
        target.total++;
        if (log.status === "delivered") target.delivered++;
        else if (log.status === "opened") { target.delivered++; target.opened++; }
        else if (log.status === "clicked") { target.delivered++; target.opened++; target.clicked++; }
        else if (log.status === "failed") target.failed++;
      }

      return { a, b };
    },
  });

  if (!campaign?.ab_test_enabled) return null;

  const winner = (campaign as any)?.ab_winner as string | null;
  const criteriaLabel = (campaign as any)?.ab_winner_criteria === "click_rate" ? "Click rate" : "Open rate";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Trophy className="h-4 w-4" />
          Risultati A/B Test
          {winner && (
            <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]">
              Vincitore: Variante {winner}
            </Badge>
          )}
          {!winner && campaign.status === "sent" && (
            <Badge variant="secondary" className="text-[10px]">
              In attesa ({(campaign as any)?.ab_test_duration_hours ?? 4}h) · Criterio: {criteriaLabel}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 gap-4">
            {/* Variant A */}
            <VariantCard
              label="A"
              subject={campaign.subject || "—"}
              stats={stats.a}
              isWinner={winner === "A"}
            />
            {/* Variant B */}
            <VariantCard
              label="B"
              subject={campaign.ab_subject_b || "—"}
              stats={stats.b}
              isWinner={winner === "B"}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function VariantCard({ label, subject, stats, isWinner }: {
  label: string;
  subject: string;
  stats: VariantStats;
  isWinner: boolean;
}) {
  return (
    <div className={`rounded-lg border p-3 space-y-3 ${isWinner ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/10" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">Variante {label}</span>
        {isWinner && <Trophy className="h-3.5 w-3.5 text-emerald-600" />}
      </div>
      <p className="text-[11px] text-muted-foreground line-clamp-2 italic">"{subject}"</p>
      <div className="space-y-1.5">
        <StatRow icon={<Mail className="h-3 w-3" />} label="Inviati" value={stats.total} rate="" />
        <StatRow icon={<Eye className="h-3 w-3" />} label="Aperture" value={stats.opened} rate={calcRate(stats.opened, stats.delivered)} />
        <StatRow icon={<MousePointerClick className="h-3 w-3" />} label="Clic" value={stats.clicked} rate={calcRate(stats.clicked, stats.delivered)} />
      </div>
    </div>
  );
}

function StatRow({ icon, label, value, rate }: { icon: React.ReactNode; label: string; value: number; rate: string }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <span className="font-medium">
        {value}
        {rate && <span className="text-muted-foreground ml-1">({rate})</span>}
      </span>
    </div>
  );
}
