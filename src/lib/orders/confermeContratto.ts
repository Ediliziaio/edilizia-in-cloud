/** Cosa si conferma dopo la lettura del contratto, detto in breve (17/11/2026). */
import { contractConfirmations, type ContractPreparation } from "./contractPreparation";

const ETICHETTE: Record<string, string> = {
  cliente: "cliente", importo: "importo", iva: "IVA", rate: "pagamenti", standard: "fasi di lavoro", date: "date dei lavori",
};

/** Un lavoro singolo: basta la riga di cosa confermare, senza la scheda alta. */
export function eLavoroSingolo(piano: ContractPreparation): boolean {
  return piano.profilo !== "manutenzione_stradale_su_ordine" && piano.organizzazione !== "interventi_su_ordine"
    && !piano.extract.appalto_pubblico?.presente && piano.extract.appalto_pubblico?.durata_giorni == null;
}

/** Le conferme brevi («cliente», «fasi di lavoro»…) e le altre che non sono avvisi dell'AI. */
export function confermeDelPiano(piano: ContractPreparation): { brevi: string[]; altre: string[] } {
  const tutte = contractConfirmations(piano);
  return {
    brevi: tutte.filter((x) => ETICHETTE[x.key]).map((x) => ETICHETTE[x.key]),
    altre: tutte.filter((x) => !ETICHETTE[x.key] && !x.key.startsWith("fonte-")).map((x) => x.testo),
  };
}
