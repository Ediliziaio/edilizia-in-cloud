import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '../WorkspaceContext';

// Long-running jobs reuse the user's current access token in memory.
export function GareJobSession() {
  const { api, member } = useWorkspace();
  const status = useQuery({
    queryKey: ['gare', member.company_id, 'ai-status'],
    queryFn: () => api.ai<{ available: boolean }>('status'),
    staleTime: 15_000,
    refetchInterval: 60_000,
    retry: false,
  });
  useEffect(() => {
    let pending = false;
    async function renew() {
      if (pending) return;
      pending = true;
      try {
        await api.ai('renew', {});
      } catch {
        // The AI panel shows interrupted jobs and lets the user resume them.
      } finally {
        pending = false;
      }
    }
    const interval = window.setInterval(renew, 45_000);
    return () => window.clearInterval(interval);
  }, [api]);
  if (!status.isError && status.data?.available !== false) return null;

  return (
    <div role="status" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
      <p><strong>Elaborazioni automatiche da collegare.</strong> Gare, fascicolo e documenti disponibili.</p>
      <Button size="sm" variant="outline" disabled={status.isFetching} onClick={() => status.refetch()}>
        {status.isFetching ? 'Verifica…' : 'Verifica collegamento'}
      </Button>
    </div>
  );
}
