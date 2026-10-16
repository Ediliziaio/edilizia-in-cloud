import { termineRicerca, unitaCompatibili, type VoceComputoDaConfrontare, type VocePrezzario } from './confronto';
import { withHeavyDatabaseRead } from '@/lib/limitHeavyReads';

export type Corrispondenze = Map<string, { rif: VocePrezzario; confidenza: 'certa' | 'probabile' }>;
const colonne = 'id, codice, descrizione, unita_misura, prezzo';
/** Solo risultati conclusi, mai promise legate al signal di un altro consumatore. */
export function creaCacheConfronti() {
  const rows = new Map<string, { at: number; data: VocePrezzario[] }>();
  return {
    get(key: string) {
      const value = rows.get(key);
      if (value && Date.now() - value.at < 600_000) return value.data;
      rows.delete(key);
    },
    set(key: string, data: VocePrezzario[]) {
      rows.delete(key); rows.set(key, { at: Date.now(), data });
      if (rows.size > 200) rows.delete(rows.keys().next().value!);
    },
  };
}
const cache = creaCacheConfronti();

export function attendiRicerca(signal: AbortSignal, ms = 350): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function cercaConfronti(db: any, scope: string, fonteId: string,
  voci: VoceComputoDaConfrontare[], signal: AbortSignal, memo = cache): Promise<Corrispondenze> {
  const result: Corrispondenze = new Map();
  const load = async (kind: 'codici' | 'testo' | 'fallback', term: string | string[]) => {
    signal.throwIfAborted();
    const key = JSON.stringify([scope, fonteId, kind, term]);
    const cached = memo.get(key);
    if (cached) return cached;
    const response = await withHeavyDatabaseRead(async requestSignal => {
      let q = db.from('prezzario_voce').select(colonne).eq('fonte_id', fonteId);
      if (kind === 'codici') q = q.in('codice', term);
      else if (kind === 'testo') q = q.textSearch('search', term, { type: 'websearch', config: 'italian' }).limit(5);
      else q = q.ilike('descrizione', `%${term}%`).limit(5);
      return await q.abortSignal(requestSignal) as { data: VocePrezzario[] | null; error: { message: string } | null };
    }, 'Confronto prezzario', 8_000, signal);
    signal.throwIfAborted();
    // Un timeout o un errore di permesso NON deve avviare una seconda scansione.
    if (response.error) throw new Error(response.error.message);
    const data = response.data ?? [];
    memo.set(key, data);
    return data;
  };
  const codici = [...new Set(voci.map(v => v.codicePrezzario).filter((c): c is string => !!c))].sort();
  const perCodice = new Map<string | null, VocePrezzario>();
  // Anche computi grandi restano entro URL/richieste contenute.
  for (let i = 0; i < codici.length; i += 100) {
    for (const r of await load('codici', codici.slice(i, i + 100))) perCodice.set(r.codice, r);
  }
  for (const v of voci) {
    signal.throwIfAborted();
    const certa = v.codicePrezzario ? perCodice.get(v.codicePrezzario) : undefined;
    if (certa) { result.set(v.id, { rif: certa, confidenza: 'certa' }); continue; }
    const term = termineRicerca(v.descrizione);
    if (!term || v.descrizione.trim().length < 3) continue;
    let candidates = await load('testo', term);
    if (!candidates.length) {
      const keyword = term.split(' ').sort((a, b) => b.length - a.length)[0];
      if (keyword?.length >= 5) candidates = await load('fallback', keyword);
    }
    const choice = candidates.find(c => unitaCompatibili(c.unita_misura, v.unita_misura)) ?? candidates[0];
    if (choice) result.set(v.id, { rif: choice, confidenza: 'probabile' });
  }
  return result;
}
