export function callRecordId(value: string | null | undefined): string | undefined {
  return value && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase()
    : undefined;
}

export function centralinoHistoryHref(agentId?: string) {
  const agent = callRecordId(agentId);
  const params = new URLSearchParams(agent ? { agente: agent } : { tipo: "ai" });
  return `/azienda/centralino?${params}`;
}

export function centralinoHistoryFilters(params: URLSearchParams): {
  agentId?: string;
  kind?: "ai" | "human";
} {
  const agentId = callRecordId(params.get("agente") || params.get("agentId") || params.get("agent"));
  const kind = params.get("tipo");
  return { agentId, kind: agentId || kind === "ai" ? "ai" : kind === "human" ? "human" : undefined };
}

export function centralinoCallbackHref(callbackId?: string, current?: URLSearchParams) {
  const params = new URLSearchParams({ tab: "richiami" });
  if (current) {
    const { agentId, kind } = centralinoHistoryFilters(current);
    if (agentId) params.set("agente", agentId);
    else if (kind) params.set("tipo", kind);
  }
  const callback = callRecordId(callbackId);
  if (callback) params.set("richiamo", callback);
  return `/azienda/centralino?${params}`;
}
