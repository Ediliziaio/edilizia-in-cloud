import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/lib/edgeFunctionError';
import { analisiConsumiIniziale, leggiAnalisiConsumi, type AnalisiConsumiFv, CAMPI_NUMERO_BOLLETTA, CAMPI_TESTO_BOLLETTA } from '../../../supabase/functions/_shared/fvBollette';
export type LetturaBollettaFv = {
  id: string; path: string; nome: string; stato: string; documenti: unknown;
  errore: string | null; scade_il: string; updated_at: string;
};
export async function leggiLettureBollettaFv(companyId: string, progettoId: string, signal: AbortSignal): Promise<LetturaBollettaFv[]> {
  const { data, error } = await supabase.from('fv_bollette_letture')
    .select('id,path,nome,stato,documenti,errore,scade_il,updated_at')
    .eq('company_id', companyId).eq('progetto_id', progettoId)
    .order('updated_at', { ascending: false }).limit(60).abortSignal(signal);
  if (error) throw Error('Stato delle letture non disponibile. Verifica la connessione e riprova.');
  return data ?? [];
}
export async function erroreLetturaBollettaFv(error: unknown): Promise<string> {
  const message = await edgeErrorMessage(error, 'Lettura non avviata. Il file resta caricato: riprova tra poco.');
  if (/Invalid JWT|jwt expired|unauthorized/i.test(message)) return 'Sessione non valida. Riapri il progetto e riprova.';
  return /Failed to (?:fetch|send)|fetch failed|NetworkError|AbortError|TimeoutError|network request failed|aborted|request timeout|timed out|Load failed|Edge Function returned/i.test(message)
    ? 'Connessione interrotta. Il file resta caricato: controlla lo stato della lettura prima di riprovare.'
    : message;
}
/** Integra i nuovi esiti senza perdere conferme o correzioni manuali già salvate. */
export function integraLettureBollettaFv(current: AnalisiConsumiFv, jobs: LetturaBollettaFv[]): AnalisiConsumiFv {
  let documenti = current.documenti;
  let acquisite = current.lettureAcquisite;
  for (const job of jobs) {
    if (job.stato !== 'completata' || acquisite?.[job.id] === job.updated_at) continue;
    const letti = leggiAnalisiConsumi({ ...analisiConsumiIniziale(), documenti: job.documenti })?.documenti ?? [];
    if (!letti.length || letti.some(d => d.path !== job.path)) continue;
    if (documenti.length + letti.filter(d => !documenti.some(x => x.hash === d.hash && x.id === d.id)).length > 60) continue;
    acquisite = Object.fromEntries(Object.entries({ ...acquisite, [job.id]: job.updated_at })
      .sort((a, b) => Date.parse(b[1]) - Date.parse(a[1])).slice(0, 60));
    for (const d of letti) {
      if (d.path !== job.path) continue;
      const index = documenti.findIndex(x => x.hash === d.hash && (
        d.estratti.pod ? x.estratti.pod === d.estratti.pod : x.id === d.id && !x.estratti.pod
      ));
      if (index < 0) {
        const id = documenti.some(x => x.id === d.id) ? `${d.hash}:${d.estratti.pod ?? d.id.split(':').at(-1)}` : d.id;
        if (documenti.length < 60) documenti = [...documenti, { ...d, id, confermato: false }];
        continue;
      }
      const old = documenti[index];
      // Il documento confermato resta esattamente quello verificato dall'operatore.
      if (old.confermato || JSON.stringify(old.estratti) === JSON.stringify(d.estratti)) continue;
      const dati = structuredClone(d.dati);
      for (const campo of [...CAMPI_NUMERO_BOLLETTA, ...CAMPI_TESTO_BOLLETTA]) {
        if (old.dati[campo] !== old.estratti[campo]) {
          // Campo eterogeneo numerico/testuale: assegnazione dopo la selezione della stessa chiave.
          Object.assign(dati, { [campo]: old.dati[campo] });
          if (old.dati.pagine[campo] != null) dati.pagine[campo] = old.dati.pagine[campo];
        }
      }
      documenti = documenti.map((x, i) => i === index ? { ...d, id: old.id, dati, confermato: false } : x);
    }
  }
  if (documenti === current.documenti && acquisite === current.lettureAcquisite) return current;
  return { ...current, documenti, lettureAcquisite: acquisite, podSelezionato: current.podSelezionato || documenti[0]?.dati.pod || '', proiezioneConfermata: documenti === current.documenti ? current.proiezioneConfermata : false };
}
