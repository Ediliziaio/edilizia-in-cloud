/**
 * Il tipo di un fornitore: decide dove va il costo delle sue fatture.
 *
 * 30/10/2026 — TIM, il grossista di materiali e la ditta in subappalto erano la
 * stessa cosa: un fornitore con una categoria scritta a mano (213 su 330 senza),
 * e su 14.320 fatture ricevute 14.298 mai classificate. Una fattura TIM chiedeva
 * la commessa come quella del cemento. Il tipo è una scelta tra otto, fissa;
 * la categoria libera di prima resta come dettaglio («cosa vende»).
 *
 * `commessa`: «si» = il costo va su una commessa (e la fattura senza commessa è da
 * sistemare); «no» = spesa di struttura, non si chiede; «a_scelta» = dipende
 * (il geometra di un cantiere sì, il commercialista no).
 */

export const TIPI_FORNITORE = [
  "materiali",
  "subappalto",
  "noli_servizi",
  "professionisti",
  "mezzi",
  "agenti",
  "generali",
  "finanza_enti",
] as const;

export type TipoFornitore = (typeof TIPI_FORNITORE)[number];

export interface InfoTipoFornitore {
  etichetta: string;
  esempi: string;
  commessa: "si" | "no" | "a_scelta";
}

export const INFO_TIPO_FORNITORE: Record<TipoFornitore, InfoTipoFornitore> = {
  materiali: { etichetta: "Materiali e merci", esempi: "Edilizia, serramenti, impianti, ferramenta, DPI", commessa: "si" },
  subappalto: { etichetta: "Subappalto e manodopera", esempi: "Ditte in subappalto, posatori, artigiani, personale in somministrazione", commessa: "si" },
  noli_servizi: { etichetta: "Noli e servizi di cantiere", esempi: "Gru, ponteggi, noli a caldo e a freddo, trasporti, smaltimento, laboratori", commessa: "si" },
  professionisti: { etichetta: "Professionisti e tecnici", esempi: "Geometra, ingegnere, direzione lavori, sicurezza, commercialista, avvocato", commessa: "a_scelta" },
  mezzi: { etichetta: "Mezzi e veicoli", esempi: "Leasing e noleggio di auto e furgoni, carburante, officina", commessa: "a_scelta" },
  agenti: { etichetta: "Agenti e provvigioni", esempi: "Agenti, procacciatori, segnalatori", commessa: "a_scelta" },
  generali: { etichetta: "Spese generali", esempi: "Telefonia, luce e gas, affitto, software, ufficio, pubblicità, pulizie", commessa: "no" },
  finanza_enti: { etichetta: "Banche, assicurazioni ed enti", esempi: "Commissioni e interessi, polizze, Cassa Edile, tributi", commessa: "no" },
};

export function isTipoFornitore(v: unknown): v is TipoFornitore {
  return typeof v === "string" && (TIPI_FORNITORE as readonly string[]).includes(v);
}

export function etichettaTipoFornitore(v: unknown): string | null {
  return isTipoFornitore(v) ? INFO_TIPO_FORNITORE[v].etichetta : null;
}

/** Le categorie dell'AI delle fatture (ai-fattura-classify) e quelle libere dei fornitori e dei costi. */
const DA_CATEGORIA: Array<[RegExp, TipoFornitore]> = [
  [/subappalt|manodopera|posa|posator|somministraz|interinal/, "subappalto"],
  [/provvigion|agent|procaccia/, "agenti"],
  [/carburant|gasolio|diesel|veicol|leasing|autonoleggio|officina/, "mezzi"],
  [/assicuraz|polizz|banca|bancari|interess|commission|tasse|impost|tribut|inps|inail|cassa.?edile|f24|imu|bollo|canone c\/c/, "finanza_enti"],
  [/consulen|professionist|commercialista|notai|avvocat|tecnic|progett|geometr|ingegner|architet/, "professionisti"],
  [/nolegg|nolo|noli|trasport|logistic|smaltiment|rifiut|ponteg|opere provvisional|gru\b/, "noli_servizi"],
  [/utenz|telefon|connettiv|energia|luce|gas\b|acqua|affitt|locazion|immobil|software|licenz|cancelleri|ufficio|toner|marketing|pubblicit|formazion|viaggi|trasfert|pulizi|servizi.generali|struttura|vigilanz/, "generali"],
  [/material|merci|forniture|serrament|infiss|finestr|pvc|alluminio|legno|acciaio|ferro|profilat|calcestruzz|cement|malt|isolament|ferrament|minuteria|utensil|impiant|termoidraul|elettric|fotovoltaic|climatizz|tapparell|zanzarier|schermatur|dpi|consumabil|edil/, "materiali"],
];

