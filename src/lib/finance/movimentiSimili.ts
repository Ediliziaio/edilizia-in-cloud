import { bankRpc } from "./bankWorkspace";
import {
  proposalClaims,
  strongProposal,
  type BankProposal,
} from "./bankReconciliationBatch";

/** Quanti movimenti simili si analizzano dopo una conferma: bank_proposte_lotto costa ~0,9 s a
 *  movimento (misurato il 28/11/2026), e l'avviso non deve far aspettare. */
export const SIMILI_MASSIMO = 10;

/**
 * «Fai lo stesso per i simili» (lotto D, 28/11/2026). Dopo una conferma fatta a mano chiede al
 * database gli altri movimenti aperti che la memoria delle scelte lega allo stesso soggetto, poi
 * ne calcola le proposte e tiene solo quelli con UNA proposta forte non reclamata da altri: gli
 * stessi che la conferma in blocco selezionerebbe con «Seleziona riscontri forti».
 * Non conferma niente: restituisce gli id, la conferma resta della persona.
 */
export async function cercaMovimentiSimili(
  company: string,
  tx: string,
): Promise<string[]> {
  const ids = await bankRpc<string[] | null>("bank_movimenti_simili", {
    p_company: company,
    p_tx: tx,
  });
  const daAnalizzare = (ids ?? []).slice(0, SIMILI_MASSIMO);
  if (!daAnalizzare.length) return [];
  const proposte = await bankRpc<Record<string, BankProposal[]>>(
    "bank_proposte_lotto",
    { p_company: company, p_ids: daAnalizzare },
  );
  const claims = proposalClaims(proposte ?? {});
  return daAnalizzare.filter(
    (id) => strongProposal(proposte?.[id] ?? [], claims) !== null,
  );
}
