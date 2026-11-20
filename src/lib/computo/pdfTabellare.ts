import type { PdfPaginaPosizionata, PdfPezzoTesto } from "./primusPdf";
import type { ComputoStrutturato, ComputoVoceStrutturata } from "./computoStrutturato";
import { completaFasiComputo } from "../../../supabase/functions/_shared/computoFasiOperative";

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const testo = (r: PdfPezzoTesto[]) => r.map(p => p.text.trim()).filter(Boolean).join(" ");
const numero = (s: string): number | null => {
  let t = s.replace(/€/g, "").replace(/\s+/g, "");
  if (!/^[+-]?\d[\d.,]*$/.test(t)) return null;
  if (t.includes(",") && t.includes(".")) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (t.includes(",")) t = t.replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
function righe(items: PdfPezzoTesto[]) {
  const out: PdfPezzoTesto[][] = [];
  for (const p of items.filter(p => p.text.trim()).sort((a, b) => b.y - a.y || a.x - b.x)) {
    const r = out.at(-1);
    if (!r || Math.abs(r[0].y - p.y) > 1.8) out.push([p]); else r.push(p);
  }
  return out.map(r => r.sort((a, b) => a.x - b.x));
}
const UM = /^(?:m[²³23]|m[qcl]|m|kg|ton|t|q|cad(?:\.|\/mese)?|cad\/me|n\.?|nr\.?|pz|h|ore|acorpo|corpo|m[²2q]\/mese|m[²2q]xcm|100kg)$/i;
const eUnita = (s: string) => UM.test(s.replace(/\s+/g, ""));
const CODE = /(?:[A-Z]\.\d+(?:\.\d+)*(?:\(\d+\))?(?:\/[a-z0-9]+|_[a-z]+)?|[A-Z]\s+\d+(?:\.\d+)+(?:\.[a-z]\b|\s+[a-z]\b)?)/i;

/**
 * Tabelle con U.M., quantità, prezzo e importo in colonne distinte.
 * Ogni riga viene accettata solo quando tutte le colonne numeriche sono leggibili.
 * I riepiloghi, senza quantità e prezzo, non diventano una seconda lista di lavori.
 */
export function leggiPdfTabellare(pagine: PdfPaginaPosizionata[], diagnostica?: (d: { voci: ComputoVoceStrutturata[]; totale: number | null }) => void): ComputoStrutturato | null {
  if (!pagine.slice(0, 3).some(p => /computo metrico/i.test(testo(p.items)))) return null;
  const voci: ComputoVoceStrutturata[] = [], avvisi: string[] = [];
  let corrente: { numero: string; codice: string; descrizioni: string[]; base: string; pagina: number; capitolo: string | null } | null = null;
  let capitolo: string | null = null, totale: number | null = null, sicurezza = false;
  let colonne: { q: number; p: number; i: number; qx: number; ordx: number } | null = null;
  for (const pg of pagine) {
    const q = pg.items.find(p => /^quantita['’]?$/i.test(norm(p.text)));
    const p = q && pg.items.find(p => p.x > q.x && Math.abs(p.y - q.y) < 60 && /^(?:prezzo|prezzo unitario|unitario)$/i.test(norm(p.text)));
    const i = q && pg.items.find(x => x.x > (p ? p.x : q.x) && Math.abs(x.y - q.y) < 60 && /^(?:importo|totale|totale per lavori)$/i.test(norm(x.text)));
    if (q && p && i) {
      const centro = (x: PdfPezzoTesto) => (x.x + (x.right ?? x.x + x.text.length * 4)) / 2;
      const ordine = pg.items.find(x => /^(?:n\.r\.|numero(?: d.ordine)?)$/i.test(x.text.trim()));
      colonne = { q: q.x - 65, p: (centro(q) + centro(p)) / 2, i: (centro(p) + centro(i)) / 2, qx: q.x,
        ordx: ordine ? ordine.x + 10 : Math.min(100, q.x - 120) };
    }
    if (!colonne) continue;
    for (const r of righe(pg.items)) {
      const tutti = testo(r), sinistra = r.filter(p => p.x < colonne!.q);
      const sx = testo(sinistra);
      const valori = r.flatMap(p => { const n = numero(p.text); return n == null ? [] : [{ x: p.x, n }]; });
      const qs = valori.filter(n => n.x >= colonne!.q && n.x < colonne!.p);
      const ps = valori.filter(n => n.x >= colonne!.p && n.x < colonne!.i);
      const is = valori.filter(n => n.x >= colonne!.i);
      const haTotale = qs.length === 1 && ps.length === 1 && is.length === 1;
      if (!haTotale && /^(?:totale(?: per lavorazioni opere| opere| euro)?|(?:ImpC )?Sommano)\s*$/i.test(sx) && is.length) totale = is.at(-1)!.n;
      if (!haTotale && /^(?:(?:A6|ImpC)\s+)?(?:TOTALE PER LAVORAZIONI OPERE|TOTALE OPERE|IMPORTO CONTRATTUALE NETTO|AMMONTARE COMPLESSIVO INTERVENTO)\b/i.test(tutti) && valori.length) totale = valori.at(-1)!.n;
      const cap = /^(?:LM\d*|LC\d*|OS(?:\.\d+\.[a-z])?)\s+(.+)/i.exec(sx);
      const titolo = sinistra.length > 0 && /[A-ZÀ-Ü]{3}/.test(sx) && sx === sx.toUpperCase()
        && !/COMPUTO|DESCRIZIONE|NUMERO|ORDINE|QUANTIT|IMPORT|PREZZO|EURO|RIPORT|SOMMANO|TOTALE|FATTORI|DIMENSIONI/.test(sx);
      if (!haTotale && (cap || (titolo && is.length === 1 && !qs.length && !ps.length))) {
        capitolo = cap ? cap[1].trim() : sx;
        if (cap) sicurezza = /^OS/i.test(sx);
        else if (/sicurezza|apprestamenti|misure preventive|protezione collettiva/i.test(sx)) sicurezza = true;
      }
      const primo = sinistra[0], ord = primo && (/^(?:Nr\.?|N\.R\.?)\s*(\d+)$/i.exec(primo.text.trim())?.[1] ?? (/^\d{1,4}$/.test(primo.text.trim()) ? primo.text.trim() : null));
      const codice = sx.match(CODE)?.[0] ?? "";
      if (ord && primo.x < colonne.ordx) {
        corrente = { numero: ord, codice, descrizioni: [], base: "", pagina: pg.page, capitolo };
      }
      if (corrente && !corrente.codice && codice && !/^Sommano/i.test(sx)) corrente.codice = codice;
      if (haTotale && corrente) {
        let unita = r.find(p => p.x < qs[0].x && eUnita(p.text.trim().replace(/^Sommano\s+/i, "")))?.text.trim().replace(/^Sommano\s+/i, "")
          ?? /\bSommano\s+([a-z²³.]+)\s*$/i.exec(sx)?.[1]?.replace(/\.$/, "") ?? null;
        if (!unita) {
          const fine = r.find(p => /^(?:cm|\/mese)$/.test(p.text.trim()) && p.x < qs[0].x);
          const prima = fine && pg.items.find(p => Math.abs(p.x - fine.x) < 2 && p.y - fine.y > 9 && p.y - fine.y < 14
            && /^(?:m[²2q]\s*x|m[²2q]|cad)$/.test(p.text.trim()));
          if (fine && prima && eUnita(prima.text + fine.text)) unita = prima.text.trim() + " " + fine.text.trim();
        }
        if (!unita || !eUnita(unita)) { avvisi.push("Pagina " + pg.page + ": unità non leggibile nella voce " + corrente.numero + "."); continue; }
        const frammento = testo(sinistra.filter(p => !eUnita(p.text.trim()) && !/^Sommano\b/i.test(p.text)));
        const descr = [...corrente.descrizioni, frammento].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
        let descrizione = descr || corrente.base || "Voce " + corrente.numero;
        descrizione = descrizione.replace(/^(?:Nr\.?\s*)?\d+\s+/i, "");
        if (corrente.codice && descrizione.startsWith(corrente.codice)) descrizione = descrizione.slice(corrente.codice.length).trim();
        const quantita = qs[0].n, prezzo = ps[0].n, importo = is[0].n;
        const incongruenza = Math.abs(Math.round(quantita * prezzo * 100) / 100 - importo) > 0.05;
        voci.push({ numero_ordine: corrente.numero, codici: corrente.codice ? [corrente.codice] : [],
          codice_tariffa: corrente.codice, descrizione, descrizione_troncata: /\.{3}|…/.test(descrizione),
          unita_misura: unita, quantita, prezzo_unitario: prezzo, importo, sezione: corrente.capitolo,
          is_sicurezza: sicurezza || /sicurezza|apprestamenti|protezion.*collettiv|misure preventive/i.test(corrente.capitolo ?? ""),
          is_detrazione: quantita < 0 || importo < 0, a_corpo: /corpo/.test(unita),
          super_categoria: null, categoria: corrente.capitolo ? { numero: 0, nome: corrente.capitolo } : null, sotto_categoria: null,
          misure: [], pagina: corrente.pagina, avvisi: incongruenza ? ["Quantità × prezzo non coincide con l'importo stampato: valori originali conservati."] : [] });
        corrente.base ||= descrizione; corrente.descrizioni = [];
        continue;
      }
      if (corrente && sx && !/^(?:Riporto|A riportare|Pag\.|Pagina|COMPUTO|N\.R\.|Numero|DESCRIZIONE|U\.M\.|Lunghezza|Larghezza|Altezza|Parti|Uguali|par\.ug\.|lung\.|larg\.|H\/peso)/i.test(sx)
        && !/^Sommano\b/i.test(sx) && !cap && !(titolo && is.length === 1 && !qs.length && !ps.length) && pg.page >= corrente.pagina) {
        corrente.descrizioni.push(sx);
      }
    }
  }
  if (voci.length < 2) return null;
  diagnostica?.({ voci, totale });
  const somma = Math.round(voci.reduce((s, v) => s + (v.importo ?? 0), 0) * 100) / 100;
  if (totale == null || Math.abs(somma - totale) > 0.05) {
    // Una lettura parziale torna al percorso AI, senza presentarsi come completa.
    return null;
  }
  return completaFasiComputo({ formato: "tabellare_pdf", metadata: {}, voci, totale_dichiarato: totale, riepiloghi: [], prezzari: [],
    avvisi: [...avvisi, "Tabella letta sul dispositivo senza AI, con controllo del totale. Le misure di dettaglio restano nel PDF originale; non sono state inventate dimensioni o distinte."] });
}
