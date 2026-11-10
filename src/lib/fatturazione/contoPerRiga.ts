/**
 * Il conto di costo riga per riga di una fattura ricevuta (10/11/2026).
 *
 * Una fattura d'acquisto mette insieme costi diversi (calcestruzzo e pompaggio, materie prime e
 * trasporto, consumo e attrezzature). Il conto scelto per una riga sta in
 * `fatture_ricevute.conti_righe` ({"numero riga": "categoria"}); le righe senza voce seguono il
 * «Conto di costo» della fattura. La scrittura contabile li divide (contabilita_righe_costo).
 *
 * Modulo puro: niente React, niente Supabase.
 */

/** Le categorie di base, per l'azienda che non ne ha create di sue (nomi della classificazione automatica). */
export const CATEGORIE_DI_BASE = [
  "materiali", "materie_prime", "materiali_edili", "materiali_di_consumo", "attrezzature", "subappalti",
  "consulenze_professionali", "noli_attrezzature", "carburanti", "trasporti", "utenze", "manutenzioni",
  "assicurazioni", "affitti", "servizi_generali", "provvigioni", "personale", "tasse_imposte", "spese_bancarie", "altro",
];

/** «materiali_di_consumo» → «Materiali di consumo». */
export function etichettaCategoria(c: string): string {
  const t = c.replace(/_/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : c;
}

/** La chiave di una riga: il numero di riga dell'XML, altrimenti la posizione (da 1). Come la scrittura contabile. */
export function chiaveRiga(r: { numero_linea?: unknown } | null | undefined, indice: number): string {
  const n = r?.numero_linea;
  return n != null && String(n).trim() !== "" ? String(n).trim() : String(indice + 1);
}

/** Le parole delle righe e il conto che suggeriscono. L'ordine conta: «pompaggio calcestruzzo» è un nolo. */
const REGOLE: Array<[RegExp, string]> = [
  [/\b(pompagg|autopompa|betonpompa|piazzamento|pompa\b|nolegg|nolo\b|noli\b|gru\b|piattaforma)/i, "noli_attrezzature"],
  [/\b(trasport|spedizion|consegna|porto\b|autotrasp|viaggio)/i, "trasporti"],
  [/\b(gasolio|benzina|carburant|lubrificant|adblue)/i, "carburanti"],
  [/\b(disco|dischi|seghett|tenagli|cacciavit|badile|pala\b|carriola|doppiometr|metro\b|trapano|martell|utensil|chiave\b|livella|frattazz|cazzuol|secchio|spatol|flessibil|smerigliatr|pennarell|matita|staggia)/i, "attrezzature"],
  [/\b(crema|spray|silicon|nastro|fascett|filo|vit[ei]\b|tassell|distanziator|cubier|smusso|tapp[oi]|polvere|guant|batteri|colla|schiuma|sigillant|disarmant|chiod|graff|stracci|sacch[ie]tti|pulizi)/i, "materiali_di_consumo"],
  [/\b(cls|calcestr|cemento|ferro|acciaio|tondo|tondin|rete\b|elettrosaldat|laterizi|mattoni|blocchi|pignatt|travett|sabbia|ghiaia|inerti|malta|massetto|calce|gesso|cartongesso|isolant|guaina|tubo|tubi\b|pvc\b|legname|tavol[ei]|pannell)/i, "materie_prime"],
];

/**
 * Il conto proposto per una riga dalla sua descrizione, se fra quelli disponibili.
 * Con le categorie proprie dell'azienda si propone solo quando una ha lo stesso nome.
 */
export function contoPropostoRiga(descrizione: string | null | undefined, disponibili: readonly string[]): string | null {
  const d = (descrizione ?? "").trim();
  if (!d) return null;
  const perNome = new Map(disponibili.map((c) => [c.toLowerCase(), c]));
  for (const [re, conto] of REGOLE) {
    if (re.test(d)) return perNome.get(conto) ?? (conto === "materie_prime" ? perNome.get("materiali") ?? null : null);
  }
  return null;
}
