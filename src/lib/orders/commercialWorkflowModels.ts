import { ORDER_WORKFLOW_MODELS } from "./workflowModels";
import type { OpportunityStatus } from "@/types/opportunities";

const preparation: Record<string, string[]> = {
  ristrutturazione: ["Sopralluogo Commerciale", "Computo / Capitolato"],
  bagno: ["Sopralluogo Commerciale", "Proposta Intervento"],
  serramenti: ["Sopralluogo Commerciale", "Configurazione Offerta"],
  fotovoltaico: ["Analisi Esigenze e Consumi", "Verifica Tecnica Preliminare"],
  tetti: ["Sopralluogo Commerciale", "Valutazione Intervento"],
  impianti: ["Verifica Esigenze", "Sopralluogo Commerciale"],
  tende_vetrate: ["Sopralluogo Commerciale", "Configurazione Offerta"],
  generico: ["Qualificazione Richiesta", "Valutazione Lavoro"],
};
/** Commercial templates stop at the sale; never contain execution or payment states. */
export const COMMERCIAL_WORKFLOW_TEMPLATES = ORDER_WORKFLOW_MODELS.map(model => ({
  id: `vendita-${model.key}`,
  label: `Vendita · ${model.label}`,
  defaultName: `Vendita ${model.label}`,
  description: "Dalla richiesta alla vendita. Dopo l'accordo, esecuzione e consegna si seguono nella commessa; vinta non significa incassata.",
  stages: [
    ...["Richiesta Ricevuta", "Contattato", ...preparation[model.key], "Preventivo Inviato", "Trattativa"].map(name => ({name, auto_status: "open" as OpportunityStatus})),
    {name: "Contratto Firmato", auto_status: "won" as OpportunityStatus},
    {name: "Trattativa Persa", auto_status: "lost" as OpportunityStatus},
    {name: "Richiesta Non Qualificata", auto_status: "abandoned" as OpportunityStatus},
  ],
}));
