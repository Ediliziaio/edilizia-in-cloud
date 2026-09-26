/**
 * La giornata degli operai in parole semplici (Manodopera e Mezzi, 26/09/2026).
 * Gli stati arrivano da manodopera_oggi() nel database.
 */
export type StatoGiornataOperaio =
  | "al_lavoro"
  | "in_pausa"
  | "uscito"
  | "uscita_mancante"
  | "assente"
  | "riposo"
  | "non_timbrato";

export const ETICHETTA_STATO: Record<StatoGiornataOperaio, string> = {
  al_lavoro: "Al lavoro",
  in_pausa: "In pausa",
  uscito: "Uscito",
  uscita_mancante: "Uscita non timbrata",
  assente: "Assente",
  riposo: "A riposo",
  non_timbrato: "Non ha timbrato",
};

/** Classi del bollino, dal più urgente al più tranquillo. */
export const TONO_STATO: Record<StatoGiornataOperaio, string> = {
  al_lavoro: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  in_pausa: "bg-amber-50 text-amber-700 ring-amber-200",
  uscito: "bg-slate-100 text-slate-600 ring-slate-200",
  uscita_mancante: "bg-orange-50 text-orange-700 ring-orange-200",
  assente: "bg-sky-50 text-sky-700 ring-sky-200",
  riposo: "bg-slate-50 text-slate-400 ring-slate-200",
  non_timbrato: "bg-white text-slate-500 ring-slate-200",
};

/** Pallino dello stato (avatar e barra del giorno). */
export const PALLINO_STATO: Record<StatoGiornataOperaio, string> = {
  al_lavoro: "bg-emerald-500",
  in_pausa: "bg-amber-400",
  uscito: "bg-slate-400",
  uscita_mancante: "bg-orange-500",
  assente: "bg-sky-400",
  riposo: "bg-slate-200",
  non_timbrato: "bg-rose-300",
};

const ASSENZE: Record<string, string> = {
  ferie: "In ferie",
  permesso: "In permesso",
  rol: "In permesso",
  malattia: "In malattia",
  infortunio: "Infortunio",
  maternita: "Maternità",
  paternita: "Paternità",
  lutto: "Lutto",
  aspettativa: "In aspettativa",
  congedo: "In congedo",
  festivita: "Festivo",
  assente: "Assente",
};

export function statoNoto(s: string | null | undefined): StatoGiornataOperaio {
  return (s && s in ETICHETTA_STATO ? s : "non_timbrato") as StatoGiornataOperaio;
}

/** «In ferie», «In malattia»…; per gli altri stati l'etichetta dello stato. */
export function etichettaGiornata(stato: string | null | undefined, assenza?: string | null): string {
  const s = statoNoto(stato);
  if (s === "assente") return (assenza && ASSENZE[assenza]) || "Assente";
  return ETICHETTA_STATO[s];
}

/** Ore in formato «7 h 45 min» (null o zero: «—»). */
export function formatOre(ore: number | null | undefined): string {
  if (ore == null || !Number.isFinite(ore) || ore <= 0) return "—";
  const minuti = Math.round(ore * 60);
  const h = Math.floor(minuti / 60);
  const m = minuti % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** «07:30:00» → «07:30». */
export function formatOra(ora: string | null | undefined): string {
  return ora ? ora.slice(0, 5) : "—";
}

export interface ConteggioGiornata {
  alLavoro: number;
  usciti: number;
  assenti: number;
  daControllare: number;
  riposo: number;
}

/** I numeri in cima: chi lavora (anche in pausa), chi è uscito, chi è assente, chi manca. */
export function contaGiornata(righe: readonly { stato: string }[]): ConteggioGiornata {
  const c: ConteggioGiornata = { alLavoro: 0, usciti: 0, assenti: 0, daControllare: 0, riposo: 0 };
  for (const r of righe) {
    const s = statoNoto(r.stato);
    if (s === "al_lavoro" || s === "in_pausa") c.alLavoro++;
    else if (s === "uscito") c.usciti++;
    else if (s === "assente") c.assenti++;
    else if (s === "riposo") c.riposo++;
    else c.daControllare++;
  }
  return c;
}

export type FiltroGiornata = "tutti" | "al_lavoro" | "usciti" | "assenti" | "da_controllare" | "riposo";

export function passaFiltroGiornata(stato: string, filtro: FiltroGiornata): boolean {
  const s = statoNoto(stato);
  switch (filtro) {
    case "tutti": return true;
    case "al_lavoro": return s === "al_lavoro" || s === "in_pausa";
    case "usciti": return s === "uscito";
    case "assenti": return s === "assente";
    case "da_controllare": return s === "non_timbrato" || s === "uscita_mancante";
    case "riposo": return s === "riposo";
  }
}

/** Giorno in parole: «oggi», «ieri», altrimenti «giovedì 24 settembre». */
export function giornoInParole(giorno: string, oggi: string): string {
  if (giorno === oggi) return "Oggi";
  const g = new Date(`${giorno}T12:00:00Z`);
  const o = new Date(`${oggi}T12:00:00Z`);
  const diff = Math.round((o.getTime() - g.getTime()) / 86_400_000);
  if (diff === 1) return "Ieri";
  const testo = g.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return testo.charAt(0).toUpperCase() + testo.slice(1);
}

/** Sposta un giorno AAAA-MM-GG di n giorni. */
export function spostaGiorno(giorno: string, n: number): string {
  const d = new Date(`${giorno}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface GruppoSquadra<T> {
  /** null = senza squadra. */
  id: string | null;
  nome: string;
  colore: string | null;
  righe: T[];
}

/** Le righe divise per squadra, in ordine di nome; chi non ha squadra in fondo. */
export function perSquadra<T extends { squadra_id: string | null; squadra: string | null; squadra_colore: string | null }>(
  righe: readonly T[],
): GruppoSquadra<T>[] {
  const gruppi = new Map<string, GruppoSquadra<T>>();
  const senza: T[] = [];
  for (const r of righe) {
    if (!r.squadra_id) { senza.push(r); continue; }
    const g = gruppi.get(r.squadra_id) ?? { id: r.squadra_id, nome: r.squadra ?? "Squadra", colore: r.squadra_colore, righe: [] };
    g.righe.push(r);
    gruppi.set(r.squadra_id, g);
  }
  const out = [...gruppi.values()].sort((a, b) => a.nome.localeCompare(b.nome, "it"));
  if (senza.length) out.push({ id: null, nome: "Senza squadra", colore: null, righe: senza });
  return out;
}

/** La commessa più frequente fra quelle previste o timbrate dal gruppo (per l'intestazione). */
export function cantiereDelGruppo(righe: readonly { cantiere: string | null; previsto: string | null }[]): string | null {
  const conta = new Map<string, number>();
  for (const r of righe) {
    const c = r.cantiere ?? r.previsto;
    if (c) conta.set(c, (conta.get(c) ?? 0) + 1);
  }
  let migliore: string | null = null;
  let n = 0;
  for (const [c, k] of conta) if (k > n) { migliore = c; n = k; }
  return migliore;
}

