/**
 * I lavori che fa un'azienda: il «profilo lavori» (07/11/2026).
 *
 * Un'azienda che fa solo serramenti non deve vedersi proporre modelli di
 * fotovoltaico o di nuova costruzione. I moduli attivi non lo dicono (li dà il
 * piano, e quasi tutte le aziende li hanno tutti): lo dice l'azienda
 * (company_fasi_settings.tipi_lavoro) e, finché non l'ha detto, il suo settore.
 *
 * Il profilo filtra solo i modelli STANDARD (quelli di EdiliziaInCloud non ancora
 * importati, e cosa importa «Importa modelli standard»). I modelli che l'azienda ha
 * già nella sua lista restano tutti: li ha tenuti lei (Innovasol, fotovoltaico, tiene
 * «Impianti»; renova, ristrutturazioni, vende anche fotovoltaico) e li può cancellare.
 * Modulo puro: nessun React, nessun database.
 */
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
  pavimenti: "pavimenti",
  pittura: "pittura",
};

export function tipoDelModelloDiPartenza(chiave: string): TipoLavoro | null {
  return TIPO_DEL_MODELLO_DI_PARTENZA[chiave] ?? null;
}

/** I modelli di partenza che fanno parte del profilo. Senza profilo, tutti. */
export function modelliDiPartenzaDelProfilo<T extends { key: string }>(modelli: ReadonlyArray<T>, profilo: ProfiloLavori): T[] {
  if (!profilo.tipi.length) return [...modelli];
  return modelli.filter((m) => {
    const tipo = tipoDelModelloDiPartenza(m.key);
    return !tipo || profilo.tipi.includes(tipo);
  });
}

/** I lavori in cui ha senso chiedersi se le misure del preventivo sono definitive. */
export const TIPI_CON_MISURE: TipoLavoro[] = ["serramenti", "bagno", "ristrutturazione", "tetto", "cappotto", "pavimenti", "piscine"];

/** Stessa regola del database (`misure_regola_azienda`): di partenza serramenti e bagni aspettano il sopralluogo. */
export const regolaDiPartenzaMisure = (t: TipoLavoro): "sopralluogo" | "definitive" =>
  t === "serramenti" || t === "bagno" ? "sopralluogo" : "definitive";
