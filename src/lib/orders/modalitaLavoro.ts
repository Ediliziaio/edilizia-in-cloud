/**
 * Come si lavora una commessa: `orders.modalita_lavoro` (migrazione 20290630180000).
 *
 * Fino al 28/11/2026 l'app indovinava come si misura una commessa da quello che le trovava
 * attaccato — le voci del computo, il contratto d'appalto — e nel caso «computo da seguire più gli
 * extra in economia» non sapeva quale documento proporre. Adesso la modalità è scritta sulla
 * commessa, e queste funzioni dicono che cosa proporre.
 *
 * Regola da tenere: la modalità **aggiunge** viste, non le toglie. Al 28/11/2026 ci sono 147
 * commesse `semplice` con un SAL verbale già emesso: il SAL a percentuale sulle fasi lo usa anche
 * chi non ha un computo, e nascondergli la vista gli farebbe sparire documenti veri.
 */
export const MODALITA_LAVORO = [
  {
    value: "semplice",
    label: "Acconto e saldo",
    description: "Si fattura secondo le rate concordate. È il modo di partenza.",
  },
  {
    value: "computo",
    label: "A computo",
    description: "Si misura sulle voci del computo e si fattura il SAL.",
  },
  {
    value: "economia",
    label: "In economia",
    description: "Si lavora a listino e si fattura il rendiconto del periodo.",
  },
  {
    value: "computo_ed_economia",
    label: "Computo più extra in economia",
    description: "Il computo si fattura col SAL; il rendiconto porta solo i lavori extra.",
  },
] as const;

export type ModalitaLavoro = typeof MODALITA_LAVORO[number]["value"];

export function etichettaModalita(modalita: string | null | undefined): string {
  return MODALITA_LAVORO.find((m) => m.value === modalita)?.label ?? MODALITA_LAVORO[0].label;
}

export function modalitaValida(valore: string | null | undefined): ModalitaLavoro {
  return MODALITA_LAVORO.some((m) => m.value === valore) ? (valore as ModalitaLavoro) : "semplice";
}

/** La commessa si misura, in tutto o in parte, sulle voci del computo. */
export function siMisuraSulComputo(modalita: string | null | undefined): boolean {
  const m = modalitaValida(modalita);
  return m === "computo" || m === "computo_ed_economia";
}

/** La commessa ha una parte da rendicontare a listino (tutto il lavoro, o i soli extra). */
export function siRendicontaAListino(modalita: string | null | undefined): boolean {
  const m = modalitaValida(modalita);
  return m === "economia" || m === "computo_ed_economia";
}

/**
 * Il rendiconto del periodo al committente.
 *
 * Il contenuto della vista ha bisogno del contratto d'appalto e del committente, quindi `inAppalto`
 * resta la condizione: una vista che si apre vuota è peggio di una vista che non c'è. La modalità
 * serve a togliere il rendiconto dove il titolare ha detto che non si usa — una commessa in appalto
 * dichiarata «a computo» si fattura col SAL (decisione del 28/11/2026) — e non ad aggiungerlo dove
 * non funzionerebbe. Una commessa ancora al valore di partenza si comporta come prima.
 *
 * Quando il rendiconto saprà stare anche fuori dall'appalto, qui cadrà `inAppalto` e resterà la
 * modalità; `rendicontiEsistenti` è già qui per non far sparire un documento scritto.
 */
export function mostraRendicontoAlCommittente(p: {
  modalita: string | null | undefined;
  inAppalto: boolean;
  rendicontiEsistenti?: number;
}): boolean {
  if ((p.rendicontiEsistenti ?? 0) > 0) return true;
  if (!p.inAppalto) return false;
  return modalitaValida(p.modalita) === "semplice" || siRendicontaAListino(p.modalita);
}
