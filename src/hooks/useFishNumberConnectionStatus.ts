import { useQuery } from "@tanstack/react-query";
import { callFishAgent } from "@/lib/fishAgentProxy";

export type ConnectionRequest = {
  id: string;
  number_mode: "existing" | "new";
  existing_number: string | null;
  carrier: string;
  status: string;
  platform_notes: string;
  company_reply?: string;
  created_at: string;
};
export type ConnectionStatus = {
  request: ConnectionRequest | null;
  line?: { number: string; outbound: boolean } | null;
};
export const fishNumberConnectionKey = (companyId: string, agentId: string) =>
  ["fish-number-request", companyId, agentId] as const;

export function useFishNumberConnectionStatus(
  companyId: string,
  agentId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: fishNumberConnectionKey(companyId, agentId),
    enabled,
    retry: false,
    staleTime: 15_000,
    queryFn: () =>
      callFishAgent<ConnectionStatus>(
        companyId,
        agentId,
        "number_connection_status",
      ),
  });
}
