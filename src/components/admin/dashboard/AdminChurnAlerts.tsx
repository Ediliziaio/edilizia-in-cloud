import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { AlertTriangle, TrendingDown, ChevronRight, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';

interface RiskCompany {
  company_id: string;
  health_status: string;
  score: number;
  updated_at: string;
  company: { name: string; status: string } | null;
}

export function AdminChurnAlerts() {
  const { data = [], isLoading } = useQuery<RiskCompany[]>({
    queryKey: ['admin-churn-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_health_scores' as never)
        .select(
          'company_id, health_status, score, updated_at, company:companies!company_id(name,status)' as never
        )
        .in('health_status' as never, ['at_risk', 'critical'] as never)
        .order('score' as never, { ascending: true })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as RiskCompany[];
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-muted-foreground" /> Churn Risk
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Nessuna azienda a rischio — ottimo lavoro!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-200">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2 text-amber-700">
          <AlertTriangle className="h-4 w-4" />
          Churn Risk — {data.length} {data.length === 1 ? 'azienda' : 'aziende'} a rischio
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.map((r) => {
          const companyData = r.company as { name?: string } | null;
          return (
            <div
              key={r.company_id}
              className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
            >
              <div>
                <p className="text-sm font-medium">{companyData?.name ?? 'Azienda'}</p>
                <p className="text-xs text-muted-foreground">
                  Aggiornato{' '}
                  {formatDistanceToNow(new Date(r.updated_at), { addSuffix: true, locale: it })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={r.health_status === 'critical' ? 'destructive' : 'secondary'}
                  className="text-[10px]"
                >
                  {r.health_status === 'critical' ? 'Critico' : 'A rischio'} {r.score}
                </Badge>
                <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                  <Link to={`/admin/aziende/${r.company_id}`}>
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
