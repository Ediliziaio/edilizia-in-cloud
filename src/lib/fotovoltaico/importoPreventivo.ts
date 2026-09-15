/**
 * Prezzo e IVA del preventivo fotovoltaico, anche senza listino.
 *
 * Un'azienda può preventivare senza aver caricato i prezzi: scrive il prezzo a
 * corpo. Il totale IVA inclusa però lo scrive solo il calcolo finanziario, e su
 * una bozza non ancora ricalcolata elenco e scheda mostravano 0 €.
 *
 * L'aliquota la sceglie chi prepara il preventivo. Prima nessuna schermata la
 * scriveva: valeva sempre il 10%, anche per un capannone.
 */

export const ALIQUOTE_IVA_FV = [
  { valore: 0.1, etichetta: "10%", nota: "abitazioni" },
  { valore: 0.22, etichetta: "22%", nota: "aziende, capannoni, uffici" },
  { valore: 0.04, etichetta: "4%", nota: "casi agevolati" },
  { valore: 0, etichetta: "0%", nota: "esente o inversione contabile" },
] as const;

const IVA_PREDEFINITA = 0.1;

/**
 * `fv_progetti.iva_aliquota` è una frazione (0,10 = 10%). Una percentuale (10)
 * si converte; lo 0 è un'aliquota vera e resta 0.
 */
export function aliquotaIvaFv(valore: unknown): number {
  if (valore == null || valore === "") return IVA_PREDEFINITA;
  const n = Number(valore);
  if (!Number.isFinite(n) || n < 0) return IVA_PREDEFINITA;
  const frazione = n > 1 ? n / 100 : n;
  return Math.round(frazione * 10000) / 10000;
}

/** 0,10 → 10 */
export function percentualeIvaFv(valore: unknown): number {
  return Math.round(aliquotaIvaFv(valore) * 10000) / 100;
}

/** IVA di partenza dal tipo di immobile: chi preventiva la può cambiare. */
export function ivaSuggeritaPerTipologia(tipologia: string | null | undefined): number {
  return !tipologia || tipologia === "residenziale" ? 0.1 : 0.22;
}

function positivo(valore: unknown): number | null {
  if (valore == null || valore === "") return null;
  const n = Number(valore);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export interface ImportoPreventivoFvInput {
  prezzo_vendita_iva_inclusa?: number | string | null;
  prezzo_vendita_manuale?: number | string | null;
  kit_bundle_id?: string | null;
  kit_prezzo?: number | string | null;
  iva_aliquota?: number | string | null;
}

/**
 * Importo IVA inclusa da mostrare in elenco e scheda.
 *
 * Il prezzo a corpo vince: il calcolo lo usa così com'è (lo sconto non si
 * applica), quindi il totale è già noto anche prima di ricalcolare. Poi il
 * totale calcolato, che per un kit tiene conto dello sconto; il prezzo del kit
 * solo se il calcolo non è mai partito.
 */
export function importoPreventivoFv(p: ImportoPreventivoFvInput): number | null {
  const ivato = (imponibile: number) =>
    Math.round(imponibile * (1 + aliquotaIvaFv(p.iva_aliquota)) * 100) / 100;

  const manuale = p.kit_bundle_id ? null : positivo(p.prezzo_vendita_manuale);
  if (manuale != null) return ivato(manuale);

  const calcolato = positivo(p.prezzo_vendita_iva_inclusa);
  if (calcolato != null) return calcolato;

  const kit = p.kit_bundle_id ? positivo(p.kit_prezzo) : null;
  if (kit != null) return ivato(kit);

  return p.prezzo_vendita_iva_inclusa == null ? null : 0;
}

/**
 * Da chiedere prima di emettere: niente kit, niente prezzo a corpo e componenti
 * tutti a 0 € (listino vuoto). Il totale sarebbe di sole pratiche e posa.
 * Non è un blocco: senza listino si preventiva, basta scrivere il prezzo.
 */
export function mancaPrezzoDiVendita(input: {
  kit_bundle_id?: string | null;
  prezzo_vendita_manuale?: number | null;
  costo_componenti_vendita?: number | null;
}): boolean {
  if (input.kit_bundle_id) return false;
  if (positivo(input.prezzo_vendita_manuale) != null) return false;
  if (input.costo_componenti_vendita == null) return false;
  const componenti = Number(input.costo_componenti_vendita);
  return Number.isFinite(componenti) && componenti <= 0;
}
