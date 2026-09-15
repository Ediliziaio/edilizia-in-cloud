/**
 * Automazioni: «Crea o aggiorna opportunità».
 *
 * Un contatto che fa di nuovo richiesta rientra nello stesso flusso. Prima
 * l'azione provava a creare un'opportunità nuova, il database la scartava
 * perché ce n'era già una aperta, e chi il flusso aveva scelto (venditore,
 * call center) andava perso: Marcella Martinucci (BeMade, 14/09) è tornata in
 * «Da Chiamare» senza nessuno. Ora l'opportunità aperta si aggiorna come dice
 * il flusso: fase e assegnazione di oggi, anche se prima c'era qualcun altro,
 * perché il flusso è la regola che vale adesso.
 *
 * Qui solo le parti senza database, provate a parte.
 */

export interface DatiNotaAggiornamento {
  flusso?: string | null;
  fasePrima?: string | null;
  faseDopo?: string | null;
  venditore?: string | null;
  callCenter?: string | null;
  arretrato?: boolean;
}

export function testoNotaAggiornamento(d: DatiNotaAggiornamento): string {
  const origine = d.flusso ? `L'automazione «${d.flusso}»` : "L'automazione";
  const parti: string[] = [];
  if (d.faseDopo && d.fasePrima && d.fasePrima !== d.faseDopo) {
    parti.push(`${origine} ha ritrovato questa opportunità aperta e l'ha riportata in «${d.faseDopo}» (era in «${d.fasePrima}»).`);
  } else {
    parti.push(`${origine} ha ritrovato questa opportunità aperta${d.faseDopo ? ` in «${d.faseDopo}»` : ""}: non ne ha creata un'altra.`);
  }
  const assegnazioni = [
    d.venditore ? `venditore ${d.venditore}` : null,
    d.callCenter ? `call center ${d.callCenter}` : null,
  ].filter(Boolean);
  if (assegnazioni.length > 0) parti.push(`Assegnata come da flusso: ${assegnazioni.join(", ")}.`);
  if (d.arretrato) parti.push("Richiesta recuperata dallo storico: non è un contatto di oggi.");
  return parti.join(" ");
}

/** Chi avvisare: senza vuoti né doppioni (la stessa persona venditore e call center). */
export function personeDaAvvisare(ids: Array<string | null | undefined>): string[] {
  return Array.from(new Set(ids.filter((id): id is string => typeof id === "string" && id.trim() !== "")));
}

/** Etichette unite, senza doppioni né vuoti. */
export function tagsUniti(esistenti: string[] | null | undefined, nuove: string[] | null | undefined): string[] {
  return Array.from(new Set([...(esistenti ?? []), ...(nuove ?? [])].map((t) => String(t).trim()).filter(Boolean)));
}
