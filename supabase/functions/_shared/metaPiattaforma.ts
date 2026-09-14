/**
 * Da quale piattaforma Meta arriva un lead.
 *
 * Graph risponde col campo `platform` del lead in forma abbreviata ("fb",
 * "ig"…). La guida pubblica dei lead non lo documenta, quindi lo si chiede in
 * una richiesta a parte: se Meta lo rifiuta, il lead entra lo stesso e la
 * piattaforma resta vuota.
 */
export type PiattaformaMeta = "facebook" | "instagram" | "messenger" | "audience_network";

const ALIAS: Record<string, PiattaformaMeta> = {
  fb: "facebook",
  facebook: "facebook",
  ig: "instagram",
  instagram: "instagram",
  msg: "messenger",
  messenger: "messenger",
  an: "audience_network",
  audience_network: "audience_network",
};

export function normalizzaPiattaformaMeta(valore: unknown): PiattaformaMeta | null {
  if (typeof valore !== "string") return null;
  return ALIAS[valore.trim().toLowerCase()] ?? null;
}

export const ETICHETTA_PIATTAFORMA_META: Record<PiattaformaMeta, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  messenger: "Messenger",
  audience_network: "Audience Network",
};

type Fetch = (url: string) => Promise<{ json: () => Promise<unknown> }>;

/** Chiede a Meta la piattaforma di un lead. Non lancia mai: in caso di errore torna null. */
export async function piattaformaDelLead(
  leadId: string,
  accessToken: string,
  apiVersion: string,
  fetchFn: Fetch = fetch,
): Promise<PiattaformaMeta | null> {
  try {
    const res = await fetchFn(
      `https://graph.facebook.com/${apiVersion}/${leadId}?fields=platform&access_token=${accessToken}`,
    );
    const body = (await res.json()) as { platform?: unknown; error?: unknown } | null;
    if (!body || body.error) return null;
    return normalizzaPiattaformaMeta(body.platform);
  } catch {
    return null;
  }
}
