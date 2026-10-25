import type { SrProgettoDetail } from "@/types/serramenti";
import { configuredQuoteEndpoint } from '@/lib/preventivi/quoteTransportEndpoint';
export function srConversationPayload(
  base: SrProgettoDetail,
  next: SrProgettoDetail,
) {
  if (
    base.progetto.id !== next.progetto.id ||
    JSON.stringify(base.progetto) !== JSON.stringify(next.progetto)
  )
    throw new Error(
      "La chat non può cambiare cliente, modello o condizioni del progetto",
    );
  const bom = (d: SrProgettoDetail) => ({
    serramenti: d.serramenti,
    accessori: d.accessori,
    servizi: d.servizi,
  });
  return {
    p_project_id: base.progetto.id,
    p_company_id: base.progetto.company_id,
    p_expected_project: base.progetto,
    p_expected: bom(base),
    p_next: bom(next),
  };
}
type Payload = ReturnType<typeof srConversationPayload>;
export async function saveLocalSrConversation(
  rpc: (
    name: string,
    args: Payload,
  ) => PromiseLike<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>,
  payload: Payload,
  backendUrl: string,
) {
  configuredQuoteEndpoint(backendUrl);
  const { data, error } = await rpc("sr_apply_ai_bom_atomic", payload);
  if (error)
    throw new Error(
      error.code === "40001"
        ? "Preventivo modificato altrove: riapri la chat."
        : error.code === "PGRST202" || error.code === "42883"
          ? "Migrazione atomica non installata nel database. Nessuna modifica parziale eseguita."
          : error.message,
    );
  if (
    !data ||
    typeof data !== "object" ||
    !("projectId" in data) ||
    data.projectId !== payload.p_project_id
  )
    throw new Error(
      "Esito non verificabile: non ripetere automaticamente la richiesta",
    );
}
