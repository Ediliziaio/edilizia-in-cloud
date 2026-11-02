/**
 * Pezzi comuni dei lettori a regole (31/10/2026, fase 1, lotto 1.1).
 *
 * Un lettore trasforma una fonte (preventivo, computo, commessa) in un `Frammento` del
 * piano: solo chiavi del registro, ognuna con la sua fonte e, dove si sa, il punto
 * preciso (`dove`). Le regole copiano, non stimano: fiducia 1 e stato «fatto», salvo
 * dove il lettore deve ricavare (durate dai capitoli) e lo dice.
 *
 * Funzioni pure: niente database. Le letture stanno in `daDatabase.ts`.
 */
import type {
  CostoDelPiano, FaseDelPiano, Fonte, Frammento, SottofaseDelPiano, Stato,
} from "../../../../shared/silvio-commessa/piano.ts";
import { variabile } from "../../../../shared/silvio-commessa/registro.ts";

export interface Opzioni {
  fiducia?: number;
  stato?: Stato;
  nota?: string | null;
  /** Il punto della fonte: «riga 3», «cronoprogramma», «condizioni di pagamento». */
  dove?: string | null;
  citazione?: string | null;
}

/** Vuoto = niente da dire: null, testo vuoto, elenco vuoto, oggetto con tutti i campi vuoti. */
export function vuoto(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (typeof v === "number") return !Number.isFinite(v);
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.values(v as object).every(vuoto);
  return false;
}

/** Un frammento vuoto della fonte, da riempire con `metti`. */
export function nuovoFrammento(fonte: Fonte): Frammento {
  return { fonte, aree: {}, avvisi: [], costoEur: 0 };
}

/**
 * Mette un valore nel frammento, nell'area della sua variabile. I valori vuoti non
 * entrano (un lettore non dice «non c'è»: tace). Una chiave fuori registro è un
 * errore di programma, non un dato: lancia.
 */
export function metti(fr: Frammento, chiave: string, valore: unknown, opz: Opzioni = {}): void {
  const v = variabile(chiave);
  if (!v) throw new Error(`«${chiave}» non è nel registro`);
  if (vuoto(valore)) return;
  const area = (fr.aree[v.area] ??= {});
  const fonte = opz.dove || opz.citazione
    ? { ...fr.fonte, dove: opz.dove ?? fr.fonte.dove ?? null, citazione: opz.citazione ?? fr.fonte.citazione ?? null }
    : undefined;
  area[chiave] = {
    valore: pulito(valore),
    fiducia: opz.fiducia ?? 1,
    stato: opz.stato ?? "fatto",
    nota: opz.nota ?? null,
    ...(fonte ? { fonte } : {}),
  };
}

/** Un oggetto di colonne senza le colonne vuote (le variabili con più colonne di `orders`). */
export function colonne(o: Record<string, unknown>): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (!vuoto(v)) out[k] = typeof v === "string" ? v.trim() : v;
  return Object.keys(out).length ? out : null;
}

function pulito(v: unknown): unknown {
  return typeof v === "string" ? v.trim() : v;
}

export function avvisa(fr: Frammento, testo: string): void {
  (fr.avvisi ??= []).push(testo);
}

export const testo = (v: unknown): string => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
export const numero = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
export const tondo = (n: number) => Math.round(n * 100) / 100;

/** «Via Roma 1, 20900 Monza (MB)» dai quattro campi del cantiere dei preventivatori. */
export function indirizzoDaParti(p: { indirizzo?: unknown; cap?: unknown; citta?: unknown; provincia?: unknown }): string {
  const via = testo(p.indirizzo);
  const luogo = [testo(p.cap), testo(p.citta)].filter(Boolean).join(" ");
  const prov = testo(p.provincia);
  const coda = [luogo, prov ? `(${prov.toUpperCase()})` : ""].filter(Boolean).join(" ");
  return [via, coda].filter(Boolean).join(", ");
}

/** Una voce di un computo (nativo, PriMus o di un preventivatore) vista come sottofase. */
export interface VoceDiCapitolo extends SottofaseDelPiano {
  capitolo: string;
}

/** Una fase con durata, da un cronoprogramma. */
export interface FaseConDurata {
  nome: string;
  giornoInizio: number;
  giorni: number;
}

const chiaveNome = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Ogni capitolo diventa una fase e ogni voce una sottofase (come crea_commessa_preventivo_atomic).
 * I tempi vengono dal cronoprogramma quando una sua fase ha il nome del capitolo; le
 * fasi del cronoprogramma che non sono capitoli (l'allestimento, il collaudo) restano
 * fasi senza voci; i capitoli senza tempi vanno in coda con la durata `stimaGiorni`.
 */
export function fasiDaCapitoli(
  voci: readonly VoceDiCapitolo[],
  crono: readonly FaseConDurata[],
  stimaGiorni: (capitolo: string, voci: VoceDiCapitolo[]) => number,
): { fasi: FaseDelPiano[]; stimate: string[] } {
  const perCapitolo = new Map<string, { nome: string; voci: VoceDiCapitolo[] }>();
  for (const v of voci) {
    const nome = v.capitolo.trim() || "Lavorazioni";
    const c = perCapitolo.get(chiaveNome(nome)) ?? { nome, voci: [] };
    c.voci.push(v);
    perCapitolo.set(chiaveNome(nome), c);
  }
  const sottofasi = (vs: VoceDiCapitolo[]): SottofaseDelPiano[] =>
    vs.map(({ capitolo: _c, ...s }) => Object.fromEntries(Object.entries(s).filter(([, x]) => x != null)) as unknown as SottofaseDelPiano);

  const fasi: FaseDelPiano[] = [];
  const usati = new Set<string>();
  for (const f of [...crono].sort((a, b) => a.giornoInizio - b.giornoInizio)) {
    const c = perCapitolo.get(chiaveNome(f.nome));
    if (c) usati.add(chiaveNome(f.nome));
    fasi.push({
      name: f.nome, giorno_inizio: f.giornoInizio, giorni: f.giorni,
      ...(c ? { sottofasi: sottofasi(c.voci) } : {}),
    });
  }
  let giorno = fasi.reduce((max, f) => Math.max(max, (f.giorno_inizio ?? 1) + (f.giorni ?? 1)), 1);
  const stimate: string[] = [];
  for (const [k, c] of perCapitolo) {
    if (usati.has(k)) continue;
    const giorni = Math.max(1, Math.round(stimaGiorni(c.nome, c.voci)));
    fasi.push({ name: c.nome, giorno_inizio: giorno, giorni, sottofasi: sottofasi(c.voci) });
    stimate.push(c.nome);
    giorno += giorni;
  }
  return { fasi, stimate };
}

/** Circa una giornata di squadra ogni 1.500 € di lavori, almeno un giorno (come `cronoDaCapitoli`). */
export const giorniDalValore = (_capitolo: string, voci: VoceDiCapitolo[]) =>
  Math.min(60, Math.max(1, Math.round(voci.reduce((s, v) => s + Math.abs(v.importo ?? 0), 0) / 1500)));

/** Il costo previsto per fase: la somma dei costi delle voci, e quante non ne hanno. */
export function costiDelleFasi(fasi: readonly FaseDelPiano[]): CostoDelPiano[] {
  return fasi
    .filter((f) => f.sottofasi?.length)
    .map((f) => ({
      fase: f.name,
      importo: tondo(f.sottofasi!.reduce((s, v) => s + (v.costo ?? 0), 0)),
      vociSenzaCosto: f.sottofasi!.filter((v) => !(v.costo && v.costo > 0)).length,
    }))
    .filter((c) => c.importo > 0);
}
