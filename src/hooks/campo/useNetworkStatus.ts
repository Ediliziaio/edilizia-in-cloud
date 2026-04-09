import { useEffect, useState } from "react";
import { isOnline, onNetworkChange } from "@/lib/campo/network-status";

/**
 * Hook React per monitorare lo stato online/offline del dispositivo.
 * Restituisce `true` se connesso, `false` se offline.
 */
export function useNetworkStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() => isOnline());

  useEffect(() => {
    const unsubscribe = onNetworkChange(setOnline);
    return () => {
      unsubscribe();
    };
  }, []);

  return online;
}
