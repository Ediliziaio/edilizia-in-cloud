/**
 * useTrack — v8.6.89
 *
 * Hook ergonomico per tracking eventi PostHog.
 * Usage:
 *   const track = useTrack();
 *   track("order_created", { order_value: 1500, customer_id });
 *
 * Le costanti standard sono in `@/lib/analytics/posthog` → ANALYTICS_EVENTS.
 */
import { useCallback } from "react";
import { track as posthogTrack, ANALYTICS_EVENTS } from "@/lib/analytics/posthog";

export function useTrack() {
  return useCallback((event: string, properties?: Record<string, unknown>) => {
    posthogTrack(event, properties);
  }, []);
}

export { ANALYTICS_EVENTS };
