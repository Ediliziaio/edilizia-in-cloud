/**
 * «Lavoro a 18.000 € con il 25% di margine: quanto posso spendere?» scritto in chat.
 *
 * Il modello non vede costi e non deve inventarli: la domanda ha una risposta aritmetica che dipende solo da
 * prezzo e margine, e la dà il programma, subito, senza chiamare la AI. Il confronto con i costi veri del
 * computo sta nella scheda «Obiettivo di margine e tempi» dello step Economia: la risposta lo dice.
 *
 * Margine = (prezzo − costi) / prezzo, sul prezzo IVA esclusa, come nel resto del sistema. Se la frase dice
 * «IVA inclusa» serve l'aliquota (la scrive la frase): senza, si chiede invece di indovinarla.
 */
import { MARGINE_MASSIMO_PCT } from './obiettivoMargine';
import { formatCurrency } from '@/lib/formatters';

export interface DomandaMargine { prezzo: number; marginePct: number; ivaInclusa: boolean; ivaPct: number | null }

const NUMERO = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?`;
const importo = (raw: string): number => {
  const s = raw.trim();
  const v = /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(',', '.');
  return Number(v);
};

/** Riconosce solo domande esplicite: una cifra in euro e un margine in %, nella stessa frase. */
export function margineChatIntent(text: string): DomandaMargine | null {
  if (text.length > 400 || /```|\[DOCUMENTO|<document/i.test(text)) return null;
  const t = text.replace(/\s+/g, ' ');
  if (!/\b(?:margine|guadagn\w+|utile)\b/i.test(t)) return null;
  const m = new RegExp(String.raw`(?:margine|guadagn\w+|utile)[^%\d]{0,25}(${NUMERO})\s*%|(${NUMERO})\s*%\s*(?:di\s+)?(?:margine|guadagn\w+|utile)`, 'i').exec(t);
  if (!m) return null;
  const marginePct = importo(m[1] ?? m[2]);
  // L'importo: «18.000 €», «€ 18000», «18000 euro», «18k». La percentuale e l'aliquota IVA non sono importi.
  const senzaPercentuali = t.replace(new RegExp(String.raw`(?:${NUMERO})\s*%`, 'g'), ' ');
  const e = new RegExp(String.raw`(?:€\s*(${NUMERO})|(${NUMERO})\s*(?:€|euro\b)|(\d+(?:[.,]\d+)?)\s*k\b)`, 'i').exec(senzaPercentuali);
  if (!e) return null;
  const prezzo = e[3] ? Number(e[3].replace(',', '.')) * 1000 : importo(e[1] ?? e[2]);
  if (!Number.isFinite(prezzo) || !Number.isFinite(marginePct)) return null;
  const ivaInclusa = /\biva\s+inclusa\b|\bivat[oa]\b|\bcon\s+iva\b|\bivaincl/i.test(t) && !/\b(?:iva\s+esclusa|senza\s+iva|\+\s*iva|pi[uù]\s+iva)\b/i.test(t);
  const iva = /\biva\s*(?:al\s*)?(\d{1,2}(?:[.,]\d+)?)\s*%|(\d{1,2}(?:[.,]\d+)?)\s*%\s*(?:di\s+)?iva\b/i.exec(t);
  return { prezzo, marginePct, ivaInclusa, ivaPct: iva ? Number((iva[1] ?? iva[2]).replace(',', '.')) : null };
}

const euro = formatCurrency;

export function margineChatReply(d: DomandaMargine): string {
  if (!(d.prezzo > 0)) return 'Indicami il prezzo in euro e il margine che vuoi.';
  if (!(d.marginePct >= 0 && d.marginePct <= MARGINE_MASSIMO_PCT)) return `Il margine va da 0% a ${MARGINE_MASSIMO_PCT}%.`;
  let netto = d.prezzo, nota = 'Intendo il prezzo IVA esclusa; se è IVA inclusa scrivilo, con l’aliquota.';
  if (d.ivaInclusa) {
    if (d.ivaPct == null || d.ivaPct < 0 || d.ivaPct > 30) return 'Mi hai detto IVA inclusa, ma non l’aliquota: scrivi per esempio «IVA 10%», oppure dammi l’importo IVA esclusa.';
    netto = d.prezzo / (1 + d.ivaPct / 100); nota = `Tolgo l’IVA al ${d.ivaPct.toLocaleString('it-IT')}%: prezzo netto ${euro(netto)}.`;
  }
  const tetto = netto * (1 - d.marginePct / 100);
  return `Per avere il ${d.marginePct.toLocaleString('it-IT')}% di margine su ${euro(netto)} puoi spendere al massimo **${euro(tetto)}** tra materiali e manodopera (il margine è sul prezzo: ${euro(netto - tetto)}). ${nota}\n\nPer vedere se ci stai dentro con i costi veri del computo, apri «Obiettivo di margine e tempi» nello step Economia del preventivo: lì trovi lo sforo, dove tagliare e i tempi della squadra. Qui in chat non ho i tuoi costi e non li invento.`;
}
