import { areaDiVerticale, areaStandard, chiaveTesto, type AreaStandard, type TipologiaStandard } from "./areeStandard";

/** Le aree libere usano la stessa etichetta persistente delle aree standard. */
export function preparaAreaPersonalizzata(
  nome: string,
  tipologie: string,
  presenti: readonly { chiave: string }[],
): { area: AreaStandard | null; problema: string | null } {
  const pulito = nome.trim().replace(/\s+/g, " ");
  const chiave = areaDiVerticale(pulito);
  if (!chiave || !chiaveTesto(pulito)) return { area: null, problema: "Scrivi il nome dell'area, per esempio Tende da sole." };
  if (pulito.length > 80) return { area: null, problema: "Il nome dell'area può contenere al massimo 80 caratteri." };
  if (presenti.some((a) => a.chiave === chiave)) return { area: null, problema: "Questa area è già nel listino: aggiungi le tipologie da lì." };
  if (areaStandard(chiave)) return { area: null, problema: "Per questa area scegli «Solo le tipologie»: trovi già la struttura pronta." };
  const nomi = tipologie.split(/\r?\n/).map((n) => n.trim().replace(/\s+/g, " ")).filter(Boolean);
  if (nomi.length === 0) return { area: null, problema: "Scrivi almeno una tipologia, una per riga." };
  if (nomi.length > 30) return { area: null, problema: "Puoi creare al massimo 30 tipologie alla volta." };
  if (nomi.some((n) => !chiaveTesto(n) || n.length > 100)) return { area: null, problema: "Ogni tipologia deve avere un nome di al massimo 100 caratteri." };
  if (new Set(nomi.map(chiaveTesto)).size !== nomi.length) return { area: null, problema: "Una tipologia è scritta due volte: lascia una sola riga per nome." };
  return {
    area: {
      chiave, nome: pulito, verticale: chiave, sinonimi: [], preventivatore: null,
      tipologie: nomi.map((n): TipologiaStandard => ({ nome: n, sinonimi: [], accessorio: false, fvCategoria: null })),
    },
    problema: null,
  };
}
