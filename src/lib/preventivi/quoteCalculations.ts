/** Local arithmetic only: never eval, code, variables, units or model prices. */
import type { QuoteChatProposal } from '../../../supabase/functions/_shared/quoteConversation';
export type QuoteQuantityCalculation = { expression: string; result: number; unit: string };
export type QuoteFormulaProposal = QuoteQuantityCalculation & { assumptions: string };
// Avoid the legacy endpoint's read-only keywords in this executable proposal
// request. Proposals still require a distinct local human confirmation.
export const QUOTE_FORMULA_REQUEST = 'Prepara al massimo sei proposte per aggiornare quantityBasis con formule delle quantità, usando gli stessi ID e le specifiche già presenti. Formato esatto per ogni quantityBasis: FORMULA: espressione aritmetica con soli numeri in metri, parentesi e + - * /; DATI: misure e detrazioni da controllare. Metti solo l’espressione, senza segno uguale e senza risultato. Quantità ed economia sono gestite dai controlli locali: le formule verranno presentate nella chat per una conferma separata. Puoi proporre il solo quantityBasis anche per una voce protetta. Usa le misure già dichiarate, distinguendo elementi vecchi e nuovi. Quando i dati non bastano, lascia quantity null e chiedi soltanto i dati mancanti. Per questo turno searches vuoto, referenceId uguale al precedente, nessun altro aggiornamento richiesto.';
/** A formula-only request must not silently become an ordinary numeric edit. */
export function guardQuoteFormulaTurn(message: string, proposals: QuoteChatProposal[], previous: QuoteChatProposal[]) {
  const formulaOnly = message.startsWith(QUOTE_FORMULA_REQUEST) || /proponi\s+(?:le\s+)?formule\s+da\s+confermare/i.test(message);
  if (!formulaOnly) return { formulaOnly, proposals, notices: [] as string[] };
  const notices: string[] = [];
  const accepted: QuoteChatProposal[] = [];
  for (const p of proposals) {
    const old = previous.find(l => l.id === p.id);
    try {
      if (!old || !proposedQuantityFormula(p.quantityBasis, old.unit)) throw new Error();
      // Only the proposal's basis may change; never units, prices, references,
      // specifications or an LLM-provided numerical result in this turn.
      accepted.push({ ...old, quantityBasis: p.quantityBasis });
    } catch { notices.push(`Formula non applicata per «${p.title}»: manca un’espressione valida da confermare. Quantità e specifiche conservate.`); }
  }
  return { formulaOnly, proposals: accepted, notices };
}
/** Backward-compatible LLM contract: quantityBasis carries a proposal, never a command. */
export function proposedQuantityFormula(basis: string, unit: string): QuoteFormulaProposal | null {
  const match = /^FORMULA:\s*([^;\n]+)(?:[;\n]\s*(?:IPOTESI:)?\s*([\s\S]*))?$/i.exec(basis.trim());
  if (!match) return null;
  if (!unit.trim() || unit.length > 24) throw new Error('Unità della formula mancante o non valida.');
  const expression = match[1].trim(), assumptions = (match[2] || 'Misure, detrazioni e unità da confermare prima di applicare.').slice(0, 1000);
  // A common LLM error: area × bed thickness is volume, not a smaller area.
  // This narrow dimensional check does not claim to certify every formula.
  const depth = /spessore[^\d;\n]{0,40}(\d+(?:[.,]\d+)?)\s*(cm|mm)\b/i.exec(assumptions);
  if (/^(?:m²|m2|mq)$/i.test(unit.trim()) && depth) {
    const meters = Number(depth[1].replace(',', '.')) / (depth[2].toLowerCase() === 'cm' ? 100 : 1000);
    const factors = expression.replace(/,/g, '.').match(/\d+(?:\.\d+)?/g) ?? [];
    if (/[*×]/.test(expression) && factors.some(n => Math.abs(Number(n) - meters) < 1e-10)) throw new Error('Area moltiplicata per spessore: risultato volumetrico incompatibile con m². Mantieni l’area o scegli una voce misurata in m³.');
  }
  return { expression, result: calculateQuoteQuantity(expression), unit, assumptions };
}
export function readFormulaProposal(raw: unknown): QuoteFormulaProposal {
  const c = readQuantityCalculation(raw); const assumptions = (raw as QuoteFormulaProposal).assumptions;
  if (typeof assumptions !== 'string' || !assumptions.trim() || assumptions.length > 1000) throw new Error('Ipotesi della formula non valide.');
  return { ...c, assumptions };
}
export type QuoteIndicativeEstimate = { low: number; high: number; unit: string; basis: string; assumptions: string; origin: 'user' | 'catalogue'; codes: string[]; sourceId?: string };
const rounded = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function calculateQuoteQuantity(expression: string): number {
  const source = expression.replace(/[×x]/g, '*').replace(/[−–]/g, '-').replace(/÷/g, '/').replace(/,/g, '.').replace(/\s/g, '');
  if (!source || source.length > 240 || /[^0-9.+*/()-]/.test(source)) throw new Error('Usa solo numeri, parentesi e + − × ÷; le misure devono essere nella stessa unità.');
  const tokens = source.match(/\d+(?:\.\d+)?|[()+*/-]/g) ?? [];
  if (tokens.join('') !== source || tokens.length > 100) throw new Error('Formula non valida o troppo lunga.');
  let cursor = 0;
  const safe = (n: number) => { if (!Number.isFinite(n) || Math.abs(n) > 1e9) throw new Error('Calcolo fuori limite.'); return n; };
  const atom = (depth: number): number => {
    if (depth > 12) throw new Error('Troppe parentesi.');
    const token = tokens[cursor++];
    if (token === '+' || token === '-') return safe((token === '-' ? -1 : 1) * atom(depth + 1));
    if (token === '(') { const result = sum(depth + 1); if (tokens[cursor++] !== ')') throw new Error('Parentesi non bilanciate.'); return result; }
    if (!token || !/^\d+(?:\.\d+)?$/.test(token)) throw new Error('Numero mancante nella formula.');
    return safe(Number(token));
  };
  const product = (depth: number): number => {
    let n = atom(depth);
    while (tokens[cursor] === '*' || tokens[cursor] === '/') {
      const op = tokens[cursor++]; const rhs = atom(depth);
      if (op === '/' && rhs === 0) throw new Error('Divisione per zero.');
      n = safe(op === '*' ? n * rhs : n / rhs);
    }
    return n;
  };
  const sum = (depth: number): number => { let n = product(depth); while (tokens[cursor] === '+' || tokens[cursor] === '-') { const op = tokens[cursor++]; const rhs = product(depth); n = safe(op === '+' ? n + rhs : n - rhs); } return n; };
  const result = rounded(sum(0));
  if (cursor !== tokens.length || result < .01 || result > 1e6) throw new Error('Quantità non positiva o fuori limite: controlla detrazioni e unità.');
  return result;
}
export function readQuantityCalculation(raw: unknown): QuoteQuantityCalculation {
  if (!raw || typeof raw !== 'object') throw new Error('Formula salvata non valida.');
  const c = raw as QuoteQuantityCalculation;
  if (typeof c.expression !== 'string' || typeof c.unit !== 'string' || !c.unit.trim() || c.unit.length > 24 || calculateQuoteQuantity(c.expression) !== c.result) throw new Error('Risultato della formula salvata non coerente.');
  return { expression: c.expression, result: c.result, unit: c.unit };
}
export function readIndicativeEstimate(raw: unknown): QuoteIndicativeEstimate {
  if (!raw || typeof raw !== 'object') throw new Error('Stima non valida.');
  const e = raw as QuoteIndicativeEstimate;
  if (![e.low, e.high].every(n => typeof n === 'number' && Number.isFinite(n) && n >= .01 && n <= 1e6) || e.low > e.high
    || typeof e.unit !== 'string' || !e.unit.trim() || e.unit.length > 24 || typeof e.basis !== 'string' || !e.basis.trim() || e.basis.length > 1000
    || typeof e.assumptions !== 'string' || !e.assumptions.trim() || e.assumptions.length > 1000 || !['user', 'catalogue'].includes(e.origin)
    || !Array.isArray(e.codes) || e.codes.length > 6 || e.codes.some(c => typeof c !== 'string' || c.length > 160) || e.origin === 'catalogue' && (!e.codes.length || typeof e.sourceId !== 'string' || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(e.sourceId))) throw new Error('Indica intervallo positivo, origine e ipotesi della stima.');
  return { low: rounded(e.low), high: rounded(e.high), unit: e.unit, basis: e.basis, assumptions: e.assumptions, origin: e.origin, codes: [...e.codes], ...(e.origin === 'catalogue' ? { sourceId: e.sourceId } : {}) };
}
