/**
 * Coerenza tra le scelte del form piscina.
 *
 * Il form lascia combinare liberamente tipologia, forma, sistema di bordo,
 * rivestimento e colore dell'acqua, e i valori di partenza sono «Rettangolare» e
 * «Skimmer»: chi sceglie solo la tipologia «Interrata a sfioro» o «Forma libera»
 * manda al modello due istruzioni opposte («rectangular overflow pool…» insieme a
 * «skimmer: no overflow behavior»). Qui si decide chi vince, una volta per tutte:
 * prompt, foto di riferimento e avvisi del form leggono queste funzioni.
 *
 * Regola: vince la scelta più specifica del prodotto. La tipologia vince su forma
 * e sistema di bordo; il rivestimento (il materiale che si compra e che si vede
 * attraverso l'acqua) vince sul colore «percepito» dell'acqua.
 */

/** Tipologie che per nome sono rettangolari. */
const TIPI_RETTANGOLARI = ["interrata_rettangolare", "sfioro_rettangolare"];

/** Sistema di bordo coerente con la tipologia; se non c'è contraddizione resta quello scelto. */
export function sistemaBordoEffettivo(tipo: string | null | undefined, sistema: string | null | undefined): string {
  const s = sistema || "skimmer";
  if (tipo === "sfioro_rettangolare" && s === "skimmer") return "sfioro";
  if (tipo === "infinity_pool" && s === "skimmer") return "infinity_edge";
  return s;
}

/** Forma coerente con la tipologia; se non c'è contraddizione resta quella scelta. */
export function formaEffettiva(tipo: string | null | undefined, forma: string | null | undefined): string {
  const f = forma || "rettangolare";
  if (TIPI_RETTANGOLARI.includes(tipo ?? "") && f === "organica") return "rettangolare";
  if (tipo === "lap_pool" && (f === "organica" || f === "compatta")) return "stretta_lunga";
  if (tipo === "interrata_organica" && (f === "rettangolare" || f === "stretta_lunga" || f === "a_l")) return "organica";
  return f;
}

/** Rivestimenti scuri: l'acqua sopra di loro è scura, mai chiara o turchese. */
const RIVESTIMENTI_SCURI = ["mosaico_antracite", "liner_scuro"];
const ACQUE_CHIARE = ["cristallina_chiara", "azzurra_classica", "turchese", "sabbia_chiara"];
/** Rivestimenti chiari: l'acqua sopra di loro non può sembrare blu profondo. */
const RIVESTIMENTI_CHIARI = ["mosaico_bianco", "liner_chiaro", "gres_effetto_sabbia"];
const ACQUE_SCURE = ["blu_profondo"];

/**
 * Il colore dell'acqua scelto è fisicamente impossibile sopra questo rivestimento?
 * (Un liner scuro non dà acqua turchese; un mosaico bianco non dà blu profondo.)
 * Il default del form (mosaico grigio + cristallina chiara) è compatibile.
 */
export function acquaIncompatibileConRivestimento(
  rivestimento: string | null | undefined,
  coloreAcqua: string | null | undefined,
): boolean {
  if (!rivestimento || !coloreAcqua) return false;
  return (RIVESTIMENTI_SCURI.includes(rivestimento) && ACQUE_CHIARE.includes(coloreAcqua))
    || (RIVESTIMENTI_CHIARI.includes(rivestimento) && ACQUE_SCURE.includes(coloreAcqua));
}

/** Tipologie interrate per nome: con loro «semi-incassata» e «fuori terra» sono una contraddizione. */
const TIPI_INTERRATI = [
  "interrata_rettangolare",
  "interrata_organica",
  "lap_pool",
  "plunge_pool",
  "sfioro_rettangolare",
  "infinity_pool",
  "biopiscina",
];

/** Tipologie che nel prompt hanno già la relazione «above-ground / semi-inground» (come isAboveGround dell'edge). */
export const TIPI_RIALZATI = ["fuori_terra_premium", "semi_incassata", "terrazzo_compatta", "minipiscina"];

/**
 * Quota del bordo da dire nel prompt, o null. «A filo terreno» (il default) non aggiunge
 * niente; una quota che contraddice la tipologia (interrata «fuori terra», fuori terra
 * «a filo») si tace: vince la tipologia, e il form lo segnala.
 */
export function quotaBordoEffettiva(tipo: string | null | undefined, quota: string | null | undefined): string | null {
  if (!quota || quota === "a_filo_terreno") return null;
  if (!["leggermente_rialzata", "semi_incassata", "fuori_terra"].includes(quota)) return null;
  const t = tipo ?? "";
  if (TIPI_INTERRATI.includes(t) && (quota === "semi_incassata" || quota === "fuori_terra")) return null;
  if (t === "fuori_terra_premium" && quota !== "fuori_terra") return null;
  if (t === "semi_incassata" && quota === "fuori_terra") return null;
  return quota;
}

/** La vasca ha pareti a vista sopra il terreno (quindi un rivestimento esterno che si vede)? */
export function vascaRialzata(tipo: string | null | undefined, quota: string | null | undefined): boolean {
  const q = quotaBordoEffettiva(tipo, quota);
  return (TIPI_RIALZATI.includes(tipo ?? "") && tipo !== "minipiscina")
    || q === "semi_incassata" || q === "fuori_terra";
}

/**
 * Quota del bordo coerente con una tipologia appena scelta nel form: una «Fuori terra
 * premium» parte fuori terra, una «Semi-incassata» semi-incassata, un'interrata non
 * resta «fuori terra». Se la quota attuale va già bene resta quella.
 */
export function quotaBordoPerTipo(tipo: string | null | undefined, quota: string | null | undefined): string {
  const q = quota || "a_filo_terreno";
  if (tipo === "fuori_terra_premium") return "fuori_terra";
  if (tipo === "semi_incassata" && (q === "a_filo_terreno" || q === "fuori_terra")) return "semi_incassata";
  if (TIPI_INTERRATI.includes(tipo ?? "") && (q === "semi_incassata" || q === "fuori_terra")) return "a_filo_terreno";
  return q;
}
