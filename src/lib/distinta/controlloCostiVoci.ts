/**
 * Il controllo più semplice contro gli errori grossi (14/11/2026): se i materiali di
 * una voce costano più della voce stessa nel computo — che comprende anche posa,
 * manodopera e margine — quasi certamente la quantità o la resa sono sbagliate
 * (uno spessore letto male, un'unità scambiata, una confezione presa per un pezzo).
 *
 * Il costo di un materiale si divide fra le voci da cui viene, in proporzione alla
 * quantità che ciascuna gli dà. Contano solo i materiali col prezzo: la stima è per
 * difetto, quindi un avviso è un avviso vero.
 */
import { prezzoRiga, type MaterialeCollegato } from "./collegaArticoli";

export interface VoceConImporto { id: string; descrizione_breve: string; importo_computo?: number | null }

export interface CostoVoce { voce_id: string; descrizione: string; materiali: number; importo: number; percentuale: number }

const euro = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function costiPerVoce(materiali: MaterialeCollegato[], voci: VoceConImporto[]): CostoVoce[] {
  const costo = new Map<string, number>();
  for (const m of materiali) {
    const p = prezzoRiga(m);
    if (!p) continue;
    const dalComputo = m.origini.filter((o): o is Extract<typeof o, { tipo: "computo" }> => o.tipo === "computo");
    const totaleQ = dalComputo.reduce((t, o) => t + (Number(o.quantita) || 0), 0);
    for (const o of dalComputo) {
      const quota = totaleQ > 0 ? (Number(o.quantita) || 0) / totaleQ : 1 / dalComputo.length;
      costo.set(o.voce_id, (costo.get(o.voce_id) ?? 0) + p.totale * quota);
    }
  }
  const out: CostoVoce[] = [];
  for (const v of voci) {
    const c = costo.get(v.id);
    const importo = Number(v.importo_computo) || 0;
    if (!c || !(importo > 0)) continue;
    out.push({ voce_id: v.id, descrizione: v.descrizione_breve, materiali: Math.round(c * 100) / 100, importo, percentuale: Math.round((c / importo) * 100) });
  }
  return out;
}

/** Per ogni materiale (chiave), l'avviso se una delle sue voci ha materiali che costano più della voce. */
export function avvisiCosto(materiali: MaterialeCollegato[], voci: VoceConImporto[], soglia = 100): Map<string, string> {
  const fuori = new Map(costiPerVoce(materiali, voci).filter((c) => c.percentuale > soglia).map((c) => [c.voce_id, c]));
  const out = new Map<string, string>();
  for (const m of materiali) {
    const voce = m.origini.map((o) => (o.tipo === "computo" ? fuori.get(o.voce_id) : undefined)).find(Boolean);
    if (voce) out.set(m.chiave, `I materiali costano ${euro(voce.materiali)} contro ${euro(voce.importo)} della voce (${voce.percentuale}%): controlla quantità e resa`);
  }
  return out;
}
