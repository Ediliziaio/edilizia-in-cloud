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

/** Un conto del piano, quanto basta per riconoscerlo dalla descrizione. */
export interface ContoDelPianoPerProposta { id: string; descrizione: string }
/** Una fattura passata dello stesso fornitore: le sue righe col conto che hanno avuto (null = nessuno). */
export interface FatturaStorica { righe: Array<{ descrizione: string; conto: string | null }> }

/** I codici di un testo (contratto, targa, matricola): almeno 5 caratteri, almeno una cifra, non un anno. */
export function codiciDi(testo: string): string[] {
  return Array.from(new Set((testo.toUpperCase().match(/[A-Z0-9]{5,}/g) ?? []).filter((t) => /\d/.test(t) && !/^\d{4}$/.test(t))));
}
/** La descrizione senza numeri, date e punteggiatura: «Canone rata 12 del 01/10» = «canone rata del». */
function normalizza(testo: string): string {
  return testo.toLowerCase().replace(/[0-9]+/g, " ").replace(/[^a-zàèéìòù ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}
/** Una riga che è il canone del contratto (non l'assicurazione, gli interessi, le spese). */
const CANONE = /\b(canon[ei]|locazione finanziaria|leasing|rata\b)/i;

/**
 * Il conto del piano proposto per ogni riga di una fattura ricevuta (11/11/2026). In ordine:
 *  1. un codice della riga (il numero del contratto, una targa) che compare nella descrizione di
 *     un solo conto: «N. ctr:QX7T41058 … Canone» → «CANONE LEASING CONTRATTO QX7T41058»;
 *  2. la «fattura gemella»: fra le fatture passate dello stesso fornitore, quella con le righe più
 *     simili (due contratti con la stessa banca si distinguono da quali righe hanno), e da lei il
 *     conto della riga con la stessa descrizione (numeri e date a parte);
 *  3. per la riga del canone, un codice dei riferimenti della fattura (contratto nell'XML) che
 *     compare in un solo conto;
 *  4. la stessa descrizione in tutte le fatture del fornitore, se ha avuto sempre lo stesso conto;
 *  5. il conto unico del fornitore, se gliene è sempre andato uno solo.
 * Restituisce {chiave riga: "conto:<id>"}; le righe senza proposta non ci sono.
 */
export function proposteDalPiano({ righe, riferimenti = "", conti, storico }: {
  righe: ReadonlyArray<{ chiave: string; descrizione: string | null }>;
  /** Testo dei riferimenti della fattura (contratto, ordine): codici validi per la riga del canone. */
  riferimenti?: string;
  conti: readonly ContoDelPianoPerProposta[];
  /** Fatture passate dello stesso fornitore, dalla più recente. */
  storico: readonly FatturaStorica[];
}): Record<string, string> {
  const esistenti = new Set(conti.map((c) => `conto:${c.id}`));
  const contoDelCodice = (codici: string[]): string | null => {
    for (const codice of codici) {
      const trovati = conti.filter((c) => codiciDi(c.descrizione).includes(codice));
      if (trovati.length === 1) return `conto:${trovati[0].id}`;
    }
    return null;
  };
  const passate = storico
    .map((f) => ({ righe: f.righe.filter((r) => r.conto && esistenti.has(r.conto)).map((r) => ({ n: normalizza(r.descrizione), conto: r.conto! })), tutte: new Set(f.righe.map((r) => normalizza(r.descrizione))) }))
    .filter((f) => f.righe.length > 0);

  // 2. La gemella: più descrizioni in comune (Jaccard), a parità la più recente.
  const firma = new Set(righe.map((r) => normalizza(r.descrizione ?? "")));
  let gemella: (typeof passate)[number] | null = null;
  let migliore = 0;
  for (const f of passate) {
    const comuni = [...firma].filter((d) => f.tutte.has(d)).length;
    const punteggio = comuni / new Set([...firma, ...f.tutte]).size;
    if (punteggio > migliore + 1e-9) { migliore = punteggio; gemella = f; }
  }
  if (migliore < 0.5) gemella = null;

  // 4. Una descrizione che ha avuto sempre lo stesso conto.
  const perDescrizione = new Map<string, Set<string>>();
  for (const f of passate) for (const r of f.righe) {
    if (!perDescrizione.has(r.n)) perDescrizione.set(r.n, new Set());
    perDescrizione.get(r.n)!.add(r.conto);
  }
  const contiDelFornitore = new Set(passate.flatMap((f) => f.righe.map((r) => r.conto)));
  const codiciRiferimenti = codiciDi(riferimenti);

  const out: Record<string, string> = {};
  for (const r of righe) {
    const d = r.descrizione ?? "";
    const n = normalizza(d);
    const unicaDescrizione = perDescrizione.get(n);
    const proposta = contoDelCodice(codiciDi(d))
      ?? gemella?.righe.find((x) => x.n === n)?.conto
      ?? (CANONE.test(d) ? contoDelCodice(codiciRiferimenti) : null)
      ?? (unicaDescrizione?.size === 1 ? [...unicaDescrizione][0] : null)
      ?? (contiDelFornitore.size === 1 ? [...contiDelFornitore][0] : null);
    if (proposta) out[r.chiave] = proposta;
  }
  return out;
}

/**
 * Una riga può diventare un cespite? Non un canone, un noleggio, un leasing (il bene non è
 * dell'azienda finché non lo riscatta), una spesa o un servizio, né un importo sotto 516,46 €
 * (bene di costo unitario non superiore, deducibile tutto nell'anno).
 */
export function rigaPuoEssereCespite(descrizione: string | null | undefined, imponibile: number): boolean {
  if (!(imponibile > 516.46)) return false;
  return !/\b(canon[ei]|leasing|locazion|nolegg|nolo\b|noli\b|affitt|abbonament|spes[ae]\b|commission|interess|assicuraz|trasport|servizi|manodopera|consulenz|manutenz|riparaz|bollo|rata\b|rate\b)/i.test(descrizione ?? "");
}
