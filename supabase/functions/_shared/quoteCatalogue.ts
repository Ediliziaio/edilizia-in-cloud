/** Pure, bounded catalogue retrieval/ranking and conservative technical checks.
 * A ranking score is never a price, a certification or an automatic inclusion. */
import type { QuoteChatProposal, QuoteChatReference } from "./quoteConversation.ts";

export const CATALOGUE_LIMITS = { queries: 6, rowsPerQuery: 48, candidates: 24, existing: 30 } as const;
const normalized = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/²/g, "2").replace(/³/g, "3");
const words = (s: string): string[] => normalized(s).match(/[a-z0-9]+/g) ?? [];
const stop = new Set("di del della delle dei degli da con per il la le gli lo una uno un in e ed o or posa fornitura lavoro lavorazione cucina camera regione lombardia prezzario smaltimento esistente confermare verificare".split(" "));
const tokens = (s: string) => [...new Set(words(s).filter(w => w.length > 2 && !stop.has(w)))];
export function catalogueUnit(s: string): string {
  const u = normalized(s).replace(/[^a-z0-9]/g, "");
  return ({ mq: "m2", metroquadro: "m2", metriquadri: "m2", metroquadrato: "m2", mc: "m3", metrocubo: "m3", metricubi: "m3", ml: "m", metro: "m", metrolineare: "m", metrilineari: "m", cad: "cad", cadauno: "cad", pz: "cad", pezzo: "cad", pezzi: "cad", n: "cad", nr: "cad", num: "cad", h: "h", ora: "h", ore: "h", ton: "t", tonnellata: "t", chilogrammo: "kg", chili: "kg", lt: "l", litro: "l", litri: "l", acorpo: "a corpo", acorpo1: "a corpo" } as Record<string, string>)[u] ?? u;
}
type Kind = "floor" | "cladding" | "skirting" | "paint" | "windows" | "sanitary" | "tap" | "cistern" | "pipe" | "other";
function kind(s: string): Kind {
  const n = normalized(s);
  if (/impermeabilizz|guaina|allestiment|preparazione support|conferimento.*rifiut/.test(n)) return 'other';
  if (/battiscop|zoccolin/.test(n)) return "skirting";
  if (/serrament|infiss|finestr/.test(n)) return "windows";
  if (/rubinetter|miscelatore|gruppo di erogazione/.test(n)) return 'tap';
  if (/cassetta.*(?:wc|lavaggio|risciacquo|scarico)/.test(n)) return 'cistern';
  if (/tubazion|tubatur/.test(n)) return 'pipe';
  if (/sanitar|lavabo|bidet|\bwc\b|\bvaso\b|doccia/.test(n)) return "sanitary";
  if (/tinteggi|pittur|idropittur/.test(n)) return "paint";
  if (/rivestiment/.test(n) && !/paviment/.test(n)) return "cladding";
  if (/paviment|piastrell|\bgres\b/.test(n)) return "floor";
  return "other";
}
const catalogueObject = (description: string) => description.split(/—|\blavoro:|\bincluso:|\bescluso:|;\s*(?:funzione|impiego|geometria|specifiche tecniche):/i)[0];
const isRemoval = (s: string) => /rimozion|demolizion|demolir|rimuov|disfaciment/.test(normalized(s));
const number = (s: string) => Number(s.replace(",", "."));
function pipeDiameter(s: string): number | null {
  const n = normalized(s);
  const match = /\b(?:de|dn)\s*(\d+(?:[.,]\d+)?)/.exec(n)
    ?? /diametro(?:\s+esterno)?\s*(?:\(ø\)\s*)?(?:\[mm\]\s*=\s*)?(\d+(?:[.,]\d+)?)/.exec(n)
    ?? /(\d+(?:[.,]\d+)?)\s*[x×]\s*\d+(?:[.,]\d+)?\s*mm\b/.exec(n);
  return match ? number(match[1]) : null;
}
function tileSize(s: string): number[] | null {
  const n = normalized(s);
  const direct = /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(cm|mm)\b/.exec(n);
  if (direct) return [number(direct[1]), number(direct[2])].map(v => direct[3] === "mm" ? v / 10 : v).sort((a, b) => a - b);
  const x = /lato x\s*\[cm\]\s*=\s*(\d+(?:[.,]\d+)?)/.exec(n);
  const y = /lato y\s*\[cm\]\s*=\s*(\d+(?:[.,]\d+)?)/.exec(n);
  return x && y ? [number(x[1]), number(y[1])].sort((a, b) => a - b) : null;
}
function thickness(s: string): number[] | null {
  const n = normalized(s);
  const a = /spessore\s*\[(mm|cm)\]\s*=\s*(\d+(?:[.,]\d+)?)(?:\s*[÷–-]\s*(\d+(?:[.,]\d+)?))?/.exec(n);
  if (a) return [number(a[2]), number(a[3] ?? a[2])].map(v => a[1] === "cm" ? v * 10 : v);
  const b = /spessore\s*(?:di\s*)?(\d+(?:[.,]\d+)?)(?:\s*[÷–-]\s*(\d+(?:[.,]\d+)?))?\s*(mm|cm)\b/.exec(n);
  return b ? [number(b[1]), number(b[2] ?? b[1])].map(v => b[3] === "cm" ? v * 10 : v) : null;
}
export function assessCatalogueMatch(p: QuoteChatProposal, ref: QuoteChatReference): string[] {
  const issues: string[] = [];
  const requested = normalized(`${p.title} ${p.description}`), description = normalized(ref.description);
  const a = kind(p.title), b = kind(catalogueObject(ref.description));
  const targetTitle = normalized(p.title), object = normalized(catalogueObject(ref.description));
  const positive = description.split(/\bescluso:/)[0];
  if (a === 'tap' || a === 'cistern' || a === 'pipe') {
    if (a !== b) issues.push('componente impiantistico richiesto non documentato nell’oggetto');
    if (a === 'tap') {
      for (const purpose of ['lavabo', 'bidet', 'doccia']) if (requested.includes(purpose) && !positive.includes(purpose)) issues.push(`impiego ${purpose} non documentato per il miscelatore`);
      if (/monocomando/.test(requested) && !/monocomando/.test(object)) issues.push('miscelatore monocomando non documentato nell’oggetto');
      for (const mounting of ['da incasso', 'a bordo lavabo', 'a bordo bidet']) if (requested.includes(mounting) && !positive.includes(mounting)) issues.push(`montaggio ${mounting} non documentato`);
      if (/temporizz|antivandal|agevolat|gomito|elettronic|pedale/.test(positive) && !/temporizz|antivandal|agevolat|gomito|elettronic|pedale/.test(requested)) issues.push('rubinetto speciale non richiesto, non equivalente al monocomando standard');
    }
    if (a === 'cistern') {
      if (/incasso/.test(requested) && !/incasso/.test(object) || /esterna/.test(requested) && !/esterna/.test(object)) issues.push('tipologia della cassetta non documentata');
      if (/disabil/.test(positive) && !/disabil/.test(requested)) issues.push('cassetta speciale non richiesta');
    }
    if (a === 'pipe') {
      const diameter = pipeDiameter(requested), actual = pipeDiameter(description);
      if (diameter != null && diameter !== actual) issues.push('diametro della tubazione non documentato o differente');
      const wall = /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*mm\b/.exec(requested);
      if (wall && !new RegExp(`spessore(?:\\s+parete)?\\s*(?:\\[mm\\]\\s*=\\s*)?${wall[2]}(?:\\s*mm|\\b)`).test(positive) && !positive.includes(wall[0])) issues.push('spessore della parete del tubo non documentato');
      for (const material of ['multistrato', 'pead', 'pvc', 'rame']) if (requested.includes(material) && !positive.includes(material)) issues.push(`materiale tubazione ${material} non documentato`);
      if (/scaric/.test(requested) && !/scaric/.test(positive) || /acqua (?:fredda|calda)|idrico/.test(requested) && /scaric/.test(object)) issues.push('tubazione acqua e scarico non equivalenti');
      const insulation = /isolamento\s*(\d+(?:[.,]\d+)?)\s*mm/.exec(requested);
      if (insulation && !new RegExp(`(?:isolamento|isolante)[^.;—]{0,100}\\b${insulation[1]}\\s*mm|spessore\\s*\\[mm\\]\\s*=\\s*${insulation[1]}\\b`).test(positive)) issues.push('isolamento richiesto non documentato');
    }
    if (/sola fornitura|^fornitura\b/.test(targetTitle) && !/posa|montaggio|installazion/.test(targetTitle) && /\.oc\./.test(normalized(ref.code))) issues.push('fornitura sola richiesta: il riferimento comprende anche posa, possibile doppio costo');
  }
  if (/pres[ae]|punt[oi] luce|comando luce/.test(targetTitle) && /reinfilaggio/.test(description) && !/reinfilaggio/.test(requested)) issues.push('reinfilaggio su impianto esistente diverso da un nuovo punto completo');
  if (/impermeabilizz|guaina/.test(targetTitle) && !/impermeabilizz|membrana|guaina/.test(object)) issues.push('impermeabilizzazione non documentata nell’oggetto: una finitura o verniciatura non è automaticamente una guaina');
  if (/preparazione support|letto.*posa/.test(targetTitle)) {
    if (/pavimentazione|piastrell/.test(object)) issues.push('preparazione supporto richiesta, non una seconda fornitura e posa delle piastrelle');
    if (/preparazione.*(?:e|formazione).*letto/.test(targetTitle)) issues.push('voce composita: separare preparazione dei supporti e formazione del letto di posa prima di abbinare tariffe');
  }
  if (/idrico/.test(targetTitle) && /scarich/.test(targetTitle)) issues.push('voce composita: acqua e scarichi richiedono tracciati, diametri e tariffe distinti; un solo tubo non prezza l’intero impianto');
  if (/elettric/.test(targetTitle) && !/elettric|presa|punto luce|comando/.test(object)) issues.push('oggetto non appartenente all’impianto elettrico richiesto');
  if (/protezion|allestiment/.test(targetTitle) && !/protezion|allestiment|cantiere/.test(object)) issues.push('protezione/allestimento non documentati nell’oggetto');
  // "Impiego: pavimento" does not make a grille or insulation a floor finish.
  // Test the actual object, not incidental placement words or equal units.
  if (/paviment|rivestiment|piastrell|\bgres\b/.test(normalized(p.title))) {
    const object = description.split(/—|\blavoro:|\bimpiego:|\bincluso:|\bescluso:/)[0];
    const objectAndUse = description.split(/—|\blavoro:/)[0];
    if ((a === 'floor' || a === 'cladding') && !/paviment|rivestiment|piastrell/.test(object)) issues.push('piastrelle/pavimentazione/rivestimento non documentati nell’oggetto: non abbinare demolizioni di pareti o altre opere');
    if (/rivestiment/.test(normalized(p.title)) && !/paviment/.test(normalized(p.title)) && /strato di pavimentazione/.test(object) && !/paret|rivestiment/.test(objectAndUse)) issues.push('pavimentazione diversa dal rivestimento a parete richiesto');
    if (/roccia naturale|granito|marmo|cunicolo|tombinatur/.test(object) && !/roccia|granito|marmo|cunicolo|tombinatur/.test(requested)) issues.push('rivestimento lapideo o impiego speciale non richiesto');
    for (const [pattern, label] of [[/isolament/, 'isolamento'], [/\bgrigli[ae]\b|\btelai[oi]\b/, 'griglia/telaio'], [/pozzett|caditoi|chiusin/, 'pozzetto/caditoia'], [/\btracc[ie]/, 'traccia impiantistica'], [/massett|sottofond/, 'massetto/sottofondo']] as const) {
      if (pattern.test(object) && !pattern.test(normalized(p.title))) issues.push(`oggetto diverso dalle piastrelle/rivestimenti: ${label}`);
    }
  }
  if (!catalogueUnit(ref.unit) || catalogueUnit(ref.unit) !== catalogueUnit(p.unit)) issues.push("unità di misura mancante o incompatibile");
  if (ref.price == null || !Number.isFinite(ref.price) || ref.price <= 0) issues.push("prezzo ufficiale non disponibile");
  if (a !== "other" && b !== "other" && a !== b) issues.push("oggetto diverso dalla lavorazione richiesta");
  if (a === 'paint' && b !== 'paint') issues.push('pittura richiesta non documentata nell’oggetto del riferimento');
  if (a === 'paint') {
    const object = description.split(/—|\blavoro:|\bincluso:|\bescluso:/)[0];
    for (const [pattern, label] of [[/fotocatalitic|biossido di titanio/, 'fotocatalitica'], [/antibatteric/, 'antibatterica'], [/ignifug|intumescent/, 'ignifuga/intumescente'], [/epossisilossanic|finitura:\s*trasparent/, 'epossisilossanica/trasparente']] as const) {
      if (pattern.test(object) && !pattern.test(requested)) issues.push(`pittura speciale non richiesta: ${label}`);
    }
    if (/\blavabile\b/.test(requested) && (!/\b(?:super)?lavabile\b/.test(object) || /\bnon lavabile\b/.test(object))) issues.push('finitura lavabile non documentata: semilavabile/non lavabile non equivalente');
    if (/\.rm\.|\.lp\./.test(normalized(ref.code))) issues.push('risorsa elementare diversa dalla pitturazione completa');
  }
  if ((a === "windows" || a === "sanitary") && a !== b) issues.push("oggetto richiesto non documentato nel riferimento");
  if (a === "windows") {
    if (/oscurant|persian|tapparell/.test(description.split(/—/)[0]) && !/oscurant|persian|tapparell/.test(requested)) issues.push("oscurante/accessorio diverso dal serramento richiesto");
    if (/\bpvc\b/.test(requested) && !/\bpvc\b/.test(description)) issues.push("materiale PVC non documentato");
    if (/legno/.test(requested) && !/legno/.test(description)) issues.push("materiale legno non documentato");
    if (/portafinestr/.test(requested) && !/portafinestr/.test(description)) issues.push("portafinestra non documentata");
  }
  if (a === "sanitary") for (const [test, label] of [[/bidet/, "bidet"], [/lavabo/, "lavabo"], [/\bwc\b|\bvaso\b/, "WC/vaso"]] as const) {
    if (test.test(requested) && !test.test(description)) issues.push(`${label} non documentato`);
  }
  // Check the operation, not incidental words in an exclusions/specification clause.
  const operation = /lavoro:\s*([^—]+)/.exec(description)?.[1] ?? description.slice(0, 220);
  const hydroseeding = /\bidrosemina\b/.test(operation);
  if (hydroseeding && (!/\bidrosemina\b/.test(requested) ||
    /pulizi|preparazion|lavorazione.*terren|livellament|(?:fornitura|stesa|modellazione).*terra|sterpagli|sfalcio/.test(targetTitle))) {
    issues.push('idrosemina distinta da pulizia, preparazione e terra vegetale: non usare la stessa tariffa per queste lavorazioni');
  }
  if (/\bidrosemina\b/.test(targetTitle) && !hydroseeding) issues.push('metodo idrosemina non documentato nella lavorazione del riferimento');
  if (a === 'sanitary' && !isRemoval(p.title)) {
    const title = normalized(p.title), object = catalogueObject(description);
    if (/\bwc\b|\bvaso\b/.test(title) && (!/\bwc\b|\bvaso\b/.test(object) || /espansione/.test(object))) issues.push('WC/vaso sanitario non documentato nell’oggetto');
    if (/\bwc\b|\bvaso\b/.test(title) && /vaso.bidet/.test(object) && !/vaso.bidet/.test(title)) issues.push('vaso-bidet combinato diverso dal WC separato richiesto');
    if (/tipo scuola|pediatric|bambin/.test(description) && !/scuola|pediatric|bambin/.test(requested)) issues.push('sanitario speciale per scuola/bambini non richiesto');
    if (/bidet/.test(title) && /vaso.bidet/.test(object) && !/vaso.bidet/.test(title)) issues.push('vaso-bidet combinato diverso dal bidet separato richiesto');
    const supplyOnly = /\bfornitura\b/.test(title) && !/\bposa\b|montaggio|collegament|installazion/.test(title);
    if (supplyOnly && (/\.oc\./.test(normalized(ref.code)) || /\bposa\b|applicazion|montaggio|installazion/.test(operation)) && !/esclus[ao] (?:la )?posa|sola fornitura/.test(description)) issues.push('fornitura sola richiesta: il riferimento comprende anche posa, possibile doppio costo');
    if (!/fornitura/.test(title) && /montaggio|collegament|\bposa\b/.test(title) && /\.oc\.|\.rm\./.test(normalized(ref.code)) && !/esclus[ao] (?:la )?fornitura|sola posa|solo posa/.test(description)) issues.push('sola posa richiesta: fornitura non esclusa dal riferimento');
    if (/pavimento/.test(title) && /sospes|a parete/.test(object) && !/pavimento/.test(object)) issues.push('sanitario sospeso diverso dal modello a pavimento');
    const positive = description.split(/\bescluso:/)[0];
    if (/su mobile/.test(requested) && !/mobile/.test(positive)) issues.push('mobile lavabo non documentato nella fornitura');
    if (/piatto.*doccia/.test(title) && !/piatto.*doccia/.test(object)) issues.push('piatto doccia non documentato nell’oggetto');
    if (/piatto.*doccia/.test(title)) {
      if (/rialzat|sopra pavimento/.test(requested) && /filo pavimento/.test(object)) issues.push('piatto a filo pavimento diverso dal piatto rialzato richiesto');
      if (/\bbox\b/.test(requested) && !/\bbox\b|cabina doccia|parete doccia/.test(positive)) issues.push('box doccia non compreso nel riferimento del solo piatto');
    }
  }
  if (isRemoval(p.title) !== isRemoval(operation) && (isRemoval(p.title) || /rimozion|demolizion/.test(operation))) issues.push("rimozione e nuova posa sono lavorazioni diverse");
  for (const [test, label] of [[/piscin/, "piscine"], [/collettore fognario/, 'collettore fognario'], [/tattil/, "percorsi tattili"], [/sopraelevat|galleggiant/, "pavimento sopraelevato/galleggiante"]] as const) {
    if (test.test(description) && !test.test(requested)) issues.push(`impiego speciale non richiesto: ${label}`);
  }
  if (/\bgres\b/.test(requested) && !/\bgres\b/.test(description)) issues.push("materiale gres non documentato");
  if (/porcellan/.test(requested) && !/porcellan/.test(description)) issues.push("gres porcellanato non documentato");
  if (/non smaltat/.test(requested) && /smaltat/.test(description) && !/non smaltat/.test(description)) issues.push("finitura smaltata diversa dalla richiesta");
  if (/smaltat/.test(requested) && !/non smaltat/.test(requested) && /non smaltat/.test(description)) issues.push("finitura non smaltata diversa dalla richiesta");
  if (/smaltat/.test(requested) && !/smaltat/.test(description)) issues.push("finitura smaltata/non smaltata non documentata");
  if (/(?:colore|finitura|tinta) chiar[oa]/.test(requested) && /colore forte/.test(description) || /(?:colore|finitura|tinta) forte/.test(requested) && /colore chiaro/.test(description)) issues.push("colore della specifica diverso dalla richiesta");
  if (/impiego:\s*esterno/.test(description) && !/estern/.test(requested)) issues.push("impiego esterno non confermato per la lavorazione richiesta");
  if (!isRemoval(p.title)) {
    if (/adesiv|collante|sovrapposizion/.test(requested) && /letto in malta/.test(description)) issues.push("posa su letto di malta diversa dal metodo richiesto");
    const size = a === 'floor' || a === 'cladding' || a === 'sanitary' ? tileSize(requested) : null, candidate = tileSize(description);
    if (size && (!candidate || size.some((v, i) => Math.abs(v - candidate[i]) > .01))) issues.push("formato richiesto non documentato o differente");
    const t = thickness(requested), ct = thickness(description);
    if (t && (!ct || t[0] < ct[0] - .01 || t[1] > ct[1] + .01)) issues.push("spessore richiesto non documentato o differente");
    if (/fornitura.{0,40}(?:posa|montaggio|installazion)/.test(requested)) {
      if (/\.rm\.|\.lp\./.test(normalized(ref.code)) || /sola posa|solo posa|esclus[ao] (?:la )?fornitura/.test(description) || !/\.oc\./.test(normalized(ref.code)) && !/posa|posat/.test(description)) issues.push("fornitura e posa non entrambe documentate nella voce");
    }
  }
  return [...new Set(issues)];
}
/** Do not let the model erase a pre-existing specification to fit a candidate.
 * A narrow, explicit format confirmation can change that constraint; other
 * technical changes still pass through the editable draft before pricing. */
