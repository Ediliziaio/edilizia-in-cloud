/**
 * Previsto e reale (24/11/2026): la previsione dei lavori fatta dalla pianta, salvata con la
 * commessa, accanto a quanto la commessa è costata e durata davvero.
 *
 * Regole:
 * - Il previsto è la copia ferma salvata (commessa_previsioni_lavori), mai ricalcolata: la pianta
 *   può essere cambiata dopo.
 * - Il costo vero per fase è quello della scheda Lavorazioni (economiaFasi, consuntivo).
 *   Una fase della previsione si abbina alle fasi della commessa dal nome (parole chiave); se
 *   nessuna corrisponde, il reale di quella fase si dice che manca.
 * - I giorni veri vengono dalle date di inizio e fine lavori della commessa; se mancano, dal primo
 *   e dall'ultimo rapportino. I giorni di lavoro sono i giorni con almeno un rapportino.
 * - Dove un dato manca resta `null`: niente numeri inventati.
 */
import { VERSIONE_REGOLE_PREVISIONE, type FasePrevisione, type Previsione } from "./previsioneLavori";
import type { Json, TablesInsert } from "@/integrations/supabase/types";

export interface FonteIstantanea {
  companyId: string;
  orderId: string;
  planimetriaId: string;
  versione: number;
  varianteId: string;
  varianteNome: string;
}

export function istantaneaPrevisione(p: Previsione, extraAccesi: readonly string[], f: FonteIstantanea): TablesInsert<"commessa_previsioni_lavori"> {
  return {
    company_id: f.companyId,
    order_id: f.orderId,
    planimetria_id: f.planimetriaId,
    versione: f.versione,
    variante_id: f.varianteId,
    variante_nome: f.varianteNome,
    previsione: p as unknown as Json,
    extra_accesi: [...extraAccesi],
    totale: p.totale,
    giorni_lavoro: p.giorniLavoro,
    giorni_calendario: p.giorniCalendario,
    versione_regole: VERSIONE_REGOLE_PREVISIONE,
  };
}

/** La previsione salvata, letta con prudenza: un jsonb di regole vecchie può non avere tutti i campi. */
export function previsioneSalvata(valore: unknown): Previsione | null {
  if (!valore || typeof valore !== "object") return null;
  const p = valore as Partial<Previsione>;
  if (!Array.isArray(p.fasi) || typeof p.totale !== "number") return null;
  return p as Previsione;
}

const PAROLE: Record<FasePrevisione, RegExp> = {
  Demolizioni: /demoli|rimozion|smontagg|sgombero/,
  Murature: /muratur|murari|tramezz|cartongess|tavolat/,
  Serramenti: /serrament|infiss|finestr|porte\b|porta\b/,
  Intonaci: /intonac|rasatur/,
  "Pavimento radiante": /radiant|massett/,
  "Pavimenti e rivestimenti": /paviment|rivestiment|piastrell|battiscop/,
  Tinteggiature: /tinteggi|pittur|imbianc|verniciat/,
};

/** A quale fase della previsione corrisponde una fase della commessa, dal nome. */
export function fasePrevisioneDi(nome: string): FasePrevisione | null {
  const n = nome.toLowerCase();
  // Il radiante prima dei pavimenti: «Pavimento radiante» non è una posa di pavimenti.
  if (PAROLE["Pavimento radiante"].test(n)) return "Pavimento radiante";
  for (const [fase, re] of Object.entries(PAROLE) as [FasePrevisione, RegExp][]) if (re.test(n)) return fase;
  return null;
}

export interface RapportinoGiorni {
  data_lavoro: string;
  fasi_lavorate: unknown;
}

export interface RigaConfronto {
  fase: string;
  previsto: number;
  /** Costo sostenuto sulle fasi della commessa abbinate; null se nessuna fase corrisponde o i costi mancano. */
  reale: number | null;
  giorniPrevisti: number;
  /** Giorni con un rapportino sulle fasi abbinate; null se nessun rapportino dice la fase. */
  giorniReali: number | null;
  fasiCommessa: string[];
}

export interface ConfrontoPrevistoReale {
  righe: RigaConfronto[];
  /** Fasi della commessa che nessuna fase della previsione spiega (impianti, extra…). */
  fasiNonAbbinate: { nome: string; reale: number | null }[];
  totale: { previsto: number; reale: number | null; scostamentoPct: number | null };
  manodopera: { previsto: number; reale: number | null };
  giorniLavoro: { previsto: number; reale: number | null };
  giorniCalendario: { previsto: number; reale: number | null; fonte: "date" | "rapportini" | null };
  /** La commessa ha una data di fine lavori passata: il reale non crescerà più. */
  chiusa: boolean;
}

