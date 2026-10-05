/**
 * Voci di listino: come si leggono costo, unità e aliquota.
 *
 * COSTO DI UNA TARIFFA (tariffe_aziendali). Il costo sta in TRE colonne, nate
 * in momenti diversi: `prezzo_costo` (la prima, legacy), `costo_interno`
 * (FASE 6) e `costo_default` (varianti costo, Sprint B). Le scritture recenti
 * le riempiono tutte e tre con lo stesso valore; le righe vecchie e gli import
 * ne riempiono una sola. E `costo_interno` e `prezzo_costo` hanno DEFAULT 0
 * nel database: lo 0 spesso vuol dire «mai scritto», non «costa zero».
 * Al 05/10/2026, su 336 tariffe: 135 con costo_interno = 0 e il costo vero
 * solo in prezzo_costo, 62 il contrario, costo_default vuoto su 335.
 *
 * Ogni pagina sceglieva a modo suo (chi costo_default per primo, chi solo
 * prezzo_costo) e la stessa voce aveva costi diversi da una pagina all'altra.
 * Regola unica, nell'ordine della pagina Tariffe — costo_interno, prezzo_costo,
 * costo_default: vince il primo maggiore di zero; se nessuno lo è, il primo
 * numero valido (uno 0 scritto apposta resta 0); se non c'è niente, null.
 * Con «il primo numero valido» e basta, il DEFAULT 0 di costo_interno
 * vincerebbe sempre e prezzo_costo non verrebbe mai letto.
 *
 * UNITÀ. La colonna legacy `unita` ha un CHECK (pz/mq/ml/mc/h/piano/km/fisso)
 * che non conosce «gg», «kg» e «a_corpo»: chi salva li converte in h, pz e
 * fisso. Letta così, una tariffa a giornata sembrava a ore. L'unità vera è
 * `unita_fatturazione`; `unita` resta il ripiego per le righe che non l'hanno.
 * Stessa trappola del costo: «pz» è il DEFAULT di unita_fatturazione, e chi
 * scriveva solo la legacy lì lasciava «pz». Al 05/10/2026 erano 35 tariffe
 * (p.es. «Posa pavimento gres» con legacy mq e unita_fatturazione pz): se la
 * legacy dice altro, l'unità vera è la sua.
 *
 * Tutto puro: niente rete, niente database, verificabile dai test.
 */

type Numerico = number | string | null | undefined;

/** Le tre colonne del costo di una tariffa: tutte facoltative, come arrivano. */
export interface CostiTariffa {
  costo_interno?: Numerico;
  prezzo_costo?: Numerico;
  costo_default?: Numerico;
}

function numero(v: Numerico): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Il primo valore maggiore di zero; altrimenti il primo numero valido; altrimenti null. */
export function primoCosto(...valori: Numerico[]): number | null {
  const numeri = valori.map(numero).filter((n): n is number => n !== null);
  return numeri.find((n) => n > 0) ?? numeri[0] ?? null;
}

/** Costo unitario di una tariffa (vedi la regola in testa al file). null = non si conosce. */
export function costoTariffa(t: CostiTariffa | null | undefined): number | null {
  if (!t) return null;
  return primoCosto(t.costo_interno, t.prezzo_costo, t.costo_default);
}

/**
 * Unità di una tariffa: unita_fatturazione, poi la legacy `unita`, poi
 * `ripiego`. Un «pz» in unita_fatturazione smentito dalla legacy è il DEFAULT
 * mai sovrascritto, e vince la legacy (vedi testa del file). La legacy
 * «fisso» si legge col nome canonico «a_corpo».
 */
export function unitaTariffa(
  t: { unita_fatturazione?: string | null; unita?: string | null } | null | undefined,
  ripiego = "pz",
): string {
  const fatturazione = t?.unita_fatturazione?.trim() || null;
  const grezza = t?.unita?.trim() || null;
  const legacy = grezza === "fisso" ? "a_corpo" : grezza;
  if (fatturazione && !(fatturazione === "pz" && legacy && legacy !== "pz")) return fatturazione;
  return legacy ?? ripiego;
}

/**
 * Costo di un articolo legacy (article_templates): prezzo_acquisto_netto, poi
 * standard_cost, con la stessa regola delle tariffe — anche
 * prezzo_acquisto_netto ha DEFAULT 0 e da solo nasconderebbe standard_cost.
 */
export function costoArticolo(
  a: { prezzo_acquisto_netto?: Numerico; standard_cost?: Numerico } | null | undefined,
): number {
  return primoCosto(a?.prezzo_acquisto_netto, a?.standard_cost) ?? 0;
}

/** Aliquota IVA valida (0..100), altrimenti `ripiego`. */
export function aliquotaValida(v: Numerico, ripiego = 22): number {
  const n = numero(v);
  return n !== null && n >= 0 && n <= 100 ? n : ripiego;
}

/**
 * L'aliquota che hanno in comune tutte le voci, o `ripiego` se discordano o
 * se non ce n'è nessuna. Serve alle righe senza un'aliquota propria (il kit a
 * prezzo unico, una tariffa sciolta in un pacchetto): prendono quella dei
 * prodotti con cui viaggiano solo se è una sola, perché fra due aliquote
 * diverse scegliere sarebbe inventare. Una voce senza aliquota valida conta
 * come `ripiego`, la stessa che riceverebbe sulla sua riga.
 */
export function aliquotaComune(aliquote: Numerico[], ripiego = 22): number {
  if (aliquote.length === 0) return ripiego;
  const valide = aliquote.map((a) => aliquotaValida(a, ripiego));
  return valide.every((a) => a === valide[0]) ? valide[0] : ripiego;
}
