import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy, Medal } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';

export function PartnerLeaderboard() {
  const { data: leaderboard = [] } = useQuery({
    queryKey: ['leaderboard-public'],
    queryFn: async () => {
      const { data } = await supabase
        .from('referral_leaderboard_public')
        .select('*');
      return data || [];
    },
    staleTime: 300_000, // 5 minuti
  });

  const rankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className='h-4 w-4 text-yellow-500' />;
    if (rank === 2) return <Medal  className='h-4 w-4 text-gray-400' />;
    if (rank === 3) return <Medal  className='h-4 w-4 text-amber-600' />;
    return <span className='text-sm text-muted-foreground font-mono w-4 text-center'>{rank}</span>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base flex items-center gap-2'>
          <Trophy className='h-4 w-4 text-yellow-500' />
          Top Partner del Mese
        </CardTitle>
      </CardHeader>
      <CardContent className='p-0'>
        <div className='divide-y'>
          {leaderboard.map((entry: any) => (
            <div key={entry.rank} className='flex items-center gap-3 px-4 py-3'>
              <div className='w-6 flex justify-center'>{rankIcon(entry.rank)}</div>
              <div className='flex-1'>
                <div className='flex items-center gap-2'>
                  <span className='font-medium text-sm'>{entry.name_masked}</span>
                  {entry.tier_icon && (
                    <span className='text-xs'>{entry.tier_icon} {entry.tier_name}</span>
                  )}
                </div>
                <span className='text-xs text-muted-foreground'>
                  {entry.active_companies} aziende attive
                </span>
              </div>
              <div className='text-right'>
                <div className='text-sm font-semibold text-green-600'>
                  {formatCurrency(entry.current_month_commission)}
                </div>
                <div className='text-xs text-muted-foreground'>questo mese</div>
              </div>
            </div>
          ))}
          {leaderboard.length === 0 && (
            <div className='text-center py-8 text-muted-foreground text-sm'>
              Nessun dato disponibile
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
