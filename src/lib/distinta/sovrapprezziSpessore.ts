/**
 * Lo spessore che un sovrapprezzo «per ogni cm in più» aggiunge alla voce principale (17/11/2026).
 *
 * Nel computo: «cappotto con pannelli EPS… spessore 3 cm» su 3.104,39 m², poi «sovrapprezzo per ogni
 * cm in più» con la misura 9 × 3.054,24 = 27.488,16 m²×cm. Il sovrapprezzo non è superficie da
 * comprare (la distinta lo esclude), ma dice lo spessore vero: 3.054,24 m² a 12 cm, e il resto
 * (50,15 m² di aggetti) a 3 cm. Prima i pannelli uscivano tutti da 3 cm.
 *
 * Qui la voce principale si divide nelle parti con spessori diversi, prima della distinta: le due
 * parti tengono l'id della voce (le origini restano sue) e differiscono nel testo dello spessore,
 * che la distinta già legge (`specificheDallaVoce`, `scalaSpessore`).
 */
import { normalizzaTesto, spessoreCm, type VoceComputo } from "./generaDistinta";

export interface MisuraVoce { quantita?: number | null; parti_uguali?: number | null }
export type VoceConMisure = VoceComputo & { misure?: MisuraVoce[] | null };

const PER_CM = /per ogni (?:cm|centimetro)/;
const SUPERFICIE = /^(m2|mq|m²)$/i;
const vicini = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.011, Math.abs(b) * 0.0005);
const testo = (v: VoceComputo) => `${v.descrizione_breve} ${v.descrizione_estesa ?? ""}`;

/** Riscrive il primo «spessore N cm/mm» del testo con lo spessore totale. */
export function conSpessore(t: string, cm: number): string {
  const nuovo = `spessore ${cm.toLocaleString("it-IT")} cm`;
  const re = /\b(?:sp\.?|spess(?:ore|\.)?)\s*(?:di\s*)?(?:cm\.?\s*)?\d+(?:[.,]\d+)?\s*(?:cm|mm)?/i;
  return re.test(t) ? t.replace(re, nuovo) : `${t} (${nuovo})`;
}

/** La voce principale di un sovrapprezzo: la più vicina prima, in superficie, che non sia a sua volta un sovrapprezzo. */
function principale(voci: VoceConMisure[], i: number): number | null {
  for (let k = i - 1; k >= Math.max(0, i - 3); k--) {
    const w = voci[k];
    if (!SUPERFICIE.test((w.unita_misura ?? "").trim())) continue;
    if (/sovrapprezz|maggiorazion/.test(normalizzaTesto(testo(w)))) continue;
    if (spessoreCm(testo(w)) == null) return null;
    return k;
  }
  return null;
}

export function applicaSovrapprezziSpessore<T extends VoceConMisure>(voci: T[]): T[] {
  const sostituite = new Map<number, T[]>();
  voci.forEach((s, i) => {
    if (!SUPERFICIE.test((s.unita_misura ?? "").trim()) || !PER_CM.test(normalizzaTesto(testo(s)))) return;
    const qS = Number(s.quantita ?? 0);
    const k = principale(voci, i);
    if (k == null || !(qS > 0) || sostituite.has(k)) return;
    const b = voci[k];
    const qB = Number(b.quantita ?? 0);
    const sp0 = spessoreCm(testo(b));
    if (!(qB > 0) || sp0 == null) return;

    // La parte che riceve il sovrapprezzo: la misura «N × area» dove l'area è una misura della voce principale.
    let area = qB;
    let extra = qS / qB;
    const mS = (s.misure ?? []).filter((m) => Number(m.quantita) > 0);
    if (mS.length === 1 && Number(mS[0].parti_uguali) > 1) {
      const n = Number(mS[0].parti_uguali);
      const porzione = Number(mS[0].quantita) / n;
      const trovata = (b.misure ?? []).some((m) => m.quantita != null && vicini(Number(m.quantita), porzione)) || vicini(porzione, qB);
      if (trovata) { area = porzione; extra = n; }
    }
    extra = Math.round(extra * 2) / 2; // a mezzo centimetro
    if (!(extra > 0)) return;
    const totale = sp0 + extra;
    const nota = ` [spessore ${totale.toLocaleString("it-IT")} cm: ${sp0.toLocaleString("it-IT")} + ${extra.toLocaleString("it-IT")} dal sovrapprezzo${s.numero_ordine ? ` (voce ${s.numero_ordine})` : ""}]`;
    const conIlSovrapprezzo = {
      ...b, quantita: Math.round(area * 100) / 100,
      descrizione_breve: conSpessore(b.descrizione_breve, totale),
      descrizione_estesa: (b.descrizione_estesa ? conSpessore(b.descrizione_estesa, totale) : "") + nota,
    } as T;
    const resto = Math.round((qB - area) * 100) / 100;
    sostituite.set(k, resto > 0.01 ? [conIlSovrapprezzo, { ...b, quantita: resto } as T] : [conIlSovrapprezzo]);
  });
  if (!sostituite.size) return voci;
  return voci.flatMap((v, i) => sostituite.get(i) ?? [v]);
}
