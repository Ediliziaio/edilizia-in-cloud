import { callElevenLabsProxy } from "@/modules/ai-agents/hooks/useElevenLabsProxy";
import type { ProxyAction } from "@/modules/ai-agents/types/agent.types";

export interface PreparedCampaignRecipients {
  recipients: { contact_id: string; nome: string; telefono: string }[];
  excluded: { contact_id: string; reason: string }[];
  verificata_il: string;
}
/** Legacy/imported JSON must not be able to break the campaign editor. */
export function readPreparedCampaignRecipients(metadata: unknown): PreparedCampaignRecipients | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const prepared = (metadata as Record<string, unknown>).preparazione_destinatari;
  if (!prepared || typeof prepared !== "object" || Array.isArray(prepared)) return null;
  const data = prepared as Record<string, unknown>;
  if (!Array.isArray(data.recipients) || !Array.isArray(data.excluded)) return null;
  return {
    recipients: data.recipients.filter((r): r is PreparedCampaignRecipients["recipients"][number] => !!r && typeof r === "object"
      && typeof r.contact_id === "string" && typeof r.nome === "string" && typeof r.telefono === "string").slice(0, 500),
    excluded: data.excluded.filter((e): e is PreparedCampaignRecipients["excluded"][number] => !!e && typeof e === "object"
      && typeof e.contact_id === "string" && typeof e.reason === "string").slice(0, 500),
    verificata_il: typeof data.verificata_il === "string" ? data.verificata_il : "",
  };
}
export async function campaignPreparationRequest<T>(companyId: string, action: ProxyAction, payload?: Record<string, unknown>): Promise<T> {
  let capabilities: { campaign_preparation?: boolean };
  try { capabilities = await callElevenLabsProxy<{ campaign_preparation?: boolean }>({ action: "get_capabilities", company_id: companyId }); }
  catch (error) {
    if (error instanceof Error && /azione non supportata.*get_capabilities|^nessuna azienda associata$/i.test(error.message)) {
      throw new Error("Il servizio server delle campagne non è ancora aggiornato. Pubblica frontend e funzioni server insieme.");
    }
    throw error;
  }
  if (!capabilities?.campaign_preparation) throw new Error("La preparazione campagne richiede il servizio server aggiornato. Nessuna chiamata è stata avviata.");
  return callElevenLabsProxy<T>({ action, company_id: companyId, payload });
}
