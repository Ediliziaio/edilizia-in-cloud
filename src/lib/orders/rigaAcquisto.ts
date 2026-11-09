/**
 * Unità di misura e aliquote di una riga d'acquisto (09/11/2026).
 *
 * Erano due caselle da riempire a mano. L'IVA si batteva cifra per cifra — e
 * «22» battuto male diventa 2 — e l'unità scritta a mano aveva già prodotto
 * «ml» e «ML» nello stesso archivio. Ora sono due menu.
 *
 * Regola che vale per entrambi: quello che c'è scritto in una riga vecchia non
 * si perde mai. Se un'unità o un'aliquota non sono nell'elenco restano nel
 * menu, segnate come fuori elenco, finché qualcuno non sceglie altro.
 *
 * `breve` è quello che si legge nella casella, `nota` solo quando il menu è
 * aperto: nella colonna non c'è spazio per una frase.
 */

export interface OpzioneRiga {
  value: string;
  breve: string;
  nota?: string;
}

/** Le unità che si usano comprando: a pezzo, a peso, a misura, a corpo. */
export const UNITA_ACQUISTO: readonly OpzioneRiga[] = [
  { value: "pz", breve: "pz", nota: "pezzi" },
  { value: "ml", breve: "ml", nota: "metri lineari" },
  { value: "mq", breve: "mq", nota: "metri quadri" },
  { value: "mc", breve: "mc", nota: "metri cubi" },
  { value: "kg", breve: "kg", nota: "chilogrammi" },
  { value: "q", breve: "q", nota: "quintali" },
  { value: "t", breve: "t", nota: "tonnellate" },
  { value: "l", breve: "l", nota: "litri" },
  { value: "h", breve: "h", nota: "ore" },
  { value: "gg", breve: "gg", nota: "giornate" },
  { value: "kW", breve: "kW", nota: "chilowatt" },
  { value: "conf", breve: "conf", nota: "confezioni" },
  { value: "corpo", breve: "corpo", nota: "a corpo" },
];

/**
 * Le aliquote dell'acquisto. Lo zero non è «niente IVA»: è il caso che in
 * edilizia si incontra di più, l'inversione contabile del subappalto, dove
 * l'imposta la versa chi riceve la fattura.
 */
export const ALIQUOTE_ACQUISTO: readonly OpzioneRiga[] = [
  { value: "22", breve: "22%", nota: "ordinaria" },
  { value: "10", breve: "10%", nota: "ristrutturazioni e manutenzioni" },
  { value: "5", breve: "5%", nota: "ridotta" },
  { value: "4", breve: "4%", nota: "prima casa e beni finiti" },
  { value: "0", breve: "0%", nota: "inversione contabile o esente" },
];

/** «22.00» e «22» sono la stessa aliquota: nel menu dev'essere una voce sola. */
export function aliquotaNormalizzata(
  valore: string | number | null | undefined,
): string {
  const n = Number(valore);
  if (!Number.isFinite(n)) return "";
  // Le aliquote si scrivono 22, non 22,00; i centesimi restano se ci sono.
  return String(Math.round(n * 100) / 100);
}

/** «ML» e «ml» sono la stessa unità: si tiene la forma dell'elenco. */
export function unitaNormalizzata(valore: string | null | undefined): string {
  const v = (valore ?? "").trim();
  if (!v) return "";
  const nota = UNITA_ACQUISTO.find(
    (u) => u.value.toLowerCase() === v.toLowerCase(),
  );
  return nota ? nota.value : v;
}

function conIlValoreAttuale(
  elenco: readonly OpzioneRiga[],
  attuale: string,
  comeSiLegge: (v: string) => string,
): OpzioneRiga[] {
  if (!attuale || elenco.some((o) => o.value === attuale)) return [...elenco];
  // Una riga vecchia non deve cambiare da sola perché apriamo il menu.
  return [
    ...elenco,
    { value: attuale, breve: comeSiLegge(attuale), nota: "fuori elenco" },
  ];
}

/** Le unità da mostrare, tenendo quella già salvata anche se non è in elenco. */
export function opzioniUnita(attuale: string | null | undefined): OpzioneRiga[] {
  return conIlValoreAttuale(UNITA_ACQUISTO, unitaNormalizzata(attuale), (v) => v);
}

/** Le aliquote da mostrare, tenendo quella già salvata anche se non è in elenco. */
export function opzioniAliquota(
  attuale: string | number | null | undefined,
): OpzioneRiga[] {
  return conIlValoreAttuale(
    ALIQUOTE_ACQUISTO,
    aliquotaNormalizzata(attuale),
    (v) => `${v}%`,
  );
}