const giorniTra = (da: string, a: string) => Math.round((Date.parse(a.slice(0, 10)) - Date.parse(da.slice(0, 10))) / 86_400_000) + 1;

function fasiDelRapportino(r: RapportinoGiorni): string[] {
  if (!Array.isArray(r.fasi_lavorate)) return [];
  return r.fasi_lavorate.flatMap((f) => (f && typeof f === "object" && typeof (f as { phase_id?: unknown }).phase_id === "string" ? [(f as { phase_id: string }).phase_id] : []));
}

export function confrontoPrevistoReale(input: {
  previsione: Previsione;
  fasiCommessa: ReadonlyArray<{ id: string; name: string }>;
  /** Consuntivo per fase della commessa (economiaFasi); null se non leggibile. */
  costoPerFase: ReadonlyMap<string, number> | null;
  /** Consuntivo dell'intera commessa (economia_commesse); null se non leggibile. */
  totaleReale: { consuntivo: number | null; manodopera: number | null } | null;
  rapportini: ReadonlyArray<RapportinoGiorni> | null;
  inizioLavori: string | null;
  fineLavori: string | null;
  oggi?: string;
}): ConfrontoPrevistoReale {
  const { previsione: p, fasiCommessa, costoPerFase, rapportini } = input;
  const abbinate = new Map<FasePrevisione, { id: string; name: string }[]>();
  const nonAbbinate: { id: string; name: string }[] = [];
  for (const f of fasiCommessa) {
    const fase = fasePrevisioneDi(f.name);
    if (fase && p.fasi.some((x) => x.fase === fase)) abbinate.set(fase, [...(abbinate.get(fase) ?? []), f]);
    else nonAbbinate.push(f);
  }
  const giorniPerFase = new Map<string, Set<string>>();
  for (const r of rapportini ?? []) for (const id of fasiDelRapportino(r)) {
    const s = giorniPerFase.get(id) ?? new Set<string>();
    s.add(r.data_lavoro.slice(0, 10));
    giorniPerFase.set(id, s);
  }
  const costo = (ids: readonly { id: string }[]) => {
    if (!costoPerFase || !ids.length) return null;
    return Math.round(ids.reduce((s, f) => s + (costoPerFase.get(f.id) ?? 0), 0) * 100) / 100;
  };
  const righe: RigaConfronto[] = p.fasi.map((f) => {
    const fasi = abbinate.get(f.fase) ?? [];
    const giorni = new Set(fasi.flatMap((x) => [...(giorniPerFase.get(x.id) ?? [])]));
    return { fase: f.fase, previsto: f.importo, reale: costo(fasi), giorniPrevisti: f.giorni, giorniReali: giorni.size ? giorni.size : null, fasiCommessa: fasi.map((x) => x.name) };
  });
  const consuntivo = input.totaleReale?.consuntivo ?? null;
  const date = [...new Set((rapportini ?? []).map((r) => r.data_lavoro.slice(0, 10)))].sort();
  let calendario: ConfrontoPrevistoReale["giorniCalendario"] = { previsto: p.giorniCalendario, reale: null, fonte: null };
  if (input.inizioLavori && input.fineLavori && input.fineLavori >= input.inizioLavori) calendario = { ...calendario, reale: giorniTra(input.inizioLavori, input.fineLavori), fonte: "date" };
  else if (date.length) calendario = { ...calendario, reale: giorniTra(date[0], date[date.length - 1]), fonte: "rapportini" };
  const oggi = input.oggi ?? new Date().toLocaleDateString("en-CA");
  return {
    righe,
    fasiNonAbbinate: nonAbbinate.map((f) => ({ nome: f.name, reale: costo([f]) })),
    totale: { previsto: p.totale, reale: consuntivo, scostamentoPct: consuntivo !== null && consuntivo > 0 && p.totale > 0 ? Math.round((consuntivo / p.totale - 1) * 100) : null },
    manodopera: { previsto: p.manodopera, reale: input.totaleReale?.manodopera ?? null },
    giorniLavoro: { previsto: p.giorniLavoro, reale: rapportini ? (date.length || null) : null },
    giorniCalendario: calendario,
    chiusa: !!input.fineLavori && input.fineLavori.slice(0, 10) <= oggi,
  };
}
