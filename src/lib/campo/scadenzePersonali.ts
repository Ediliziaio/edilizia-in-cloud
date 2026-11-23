import { calcStato } from "@/types/hrDocumenti";

/**
 * Le scadenze personali da avvisare in Home (collaudo 23/11/2026): visita medica, corsi, patentini.
 * La pagina Documenti le mostrava già, ma solo a chi la apriva. Stessa regola dell'ufficio e del cron
 * (`calcStato`, soglia = `alert_giorni_prima` del documento). Prima gli scaduti, poi i più vicini.
 */
export interface DocumentoConScadenza {
  id: string;
  categoria: string;
  titolo: string | null;
  data_scadenza: string | null;
  alert_giorni_prima: number | null;
}

export interface ScadenzaDaAvvisare extends DocumentoConScadenza {
  stato: "scaduto" | "in_scadenza";
}

export function scadenzeDaAvvisare(documenti: readonly DocumentoConScadenza[]): ScadenzaDaAvvisare[] {
  return documenti
    .map(d => ({ ...d, stato: calcStato(d.data_scadenza, d.alert_giorni_prima) }))
    .filter((d): d is ScadenzaDaAvvisare => d.stato === "scaduto" || d.stato === "in_scadenza")
    .sort((a, b) => (a.stato === b.stato ? String(a.data_scadenza).localeCompare(String(b.data_scadenza)) : a.stato === "scaduto" ? -1 : 1));
}
