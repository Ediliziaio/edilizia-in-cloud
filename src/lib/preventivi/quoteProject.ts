import type { ChatDocument } from './quoteChatDocument';
import type { PreliminaryQuoteBudget } from '../../../supabase/functions/_shared/quoteAdvanced';
import { calculateQuoteQuantity } from './quoteCalculations';
import { readQuoteTax, type QuoteTaxSettings } from './quoteTax';
import { readLocalQuoteSchedule, type LocalQuoteSchedule } from './quoteSchedule';

export type QuoteBudgetTarget = { amount: number; basis: 'net' | 'gross' | 'unspecified'; evidence: string };
export type QuoteLineCost = { id: string; materials: number | null; hours: number | null; hourlyRate: number | null; subcontract: number | null; other: number | null; scope?: string };
export type QuoteRoomMeasures = { id: string; name: string; length: number | null; width: number | null; height: number | null; tileHeight: number | null; tiledOpenings: number | null; paintOpenings: number | null; wastePct: number | null };
export const QUANTITY_KINDS = { floor: 'Pavimento netto', ceiling: 'Soffitto', tiles: 'Rivestimenti netti', paint: 'Pareti sopra rivestimento', floorSupply: 'Fornitura pavimento con sfrido', tileSupply: 'Fornitura rivestimenti con sfrido' } as const;
export type QuoteQuantityKind = keyof typeof QUANTITY_KINDS;
export type QuoteProject = {
  target: QuoteBudgetTarget | null;
  costs: QuoteLineCost[];
  overheadPct: number | null; contingencyPct: number | null; targetMarginPct: number | null;
  crewSize: number | null; hoursPerDay: number | null;
  rooms: QuoteRoomMeasures[];
  links: Array<{ lineId: string; roomId: string; kind: QuoteQuantityKind }>;
  address: string; propertyType: string; notes: string;
  tax?: QuoteTaxSettings;
  schedule?: LocalQuoteSchedule;
  proposalNotes?: string;
};
export const emptyQuoteProject = (): QuoteProject => ({ target: null, costs: [], overheadPct: null, contingencyPct: null, targetMarginPct: null, crewSize: null, hoursPerDay: null, rooms: [], links: [], address: '', propertyType: '', notes: '' });
const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const number = (v: unknown, max = 1e9): number | null => { if (v === null) return null; if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) throw new Error('Valore economico o misura non valido.'); return v; };
const text = (v: unknown, max: number): string => { if (typeof v !== 'string' || v.length > max) throw new Error('Dati progetto non validi.'); return v; };
const id = (v: unknown) => { const s = text(v, 80); if (!/^[a-z\d_-]+$/i.test(s)) throw new Error('Identità progetto non valida.'); return s; };
const list = (v: unknown, max: number): unknown[] => { if (!Array.isArray(v) || v.length > max) throw new Error('Dati progetto oltre limite.'); return v; };
const object = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Dati progetto non validi.'); return v as Record<string, unknown>; };
export function readQuoteProject(raw: unknown): QuoteProject {
  const p = object(raw); let target: QuoteBudgetTarget | null = null;
  if (p.target != null) {
    const t = object(p.target); const amount = number(t.amount);
    if (!amount || !['net', 'gross', 'unspecified'].includes(String(t.basis))) throw new Error('Budget obiettivo non valido.');
    target = { amount, basis: t.basis as QuoteBudgetTarget['basis'], evidence: text(t.evidence, 1000) };
  }
  const costs = list(p.costs, 100).map(v => { const c = object(v); return { id: id(c.id), materials: number(c.materials), hours: number(c.hours, 100000), hourlyRate: number(c.hourlyRate, 100000), subcontract: number(c.subcontract), other: number(c.other), ...(c.scope == null ? {} : { scope: text(c.scope, 6500) }) }; });
  const rooms = list(p.rooms, 20).map(v => { const r = object(v); return { id: id(r.id), name: text(r.name, 80), length: number(r.length, 1000), width: number(r.width, 1000), height: number(r.height, 100), tileHeight: number(r.tileHeight, 100), tiledOpenings: number(r.tiledOpenings, 1e6), paintOpenings: number(r.paintOpenings, 1e6), wastePct: number(r.wastePct, 100) }; });
  const links = list(p.links, 100).map(v => { const l = object(v); if (!Object.hasOwn(QUANTITY_KINDS, String(l.kind))) throw new Error('Dipendenza quantità non valida.'); return { lineId: id(l.lineId), roomId: id(l.roomId), kind: l.kind as QuoteQuantityKind }; });
  if (new Set(costs.map(c => c.id)).size !== costs.length || new Set(rooms.map(r => r.id)).size !== rooms.length || new Set(links.map(l => l.lineId)).size !== links.length || links.some(l => !rooms.some(r => r.id === l.roomId))) throw new Error('Dati progetto duplicati o dipendenze mancanti.');
  const result = { target, costs, rooms, links, overheadPct: number(p.overheadPct, 100), contingencyPct: number(p.contingencyPct, 100), targetMarginPct: number(p.targetMarginPct, 99.99), crewSize: number(p.crewSize, 1000), hoursPerDay: number(p.hoursPerDay, 24), address: text(p.address, 300), propertyType: text(p.propertyType, 100), notes: text(p.notes, 3000) };
  if (result.crewSize != null && (!Number.isInteger(result.crewSize) || result.crewSize < 1) || result.hoursPerDay != null && result.hoursPerDay <= 0) throw new Error('Composizione squadra non valida.');
  return { ...result, ...(p.tax == null ? {} : { tax: readQuoteTax(p.tax) }), ...(p.schedule == null ? {} : { schedule: readLocalQuoteSchedule(p.schedule) }), ...(p.proposalNotes == null ? {} : { proposalNotes: text(p.proposalNotes, 9000) }) };
}
/** A budget is a constraint, never a licence to invent quantities or force prices. */
export function quoteBudgetIntent(message: string): QuoteBudgetTarget | null {
  if (/\b(?:non|senza)\s+(?:un\s+)?budget\b|\b(?:voce|unitario|fattura)\b/i.test(message)) return null;
  if (!/budget|spendere|spesa|preventivo|bagno|ristruttur|impianto|tetto|serrament|fotovoltaic/i.test(message)) return null;
  const tokens = [...message.matchAll(/(?:\b(?:budget|spendere|massimo|tetto di spesa)\s*(?:di\s*)?)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\s*(€|euro\b)/gi)];
  if (tokens.length !== 1) return null;
  const amount = Number(tokens[0][1].replaceAll('.', '').replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) return null;
  const net = /\bnett[oi]|iva (?:esclusa|non (?:inclusa|compresa))|oltre (?:l['’])?iva|\+\s*iva|pi[uù]\s+iva/i.test(message), gross = /\blord[oi]|iva (?:inclusa|compresa)|compres[ao] (?:l['’])?iva|tutto compreso/i.test(message) && !/iva non (?:inclusa|compresa)/i.test(message);
  return { amount, basis: net === gross ? 'unspecified' : net ? 'net' : 'gross', evidence: message.slice(0, 1000) };
}
export function quoteProjectBrief(project: QuoteProject): string {
  const target = project.target;
  return `${target ? `BUDGET UTENTE: ${target.amount} EUR, ${target.basis === 'net' ? 'netto IVA esclusa' : target.basis === 'gross' ? 'lordo IVA inclusa' : 'base IVA non specificata: chiedi di chiarirla'}. Vincolo, NON prezzo calcolato. Non ridistribuire importi per raggiungerlo: se non compatibile proponi alternative di ambito/materiali con differenze esplicite.` : ''} ${project.rooms.map(r => `Misure dichiarate ${r.name}: ${r.length ?? '?'} x ${r.width ?? '?'} m, altezza ${r.height ?? '?'} m; fascia rivestita ${r.tileHeight ?? '?'} m.`).join(' ')} Nessun costo aziendale mancante vale zero. Le modifiche a righe protette possono essere PROPOSTE con lo stesso ID e saranno mostrate per approvazione, mai applicate dal modello.`.slice(0, 1200);
}
export const quoteCostScope = (line: ChatDocument['lines'][number]) => JSON.stringify([line.title, line.description, line.quantity, line.unit]);
/** Preliminary ranges are NET. Never trust a prose affordability claim or
 * compare a gross target with a net range without a known VAT rate. */
