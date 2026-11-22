import { useCallback, useEffect, useRef, useState } from 'react';
import { leggiLettureBollettaFv, type LetturaBollettaFv } from '@/lib/fotovoltaico/lettureBolletta';
const NESSUNA: LetturaBollettaFv[] = [];
export function useLettureBollettaFv(company: string | null | undefined, progetto: string | null | undefined, enabled: boolean, onRisultati: (jobs: LetturaBollettaFv[]) => void) {
  const key = `${company ?? ''}:${progetto ?? ''}`;
  const [state, setState] = useState({ key: '', jobs: NESSUNA, errore: '', ora: 0 });
  const [revision, setRevision] = useState(0);
  const callback = useRef(onRisultati);
  useEffect(() => { callback.current = onRisultati; }, [onRisultati]);
  const ricarica = useCallback(() => setRevision(n => n + 1), []);
  useEffect(() => {
    if (!enabled || !company || !progetto) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    const carica = async () => {
      if (running || controller.signal.aborted) return;
      running = true;
      clearTimeout(timer);
      try {
        const jobs = await leggiLettureBollettaFv(company, progetto, controller.signal);
        if (controller.signal.aborted) return;
        setState({ key, jobs, errore: '', ora: Date.now() });
        callback.current(jobs);
        // Dopo scadenza non ripetere richieste inutili: la UI propone la ripresa.
        if (jobs.some(j => j.stato === 'in_corso' && Date.parse(j.scade_il) > Date.now())) timer = setTimeout(() => void carica(), 3000);
      } catch {
        if (!controller.signal.aborted) setState({ key, jobs: NESSUNA, errore: 'Stato delle letture non disponibile. Verifica la connessione e riprova.', ora: Date.now() });
      } finally { running = false; }
    };
    void carica();
    const online = (): void => { void carica(); };
    window.addEventListener('online', online);
    return () => { controller.abort(); clearTimeout(timer); window.removeEventListener('online', online); };
  }, [company, progetto, enabled, key, revision]);
  return { jobs: state.key === key && enabled ? state.jobs : NESSUNA, errore: state.key === key && enabled ? state.errore : '', ora: state.ora, ricarica };
}
