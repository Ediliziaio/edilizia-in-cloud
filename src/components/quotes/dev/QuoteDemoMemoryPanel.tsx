import { useState } from 'react';
import type { MemoryProps } from './PersistentQuoteSession';
import type { QuoteDemoCopy } from '@/lib/preventivi/quoteDemoMemory';
export function QuoteDemoMemoryPanel({ demo, disabled }: { demo: NonNullable<MemoryProps['demo']>; disabled?: boolean }) {
  const [copy, setCopy] = useState<QuoteDemoCopy | null | undefined>();
  const [busy, setBusy] = useState(false); const [status, setStatus] = useState('');
  const act = async (fn: () => Promise<void>) => { if (busy) return; setBusy(true); setStatus(''); try { await fn(); } catch (e) { setStatus((e as Error).message); } finally { setBusy(false); } };
  return <details className="rounded-lg border border-blue-100 p-3"><summary className="cursor-pointer font-medium text-blue-950">Riprendi su un altro dispositivo · Demo 2</summary>
    <p className="my-2 text-xs text-slate-600">Solo su tua richiesta: salva chat, dossier, misure e voci nell’area di prova del tuo account. Non crea un preventivo nel gestionale. I file originali restano sul dispositivo; se mancanti dovrai riallegarli. Nessun invio ai clienti.</p>
    <fieldset disabled={disabled || busy} className="flex flex-wrap gap-2">
      <button type="button" className="rounded-lg border px-3 py-2" onClick={() => void act(async () => { const next = await demo.inspect(); setCopy(next); setStatus(next ? 'Copia trovata: confronta i dati prima di sostituirla o riprenderla.' : 'Nessuna copia presente per questo modello e account.'); })}>Controlla copia demo</button>
      {copy !== undefined && <button type="button" disabled={demo.auto?.enabled || demo.auto?.pending} className="rounded-lg border px-3 py-2" onClick={() => void act(async () => { const version = await demo.upload(copy?.version ?? 0); setCopy(undefined); setStatus(`Copia demo salvata · versione ${version}. Nessuna sincronizzazione automatica.`); })}>{copy ? `Sostituisci copia demo v${copy.version}` : 'Salva prima copia demo'}</button>}
      {copy && <button type="button" disabled={demo.auto?.enabled || demo.auto?.pending} className="rounded-lg border px-3 py-2" onClick={() => void act(() => demo.restore(copy))}>Riprendi copia e conserva versione locale</button>}
      {demo.auto && !demo.auto.enabled && copy !== undefined && <button type="button" disabled={demo.auto.pending} className="rounded-lg border px-3 py-2" onClick={() => void act(async () => { await demo.auto!.start(copy?.version ?? 0); setCopy(undefined); })}>Attiva copia automatica da questa bozza{copy ? ` · sostituisce v${copy.version}` : ''}</button>}
      {demo.auto?.enabled && <button type="button" className="rounded-lg border px-3 py-2" onClick={demo.auto.stop}>Disattiva copia automatica</button>}
    </fieldset>
    {copy && <p className="mt-2 text-xs">Versione {copy.version} · {new Date(copy.updatedAt).toLocaleString('it-IT')} · «{copy.snapshot.document.title}» · {copy.snapshot.document.lines.length} voci · {copy.snapshot.dossier?.length ?? 0} {copy.snapshot.dossier?.length === 1 ? 'pagina' : 'pagine'} nel dossier. Il ripristino sostituisce la bozza locale, dopo averne salvato una versione.</p>}
    {status && <p className="mt-2 text-xs" role="status">{status}</p>}
    {demo.auto && <p className="mt-2 text-xs" role="status">{demo.auto.status || 'Copia automatica disattivata.'} Se attivata, aggiorna la copia dopo le pause di lavoro finché questa pagina resta aperta. Un conflitto la sospende; non fonde né scarica automaticamente modifiche di un altro dispositivo.</p>}
  </details>;
}
