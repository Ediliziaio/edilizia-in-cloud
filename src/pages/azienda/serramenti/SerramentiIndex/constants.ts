/**
 * SerramentiIndex — constants
 * Estratto da SerramentiIndex.tsx (MP-MKT-001).
 */

export type PeriodKey = "all" | "7d" | "30d" | "90d" | "ytd";

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  all: "Sempre",
  "7d": "Ultimi 7 giorni",
  "30d": "Ultimi 30 giorni",
  "90d": "Ultimi 90 giorni",
  ytd: "Anno corrente",
};

export const MATERIALI: Array<{ value: string; label: string }> = [
  { value: "alluminio", label: "Alluminio" },
  { value: "pvc", label: "PVC" },
  { value: "legno", label: "Legno" },
  { value: "legno_alluminio", label: "Legno-Alluminio" },
];

export const TIPI_INTERVENTO: Array<{ value: string; label: string }> = [
  { value: "sostituzione", label: "Sostituzione" },
  { value: "nuova_costruzione", label: "Nuova costruzione" },
  { value: "ristrutturazione", label: "Ristrutturazione" },
  { value: "manutenzione", label: "Manutenzione" },
];

export const SCHEMI_PAGAMENTO_LABELS: Record<string, string> = {
  tutto_finanziato: "Tutto finanziato",
  acconto_finanziato: "Acconto + finanziato",
  due_acconti_finanziato: "2 acconti + finanziato",
  due_acconti_saldo: "2 acconti + saldo",
  tre_step: "3 step (firma + merce + saldo)",
  personalizzato: "Personalizzato",
};

export const BONUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "any", label: "Tutti" },
  { value: "50", label: "Detrazione 50%" },
  { value: "36", label: "Detrazione 36%" },
  { value: "none", label: "Senza bonus" },
];

/** Sigle province IT (107 elementi, ordine alfabetico). */
export const PROVINCE_IT: string[] = [
  "AG","AL","AN","AO","AP","AQ","AR","AT","AV","BA","BG","BI","BL","BN","BO","BR","BS","BT","BZ",
  "CA","CB","CE","CH","CL","CN","CO","CR","CS","CT","CZ","EN","FC","FE","FG","FI","FM","FR","GE","GO","GR",
  "IM","IS","KR","LC","LE","LI","LO","LT","LU","MB","MC","ME","MI","MN","MO","MS","MT","NA","NO","NU",
  "OR","PA","PC","PD","PE","PG","PI","PN","PO","PR","PT","PU","PV","PZ","RA","RC","RE","RG","RI","RM","RN","RO",
  "SA","SI","SO","SP","SR","SS","SU","SV","TA","TE","TN","TO","TP","TR","TS","TV","UD","VA","VB","VC","VE","VI","VR","VT","VV",
];

export type TriState = "all" | "yes" | "no";

export type SortKey = "recent" | "value_desc" | "value_asc" | "code_asc";

export const SORT_LABELS: Record<SortKey, string> = {
  recent: "Più recenti",
  value_desc: "Importo (alto → basso)",
  value_asc: "Importo (basso → alto)",
  code_asc: "Codice (A → Z)",
};

export const PAGE_SIZE = 50;
