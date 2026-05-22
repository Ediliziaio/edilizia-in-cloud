import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface GeofenceBreachNotification {
  id: string;
  title: string;
  body: string | null;
  entity_id: string | null; // geofence id
  created_at: string;
}

export function useGeofenceAlert(companyId: string) {
  const { profile } = useAuth();
  const [violazioni, setViolazioni] = useState<GeofenceBreachNotification[]>([]);
  const [ultimaViolazione, setUltimaViolazione] = useState<GeofenceBreachNotification | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!companyId || !profile?.id) return;
    const userId = profile.id;
    // Cleanup guard: il capocantiere può navigare via prima che la query
    // iniziale ritorni. Senza guard: setState su componente smontato +
    // canale realtime non liberato → memory leak su navigazioni frequenti.
    let cancelled = false;

    // Carica recenti (ultime 8 ore)
    const carica = async () => {
      const { data, error } = await (supabase
        .from('notifications' as never)
        .select('id, title, body, entity_id, created_at')
        .eq('company_id', companyId)
        .eq('user_id', userId)
        .eq('type', 'geofence_breach')
        .gte('created_at', new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(10) as unknown as Promise<{
          data: GeofenceBreachNotification[] | null;
          error: unknown;
        }>);
      if (cancelled) return;
      if (!error && data) setViolazioni(data);
    };

    void carica();

    // Real-time subscription — canale unique per (company, user) coppia.
    // Suffisso random non necessario perché la chiave (companyId, profile.id)
    // è già nei deps: re-mount = effect ri-eseguito = nuovo channel name.
    const channel = supabase
      .channel(`geofence-alert-${companyId}-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          if (cancelled) return;
          const nuova = payload.new as {
            id: string;
            type: string;
            title: string;
            body: string | null;
            entity_id: string | null;
            created_at: string;
            user_id: string;
          };
          if (nuova.type !== 'geofence_breach' || nuova.user_id !== userId) return;
          const notifica: GeofenceBreachNotification = {
            id: nuova.id,
            title: nuova.title,
            body: nuova.body,
            entity_id: nuova.entity_id,
            created_at: nuova.created_at,
          };
          setViolazioni((prev) => [notifica, ...prev]);
          setUltimaViolazione(notifica);
        }
      )
      .subscribe();
    channelRef.current = channel;

    return () => {
      cancelled = true;
      // removeChannel() è il modo corretto Supabase v2 per liberare la
      // connessione websocket sottostante. unsubscribe() da solo non
      // sempre rimuove il channel dal pool client.
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [companyId, profile?.id]);

  const dismissViolazione = (id: string) => {
    setViolazioni((prev) => prev.filter((v) => v.id !== id));
    if (ultimaViolazione?.id === id) setUltimaViolazione(null);
  };

  return { violazioni, ultimaViolazione, dismissViolazione };
}
