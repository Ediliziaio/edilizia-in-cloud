/**
 * Le voci di lavoro di una commessa, dalla fonte migliore che ha (2/11/2026): voci delle fasi,
 * poi computo, poi righe del preventivo. Mai sommate fra loro: sono lo stesso lavoro scritto
 * in posti diversi, e sommarle raddoppierebbe le ore.
 */
import type { FaseCantiere, Incidenza, VoceCantiere } from "./calcolo.ts";

export interface RigaVoce {
  fase?: string | null; capitolo?: string | null; descrizione?: string | null; unita?: string | null;
  quantita?: number | string | null; importo?: number | string | null;
  costo_manodopera?: number | string | null; costo_materiali?: number | string | null; ore_previste?: number | string | null;
  /** Frazione da 0 a 1, o percentuale da 1 a 100 (i listini scritti a mano). */
  incidenza?: number | string | null;
  opzionale?: boolean | null;
}

export interface DatiVoci { voci_fase?: RigaVoce[] | null; voci_computo?: RigaVoce[] | null; righe_preventivo?: RigaVoce[] | null }

const numero = (v: unknown): number | null => { const n = Number(v); return v != null && v !== "" && Number.isFinite(n) ? n : null; };

/** La chiave con cui il prezzario restituisce l'incidenza di un testo. */
export const testoPerPrezzario = (v: Pick<VoceCantiere, "descrizione">) => v.descrizione.trim().slice(0, 120).toLowerCase();

function incidenzaDa(v: unknown): Incidenza | null {
  const n = numero(v);
  if (n === null || n <= 0) return null;
  return { frazione: n > 1 ? Math.min(1, n / 100) : n };
}

function daRighe(righe: readonly RigaVoce[], origine: VoceCantiere["origine"]): VoceCantiere[] {
  return righe.filter((r) => !r.opzionale && (r.descrizione ?? "").trim()).map((r) => ({
    fase: r.fase?.trim() || null, capitolo: r.capitolo?.trim() || null, descrizione: r.descrizione!.trim(),
    unita: r.unita ?? null, quantita: numero(r.quantita) ?? 0, importo: numero(r.importo),
    costo_manodopera: numero(r.costo_manodopera), costo_materiali: numero(r.costo_materiali), ore_previste: numero(r.ore_previste),
    incidenza: incidenzaDa(r.incidenza), origine,
  }));
}

const FASE_SENZA_VOCI = /collaud|consegn|allestiment|sicurezz|pulizi/i;

export function vociDellaCommessa(dati: DatiVoci, fasi: readonly { nome?: string | null }[] = []): VoceCantiere[] {
  if (dati.voci_fase?.length) {
    // Le voci di fase valgono solo se coprono tutte le fasi di lavoro: se ne bastasse una,
    // cancellerebbe il preventivo e le altre fasi resterebbero a zero ore.
    const conVoci = new Set(dati.voci_fase.map((v) => v.fase?.trim()));
    const scoperta = fasi.some((f) => f.nome?.trim() && !FASE_SENZA_VOCI.test(f.nome) && !conVoci.has(f.nome.trim()));
    if (!scoperta || (!dati.voci_computo?.length && !dati.righe_preventivo?.length)) return daRighe(dati.voci_fase, "fase");
  }
  if (dati.voci_computo?.length) return daRighe(dati.voci_computo, "computo");
  return daRighe(dati.righe_preventivo ?? [], "preventivo");
}

/** Aggiunge la stima del prezzario alle sole voci che non hanno altri dati di manodopera. */
export function conIncidenzaPrezzario(voci: readonly VoceCantiere[], stime: ReadonlyMap<string, Incidenza>): VoceCantiere[] {
  return voci.map((v) => {
    if (v.incidenza || (v.ore_previste ?? 0) > 0 || (v.costo_manodopera ?? 0) > 0) return v;
    const s = stime.get(testoPerPrezzario(v));
    return s ? { ...v, incidenza: s } : v;
  });
}

/** I testi da chiedere al prezzario. */
export function testiSenzaManodopera(voci: readonly VoceCantiere[], massimo = 40): string[] {
  const testi = new Set<string>();
  for (const v of voci) {
    if (v.incidenza || (v.ore_previste ?? 0) > 0 || (v.costo_manodopera ?? 0) > 0 || !(v.importo ?? 0)) continue;
    testi.add(testoPerPrezzario(v));
    if (testi.size >= massimo) break;
  }
  return [...testi];
}

export interface RigaFase { nome?: string | null; dal?: string | null; al?: string | null; status?: string | null; percentuale?: number | null; ditta?: string | null }

export function fasiDellaCommessa(righe: readonly RigaFase[] | null | undefined): FaseCantiere[] {
  return (righe ?? []).filter((f) => (f.nome ?? "").trim()).map((f) => ({
    nome: f.nome!.trim(), dal: f.dal ?? null, al: f.al ?? null,
    percentuale: f.status === "completata" ? 100 : Math.max(0, Math.min(100, Number(f.percentuale) || 0)),
    completata: f.status === "completata", ditta: f.ditta ?? null,
  }));
}
