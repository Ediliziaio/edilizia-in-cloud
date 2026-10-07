// src/lib/orders/modelliFasi.ts
/**
 * Modelli di fasi (07/10/2026): quelli dell'azienda, con le sottofasi, e i
 * modelli di partenza (gli 8 che l'azienda fa suoi la prima volta).
 * Modulo puro: nessun React, nessun Supabase.
 */
import type { PhaseTemplate } from "@/hooks/useOrderWorkPhases";

export interface SottofaseModello { nome: string; peso: number }
export interface FaseModello { nome: string; sottofasi: SottofaseModello[] }
export type OrigineModello = "azienda" | "partenza";

export interface ModelloFasi {
  /** uuid del modello dell'azienda; i modelli di partenza non ancora suoi hanno «partenza:<chiave>». */
  id: string;
  origine: OrigineModello;
  nome: string;
  descrizione: string;
  fasi: FaseModello[];
}

export const PREFISSO_PARTENZA = "partenza:";
export const MAX_FASI_MODELLO = 60;
export const MAX_SOTTOFASI_FASE = 40;
export const MAX_NOME_MODELLO = 80;
export const MAX_NOME_VOCE = 160;

export const eModelloDiPartenza = (id: string): boolean => id.startsWith(PREFISSO_PARTENZA);

export function modelloDiPartenza(t: PhaseTemplate): ModelloFasi {
  return {
    id: `${PREFISSO_PARTENZA}${t.key}`, origine: "partenza", nome: t.label, descrizione: t.hint,
    fasi: t.phases.map((nome): FaseModello => ({ nome, sottofasi: [] })),
  };
}

/**
 * I modelli che «Scegli le fasi» e la pagina delle impostazioni mostrano: quelli
 * dell'azienda se li ha già fatti suoi (anche se li ha tolti tutti); finché non
 * lo ha fatto, quelli di partenza, uguali a quelli di sempre, dopo gli eventuali
 * modelli che ha già salvato lei (senza ripetere quelli con lo stesso nome).
 */
export function modelliDaOffrire(
  inizializzati: boolean,
  azienda: ReadonlyArray<ModelloFasi>,
  partenza: ReadonlyArray<PhaseTemplate>,
): ModelloFasi[] {
  if (inizializzati) return [...azienda];
  const nomi = new Set(azienda.map((m) => m.nome.trim().toLowerCase()));
  return [...azienda, ...partenza.filter((t) => !nomi.has(t.label.trim().toLowerCase())).map(modelloDiPartenza)];
}

/** Cosa si manda a inizializza_modelli_fasi per darli all'azienda. */
export interface ModelloPerServer { nome: string; descrizione: string; fasi: FaseModello[] }
export function modelliPerInizializzare(partenza: ReadonlyArray<PhaseTemplate>): ModelloPerServer[] {
  return partenza.map((t) => ({
    nome: t.label, descrizione: t.hint,
    fasi: t.phases.map((nome): FaseModello => ({ nome, sottofasi: [] })),
  }));
}

/** Quanti modelli di partenza l'azienda non ha (più), per nome: serve a «Ripristina i predefiniti». */
export function modelliDiPartenzaMancanti(partenza: ReadonlyArray<PhaseTemplate>, azienda: ReadonlyArray<ModelloFasi>): number {
  const nomi = new Set(azienda.map((m) => m.nome.trim().toLowerCase()));
  return partenza.filter((t) => !nomi.has(t.label.trim().toLowerCase())).length;
}

export const totaleSottofasi = (m: Pick<ModelloFasi, "fasi">): number =>
  m.fasi.reduce((n, f) => n + f.sottofasi.length, 0);

// ── dalle tre tabelle all'albero ────────────────────────────────────────────
export interface RigaModello { id: string; name: string; hint: string | null; position: number }
export interface RigaFaseModello { id: string; template_id: string; name: string; position: number }
export interface RigaSottofaseModello { id: string; template_phase_id: string; name: string; position: number; peso: number }

export function assemblaModelli(
  modelli: ReadonlyArray<RigaModello>,
  fasi: ReadonlyArray<RigaFaseModello>,
  sottofasi: ReadonlyArray<RigaSottofaseModello>,
): ModelloFasi[] {
  const perPosizione = <T extends { position: number }>(a: T, b: T) => a.position - b.position;
  const sottoPerFase = new Map<string, RigaSottofaseModello[]>();
  for (const s of sottofasi) sottoPerFase.set(s.template_phase_id, [...(sottoPerFase.get(s.template_phase_id) ?? []), s]);
  const fasiPerModello = new Map<string, RigaFaseModello[]>();
  for (const f of fasi) fasiPerModello.set(f.template_id, [...(fasiPerModello.get(f.template_id) ?? []), f]);
  return [...modelli].sort(perPosizione).map((m): ModelloFasi => ({
    id: m.id, origine: "azienda", nome: m.name, descrizione: m.hint ?? "",
    fasi: [...(fasiPerModello.get(m.id) ?? [])].sort(perPosizione).map((f) => ({
      nome: f.name,
      sottofasi: [...(sottoPerFase.get(f.id) ?? [])].sort(perPosizione).map((s) => ({ nome: s.name, peso: s.peso })),
    })),
  }));
}

