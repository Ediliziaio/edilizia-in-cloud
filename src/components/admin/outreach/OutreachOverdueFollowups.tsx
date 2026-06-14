import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlarmClock, ArrowRight } from "lucide-react";

/**
 * Follow-up scaduti — opportunità aperte con next_action_date nel passato.
 * Disciplina di vendita: ogni mattina lavora prima questi. Su
 * marketing_opportunities (esistente), nessuna migrazione.
 */

interface Overdue { id: string; name: string; next_action: string | null; next_action_date: string; value: number | null; }

export function OutreachOverdueFollowups({ companyId }: { companyId: string }) {
  const [todayMs] = useState(() => Date.now());
  const today = new Date(todayMs).toISOString().slice(0, 10);

  const q = useQuery({
    queryKey: ["overdue-followups", companyId, today],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_opportunities")
        .select("id,name,next_action,next_action_date,value")
        .eq("company_id", companyId).eq("status", "open").is("deleted_at", null)
        .not("next_action_date", "is", null).lt("next_action_date", today)
        .order("next_action_date", { ascending: true }).limit(50);
      if (error) throw error;
      return (data ?? []) as Overdue[];
    },
  });

  const rows = q.data ?? [];
  const daysOverdue = (d: string) => Math.max(0, Math.floor((todayMs - new Date(d).getTime()) / 86400000));

  return (
    <Card className={rows.length > 0 ? "border-red-200" : ""}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlarmClock className={`h-5 w-5 ${rows.length > 0 ? "text-red-500" : "text-muted-foreground"}`} />
          Follow-up scaduti
          {rows.length > 0 && <Badge className="bg-red-500">{rows.length}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted-foreground">Nessun follow-up scaduto. Ottimo lavoro. 🎉</p>
        ) : (
          <>
            {rows.map((o) => (
              <Link key={o.id} to="/admin/marketing/opportunita" className="flex items-center gap-3 rounded-lg border border-red-100 bg-red-50/40 p-2.5 transition-colors hover:bg-red-50">
                <Badge variant="destructive" className="shrink-0 text-[10px]">{daysOverdue(o.next_action_date)}g fa</Badge>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{o.name}</div>
                  {o.next_action && <div className="truncate text-xs text-muted-foreground">{o.next_action}</div>}
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
              </Link>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
