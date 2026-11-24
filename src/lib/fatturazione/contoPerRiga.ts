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
  "consulenze_professionali", "noli_attrezzature", "leasing", "carburanti", "trasporti", "utenze", "manutenzioni",
  "assicurazioni", "affitti", "servizi_generali", "provvigioni", "personale", "tasse_imposte", "spese_bancarie", "altro",
];

/**
 * I conti da salvare quando se ne aggiunge uno a mano (16/11/2026).
 *
 * Il menu mostra i conti dell'azienda se ne ha, altrimenti quelli di base: chi aggiungeva il
 * primo conto suo si ritrovava il menu con quella sola voce e tutte le altre sparite. Quindi
 * il primo si salva insieme ai conti di base, e da lì in poi si aggiunge e basta.
 * Il nome si confronta senza maiuscole e senza spazi ai lati: niente doppioni.
 */
export function contiDaCreare(nuovo: string, proprie: string[]): string[] {
  const nome = nuovo.trim();
  if (!nome) return [];
  const chiave = (x: string) => x.trim().toLowerCase();
  const viste = new Set(proprie.map(chiave));
  const fuori: string[] = [];
  for (const c of [...(proprie.length === 0 ? CATEGORIE_DI_BASE : []), nome]) {
    if (viste.has(chiave(c))) continue;
    viste.add(chiave(c));
    fuori.push(c.trim());
  }
  return fuori;
}

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

/**
 * Il conto proposto per una riga dalla sua descrizione (riscritto il 24/11/2026).
 *
 * Fino al 24/11 si provavano sei elenchi di parole in un ordine fisso e vinceva il primo che
 * trovava qualcosa in QUALUNQUE punto della descrizione. Misurato in produzione: «VITE MARTELLO
 * M8X40» finiva in attrezzature (per «martello»), «TURBOVITE POSA FIX» in nessun conto (la vite
 * dentro una parola composta non si vedeva), «IDROPITTURA - SECCHIO 14 L» in attrezzature (il
 * secchio), «FOLLETTO … PRONTA CONSEGNA» nei trasporti, «SPESA PER IL TRASPORTO DELL'ENERGIA
 * ELETTRICA» (439 righe) nei trasporti invece che nelle utenze, «POMPA DI CALORE» nei noli.
 *
 * Ora conta la PRIMA parola che dice cos'è la riga, come la scrive chi fattura: l'articolo viene
 * prima, i dettagli («posa», «per pistola», «secchio 14 l», «pronta consegna») dopo. Prima di
 * tutto, poche frasi che decidono da sole (energia, rifiuti, abbonamenti, pompa di calore).
 * Le parole di trasporto contano solo all'inizio: «documento di trasporto» in coda non è un
 * trasporto. Le righe tecniche dei gestionali (la «Riga ausiliaria» di TeamSystem con i dati
 * AswT…) non hanno mai un conto.
 */

/** Frasi che decidono da sole, su tutta la descrizione. In ordine. */
const FRASI: Array<[RegExp, string]> = [
  [/(energia elettrica|spesa per l.?energia|accis[ae]|energia (attiva|reattiva|mono|in f|fascia)|gestione (del )?contatore|oneri di sistema|fornitura (di )?(gas|energia|acqua)|bollett|consumi (di )?(gas|energia|acqua))/, "utenze"],
  [/(conferiment|smaltiment|macerie|rifiuti|\bcasson[ei]\b)/, "servizi_generali"],
  [/(abbonament|licenz[ae]|software|\bpiattaforma (?!aere|elevat|semovent|a pantograf))/, "servizi_generali"],
  [/(commission|carta di credito|\bcontr\. (mensile )?carta|carta inattiva)/, "spese_bancarie"],
  [/((disco|dischi) (dei |del )?fren|pastigli|tagliando)/, "manutenzioni"],
  [/pomp[ae] di calore/, "materiali"],
  [/(piattaforma (aere|elevat|semovent|a pantograf)|servizio pompa|pompa (a )?braccio|pompa (cls|calcestruzzo)|\bnolegg|\bnol[oi]\b)/, "noli_attrezzature"],
];

