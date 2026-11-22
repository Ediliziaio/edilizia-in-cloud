import type { Viaggio } from "./viaggi";

export type QuotaCarburante = {
  chiave: string;
  ordine: string | null;
  tipo: "commessa" | "generale" | "da_attribuire";
  metri: number;
  centesimi: number;
};

export function ripartoCarburante(viaggi: Viaggio[], centesimi: number) {
  if (!Number.isSafeInteger(centesimi)) throw new Error("Importo del carburante non valido.");
  const gruppi = new Map<string, QuotaCarburante>();
  const visti = new Set<string>();
  let viaggiDaVerificare = 0;
  let tratteSenzaKm = 0;
  let metriTotali = 0;

  for (const v of viaggi) {
    if (visti.has(v.id) || v.stato === "annullato") continue;
    visti.add(v.id);
    if (v.stato !== "verificato") {
      viaggiDaVerificare++;
      continue;
    }
    const ordini = new Set(v.tratte.flatMap(t => t.destinazione === "commessa" && t.order_id ? [t.order_id] : []));
    const partenza = v.tratte[0]?.da.trim().toLowerCase();
    for (const [indice, t] of v.tratte.entries()) {
      if (t.fonte !== "dichiarati" || t.km == null || !Number.isFinite(t.km) || t.km < 0) {
        tratteSenzaKm++;
        continue;
      }
      const metri = Math.round(t.km * 1000);
      if (!metri) continue;
      // Come nel riepilogo economico, il ritorno al deposito si attribuisce quando il giro serve una sola commessa.
      const rientro = indice > 0 && indice === v.tratte.length - 1 && t.destinazione === "generale" && !t.order_id &&
        !!partenza && t.a.trim().toLowerCase() === partenza && ordini.size === 1;
      const ordine = rientro ? [...ordini][0] : t.destinazione === "commessa" ? t.order_id : null;
      const tipo = ordine ? "commessa" : t.destinazione === "generale" ? "generale" : "da_attribuire";
      const chiave = ordine ?? tipo;
      const gruppo = gruppi.get(chiave) ?? { chiave, ordine, tipo, metri: 0, centesimi: 0 };
      gruppo.metri += metri;
      metriTotali += metri;
      gruppi.set(chiave, gruppo);
    }
  }

  const quote = [...gruppi.values()].sort((a, b) => b.metri - a.metri || a.chiave.localeCompare(b.chiave));
  let residuo = Math.abs(centesimi);
  if (metriTotali > 0) {
    const pesoTotale = BigInt(metriTotali);
    const proporzioni = quote.map(quota => {
      const peso = BigInt(Math.abs(centesimi)) * BigInt(quota.metri);
      quota.centesimi = Number(peso / pesoTotale);
      residuo -= quota.centesimi;
      return { quota, resto: Number(peso % pesoTotale) };
    });
    for (const { quota } of proporzioni.sort((a, b) => b.resto - a.resto).slice(0, residuo)) {
      quota.centesimi++;
    }
    if (centesimi < 0) for (const quota of quote) quota.centesimi = -quota.centesimi;
  }
  return { quote, metriTotali, viaggiDaVerificare, tratteSenzaKm, daRipartire: metriTotali ? 0 : centesimi };
}