/** Il tipo dalla categoria scritta (sul fornitore, sulla fattura o sul costo), se si capisce. */
export function tipoDaCategoria(categoria: string | null | undefined): TipoFornitore | null {
  const c = String(categoria ?? "").toLowerCase().replace(/_/g, " ").trim();
  if (!c || c === "altro") return null;
  for (const [re, tipo] of DA_CATEGORIA) if (re.test(c)) return tipo;
  return null;
}

/** I nomi che si riconoscono da soli: gestori, banche, assicurazioni, enti, noleggiatori. */
const DA_NOME: Array<[RegExp, TipoFornitore]> = [
  // Gestori, utenze, software, pubblicità, viaggi, buoni pasto.
  [/\b(tim|telecom|vodafone|wind ?tre|windtre|fastweb|iliad|tiscali|eolo|linkem|aruba|register\.it|ovh|google|microsoft|amazon web|meta platforms?|facebook|hp italy|apple|adobe|canva|zoom video|grenke)\b/, "generali"],
  [/\b(enel|eni plenitude|plenitude|a2a|hera|edison|iren|acea|sorgenia|engie|dolomiti energia|illumia|e\.on|eon energia|servizio elettrico|duferco|optima italia|energia)\b/, "generali"],
  [/\b(ryanair|easyjet|ita airways|alitalia|trenitalia|italo|booking\.com|airbnb|day ristoservice|edenred|pluxee|sodexo|up day)\b/, "generali"],
  // Banche, pagamenti, finanziarie, assicurazioni, enti.
  [/\b(intesa sanpaolo|unicredit|banco bpm|bper|credem|mps|monte dei paschi|banca|bcc|credito cooperativo|poste italiane|nexi|satispay|sumup|american express|paypal|deutsche bank|fineco|mediolanum|ing bank|agos|findomestic|compass)\b/, "finanza_enti"],
  [/\b(assicurazion|generali italia|allianz|unipol|unipolsai|reale mutua|axa|zurich|cattolica|groupama|helvetia|vittoria|itas|sara assicurazioni|hdi)/, "finanza_enti"],
  [/\b(cassa edile|edilcassa|inps|inail|agenzia delle entrate|agenzia entrate|comune di|regione|camera di commercio|cciaa|equitalia|riscossione)\b/, "finanza_enti"],
  // Mezzi: noleggio lungo, carburante e carte carburante, pedaggi, car sharing.
  [/\b(arval|leasys|ayvens|ald automotive|leaseplan|alphabet|athlon|free2move|hertz|avis|europcar|sixt|locauto|enimoov|enjoy)\b/, "mezzi"],
  [/\b(q8|kuwait petroleum|esso|tamoil|ip italiana petroli|api ip|shell|eni station|enilive|total ?energies|erg|dkv|radius business|uta edenred|telepass|autostrade per l.italia|carburanti)\b/, "mezzi"],
  // Grande distribuzione edile e marchi di materiali e impianti.
  [/\b(leroy merlin|bricoman|brico ?center|bricocenter|obi italia|bigmat|berner|hilti|mapei|knauf|saint.gobain|daikin|samsung electronics air|mitsubishi electric|rossato|ferexpert)\b|w(ue|ü|u)rth/, "materiali"],
  [/\b(studio|ing\.|ingegner|arch\.|architett|geom\.|geometr|dott\.|commercialist|avvocat|notai|consulen)/, "professionisti"],
];

/**
 * Le parole del mestiere nel nome: «GIELLE SERRAMENTI», «C.D.L. LAMIERE», «Edil
 * Scavi». Indizio più debole dei nomi noti: la proposta resta da guardare.
 */