// ── bozza e validazione (l'editor lavora su una bozza) ──────────────────────
export interface BozzaModello { id: string | null; nome: string; descrizione: string; fasi: FaseModello[] }
export interface PayloadModello { id: string | null; nome: string; descrizione: string | null; fasi: FaseModello[] }
export type EsitoBozza = { ok: true; payload: PayloadModello } | { ok: false; errore: string };

export const bozzaVuota = (): BozzaModello => ({ id: null, nome: "", descrizione: "", fasi: [{ nome: "", sottofasi: [] }] });

/** Duplicare un modello dà una bozza nuova, «Copia di …»; modificarlo ne tiene l'id. */
export function bozzaDaModello(m: ModelloFasi, comeCopia: boolean): BozzaModello {
  return {
    id: comeCopia ? null : m.id,
    nome: comeCopia ? `Copia di ${m.nome}`.slice(0, MAX_NOME_MODELLO) : m.nome,
    descrizione: m.descrizione,
    fasi: m.fasi.map((f) => ({ nome: f.nome, sottofasi: f.sottofasi.map((s) => ({ ...s })) })),
  };
}

const pesoIntero = (peso: number): number =>
  Math.min(100, Math.max(1, Math.round(Number.isFinite(peso) ? peso : 1)));

export function validaBozza(b: BozzaModello): EsitoBozza {
  const nome = b.nome.trim();
  if (!nome) return { ok: false, errore: "Dai un nome al modello." };
  if (nome.length > MAX_NOME_MODELLO) return { ok: false, errore: `Il nome è troppo lungo (massimo ${MAX_NOME_MODELLO} caratteri).` };
  const fasi = b.fasi
    .map((f) => ({
      nome: f.nome.trim(),
      sottofasi: f.sottofasi.map((s) => ({ nome: s.nome.trim(), peso: pesoIntero(s.peso) })).filter((s) => s.nome),
    }))
    .filter((f) => f.nome);
  if (fasi.length === 0) return { ok: false, errore: "Un modello ha almeno una fase, con un nome." };
  if (fasi.length > MAX_FASI_MODELLO) return { ok: false, errore: `Troppe fasi: al massimo ${MAX_FASI_MODELLO}.` };
  if (fasi.some((f) => f.nome.length > MAX_NOME_VOCE || f.sottofasi.some((s) => s.nome.length > MAX_NOME_VOCE))) {
    return { ok: false, errore: `Un nome di fase o di sottofase è troppo lungo (massimo ${MAX_NOME_VOCE} caratteri).` };
  }
  if (fasi.some((f) => f.sottofasi.length > MAX_SOTTOFASI_FASE)) {
    return { ok: false, errore: `Troppe sottofasi in una fase: al massimo ${MAX_SOTTOFASI_FASE}.` };
  }
  return { ok: true, payload: { id: b.id, nome, descrizione: b.descrizione.trim() || null, fasi } };
}

/** Quello che arriva a «aggiungi_fasi_commessa» per un modello scelto. */
export function fasiPerCommessa(m: Pick<ModelloFasi, "fasi">): FaseModello[] {
  return m.fasi.map((f) => ({ nome: f.nome, sottofasi: f.sottofasi.map((s) => ({ nome: s.nome, peso: pesoIntero(s.peso) })) }));
}

// ── riordino, senza toccare l'originale ─────────────────────────────────────
export function sposta<T>(lista: ReadonlyArray<T>, indice: number, verso: -1 | 1): T[] {
  const j = indice + verso;
  if (indice < 0 || indice >= lista.length || j < 0 || j >= lista.length) return [...lista];
  const copia = [...lista];
  [copia[indice], copia[j]] = [copia[j], copia[indice]];
  return copia;
}
export const sostituisci = <T,>(lista: ReadonlyArray<T>, indice: number, patch: Partial<T>): T[] =>
  lista.map((x, i) => (i === indice ? { ...x, ...patch } : x));
export const rimuovi = <T,>(lista: ReadonlyArray<T>, indice: number): T[] => lista.filter((_, i) => i !== indice);
