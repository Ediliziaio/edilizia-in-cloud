import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";
import { createCommessaRefresh } from "@/lib/orders/createCommessaRefresh";
import { isCommessaCampoEvent, refreshCommessaCampoQueries } from "@/lib/orders/refreshCommessaCampoQueries";

// Header, diary and Campo detail share one subscriber per QueryClient and scope.
const scopes = new WeakMap<QueryClient, Map<string, { refs: number; dispose: () => void }>>();
let subscriptionId = 0;

export function attachCommessaCampoSync(qc: QueryClient, companyId: string, orderId: string): () => void {
  let map = scopes.get(qc);
  if (!map) { map = new Map(); scopes.set(qc, map); }
  const key = JSON.stringify([companyId, orderId]);
  let entry = map.get(key);
  if (!entry) {
    const refresh = createCommessaRefresh(() => refreshCommessaCampoQueries(qc, orderId, companyId));
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let subscribed = false;
    try {
      channel = supabase.channel(`commessa-campo-${companyId}-${orderId}-${++subscriptionId}`);
      channel.on("postgres_changes", { event: "*", schema: "public", table: "order_events", filter: `order_id=eq.${orderId}` }, payload => {
        const row = Object.keys(payload.new).length ? payload.new : payload.old;
        if (isCommessaCampoEvent(row, orderId, companyId)) refresh.request();
      }).on("postgres_changes", { event: "*", schema: "public", table: "commessa_campo_sync", filter: `order_id=eq.${orderId}` }, payload => {
        const row = Object.keys(payload.new).length ? payload.new : payload.old;
        if (isCommessaCampoEvent(row, orderId, companyId)) refresh.request();
      }).on("postgres_changes", { event: "*", schema: "public", table: "order_messages", filter: `order_id=eq.${orderId}` }, payload => {
        const row = Object.keys(payload.new).length ? payload.new : payload.old;
        if (isCommessaCampoEvent(row, orderId, companyId))
          void qc.invalidateQueries({ queryKey: ["order-messages", companyId, orderId] }).catch((): void => undefined);
      }).subscribe((status, error) => {
        if (status === "SUBSCRIBED") {
          if (subscribed) refresh.request();
          subscribed = true;
        }
        if (error) logger.warn("Commessa realtime non disponibile: recupero mirato attivo", { orderId, status });
      });
    } catch (error) {
      logger.warn("Commessa realtime non disponibile: recupero mirato attivo", { orderId, error });
    }
    entry = { refs: 0, dispose: () => {
      refresh.dispose();
      if (channel) void supabase.removeChannel(channel);
    } };
    map.set(key, entry);
  }
  entry.refs++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--entry!.refs === 0) { entry!.dispose(); map!.delete(key); }
  };
}

export function useCommessaCampoSync(orderId: string | null | undefined, companyId: string | null | undefined, enabled = true) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled || !orderId || !companyId) return;
    return attachCommessaCampoSync(qc, companyId, orderId);
  }, [qc, orderId, companyId, enabled]);
}