export function assessProposedCatalogueMatch(p: QuoteChatProposal, ref: QuoteChatReference, previous?: QuoteChatProposal, latestUser = ""): string[] {
  if (!previous) return assessCatalogueMatch(p, ref);
  let baseline = previous;
  const confirmation = /\b(confermo|scelgo|accetto|utilizziamo|preferisco)\b/i.exec(latestUser);
  if (confirmation && !/\bnon\s*$/i.test(latestUser.slice(Math.max(0, confirmation.index - 8), confirmation.index))) {
    const chosen = tileSize(latestUser.slice(confirmation.index, confirmation.index + 180));
    const proposed = tileSize(`${p.title} ${p.description}`);
    if (chosen && proposed && chosen.every((v, i) => Math.abs(v - proposed[i]) < .01)) {
      const rewrite = (s: string) => s.replace(/\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:cm|mm)\b/gi, `${chosen[0]}×${chosen[1]} cm`);
      baseline = { ...previous, title: rewrite(previous.title), description: rewrite(previous.description) };
    }
  }
  const method = /\b(?:considero|confermo|scelgo|accetto)\b.{0,90}\bposa su letto di malta\b/i.exec(latestUser);
  if (method && !/\bnon\s*$/i.test(latestUser.slice(Math.max(0, method.index - 8), method.index))) {
    const rewrite = (s: string) => s.replace(/posa (?:in sovrapposizione|con adesivo)(?: su supporto da verificare)?/gi, "posa su letto di malta");
    baseline = { ...baseline, title: rewrite(baseline.title), description: rewrite(baseline.description) };
  }
  return [...new Set([...assessCatalogueMatch(p, ref), ...assessCatalogueMatch(baseline, ref)])];
}

