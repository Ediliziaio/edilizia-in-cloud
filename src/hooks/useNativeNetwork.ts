import { useState, useEffect } from "react";
import { getNetworkState, onNetworkChange, type NetworkState } from "@/lib/mobile/native-network";

export function useNativeNetwork(): NetworkState {
  const [state, setState] = useState<NetworkState>(getNetworkState);
  useEffect(() => { const unsub = onNetworkChange(setState); return unsub; }, []);
  return state;
}
