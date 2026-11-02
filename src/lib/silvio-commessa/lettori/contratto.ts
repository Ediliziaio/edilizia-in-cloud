/**
 * Lettore del contratto scritto nell'app (31/10/2026, fase 3, lotto 3.3): una riga di
 * `contratti_documents` («Crea la commessa da questo contratto»).
 *
 * Le colonne del contratto sono già dati: importo, inizio e fine, durata, penale, garanzia,
 * committente, oggetto, cantiere. Si copiano a regole, senza AI e senza costo; la fonte è il
 * contratto, la più fidata dopo una persona (sezione 3.3 del piano).
 */
import type { CondizioniContratto, Frammento } from "../../../../shared/silvio-commessa/piano.ts";
import { colonne, metti, nuovoFrammento, numero, testo } from "./comuni";

/** Le colonne di `contratti_documents` che il lettore usa. */
export const COLONNE_CONTRATTO = "id, order_id, numero_contratto, status, committente_nome, committente_indirizzo, committente_pi, committente_cf, oggetto_lavori, ubicazione_cantiere, importo_totale_eur, data_inizio_lavori, data_fine_prevista, durata_giorni, penale_ritardo_eur_giorno, garanzia_anni";

const data = (v: unknown) => {
  const s = testo(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

const SOCIETA = /\b(s\.?r\.?l|s\.?p\.?a|s\.?n\.?c|s\.?a\.?s|s\.?c\.?a\.?r\.?l|cooperativa|condominio|comune|azienda|impresa|societ[aà]|consorzio|fondazione|associazione|parrocchia|ente)\b/i;

export function frammentoDaContratto(c: Record<string, unknown>): Frammento {
  const numeroContratto = testo(c.numero_contratto);
  const fr = nuovoFrammento({
    tipo: "contratto", id: testo(c.id) || null,
    etichetta: numeroContratto ? `contratto ${numeroContratto}` : "contratto dell'app", dove: null,
  });
  const firmato = /firmat|approvat|sottoscritt/i.test(testo(c.status));
  // Un contratto in bozza dice cose vere, ma non ancora firmate: proposte, non fatti.
  const opz = (dove: string) => (firmato ? { dove } : { dove, stato: "proposta" as const, fiducia: 0.85, nota: "Dal contratto non ancora firmato." });

  metti(fr, "identita.description", testo(c.oggetto_lavori).slice(0, 200), opz("oggetto dei lavori"));
  // Il committente è una persona, salvo che abbia la partita IVA o il nome da società (revisione 2/11, G13).
  const committente = testo(c.committente_nome);
  const societa = !!testo(c.committente_pi) || SOCIETA.test(committente);
  metti(fr, "cliente.nome", colonne(societa ? { client_company: committente } : { client_name: committente }), opz("committente"));
  metti(fr, "cliente.client_address", testo(c.committente_indirizzo), opz("committente"));
  metti(fr, "cantiere.indirizzo", colonne({ indirizzo_lavori: testo(c.ubicazione_cantiere) }), opz("ubicazione del cantiere"));
  const importo = numero(c.importo_totale_eur);
  if (importo != null && importo > 0) metti(fr, "economia.total_amount", importo, opz("importo dei lavori"));
  metti(fr, "fasi.work_start_date", data(c.data_inizio_lavori), opz("inizio dei lavori"));
  metti(fr, "fasi.work_end_date", data(c.data_fine_prevista), opz("fine prevista"));

  const condizioni: CondizioniContratto = {};
  if (numeroContratto) condizioni.numero_contratto = numeroContratto;
  const durata = numero(c.durata_giorni);
  if (durata != null && durata > 0) condizioni.durata_giorni = durata;
  const penale = numero(c.penale_ritardo_eur_giorno);
  if (penale != null && penale > 0) condizioni.penale_giorno_eur = penale;
  const garanzia = numero(c.garanzia_anni);
  if (garanzia != null && garanzia > 0) condizioni.garanzia_anni = garanzia;
  // Solo il numero non è una condizione: il contratto c'è già, non se ne fa un altro.
  if (Object.keys(condizioni).some((k) => k !== "numero_contratto")) {
    metti(fr, "economia.condizioni_contratto", condizioni, opz("condizioni"));
  }
  return fr;
}
