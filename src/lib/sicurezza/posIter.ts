import type { AvvioSicurezza } from "@/hooks/useAvvioSicurezza";
import type { IterPos } from "@/hooks/usePos";
import { oggiSicurezza } from "./fascicolo";
import { stessoRiferimentoPsc, type RiferimentoPsc } from "../../../supabase/functions/_shared/posPsc";

/**
 * Art. 101 comma 3 del D.Lgs 81/2008: l'impresa esecutrice consegna il POS all'affidataria, che lo verifica e lo
 * trasmette al CSE; con una verifica negativa i lavori non possono iniziare, anche se nell'app il POS risulta
 * approvato (l'approvazione dell'app è del datore di lavoro, non sostituisce l'esito di chi verifica).
 * Conta solo la verifica che si applica: quella dell'affidataria in subappalto, quella del CSE con il PSC.
 */
export function verificaIterNegativa(
  contenuto: { impresa?: { ruolo?: string | null } | null; procedure_psc?: { psc_presente?: boolean | null } | null } | null | undefined,
  iter: { affidataria_esito?: string | null; cse_esito?: string | null } | null | undefined,
): boolean {
  if (!iter) return false;
  const inSubappalto = contenuto?.impresa?.ruolo === "esecutrice_subappalto";
  const conCse = contenuto?.procedure_psc?.psc_presente === true;
  return (inSubappalto && iter.affidataria_esito === "negativo") || (conCse && iter.cse_esito === "negativo");
}

export function errorePscAvvio(contenuto: { psc_presente: boolean; documento?: RiferimentoPsc }, avvio?: AvvioSicurezza | null) {
  if (!avvio || avvio.stato === "da_valutare") return "Conferma l’applicabilità del PSC in Avvio sicurezza.";
  if (avvio.stato === "non_previsto") return contenuto.psc_presente ? "Allinea il POS alla decisione PSC della commessa." : null;
  if (!avvio.psc) return "Collega il PSC vigente in Avvio sicurezza.";
  return contenuto.psc_presente && stessoRiferimentoPsc(avvio.psc, contenuto.documento)
    ? null : "Allinea il POS alla revisione vigente del PSC e riesamina le procedure.";
}

export function prossimoPassoPos(pos: {
  status: string | null;
  contenuto: { impresa: { ruolo?: string }; procedure_psc: { psc_presente: boolean; documento?: RiferimentoPsc } };
  iter: IterPos;
}, avvio?: AvvioSicurezza | null) {
  const { status, contenuto, iter } = pos;
  if (!["approvato", "firmato", "consegnato"].includes(status ?? "")) return "Completa e approva la bozza.";
  const errorePsc = errorePscAvvio(contenuto.procedure_psc, avvio);
  if (errorePsc) return errorePsc;
  if (verificaIterNegativa(contenuto, iter)) return "Verifica negativa. Prepara una revisione.";
  const oggi = oggiSicurezza();
  if (!iter.firma_datore_il || iter.firma_datore_il > oggi) return "Registra la firma effettiva del datore di lavoro.";
  if (contenuto.impresa.ruolo === "esecutrice_subappalto" && (
    !dateIterCoerenti(oggi, iter.affidataria_inviato_il, iter.affidataria_ricevuto_il, iter.affidataria_esito_il) ||
    iter.affidataria_esito !== "positivo"
  )) return "Completa ricezione ed esito dell’impresa affidataria.";
  if (avvio?.stato === "previsto" && (
    !dateIterCoerenti(oggi, iter.cse_inviato_il, iter.cse_ricevuto_il, iter.cse_esito_il) || iter.cse_esito !== "positivo"
  )) return "Completa ricezione ed esito del CSE.";
  return null;
}

function dateIterCoerenti(oggi: string, invio?: string | null, ricezione?: string | null, esito?: string | null) {
  return !!invio && !!ricezione && !!esito && invio <= ricezione && ricezione <= esito && esito <= oggi;
}
