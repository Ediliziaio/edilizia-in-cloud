/**
 * Quante fatture mancano. Sulle emesse la numerazione è dell'azienda, quindi un numero saltato è un
 * documento che manca davvero, o scartato. Sulle ricevute è di ogni fornitore: lì si può solo
 * segnalare un mese sospetto, la prova certa è il confronto col cassetto fiscale.
 */
export interface DocumentoNumerato { numero: string | null; data: string | null }

export interface BuchiSerie {
  anno: string;
  serie: string;
  presenti: number;
  da: number;
  a: number;
  mancanti: number[];
  /** I mancanti in intervalli, per scriverli senza un elenco infinito. */
  intervalli: Array<[number, number]>;
}

/** Oltre questo salto non è un buco ma un cambio di numerazione: dirlo mancante sarebbe un falso allarme. */
const SALTO_MASSIMO = 500;

function separa(numero: string): { serie: string; n: number } | null {
  const m = numero.trim().match(/^(.*?)(\d+)$/);
  if (!m) return null;
  const n = Number(m[2]);
  return Number.isSafeInteger(n) ? { serie: m[1], n } : null;
}

export function buchiNumerazione(docs: readonly DocumentoNumerato[]): BuchiSerie[] {
  const gruppi = new Map<string, { anno: string; serie: string; numeri: Set<number> }>();
  for (const d of docs) {
    if (!d.numero || !d.data) continue;
    const s = separa(d.numero);
    if (!s) continue;
    const anno = d.data.slice(0, 4);
    const k = `${anno}|${s.serie}`;
    if (!gruppi.has(k)) gruppi.set(k, { anno, serie: s.serie, numeri: new Set() });
    gruppi.get(k)!.numeri.add(s.n);
  }
  const out: BuchiSerie[] = [];
  for (const g of gruppi.values()) {
    const numeri = [...g.numeri].sort((a, b) => a - b);
    const mancanti: number[] = [];
    const intervalli: Array<[number, number]> = [];
    for (let i = 1; i < numeri.length; i++) {
      const salto = numeri[i] - numeri[i - 1] - 1;
      if (salto < 1 || salto > SALTO_MASSIMO) continue;
      intervalli.push([numeri[i - 1] + 1, numeri[i] - 1]);
      for (let n = numeri[i - 1] + 1; n < numeri[i]; n++) mancanti.push(n);
    }
    out.push({ anno: g.anno, serie: g.serie, presenti: numeri.length, da: numeri[0], a: numeri[numeri.length - 1], mancanti, intervalli });
  }
  return out.sort((a, b) => b.anno.localeCompare(a.anno) || a.serie.localeCompare(b.serie));
}

export const totaleMancanti = (serie: readonly BuchiSerie[]) => serie.reduce((s, b) => s + b.mancanti.length, 0);

/** «1/190 – 1/215, 2/3»: gli intervalli di una serie, in parole. */
export function testoIntervalli(b: BuchiSerie): string {
  return b.intervalli.map(([da, a]) => (da === a ? `${b.serie}${da}` : `${b.serie}${da} – ${b.serie}${a}`)).join(", ");
}

/** Numero alto e data vecchia: fuori ordine rispetto ai numeri prima. Si segnala, non si corregge. */
export function fuoriSequenza(docs: readonly DocumentoNumerato[]): DocumentoNumerato[] {
  const gruppi = new Map<string, Array<{ n: number; d: DocumentoNumerato }>>();
  for (const d of docs) {
    if (!d.numero || !d.data) continue;
    const s = separa(d.numero);
    if (!s) continue;
    const k = `${d.data.slice(0, 4)}|${s.serie}`;
    if (!gruppi.has(k)) gruppi.set(k, []);
    gruppi.get(k)!.push({ n: s.n, d });
  }
  const out: DocumentoNumerato[] = [];
  for (const righe of gruppi.values()) {
    righe.sort((a, b) => a.n - b.n);
    let massima = "";
    for (const r of righe) {
      if (massima && r.d.data! < massima) out.push(r.d);
      else massima = r.d.data!;
    }
  }
  return out;
}

export interface Mese { mese: string; quante: number; sospetto: boolean }

/**
 * Le fatture per mese, compresi i mesi vuoti. Sospetto = meno della metà della mediana. Il mese in corso
 * non si giudica: è appena iniziato o a metà, e con meno di quattro mesi interi non c'è una misura.
 */
export function fatturePerMese(date: ReadonlyArray<string | null>, oggi: string): Mese[] {
  const conteggi = new Map<string, number>();
  for (const d of date) if (d) conteggi.set(d.slice(0, 7), (conteggi.get(d.slice(0, 7)) ?? 0) + 1);
  if (!conteggi.size) return [];
  const chiavi = [...conteggi.keys()].sort();
  const corrente = oggi.slice(0, 7);
  const fine = chiavi[chiavi.length - 1] > corrente ? chiavi[chiavi.length - 1] : corrente;
  const mesi: string[] = [];
  let [y, m] = chiavi[0].split("-").map(Number);
  for (let guardia = 0; guardia < 600; guardia++) {
    const k = `${y}-${String(m).padStart(2, "0")}`;
    mesi.push(k);
    if (k >= fine) break;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  // Il primo mese è spesso parziale: non entra nella misura.
  const interi = mesi.slice(1).filter((k) => k < corrente).map((k) => conteggi.get(k) ?? 0).sort((a, b) => a - b);
  const mediana = interi.length >= 4 ? interi[Math.floor(interi.length / 2)] : null;
  return mesi.map((k, i) => {
    const quante = conteggi.get(k) ?? 0;
    return { mese: k, quante, sospetto: mediana !== null && i > 0 && k < corrente && quante < mediana / 2 };
  });
}
