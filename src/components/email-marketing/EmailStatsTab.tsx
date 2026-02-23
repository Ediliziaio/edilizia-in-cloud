import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CampaignStatsCards } from "./CampaignStatsCards";
import { EmailFunnelChart } from "./EmailFunnelChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function EmailStatsTab() {
  const { company } = useAuth();

  const { data: logs = [] } = useQuery({
    queryKey: ["email-logs-stats", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_logs")
        .select("status")
        .eq("company_id", company!.id);
      if (error) throw error;
      return data || [];
    },
  });

  const count = (s: string) => logs.filter((l) => l.status === s).length;
  const stats = {
    sent: logs.length,
    delivered: count("delivered") + count("opened") + count("clicked"),
    opened: count("opened") + count("clicked"),
    clicked: count("clicked"),
    bounced: count("bounced"),
    unsubscribed: count("unsubscribed"),
    spam: count("spam"),
  };

  const funnel = { ...stats, converted: 0 };

  return (
    <div className="space-y-6">
      <CampaignStatsCards stats={stats} />

      <div className="grid md:grid-cols-2 gap-6">
        <EmailFunnelChart data={funnel} />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Migliori campagne</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              Nessuna campagna inviata ancora.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
