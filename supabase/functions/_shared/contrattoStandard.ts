/**
 * Il contratto col cliente standard, senza AI (09/11/2026).
 *
 * Florin: «deve sempre uscire con la tabella e con le condizioni definite a monte, uguale agli altri; l'AI solo se la
 * chiedo». Il testo si compone dai dati della commessa: stesso formato di quello dell'AI, così il PDF è uno solo. Le
 * condizioni le attacca in coda chi chiama, parola per parola, dal modello di «Contratti e condizioni».
 */
export interface CommessaPerContratto {
  description?: string | null;
  work_description?: string | null;
  work_address?: string | null;
  client_address?: string | null;
  work_start_date?: string | null;
  expected_date?: string | null;
}

const pulito = (v: unknown): string => String(v ?? "").replace(/\s+/g, " ").trim();
const giorno = (iso: unknown): string => {
  const [a, m, g] = pulito(iso).slice(0, 10).split("-");
  return g && m && a ? `${g}/${m}/${a}` : "";
};

export function contrattoStandardMd(o: CommessaPerContratto): string {
  const oggetto = pulito(o.description);
  const dettaglio = pulito(o.work_description);
  const luogo = pulito(o.work_address) || pulito(o.client_address);
  const inizio = giorno(o.work_start_date);
  const fine = giorno(o.expected_date);
  const tempi = inizio && fine ? `I lavori iniziano il ${inizio} e terminano entro il ${fine}, salvo cause non imputabili all'Appaltatore.`
    : inizio ? `I lavori iniziano il ${inizio}. La data di fine si concorda per iscritto.`
      : "Le date di inizio e di fine dei lavori si concordano per iscritto prima dell'avvio del cantiere.";
  return [
    "# CONTRATTO D'APPALTO",
    `## Oggetto dei lavori\nCon il presente contratto il Committente affida all'Appaltatore, che accetta, l'esecuzione dei seguenti lavori: ${oggetto || "come da Allegato A"}.${dettaglio && dettaglio !== oggetto ? ` ${dettaglio}.`.replace(/\.\.$/, ".") : ""} Le singole lavorazioni sono elencate nell'Allegato A, parte integrante del contratto.`,
    `## Luogo dei lavori\nI lavori si eseguono in ${luogo || "luogo da indicare a cura delle parti"}.`,
    "## Corrispettivo\nIl corrispettivo e le scadenze di pagamento sono quelli indicati nel riquadro «Corrispettivo e pagamenti». I prezzi delle singole lavorazioni sono quelli dell'Allegato A.",
    `## Tempi di esecuzione\n${tempi}`,
  ].join("\n\n");
}
