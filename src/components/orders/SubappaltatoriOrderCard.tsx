// src/components/orders/SubappaltatoriOrderCard.tsx
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { HardHat, ExternalLink } from 'lucide-react';
import { differenceInDays, parseISO } from 'date-fns';
import type { SubappaltatoreConDashboard } from '@/types/subappaltatori';

interface Props {
  orderId: string;
  companyId: string;
}

function DurcBadge({ scadenza }: { scadenza: string | null }) {
  if (!scadenza) return <Badge variant="outline" className="text-xs">DURC mancante</Badge>;
  const daysLeft = differenceInDays(parseISO(scadenza), new Date());
  if (daysLeft < 0) return <Badge className="text-xs bg-red-600 text-white">DURC scaduto</Badge>;
  if (daysLeft <= 30) return <Badge className="text-xs bg-yellow-500 text-white">DURC {daysLeft}gg</Badge>;
  return <Badge className="text-xs bg-green-600 text-white">DURC OK</Badge>;
}

export function SubappaltatoriOrderCard({ orderId, companyId }: Props) {
  const { data: subappaltatori = [], isLoading } = useQuery({
    queryKey: ['subappaltatori-order', orderId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('v_subappaltatori_dashboard')
        .select('*')
        .eq('order_id', orderId)
        .eq('company_id', companyId);
      if (error) throw error;
      return (data ?? []) as SubappaltatoreConDashboard[];
    },
    enabled: !!orderId && !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (subappaltatori.length === 0) return null;

  const totaleRitenute = subappaltatori.reduce((s, sub) => s + (sub.ritenute_in_corso ?? 0), 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <HardHat className="h-4 w-4 text-orange-500" />
          Subappaltatori ({subappaltatori.length})
          {totaleRitenute > 0 && (
            <Badge variant="outline" className="ml-auto text-xs font-normal">
              €{totaleRitenute.toLocaleString('it-IT')} in garanzia
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {subappaltatori.map((sub) => {
          const lordo = sub.totale_sal_lordo ?? 0;
          const contr = sub.importo_contrattuale ?? 0;
          const pct = contr > 0
            ? Math.min(100, Math.round((lordo / contr) * 100))
            : 0;
          return (
            <div key={sub.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{sub.ragione_sociale}</p>
                  {sub.tipo_lavori && (
                    <p className="text-xs text-muted-foreground">{sub.tipo_lavori}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <DurcBadge scadenza={sub.durc_scadenza} />
                </div>
              </div>

              {contr > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Contratto eseguito</span>
                    <span className="font-medium">{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-orange-500 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>€{lordo.toLocaleString('it-IT')} / €{contr.toLocaleString('it-IT')}</span>
                    {sub.ritenute_in_corso > 0 && (
                      <span className="text-amber-600 font-medium">
                        €{sub.ritenute_in_corso.toLocaleString('it-IT')} ritenuta
                      </span>
                    )}
                  </div>
                </div>
              )}

              <Button asChild variant="ghost" size="sm" className="h-7 text-xs w-full">
                <Link to={`/azienda/subappaltatori/${sub.id}`}>
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Gestisci
                </Link>
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
