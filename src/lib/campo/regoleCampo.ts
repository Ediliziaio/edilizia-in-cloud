/**
 * Come l'azienda gestisce rapportini e presenze di cantiere (04/10/2026).
 *
 * Il software si adatta al modo di lavorare dell'azienda, non il contrario:
 * chi ha un capocantiere vuole UN rapportino per cantiere e giorno, chi lavora
 * a squadre piccole vuole che ognuno scriva il suo; le ore possono venire dalle
 * timbrature o essere scritte dal capo. Tre scelte, per azienda, nella pagina
 * Impostazioni → Rapportini e presenze.
 *
 * Senza scelte valgono i valori «come oggi»: nessuna azienda cambia
 * comportamento finché non decide. Modulo puro: niente React, niente Supabase.
 */

/** Chi manda il rapportino di cantiere. */
export type ChiCompila = "ognuno" | "capo";
/** Da dove arrivano le ore di ogni persona nel rapportino di squadra. */
export type OreDalle = "capo" | "timbrature";

export interface RegoleCampo {
  chiCompila: ChiCompila;
  oreDalle: OreDalle;
  /** Minuti di differenza tra ore scritte e timbrate oltre i quali avvisare; null = mai. */
  avvisoScostamentoMinuti: number | null;
}

export const REGOLE_COME_OGGI: RegoleCampo = {
  chiCompila: "ognuno",
  oreDalle: "capo",
  avvisoScostamentoMinuti: null,
};

/** Soglie proposte nella pagina delle impostazioni. */
export const SCOSTAMENTI_PROPOSTI = [15, 30, 45, 60, 90, 120] as const;
export const SCOSTAMENTO_PREDEFINITO = 30;

/** Legge ciò che manda il database; ogni campo non valido torna al «come oggi». */
export function leggiRegole(raw: unknown): RegoleCampo {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const minuti = r.avviso_scostamento_minuti == null ? NaN : Number(r.avviso_scostamento_minuti);
  return {
    chiCompila: r.chi_compila === "capo" ? "capo" : "ognuno",
    oreDalle: r.ore_dalle === "timbrature" ? "timbrature" : "capo",
    avvisoScostamentoMinuti: Number.isFinite(minuti) && minuti >= 5 && minuti <= 480 ? Math.round(minuti) : null,
  };
}

/** 7,5 → «7h 30»; 8 → «8h»; 0,25 → «15 min». */
export function oreInTesto(ore: number): string {
  const minuti = Math.round(Math.abs(ore) * 60);
  const h = Math.floor(minuti / 60);
  const m = minuti % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, "0")}`;
}

/**
 * Le ore da proporre per una persona partendo dalle timbrature. Se non ha
 * timbrato, o è ancora dentro (le ore non sono definitive), non si propone
 * nulla: le scrive il capo.
 */
export function proponiOre(timbrate: number | null | undefined, ancoraDentro?: boolean): number | "" {
  if (ancoraDentro || timbrate == null || !Number.isFinite(timbrate) || timbrate <= 0) return "";
  return Math.min(24, Math.round(timbrate * 10) / 10);
}

export interface Scostamento {
  /** Positivo: il capo ha scritto più ore di quelle timbrate. */
  minuti: number;
  fuori: boolean;
}

/** Confronto tra ore scritte e ore timbrate; null se manca un dato o l'avviso è spento. */
export function scostamento(
  scritte: number | "" | undefined,
  timbrate: number | null | undefined,
  sogliaMinuti: number | null,
): Scostamento | null {
  if (sogliaMinuti == null || scritte === "" || scritte == null || timbrate == null) return null;
  if (!Number.isFinite(scritte) || !Number.isFinite(timbrate)) return null;
  const minuti = Math.round((scritte - timbrate) * 60);
  return { minuti, fuori: Math.abs(minuti) > sogliaMinuti };
}

/** Una persona della lista del capo, per la regola «chi si può selezionare». */
export interface MembroPerRegola {
  rapportino_inviato?: boolean;
  gia_registrato_da_altri?: boolean;
}

/**
 * Chi non si può mettere nelle presenze: ha già mandato il suo rapportino
 * (le ore sono lì) o un collega l'ha già registrato oggi. Vale per ogni
 * flusso: una persona non si conta due volte nello stesso giorno e cantiere.
 */
export function giaCoperto(m: MembroPerRegola): "suo" | "collega" | null {
  if (m.rapportino_inviato) return "suo";
  if (m.gia_registrato_da_altri) return "collega";
  return null;
}
