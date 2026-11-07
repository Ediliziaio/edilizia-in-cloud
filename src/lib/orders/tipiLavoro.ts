/**
 * I lavori che fa un'azienda: il «profilo lavori» (07/11/2026).
 *
 * Un'azienda che fa solo serramenti non deve vedersi proporre modelli di
 * fotovoltaico o di nuova costruzione. I moduli attivi non lo dicono (li dà il
 * piano, e quasi tutte le aziende li hanno tutti): lo dice l'azienda
 * (company_fasi_settings.tipi_lavoro) e, finché non l'ha detto, il suo settore.
 * Modulo puro: nessun React, nessun database.
 */
import type { ModelloFasi } from "./modelliFasi";

/** Gli stessi valori ammessi da fasi_impostazioni_salva (migrazione 20281223110000). */
export const TIPI_LAVORO = [
  "serramenti", "bagno", "ristrutturazione", "nuova_costruzione", "fotovoltaico", "tetto",
  "cappotto", "impianti", "pavimenti", "pittura", "piscine", "manutenzione",
] as const;
export type TipoLavoro = (typeof TIPI_LAVORO)[number];

export const ETICHETTE_TIPI: Record<TipoLavoro, string> = {
  serramenti: "Serramenti e infissi",
  bagno: "Bagni",
  ristrutturazione: "Ristrutturazioni complete",
  nuova_costruzione: "Nuove costruzioni",
  fotovoltaico: "Fotovoltaico",
  tetto: "Tetti e coperture",
  cappotto: "Cappotto e facciate",
  impianti: "Impianti (elettrico, idraulico, clima)",
  pavimenti: "Pavimenti",
  pittura: "Pittura e cartongesso",
  piscine: "Piscine",
  manutenzione: "Manutenzioni e piccoli interventi",
};

/** L'impresa edile generale: fa un po' di tutto quello che è cantiere. */
const EDILI: TipoLavoro[] = ["ristrutturazione", "bagno", "nuova_costruzione", "cappotto", "tetto", "impianti", "pavimenti", "pittura"];

/** Il punto di partenza dal settore dell'azienda (companies.sector). «altro» non dice niente. */
export function tipiDaSettore(settore: string | null | undefined): TipoLavoro[] {
  switch (settore) {
    case "serramenti":
    case "infissi": return ["serramenti"];
    case "bagni": return ["bagno"];
    case "tetti": return ["tetto"];
    case "fotovoltaico": return ["fotovoltaico"];
    case "pittura": return ["pittura"];
    case "ristrutturazioni": return [...EDILI];
    default: return [];
  }
}

export const eTipoLavoro = (v: unknown): v is TipoLavoro => typeof v === "string" && (TIPI_LAVORO as readonly string[]).includes(v);

/** Dalla colonna del database: un elenco valido, oppure null (non l'ha ancora detto). */
export function tipiDalDb(valore: unknown): TipoLavoro[] | null {
  if (!Array.isArray(valore)) return null;
  return TIPI_LAVORO.filter((t) => valore.includes(t));
}

export interface ProfiloLavori {
  /** I tipi che contano. Vuoto = non si sa: non si filtra niente. */
  tipi: TipoLavoro[];
  /** Da dove vengono: scelti dall'azienda, dedotti dal settore, o nessuno dei due. */
  origine: "scelti" | "settore" | "nessuno";
}

export function profiloLavori(scelti: TipoLavoro[] | null, settore: string | null | undefined): ProfiloLavori {
  if (scelti && scelti.length) return { tipi: scelti, origine: "scelti" };
  const daSettore = tipiDaSettore(settore);
  return daSettore.length ? { tipi: daSettore, origine: "settore" } : { tipi: [], origine: "nessuno" };
}

/** I modelli di partenza (PHASE_TEMPLATES) e il loro tipo di lavoro. */
const TIPO_DEL_MODELLO_DI_PARTENZA: Record<string, TipoLavoro> = {
  fotovoltaico: "fotovoltaico",
  ristrutturazione_completa: "ristrutturazione",
  ristrutturazione_bagno: "bagno",
  nuova_costruzione: "nuova_costruzione",
  cappotto_facciata: "cappotto",
  serramenti_infissi: "serramenti",
  impianti: "impianti",
  tetto_copertura: "tetto",
};

export function tipoDelModelloDiPartenza(chiave: string): TipoLavoro | null {
  return TIPO_DEL_MODELLO_DI_PARTENZA[chiave] ?? null;
}

const norma = (s: string) => s.trim().toLocaleLowerCase("it-IT");

/** I modelli di partenza che fanno parte del profilo. Senza profilo, tutti. */
export function modelliDiPartenzaDelProfilo<T extends { key: string }>(modelli: ReadonlyArray<T>, profilo: ProfiloLavori): T[] {
  if (!profilo.tipi.length) return [...modelli];
  return modelli.filter((m) => {
    const tipo = tipoDelModelloDiPartenza(m.key);
    return !tipo || profilo.tipi.includes(tipo);
  });
}

/**
 * I modelli da proporre: fuori quelli di un altro lavoro. Il tipo di un modello
 * dell'azienda si riconosce dal nome dello standard da cui è stato importato;
 * un modello con un nome suo l'ha fatto l'azienda, e resta sempre.
 */
export function modelliDelProfilo(
  modelli: ReadonlyArray<ModelloFasi>,
  partenza: ReadonlyArray<{ key: string; label: string }>,
  profilo: ProfiloLavori,
  /** Il modello di partenza scelto in Impostazioni: l'ha scelto l'azienda, resta. */
  sempre: string | null = null,
): ModelloFasi[] {
  if (!profilo.tipi.length) return [...modelli];
  const tipoPerNome = new Map(partenza.map((t) => [norma(t.label), tipoDelModelloDiPartenza(t.key)]));
  return modelli.filter((m) => {
    if (m.id === sempre) return true;
    const tipo = tipoPerNome.get(norma(m.nome)) ?? null;
    return !tipo || profilo.tipi.includes(tipo);
  });
}
