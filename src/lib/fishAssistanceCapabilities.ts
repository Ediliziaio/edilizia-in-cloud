import { useQuery } from "@tanstack/react-query";
import { callFishAgent } from "./fishAgentProxy";
export function useFishAssistanceCapabilities(
  companyId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["fish-assistance-capabilities", companyId],
    enabled: !!companyId && enabled,
    retry: false,
    staleTime: 30_000,
    queryFn: () =>
      callFishAgent<{ version: number; ready: boolean }>(
        companyId!,
        "",
        "assistance_capabilities",
      ),
  });
}