export type CatalogueQuery = { kind: "text" | "code"; text: string };
/** Extract literal codes, never manufacture one from prose or a model's memory. */
export function explicitCatalogueCodes(message: string): string[] {
  if (message.length > 3000) return [];
  return [...new Set([...message.matchAll(/\b[A-Z]{2,}\d[A-Z0-9_.-]{6,159}/gi)].flatMap(m => {
    const code = m[0].replace(/[.,]+$/, '');
    // Typos such as "massimo3domande" or "acqua16mm" are not codes.
    const labelled = /\bcodice\s*[:#]?\s*$/i.test(message.slice(Math.max(0, m.index - 20), m.index));
    return /[._-]/.test(code) || code === code.toUpperCase() || labelled ? [code] : [];
  }))].slice(0, 3);
}
export function catalogueQueries(terms: string[], targets: QuoteChatProposal[]): CatalogueQuery[] {
  const queries: CatalogueQuery[] = [];
  const add = (q: CatalogueQuery) => { if (queries.length < CATALOGUE_LIMITS.queries && !queries.some(v => v.kind === q.kind && v.text === q.text)) queries.push(q); };
  for (const raw of terms.slice(0, 3)) {
    const term = raw.trim().slice(0, 100);
    if (/^[a-z]{2,}\d[\w.-]{6,}$/i.test(term)) { add({ kind: "code", text: term }); continue; }
    const keys = tokens(term).slice(0, 4); if (!keys.length && !/\bwc\b/i.test(term)) continue;
    let query = keys.join(" ");
    const k = kind(term);
    if (k === 'tap') {
      const use = /bidet/.test(normalized(term)) ? 'bidet' : /doccia/.test(normalized(term)) ? 'doccia' : /lavabo/.test(normalized(term)) ? 'lavabo' : '';
      add({ kind: 'text', text: `miscelatore monocomando ${use} -temporizzata -antivandalo`.trim() });
      add({ kind: 'text', text: `gruppo erogazione ${use}`.trim() }); continue;
    }
    if (k === 'cistern') { add({ kind: 'text', text: 'cassetta risciacquo' }); add({ kind: 'text', text: 'cassetta lavaggio' }); continue; }
    if (k === 'pipe') {
      const scope = normalized(`${term} ${targets.length === 1 ? targets[0].description : ''}`);
      const use = /scaric/.test(scope) ? 'scarico' : 'acqua';
      const material = ['multistrato', 'pead', 'pvc', 'rame'].find(m => scope.includes(m)) ?? '';
      add({ kind: 'text', text: `tubazione ${use} ${material}`.trim() });
      add({ kind: 'text', text: `tubazione ${material} ${pipeDiameter(scope) ?? ''}`.trim() }); continue;
    }
    const technical = /impermeabilizz|guaina/.test(normalized(term)) ? ['impermeabilizzazione bagno', 'impermeabilizzazione doccia', 'guaina cementizia']
      : /impianto.*idr|idrico|scarich/.test(normalized(term)) ? ['tubazione scarico', 'tubazione acqua', 'impianto idrico']
      : /elettric/.test(normalized(term)) ? ['punto presa', 'punto luce', 'impianto elettrico']
      : /protezion|allestiment/.test(normalized(term)) ? ['protezione pavimenti', 'allestimento cantiere']
      : /preparazione support|letto.*posa/.test(normalized(term)) ? ['letto malta', 'preparazione supporto', 'rasatura']
      : /conferimento.*rifiut|smaltiment/.test(normalized(term)) ? ['oneri smaltimento', 'conferimento rifiuti'] : null;
    if (technical) { for (const text of technical) add({ kind: 'text', text }); continue; }
    if (k === 'cladding' && !isRemoval(term)) {
      const size = targets.length === 1 ? tileSize(`${targets[0].title} ${targets[0].description}`) : null;
      if (size) add({ kind: 'text', text: `rivestimento gres ${size.join(' ')}` });
      add({ kind: 'text', text: query });
      add({ kind: 'text', text: /gres/.test(normalized(term)) ? 'rivestimento gres' : 'rivestimento piastrelle' });
      add({ kind: 'text', text: 'piastrelle pareti' });
      continue;
    }
    if (k === 'sanitary') {
      const item = /\bwc\b|\bvaso\b/.test(normalized(term)) ? ['vaso wc', 'vaso pavimento', 'vaso sanitario'] : /bidet/.test(normalized(term)) ? ['bidet'] : /lavabo/.test(normalized(term)) ? ['lavabo'] : /piatto.*doccia/.test(normalized(term)) ? ['piatto doccia'] : ['apparecchio sanitario', 'sanitari'];
      for (const noun of item) add({ kind: 'text', text: `${isRemoval(term) ? 'rimozione ' : /montaggio|collegament|\bposa\b/i.test(term) ? 'posa ' : ''}${noun}` });
      continue;
    }
    if (k === 'paint') {
      // Prefer technical nouns found in regional descriptions, not room names,
      // "fascia alta", quantities or long chat wording as mandatory terms.
      const scope = normalized(`${term} ${targets.slice(0, 30).filter(p => kind(p.title) === 'paint').map(p => p.description).join(' ')}`);
      const exclusions = [/fotocatalitic|biossido di titanio/.test(scope) ? '' : ' -fotocatalitico -biossido', /antibatteric/.test(scope) ? '' : ' -antibatterico', /ignifug|intumescent/.test(scope) ? '' : ' -ignifuga -intumescente'].join('');
      const alternatives = /soffitt/.test(normalized(term)) ? ['pitturazione soffitti', 'tinteggiatura soffitti'] : ['pitturazione pareti', 'tinteggiatura pareti'];
      add({ kind: 'text', text: alternatives.map(q => q + exclusions).join(' or ') });
      add({ kind: 'text', text: ['idropittura lavabile', 'pittura lavabile'].map(q => q + exclusions).join(' or ') });
      continue;
    }
    if ((k === 'floor' || /rivestiment/.test(normalized(term))) && isRemoval(term)) {
      add({ kind: 'text', text: 'rimozione piastrelle or demolizione piastrelle' });
      if (/rivestiment/.test(normalized(term))) { add({ kind: 'text', text: 'rimozione rivestimenti or demolizione rivestimenti' }); continue; }
    }
    if (k === "windows" && !isRemoval(term)) {
      const material = /pvc/i.test(term) ? " pvc" : /legno/i.test(term) ? " legno" : "";
      for (const alias of ["serramenti", "finestre", "infissi"]) add({ kind: "text", text: `${alias}${material}` });
      continue;
    }
    // Synonyms are a deterministic discovery aid, never a technical equivalence.
    if (k === "floor" && isRemoval(term)) query = "demolizione pavimenti or rimozione pavimenti or disfacimento pavimenti";
    if (k === "skirting") query = "battiscopa or zoccolino";
    const relevant = targets.slice(0, 30).filter(p => tokens(p.title).some(w => keys.includes(w)) || kind(p.title) === k && k !== "other");
    const scope = `${term} ${relevant.map(p => `${p.title} ${p.description}`).join(" ")}`;
    const excluded = [ [/piscin/, "piscine"], [/tattil/, "tattili"], [/sopraelevat|galleggiant/, "sopraelevati -galleggiante"] ] as const;
    // Parenthesized raw tsquery would not be portable through websearch. Apply
    // exclusions only to conjunctive searches; OR variants remain bounded/ranked.
    if (!query.includes(" or ")) {
      for (const [pattern, word] of excluded) if (!pattern.test(normalized(scope))) query += ` -${word}`;
      if (k === "floor" && !/battiscop|zoccolin/.test(normalized(term))) query += " -battiscopa -zoccolino";
      const requestedSize = k === "floor" ? relevant.map(p => tileSize(`${p.title} ${p.description}`)).find(Boolean) : null;
      if (requestedSize) add({ kind: "text", text: `${query} ${requestedSize[0]}` });
    }
    add({ kind: "text", text: query });
  }
  return queries;
}
export function rankCatalogueReferences(refs: QuoteChatReference[], targets: QuoteChatProposal[], existingIds: string[] = []): QuoteChatReference[] {
  const byId = new Map(refs.map(r => [r.id, r]));
  const kept = existingIds.slice(0, CATALOGUE_LIMITS.existing).map(id => byId.get(id)).filter((r): r is QuoteChatReference => !!r);
  const score = (r: QuoteChatReference, p: QuoteChatProposal) => {
    const d = tokens(r.description), t = tokens(`${p.title} ${p.description}`);
    const overlap = t.reduce((n, w) => n + (d.some(v => v.startsWith(w.slice(0, Math.max(4, w.length - 2)))) ? 1 : 0), 0);
    return overlap * 3 + (kind(p.title) !== "other" && kind(p.title) === kind(r.description.split(/—/)[0]) ? 12 : 0) - assessCatalogueMatch(p, r).length * 30;
  };
  const pool = [...byId.values()].filter(r => !kept.some(k => k.id === r.id));
  const limitedTargets = targets.slice(0, 30);
  const scores = new Map(pool.map(r => [r.id, limitedTargets.map(p => score(r, p))]));
  const chosen = new Map<string, QuoteChatReference>();
  // Diversity: each proposed line gets candidates, not 24 colour variants of one.
  for (let i = 0; i < limitedTargets.length; i++) {
    for (const r of [...pool].sort((a, b) => scores.get(b.id)![i] - scores.get(a.id)![i] || a.code.localeCompare(b.code) || a.id.localeCompare(b.id)).slice(0, 3)) if (scores.get(r.id)![i] > 0 && chosen.size < CATALOGUE_LIMITS.candidates) chosen.set(r.id, r);
  }
  const best = (r: QuoteChatReference) => Math.max(0, ...scores.get(r.id)!);
  for (const r of pool.sort((a, b) => best(b) - best(a) || a.code.localeCompare(b.code) || a.id.localeCompare(b.id))) if (chosen.size < CATALOGUE_LIMITS.candidates) chosen.set(r.id, r);
  return [...kept, ...chosen.values()];
}
