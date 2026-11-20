import type { ContractExtract } from "./contractExtract";
import { normalizzaUnita } from "@/lib/distinta/generaDistinta";

const NUM = "[-−]?(?:\\d{1,3}(?:\\.\\d{3})+|\\d+)(?:[,.]\\d+)?";
const UM = "(?:m²|m³|m2|m3|mq|mc|ml|mt|metri|kg|ton|lt|cad(?:auno)?|pz|pezzi|nr\\.?|n\\.|h|ore|a\\s+corpo|m|t|l)";
const scappa = (s: string) => s.replace(/[.*+?^{}()|[\]\\$]/g, "\\$&");
function valori(s: string): number[] {
  const t = s.replace("−", "-");
  return t.includes(",") ? [Number(t.replace(/\./g, "").replace(",", "."))] : [...new Set([Number(t), Number(t.replace(/\./g, ""))])];
}
const coincide = (s: string, n: number) => valori(s).some(v => Number.isFinite(v) && Math.abs(v - n) < 0.00011);
export interface RiscontroUnitaPdf { voce: number; pagina: number; codice: string | null; quantita: number; unita: string; prezzo: number | null }

/** Recupera soltanto l'unità: non modifica quantità/prezzi e non usa la posizione della riga AI. */
export function integraUnitaDalPdf(e: ContractExtract, pagine: string[]): { estratto: ContractExtract; riscontri: RiscontroUnitaPdf[] } {
  const testo = pagine.join("\n"), offset = pagine.map((_, i) => pagine.slice(0, i).reduce((n, p) => n + p.length + 1, 0));
  const codici = e.voci.map(v => v.codice?.trim() || /^[A-Z][\w]*(?:\.[\w]+){1,12}\b/i.exec(v.descrizione)?.[0]
    || /^(.{1,110}?)\s+[-–—]\s+(?:fornitura|quadro|pratica)\b/i.exec(v.descrizione)?.[1] || null);
  const posizioni = codici.flatMap((c, i) => c ? [...testo.matchAll(new RegExp("(?<![\\w.])" + [...c].map(scappa).join("\\s*") + "(?![\\w.])", "gi"))]
    .map(m => ({ voce: i, indice: m.index!, codice: c })) : []).sort((a, b) => a.indice - b.indice);
  const riscontri: RiscontroUnitaPdf[] = [];
  const voci = e.voci.map((v, i) => {
    if (v.unita?.trim() || !Number.isFinite(v.quantita) || v.quantita_da_confermare || !(v.prezzo_unitario_eur >= 0)) return v;
    const pos = posizioni.filter(p => p.voce === i);
    const finestre = pos.length ? pos.map(p => ({ testo: testo.slice(p.indice, Math.min(
      posizioni.find(n => n.indice > p.indice)?.indice ?? testo.length, p.indice + 12000)), offset: p.indice }))
      : [{ testo, offset: 0 }];
    const trovati: { unita: string; indice: number }[] = [];
    for (const f of finestre) {
      const schemi = [
        { re: new RegExp("(?<![\\w])(" + NUM + ")\\s+(" + UM + ")\\s*(?:€\\s*)?(" + NUM + ")(?![\\d])", "gi"), q: 1, u: 2, p: 3 },
        { re: new RegExp("(?<![\\w])(" + UM + ")\\s+(" + NUM + ")\\s*(?:€\\s*)?(" + NUM + ")(?![\\d])", "gi"), q: 2, u: 1, p: 3 },
        // Alcuni PDF collocano il testo dell'U.M. dopo gli importi nell'ordine interno.
        { re: new RegExp("(?<![\\w])(" + NUM + ")\\s+(" + NUM + ")\\s+(" + NUM + ")(?:\\s+" + NUM + ")?\\s+(" + UM + ")(?![\\w])", "gi"), q: 1, u: 4, p: 2 },
      ];
      // Le quantità dei dettagli possono precedere il totale: servono anche finestre sovrapposte.
      for (const s of schemi) for (const m of f.testo.matchAll(new RegExp("(?=" + s.re.source + ")", s.re.flags))) {
        if (!coincide(m[s.q], v.quantita)) continue;
        if (!coincide(m[s.p], v.prezzo_unitario_eur)) continue;
        if (!pos.length && !(v.prezzo_unitario_eur > 0)) continue;
        trovati.push({ unita: normalizzaUnita(m[s.u]), indice: f.offset + m.index! });
      }
    }
    const unita = [...new Set(trovati.map(t => t.unita))];
    if (unita.length !== 1 || !unita[0]) return v;
    const riscontro = trovati[0];
    riscontri.push({ voce: i + 1, pagina: offset.filter(o => o <= riscontro.indice).length, codice: codici[i],
      quantita: v.quantita, unita: unita[0], prezzo: v.prezzo_unitario_eur });
    return { ...v, unita: unita[0], ...(codici[i] && !v.codice ? { codice: codici[i] } : {}) };
  });
  return { estratto: riscontri.length ? { ...e, voci, warnings: [...e.warnings,
    "Unità recuperate dal testo del PDF per le voci " + riscontri.map(r => r.voce).join(", ") + ": quantità e prezzo confrontati; valori originali conservati."] } : e, riscontri };
}