export function quoteBudgetTargetCheck(budget: PreliminaryQuoteBudget, target: QuoteBudgetTarget | null, vat: number | null) {
  if (!target || target.basis === 'unspecified' || target.basis === 'gross' && vat == null) return null;
  const factor = target.basis === 'gross' ? 1 + vat! / 100 : 1;
  const low = Math.round(budget.groups.reduce((sum, group) => sum + group.low, 0) * factor * 100) / 100;
  const high = Math.round(budget.groups.reduce((sum, group) => sum + group.high, 0) * factor * 100) / 100;
  return { low, high, shortfall: Math.max(0, Math.round((low - target.amount) * 100) / 100), status: target.amount < low ? 'below-range' as const : target.amount > high ? 'above-range' as const : 'within-range' as const };
}
export function quoteProjectEconomy(doc: ChatDocument, project: QuoteProject, vat: number | null, discounts: Record<string, number> = {}, commercialTotals?: { net: number; gross: number | null }) {
  const rows = doc.lines.filter(l => !l.supersededBy?.length && l.included && l.quantity != null && l.price != null);
  const net = commercialTotals?.net ?? money(rows.reduce((sum, row) => sum + money(row.quantity! * row.price! * (1 - (discounts[row.id] ?? 0) / 100)), 0));
  const missing: string[] = []; let knownCosts = 0, hours = 0;
  for (const row of rows) {
    const c = project.costs.find(c => c.id === row.id);
    if (!c || c.scope !== quoteCostScope(row)) { missing.push(row.id); continue; }
    if ([c.materials, c.hours, c.hourlyRate, c.subcontract, c.other].some(n => n == null)) missing.push(row.id);
    knownCosts += (c.materials ?? 0) + (c.hours != null && c.hourlyRate != null ? c.hours * c.hourlyRate : 0) + (c.subcontract ?? 0) + (c.other ?? 0);
    hours += c.hours ?? 0;
  }
  const costsComplete = rows.length > 0 && !missing.length && project.overheadPct != null && project.contingencyPct != null;
  const base = money(knownCosts), totalCost = costsComplete ? money(base * (1 + project.overheadPct! / 100) * (1 + project.contingencyPct! / 100)) : null;
  const margin = totalCost == null ? null : money(net - totalCost);
  const gross = commercialTotals ? commercialTotals.gross : vat == null ? null : money(net * (1 + vat / 100));
  const target = project.target;
  const missingPriceRows = doc.lines.filter(l => !l.supersededBy?.length && (l.price == null || l.quantity == null)).length;
  const comparisonValue = target?.basis === 'net' ? net : target?.basis === 'gross' ? gross : null;
  return { net, gross, knownCosts: base, totalCost, missingCostRows: missing, costsComplete, margin,
    marginPct: margin == null || net <= 0 ? null : money(margin / net * 100),
    requiredPrice: totalCost != null && project.targetMarginPct != null ? money(totalCost / (1 - project.targetMarginPct / 100)) : null,
    targetDelta: target && comparisonValue != null && !missingPriceRows ? money(comparisonValue - target.amount) : null,
    hours: missing.length ? null : hours,
    crewDays: costsComplete && project.crewSize && project.hoursPerDay ? money(hours / (project.crewSize * project.hoursPerDay)) : null,
    missingPriceRows,
  };
}
export function quoteRoomQuantity(room: QuoteRoomMeasures, kind: QuoteQuantityKind) {
  const need = (value: number | null, label: string, allowZero = false) => { if (value == null || !Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) throw new Error(`Completa ${label} di ${room.name}.`); return value; };
  const a = need(room.length, 'lunghezza'), b = need(room.width, 'larghezza');
  let expression = `${a} * ${b}`;
  if (['tiles', 'paint', 'tileSupply'].includes(kind)) {
    const height = need(room.height, 'altezza'), tile = need(room.tileHeight, 'altezza rivestimento', true);
    if (tile > height) throw new Error('Il rivestimento supera l’altezza del locale.');
    expression = kind === 'paint' ? `2 * (${a} + ${b}) * (${height} - ${tile}) - ${need(room.paintOpenings, 'aperture nella fascia dipinta', true)}` : `2 * (${a} + ${b}) * ${tile} - ${need(room.tiledOpenings, 'aperture nella fascia rivestita', true)}`;
  }
  if (kind === 'tileSupply' || kind === 'floorSupply') expression = `(${expression}) * (1 + ${need(room.wastePct, 'sfrido', true)} / 100)`;
  return { expression, result: calculateQuoteQuantity(expression), unit: 'm²' };
}
/** Explicit human confirmation of linked quantities. No price or unrelated row changes. */
export function applyQuoteRoomQuantities(doc: ChatDocument, raw: QuoteProject, revision: number): ChatDocument {
  if (doc.revision !== revision) throw new Error('Le voci sono cambiate: rivedi i calcoli prima di confermare.');
  const project = readQuoteProject(raw);
  const calculations = new Map(project.links.map(link => {
    const line = doc.lines.find(l => l.id === link.lineId && !l.supersededBy?.length);
    if (!line || !/^(m²|m2|mq)$/i.test(line.unit)) throw new Error('Collega solo lavorazioni attive misurate in m².');
    return [line.id, quoteRoomQuantity(project.rooms.find(r => r.id === link.roomId)!, link.kind)];
  }));
  if (!calculations.size) throw new Error('Collega almeno una voce a una misura.');
  return { ...doc, revision: doc.revision + 1, lines: doc.lines.map(line => {
    const c = calculations.get(line.id); if (!c) return line;
    return { ...line, quantity: c.result, manual: true, included: false, calculation: { ...c, unit: line.unit }, proposedCalculation: undefined, quantityBasis: `Misure per ambiente confermate: ${c.expression} = ${c.result} ${line.unit}.` };
  }) };
}
