/**
 * Automazioni: «Crea o aggiorna opportunità».
 *
 * Un contatto che fa di nuovo richiesta rientra nello stesso flusso. Prima
 * l'azione provava a creare un'opportunità nuova, il database la scartava
 * perché ce n'era già una aperta, e chi il flusso aveva scelto (venditore,
 * call center) andava perso: Marcella Martinucci (BeMade, 14/09) è tornata in
 * «Da Chiamare» senza nessuno. Allora l'opportunità aperta si aggiornava come
 * diceva il flusso: fase e assegnazione di oggi.
 *
 * 18/09/2026: era troppo. La scheda tornava in «Da Chiamare» da qualunque
 * fase — «Non risponde 3», «Standby», perfino un appuntamento fissato — e
 * cambiava di mano, ogni volta che quella persona ricompilava il modulo (i
 * caroselli Meta la fanno compilare più volte). Venusia e Antonella (BeMade)
 * si sono ritrovate in «Da Chiamare» contatti che avevano appena classificato.
 * Ora la scheda NON si muove e non cambia di mano: resta dov'è, con la data
 * dell'ultima attività aggiornata, il badge «Di nuovo» sulla scheda, una nota
 * e un avviso a chi la segue. Quando decidere di richiamare è di chi chiama.
 *
 * Qui solo le parti senza database, provate a parte.
 */

export interface DatiNotaAggiornamento {
  flusso?: string | null;
  /** Dove sta la scheda (e dove resta). */
  fasePrima?: string | null;
  /** Dove l'avrebbe messa il flusso: si scrive solo per dire che non ce l'ha portata. */
  faseFlusso?: string | null;
  venditore?: string | null;
  callCenter?: string | null;
  arretrato?: boolean;
}

export function testoNotaAggiornamento(d: DatiNotaAggiornamento): string {
  const origine = d.flusso ? `L'automazione «${d.flusso}»` : "L'automazione";
  const dove = d.fasePrima ?? d.faseFlusso ?? null;
  const parti: string[] = [];
  if (d.fasePrima && d.faseFlusso && d.fasePrima !== d.faseFlusso) {
    parti.push(
      `${origine} ha ritrovato questa opportunità aperta in «${d.fasePrima}» e l'ha lasciata lì: non la riporta in «${d.faseFlusso}» e non ne crea un'altra.`,
    );
  } else {
    parti.push(`${origine} ha ritrovato questa opportunità aperta${dove ? ` in «${dove}»` : ""}: non ne ha creata un'altra.`);
  }
  const assegnazioni = [
    d.venditore ? `venditore ${d.venditore}` : null,
    d.callCenter ? `call center ${d.callCenter}` : null,
  ].filter(Boolean);
  if (assegnazioni.length > 0) parti.push(`Non era di nessuno: l'ha presa ${assegnazioni.join(", ")}.`);
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

/**
 * Il nome dell'opportunità dopo le variabili (19/09/2026). Un modello come
 * «{{contatto.full_name}} · {{settore}}» con il settore vuoto lasciava
 * «Mario Rossi ·»: i separatori rimasti in testa o in coda si tolgono.
 */
export function nomeOpportunitaPulito(risolto: string | null | undefined, ripiego = "Nuova Opportunità"): string {
  const pulito = String(risolto ?? "")
    .replace(/^[\s·•|,;:–—-]+/u, "")
    .replace(/[\s·•|,;:–—-]+$/u, "")
    .trim();
  return pulito || ripiego;
}
