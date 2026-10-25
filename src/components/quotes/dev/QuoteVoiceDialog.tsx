import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import CampoAudioRecorder from '@/components/campo/CampoAudioRecorder';
import { QUOTE_AUDIO_MAX_BYTES } from '../../../../supabase/functions/_shared/quoteAudio';

export type QuoteAudioTranscriber = (blob: Blob, signal: AbortSignal) => Promise<string>;
export function QuoteVoiceDialog({ onClose, onInsert, transcribe }: { onClose: () => void; onInsert: (text: string) => boolean; transcribe?: QuoteAudioTranscriber }) {
  const [text, setText] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const [imported, setImported] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);
  const selectRecording = (file: File | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = file ? URL.createObjectURL(file) : null;
    setPreview(previewRef.current); setImported(file); setText(''); setError('');
  };
  const convert = async (blob: Blob) => {
    if (controller.current) return;
    if (!transcribe) { setError('Trascrizione non ancora attiva in questo ambiente. La registrazione non è stata inviata e puoi riascoltarla.'); return; }
    const ctrl = new AbortController(); controller.current = ctrl; setBusy(true); setError('');
    try { const result = await transcribe(blob, ctrl.signal); if (!ctrl.signal.aborted) setText(result); }
    catch (e) { if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : 'Trascrizione non riuscita. Nessun nuovo tentativo automatico.'); }
    finally { if (!ctrl.signal.aborted) setBusy(false); if (controller.current === ctrl) controller.current = null; }
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="quote-composer-dialog quote-voice-dialog">
    <DialogHeader><DialogTitle>Descrivi il lavoro a voce</DialogTitle><DialogDescription>Registra fino a 2 minuti e riascolta. «Trascrivi audio» prepara un testo modificabile: lo controlli prima di inviarlo nella chat.</DialogDescription></DialogHeader>
    {!transcribe && <p role="status" className="quote-voice-pending">Registrazione e riascolto locali disponibili. La trascrizione in questo ambiente è in attesa di attivazione: nessun audio viene inviato.</p>}
    {!imported && <CampoAudioRecorder disabled={busy} onConfirm={convert} confirmLabel="Trascrivi audio" confirmAvailable={!!transcribe} />}
    <label className="quote-voice-upload">{imported ? imported.name : 'Oppure carica una registrazione'}<input aria-label="Registrazione audio da trascrivere" type="file" disabled={busy} accept="audio/wav,audio/webm,audio/mp4,audio/ogg,.wav,.webm,.m4a,.ogg" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) { if (!file.size || file.size > QUOTE_AUDIO_MAX_BYTES) { setError('Usa un audio non vuoto, massimo 2 MB e 2 minuti.'); return; } selectRecording(file); } }} /></label>
    {preview && <div className="quote-voice-import"><audio controls src={preview} aria-label="Riascolta registrazione caricata" /><button type="button" disabled={busy || !transcribe} onClick={() => imported && void convert(imported)}>Trascrivi audio</button><button type="button" disabled={busy} onClick={() => selectRecording(null)}>Rimuovi audio</button></div>}
    <p className="quote-support-note">Il microfono si attiva solo con il tuo permesso. «Trascrivi audio» invia la registrazione a OpenAI Whisper tramite il server del gestionale, con consumo tracciato sulla tua azienda. Audio e trascrizione non sono archiviati dal gestionale; l’audio viene elaborato dal fornitore. Nessun invio ai clienti.</p>
    {busy && <p role="status">Trascrizione in corso…</p>}{error && <p role="alert" className="quote-support-error">{error}</p>}
    {text && <label className="quote-support-extract">Controlla la trascrizione<textarea aria-label="Trascrizione da verificare" value={text} onChange={e => setText(e.target.value)} /></label>}
    <div className="quote-support-footer"><button type="button" onClick={onClose}>Annulla</button>{text && <button type="button" disabled={!text.trim()} onClick={() => { if (onInsert(text.trim())) onClose(); else setError('Messaggio oltre 3000 caratteri. Accorcia la trascrizione: il testo già scritto è conservato.'); }}>Inserisci nel messaggio</button>}</div>
  </DialogContent></Dialog>;
}
