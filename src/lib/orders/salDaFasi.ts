/**
 * Ponte avanzamento fisico → verbale SAL (07/10/2026).
 *
 * Il verbale SAL (SalTab) finora si compilava a mano o con un suggerimento AI:
 * non c'era un legame diretto con l'avanzamento dichiarato sulle fasi di
 * lavorazione. Qui si traduce ogni fase in una voce di SAL — descrizione = nome
 * della fase, % = avanzamento della fase, importo contrattuale = venduto della
 * fase se l'ufficio l'ha scritto. L'ufficio può poi correggere ogni voce.
 *
 * Dal 10/11/2026 (SAL standard, lotto 1) ogni voce porta il `fase_id`: il SAL
 * successivo sa quale voce è quale fase e parte dalla % già certificata, perché
 * il verbale è cumulativo. Una voce che scende è una rettifica, da dichiarare.
 *
 * Modulo puro: niente React, niente Supabase.
 */
import { avanzamentoFase } from "./cronoprogramma";

export interface FasePerSal {
  id?: string;
  name: string;
  /** Stato della fase: una fase «completata» vale 100 anche con la % rimasta a 0. */
  status?: string | null;
  /** Avanzamento dichiarato (0..100), da order_work_phases.percentuale. */
  percentuale: number | null;
  /** Venduto della fase (€), se scritto dall'ufficio; altrimenti non lo sappiamo. */
  importo_venduto: number | null;
}

/** Stessa forma del form voce in SalTab (campi stringa per gli input). */
export interface VoceSalDraft {
  descrizione: string;
  importo_contrattuale: string;
  percentuale_avanzamento: string;
  note: string;
  /** Fase della commessa da cui nasce la voce; assente = voce libera. */
  fase_id?: string | null;
}

/** Una voce di un verbale già salvato, per sapere da dove riparte il SAL nuovo. */
export interface VoceSalSalvata {
  descrizione: string;
  percentuale_avanzamento: number;
  fase_id?: string | null;
}

export interface SalPerPrecedente {
  id: string;
  numero_sal: number;
  stato: string;
  sal_voci?: ReadonlyArray<VoceSalSalvata> | null;
}

const STATI_EMESSI = new Set(["emesso", "approvato", "firmato"]);
const chiaveNome = (s: string) => s.trim().toLowerCase();

/** Percentuali del SAL precedente, per fase e (per le voci libere) per descrizione. */
export interface PercentualiPrecedenti {
  numero: number | null;
  perFase: Map<string, number>;
  perNome: Map<string, number>;
}

/**
 * L'ultimo verbale emesso con un numero più basso: lo stesso che
 * `maturatoPrecedente` usa per il cumulativo, così voci e importi parlano dello
 * stesso SAL.
 */
export function percentualiPrecedenti(numeroNuovo: number, tutti: ReadonlyArray<SalPerPrecedente>): PercentualiPrecedenti {
  const prec = tutti
    .filter((s) => s.numero_sal < numeroNuovo && STATI_EMESSI.has(s.stato))
    .reduce<SalPerPrecedente | null>((u, s) => (!u || s.numero_sal > u.numero_sal ? s : u), null);
  const perFase = new Map<string, number>();
  const perNome = new Map<string, number>();
  for (const v of prec?.sal_voci ?? []) {
    const pct = Number(v.percentuale_avanzamento) || 0;
    if (v.fase_id) perFase.set(v.fase_id, pct);
    else perNome.set(chiaveNome(v.descrizione), pct);
  }
  return { numero: prec?.numero_sal ?? null, perFase, perNome };
}

const VUOTE: PercentualiPrecedenti = { numero: null, perFase: new Map(), perNome: new Map() };

function pctPrecedente(v: { descrizione: string; fase_id?: string | null }, prec: PercentualiPrecedenti): number | null {
  if (v.fase_id) return prec.perFase.get(v.fase_id) ?? null;
  return prec.perNome.get(chiaveNome(v.descrizione)) ?? null;
}

/**
 * Una voce di SAL per ogni fase con un nome. L'importo contrattuale resta vuoto
 * se il venduto della fase non c'è (lo scrive l'ufficio): la % arriva
 * dall'avanzamento della fase, ma non parte mai sotto quella già certificata
 * nel SAL precedente.
 */
export function vociSalDaFasi(fasi: ReadonlyArray<FasePerSal>, precedenti: PercentualiPrecedenti = VUOTE): VoceSalDraft[] {
  return fasi
    .filter((f) => f.name?.trim())
    .map((f) => {
      const cantiere = avanzamentoFase({ status: f.status ?? "", percentuale: f.percentuale });
      const certificata = f.id ? precedenti.perFase.get(f.id) ?? null : null;
      const voce: VoceSalDraft = {
        descrizione: f.name.trim(),
        importo_contrattuale: f.importo_venduto != null && f.importo_venduto > 0 ? String(f.importo_venduto) : "",
        percentuale_avanzamento: String(certificata != null && certificata > cantiere ? certificata : cantiere),
        note: "",
      };
      if (f.id) voce.fase_id = f.id;
      return voce;
    });
}

/**
 * Voci arrivate senza fase (AI, scritte a mano): si collegano alla fase con lo
 * stesso nome, se nella commessa ce n'è una sola. Le altre restano libere.
 */
export function collegaVociAFasi<T extends VoceSalDraft>(voci: ReadonlyArray<T>, fasi: ReadonlyArray<FasePerSal>): T[] {
  const perNome = new Map<string, string | null>();
  for (const f of fasi) {
    if (!f.id || !f.name?.trim()) continue;
    const k = chiaveNome(f.name);
    perNome.set(k, perNome.has(k) ? null : f.id);
  }
  return voci.map((v) => {
    if (v.fase_id) return v;
    const id = perNome.get(chiaveNome(v.descrizione));
    return id ? { ...v, fase_id: id } : v;
  });
}

export interface VoceInDiscesa {
  descrizione: string;
  precedente: number;
  attuale: number;
}

/**
 * Il verbale è cumulativo: una voce sotto il SAL precedente abbassa il già
 * certificato. Si può fare (rettifica), ma va dichiarato: qui l'elenco.
 */
export function vociSottoIlPrecedente(voci: ReadonlyArray<VoceSalDraft>, precedenti: PercentualiPrecedenti): VoceInDiscesa[] {
  const out: VoceInDiscesa[] = [];
  for (const v of voci) {
    const prima = pctPrecedente(v, precedenti);
    const ora = Number(String(v.percentuale_avanzamento).replace(",", "."));
    if (prima != null && Number.isFinite(ora) && ora < prima) out.push({ descrizione: v.descrizione.trim(), precedente: prima, attuale: ora });
  }
  return out;
}

/** La % del SAL precedente per una voce del modulo, per mostrarla accanto al campo. */
export function percentualePrecedenteVoce(v: VoceSalDraft, precedenti: PercentualiPrecedenti): number | null {
  return pctPrecedente(v, precedenti);
}