const DA_PAROLE_NEL_NOME: Array<[RegExp, TipoFornitore]> = [
  [/costruzion|demolizion|scavi|movimento terra|montagg|posa in opera|installazion|ristrutturaz|cartongess|imbiancatur|tinteggiat|pittur|impresa edile|carpenteri/, "subappalto"],
  [/nolegg|nolo |autogru|trasport|logistic|spedizion|corrier|autotrasp|ecologi|rifiuti|smaltiment|ponteggi|laboratorio prove/, "noli_servizi"],
  [/serrament|infiss|finestr|okna|window|portoni|lamier|acciai|metall|legnam|plast|ceramich|piastrell|marmi|vernic|colorific|termoidraul|idraulic|materiali|forniture|calcestruzz|betonier|laterizi|isolant|vetr|allumin|pvc|fotovoltaic|climatizz|sanitari|ferrament|edilizia|edilcentro/, "materiali"],
];

export function tipoDaParoleNelNome(nome: string | null | undefined): TipoFornitore | null {
  const n = String(nome ?? "").toLowerCase();
  for (const [re, tipo] of DA_PAROLE_NEL_NOME) if (re.test(n)) return tipo;
  return null;
}

export function tipoDaNome(nome: string | null | undefined): TipoFornitore | null {
  const n = ` ${String(nome ?? "").toLowerCase()} `;
  for (const [re, tipo] of DA_NOME) if (re.test(n)) return tipo;
  return null;
}

export interface IndiziFornitore {
  nome?: string | null;
  /** La partita IVA è nell'elenco dei subappaltatori dell'azienda. */
  traISubappaltatori?: boolean;
  /** Una sua fattura ha righe in reverse charge da subappalto edile (N6.3, N6.7). */
  reverseChargeEdile?: boolean;
  /** Categoria libera della scheda fornitore. */
  categoriaScheda?: string | null;
  /** Categorie dell'AI o dei costi sulle sue fatture, la più frequente prima. */
  categorieFatture?: Array<string | null | undefined>;
}

export interface PropostaTipo {
  tipo: TipoFornitore;
  /** Perché: si mostra accanto alla proposta. */
  motivo: string;
  /** «certa» si può confermare in blocco; «probabile» va guardata. */
  sicurezza: "certa" | "probabile";
}

/**
 * Il tipo proposto per un fornitore, dagli indizi più solidi ai più deboli. Null se
 * non c'è nessun indizio: decide una persona.
 */
export function proponiTipo(i: IndiziFornitore): PropostaTipo | null {
  if (i.traISubappaltatori) return { tipo: "subappalto", motivo: "È nell'elenco dei subappaltatori", sicurezza: "certa" };
  if (i.reverseChargeEdile) return { tipo: "subappalto", motivo: "Fattura in reverse charge da subappalto edile", sicurezza: "certa" };
  const daNome = tipoDaNome(i.nome);
  if (daNome) return { tipo: daNome, motivo: "Dal nome", sicurezza: daNome === "professionisti" ? "probabile" : "certa" };
  const daScheda = tipoDaCategoria(i.categoriaScheda);
  if (daScheda) return { tipo: daScheda, motivo: `Dalla categoria «${String(i.categoriaScheda).trim()}»`, sicurezza: "probabile" };
  for (const c of i.categorieFatture ?? []) {
    const t = tipoDaCategoria(c);
    if (t) return { tipo: t, motivo: `Dalle sue fatture (${String(c).replace(/_/g, " ")})`, sicurezza: "probabile" };
  }
  const daParole = tipoDaParoleNelNome(i.nome);
  if (daParole) return { tipo: daParole, motivo: "Dal nome (da controllare)", sicurezza: "probabile" };
  return null;
}

/** La natura IVA di una riga che dice «subappalto edile» (reverse charge art. 17 c.6 a e a-ter). */
export function naturaSubappaltoEdile(natura: unknown): boolean {
  const n = String(natura ?? "").toUpperCase().replace(".", "_");
  return n === "N6_3" || n === "N6_7";
}
