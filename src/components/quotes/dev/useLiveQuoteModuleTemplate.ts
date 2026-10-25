import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MODELLO_AGGIORNATO, aziendaDelModello } from '@/lib/moduli-vendita/archivioModelli';
import { loadLiveQuoteModuleTemplate } from '@/lib/preventivi/liveQuoteModuleTemplate';

export function useLiveQuoteModuleTemplate(companyId: string, module: 'bagni' | 'serramenti', modelId: string) {
  const client = useQueryClient();
  const key = ['quote-live-module-template', companyId, module, modelId];
  const query = useQuery({ queryKey: key, queryFn: () => loadLiveQuoteModuleTemplate(companyId, module, modelId),
    enabled: !!companyId && !!modelId, staleTime: 0, refetchOnWindowFocus: 'always', refetchOnMount: 'always',
    refetchInterval: 60_000, refetchIntervalInBackground: false, retry: 1 });
  useEffect(() => {
    // Defer/batch notifications from a library download; don't refetch in a loop.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => { void client.invalidateQueries({ queryKey: ['quote-live-module-template', companyId] }); }, 200); };
    const updated = (e: Event) => { if ((e as CustomEvent).detail?.companyId === companyId) refresh(); };
    const storage = (e: StorageEvent) => { if (e.key && aziendaDelModello(e.key) === companyId) refresh(); };
    window.addEventListener(MODELLO_AGGIORNATO, updated); window.addEventListener('storage', storage);
    return () => { clearTimeout(timer); window.removeEventListener(MODELLO_AGGIORNATO, updated); window.removeEventListener('storage', storage); };
  }, [client, companyId]);
  return query;
}
