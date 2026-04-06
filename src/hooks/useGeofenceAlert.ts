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
      if (!error && data) setViolazioni(data);
    };

    carica();

    // Real-time subscription
    channelRef.current = supabase
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

    return () => {
      channelRef.current?.unsubscribe();
    };
  }, [companyId, profile?.id]);

  const dismissViolazione = (id: string) => {
    setViolazioni((prev) => prev.filter((v) => v.id !== id));
    if (ultimaViolazione?.id === id) setUltimaViolazione(null);
  };

  return { violazioni, ultimaViolazione, dismissViolazione };
}
