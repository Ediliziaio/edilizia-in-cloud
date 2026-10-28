import { useEffect, useState } from "react";

/** A new loading cycle starts cleanly, without an effect overwriting fresh UI state. */
export function useLoadingTimeout(isLoading: boolean, delayMs = 8000) {
  const [cycle, setCycle] = useState({ isLoading, delayMs, expired: false });
  if (cycle.isLoading !== isLoading || cycle.delayMs !== delayMs) {
    setCycle({ isLoading, delayMs, expired: false });
  }
  useEffect(() => {
    if (!isLoading) return;
    const timer = window.setTimeout(() => setCycle({ isLoading, delayMs, expired: true }), delayMs);
    return () => window.clearTimeout(timer);
  }, [isLoading, delayMs]);
  return isLoading && cycle.isLoading === isLoading && cycle.delayMs === delayMs && cycle.expired;
}