/** Parole che non dicono cos'è la riga: si saltano per arrivare all'articolo («Spese trasporto» → trasporto). */
const DA_SALTARE = new Set([
  "demo", "spese", "spesa", "sp", "costo", "costi", "addebito", "riaddebito", "contributo", "oneri", "onere", "supplemento",
  "concorso", "rivalsa", "quota", "ns", "vs", "rif", "art", "cod", "nr", "n", "di", "del", "della", "dei", "delle", "per",
  "il", "lo", "la", "le", "gli", "i", "e", "ed", "a", "al", "con", "da", "in", "su", "x",
]);

/**
 * Il conto di una parola. `entro` = la parola conta solo fra le prime N parole utili: le parole
 * di trasporto in coda descrivono la consegna di un articolo, non un costo di trasporto.
 */
const PAROLE: Array<{ re: RegExp; conto: string; entro?: number }> = [
  { re: /^(pompagg|autopompa|betonpompa|piazzament|nolegg|nol[oi]$|gru$|autogru|autoscala)/, conto: "noli_attrezzature" },
  { re: /^(trasport|trasp$|spedizion|consegn|autotrasp|viaggi|porto$|corriere|imball)/, conto: "trasporti", entro: 2 },
  { re: /^(gasolio|benzina|carburant|lubrificant|adblue|diesel)/, conto: "carburanti" },
  // Le viti anche dentro una parola composta: turbovite, autoperforanti, tirafondi.
  { re: /(vit[ei]$|^tirafond|^autoperforant|^autofilettant)/, conto: "materiali_di_consumo" },
  { re: /^(crema|spray|silicon|nastr|fascett|filo$|tassell|distanziator|cubier|smusso|tapp[oi]$|polvere|guant|batteri|coll[ae]$|schium|sigillant|disarmant|chiod|graff|stracci|sacch|pulizi|disco$|dischi$|abrasiv|rondell|dad[oi]$|bullon|ancorant|rivett|pennarell|matit|marker|mascherin|primer|fissagg|elettrod|punt[ae]$|lam[ae]$|spugn|collar)/, conto: "materiali_di_consumo" },
  { re: /^(seghett|tenagli|cacciavit|badil|pala$|carriol|doppiometr|flessometr|metro$|trapan|martell|utensil|chiav[ei]$|livella$|frattazz|cazzuol|secchio$|spatol|smerigliatr|staggia|avvitator|tassellator|scala$|trabattell|pinz[ae]$|forbic|cutter|flessibile$)/, conto: "attrezzature" },
  { re: /^(cls$|calcestr|cemento|ferro$|acciai|tond[oi]$|tondin|rete$|elettrosaldat|laterizi|mattoni|blocch|pignatt|travett|sabbia|ghiaia|inerti|malta|massett|calce$|gesso|cartongesso|isolant|guaina|tub[oi]$|pvc$|legname|tavol[ei]$|pannell|idropittur|pittur|vernic|intonac|piastrell|gres$|battiscopa|lastr[ae]$|coppi$|tegol|stucc|collant|adesiv)/, conto: "materie_prime" },
];

/** Le righe tecniche dei gestionali (TeamSystem «Riga ausiliaria», dati AswT…): non sono un costo. */
export function rigaTecnica(descrizione: string | null | undefined): boolean {
  const d = (descrizione ?? "").trim().toLowerCase();
  return /^riga ausiliaria|informazioni tecniche e aggiuntive del documento|^asw[a-z]*\b/.test(d);
}

/** Il conto, fra le categorie di base, che la descrizione suggerisce. */
export function contoDallaDescrizione(descrizione: string | null | undefined): string | null {
  const d = (descrizione ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!d || rigaTecnica(d)) return null;
  for (const [re, conto] of FRASI) if (re.test(d)) return conto;
  const parole = d.split(/[^a-zàèéìòù]+/).filter((p) => p.length >= 2 && !DA_SALTARE.has(p));
  for (let i = 0; i < parole.length; i++) {
    const regola = PAROLE.find((r) => (r.entro == null || i < r.entro) && r.re.test(parole[i]));
    if (regola) return regola.conto;
  }
  return null;
}

