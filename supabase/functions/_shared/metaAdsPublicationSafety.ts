/** Regole condivise: nessun ID esterno, nessuna Pagina scelta implicitamente tra più opzioni. */
export interface CampaignPage {
  id: string;
  asset_id: string;
  selected: boolean;
  metadata?: unknown;
}
export function selectCampaignPage<T extends CampaignPage>(pages: T[], state: { pageMetaId?: string; pageId?: string }):
  { page: T; error?: never } | { page?: never; error: string } {
  const selected = pages.filter((page) => page.selected);
  const requested = state.pageMetaId || state.pageId;
  if (requested) {
    const page = selected.find((item) => state.pageMetaId ? item.asset_id === requested : item.id === requested || item.asset_id === requested);
    return page ? { page } : { error: "La Pagina scelta non è più collegata a questa azienda. Scegli una Pagina disponibile e salva la bozza." };
  }
  if (selected.length === 1) return { page: selected[0] };
  return { error: selected.length > 1
    ? "Sono collegate più Pagine: scegli la Pagina Facebook nel primo passaggio della campagna e salva la bozza."
    : "Collega e seleziona una Pagina Facebook prima di pubblicare." };
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}

export function campaignStateMatches(savedState: unknown, requestedState: unknown): boolean {
  return canonical(savedState) === canonical(requestedState);
}

/** L'ok vale solo per la configurazione e il budget effettivamente approvati. */
export function campaignApprovalMatches(
  draft: { approved_at?: string | null; builder_state?: unknown; daily_budget_cents?: number | null } | null,
  requestedState: unknown,
  budgetCents: number,
): boolean {
  return Boolean(draft?.approved_at) && draft?.daily_budget_cents === Math.round(budgetCents)
    && campaignStateMatches(draft?.builder_state, requestedState);
}

export class CampaignPublicationLockError extends Error {
  constructor(public readonly code: "publication_in_progress" | "publication_lock_failed", message: string) { super(message); }
}

/** Il vincolo PK rende il claim atomico anche da due schede/dispositivi. Niente scadenza automatica:
 * dopo un'interruzione bisogna verificare Meta, non rischiare di creare una seconda campagna. */
// deno-lint-ignore no-explicit-any
export async function acquireCampaignPublicationLock(admin: any, companyId: string, campaignId: string): Promise<() => Promise<void>> {
  const requestId = crypto.randomUUID();
  const { error } = await admin.from("meta_campaign_publication_locks").insert({
    campaign_id: campaignId, company_id: companyId, request_id: requestId,
  });
  if (error) {
    if (error.code === "23505") throw new CampaignPublicationLockError("publication_in_progress",
      "La pubblicazione di questa bozza è già stata avviata. Attendi l’esito nel riepilogo prima di riprovare.");
    throw new CampaignPublicationLockError("publication_lock_failed", "Non riesco a verificare se questa bozza è già in pubblicazione. Riprova più tardi.");
  }
  return async () => {
    const { error: releaseError } = await admin.from("meta_campaign_publication_locks").delete()
      .eq("campaign_id", campaignId).eq("company_id", companyId).eq("request_id", requestId);
    if (releaseError) console.error("Campaign publication lock release failed", releaseError.code);
  };
}
