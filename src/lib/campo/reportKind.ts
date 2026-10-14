/** Classifies existing reports without treating the author's signature as a client's. */
export function isClientReport(report: {
  lavoro_completato?: boolean | null;
  firma_cliente_url?: string | null;
}): boolean {
  return report.lavoro_completato === true || !!report.firma_cliente_url?.trim();
}

export function campoReportUrl(orderId: string, kind: "daily" | "client", day?: string): string {
  const path = kind === "client" ? "rapporto-fine-lavori" : "rapportino";
  const params = new URLSearchParams();
  if (day) params.set("data", day);
  const query = params.toString();
  return `/campo/lavoro/${encodeURIComponent(orderId)}/${path}${query ? `?${query}` : ""}`;
}