/** Nomi con cui le aziende chiamano le categorie di base nei loro conti («Consumabili», «Spedizioni»…). */
const SINONIMI: Record<string, string[]> = {
  materiali_di_consumo: ["materiali di consumo", "consumabili", "materiale di consumo", "ferramenta", "ferramenta e fissaggi"],
  materie_prime: ["materie prime", "materiali", "materiale", "materiali edili"],
  materiali: ["materiali", "materiale", "materiali edili", "materie prime"],
  attrezzature: ["attrezzature", "utensili, attrezzature, sistemi di fissaggio", "attrezzature e fissaggi"],
  noli_attrezzature: ["noli attrezzature", "noleggio attrezzature", "noleggi", "noli"],
  trasporti: ["trasporti", "spedizioni"],
  carburanti: ["carburanti", "carburante", "carburante e pedaggi"],
  utenze: ["utenze", "energia elettrica"],
  servizi_generali: ["servizi generali", "smaltimento rifiuti", "smaltimenti", "container e rifiuti", "servizi"],
  manutenzioni: ["manutenzioni", "ricambi e officina"],
};
const chiaveNome = (x: string) => x.toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim();

/** Fra i conti disponibili, quello che corrisponde a una categoria di base (stesso nome o un sinonimo). */
export function contoDisponibile(conto: string, disponibili: readonly string[]): string | null {
  const perNome = new Map(disponibili.map((c) => [chiaveNome(c), c]));
  for (const nome of [conto, ...(SINONIMI[conto] ?? [])]) {
    const trovato = perNome.get(chiaveNome(nome));
    if (trovato) return trovato;
  }
  return null;
}

/**
 * Il conto proposto per una riga dalla sua descrizione, se fra quelli disponibili.
 * Con le categorie proprie dell'azienda si propone quella con lo stesso nome o un sinonimo.
 */
export function contoPropostoRiga(descrizione: string | null | undefined, disponibili: readonly string[]): string | null {
  const conto = contoDallaDescrizione(descrizione);
  return conto ? contoDisponibile(conto, disponibili) : null;
}

/** La descrizione come articolo: parole di almeno tre lettere, senza numeri, misure, codici e targhe. */
function articolo(testo: string | null | undefined): string {
  return (testo ?? "").toLowerCase().replace(/[0-9]+/g, " ").split(/[^a-zàèéìòù]+/).filter((p) => p.length >= 3).join(" ").slice(0, 80);
}

/** Una riga già classificata a mano in un'altra fattura della stessa azienda. */
export interface SceltaPassata { fornitore: string | null; descrizione: string; conto: string }

/**
 * Le scelte fatte a mano valgono per le righe uguali (24/11/2026). Per ogni riga: la stessa
 * descrizione (numeri, misure e targhe a parte: «126 CLS RCK35» = «CLS RCK 37», «AUTOPOMPA
 * AB123CD» = «AUTOPOMPA EF456GH») già classificata nelle fatture
 * dello STESSO fornitore, se ha avuto sempre lo stesso conto; altrimenti nelle fatture di tutti
 * i fornitori dell'azienda, alla stessa condizione. Solo conti fra quelli disponibili.
 * Restituisce {chiave riga: conto}; le righe senza un precedente non ci sono.
 */
export function proposteDalleScelte({ righe, fornitore, scelte, disponibili }: {
  righe: ReadonlyArray<{ chiave: string; descrizione: string | null }>;
  fornitore: string | null;
  scelte: readonly SceltaPassata[];
  /** Il conto è valido? (categoria del menu, o conto del piano esistente) */
  disponibili: (conto: string) => boolean;
}): Record<string, string> {
  const delFornitore = new Map<string, Set<string>>();
  const ditutti = new Map<string, Set<string>>();
  for (const s of scelte) {
    if (!disponibili(s.conto)) continue;
    const n = articolo(s.descrizione);
    if (!n) continue;
    if (fornitore && s.fornitore === fornitore) (delFornitore.get(n) ?? delFornitore.set(n, new Set()).get(n)!).add(s.conto);
    (ditutti.get(n) ?? ditutti.set(n, new Set()).get(n)!).add(s.conto);
  }
  const out: Record<string, string> = {};
  for (const r of righe) {
    if (rigaTecnica(r.descrizione)) continue;
    const n = articolo(r.descrizione);
    if (!n) continue;
    const unico = (m: Map<string, Set<string>>) => { const v = m.get(n); return v?.size === 1 ? [...v][0] : null; };
    const conto = unico(delFornitore) ?? unico(ditutti);
    if (conto) out[r.chiave] = conto;
  }
  return out;
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
  return !/\b(canon[ei]|leasing|locazion|nolegg|nolo\b|noli\b|affitt|abbonament|spes[ae]\b|commission|interess|assicuraz|serviz(?:i|io)\b|manodopera|consulenz|manutenz|riparaz|bollo|rata\b|rate\b)/i.test(descrizione ?? "");
}
