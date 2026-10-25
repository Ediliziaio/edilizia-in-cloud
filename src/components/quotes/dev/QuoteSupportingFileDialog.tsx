import { useEffect, useRef, useState } from 'react';
import { FileText, LoaderCircle, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PLAN_MAX_BYTES, readPlanLocally } from '@/lib/preventivi/planReading';
import { supportingDocumentMessage } from '@/lib/preventivi/quoteSupportingDocuments';
import type { QuoteDossierPage } from '@/lib/preventivi/quoteDossier';

/** Supporting documents are not floorplans: never replace room identities or prices. */
export function QuoteSupportingFileDialog({ onClose, onInsert }: { onClose: () => void; onInsert: (text: string, evidence?: QuoteDossierPage) => boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const read = async (selected: File, selectedPage: number) => {
    if (controller.current) return;
    const ctrl = new AbortController(); controller.current = ctrl;
    setBusy(true); setError(''); setText('');
    try {
      if (!selected.size || selected.size > PLAN_MAX_BYTES) throw new Error('Usa un PDF, PNG o JPEG non vuoto, massimo 12 MB.');
      const bytes = new Uint8Array(await selected.slice(0, 8).arrayBuffer());
      const valid = new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-' || bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 || [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
      if (!valid) throw new Error('Formato non supportato: scegli PDF, PNG o JPEG, non file rinominati.');
      const reading = await readPlanLocally(selected, selectedPage, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setPages(reading.pages);
      const result = reading.lines.map(l => l.text).join('\n');
      if (!result.trim()) throw new Error('Non ho trovato testo leggibile. Puoi scrivere i dettagli del materiale qui sotto.');
      setText(result);
    } catch (e) { if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : 'Lettura non riuscita.'); }
    finally { if (!ctrl.signal.aborted) setBusy(false); if (controller.current === ctrl) controller.current = null; }
  };
  const insert = () => {
    const message = supportingDocumentMessage(file?.name ?? 'Materiale', file ? page : null, text);
    if (message.length > 3000) { setError('Accorcia l’estratto prima di inserirlo.'); return; }
    if (onInsert(message, { id: crypto.randomUUID().replaceAll('-', ''), name: (file?.name ?? 'Materiale').slice(0, 180), page, kind: 'material', origin: 'user-reviewed', text, excerpt: true })) onClose();
    else setError('Il testo e il messaggio già scritto superano 3000 caratteri. Accorcia l’estratto qui sotto: non cancello il tuo messaggio.');
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="quote-composer-dialog">
    <DialogHeader><DialogTitle>Allega materiali e documenti</DialogTitle><DialogDescription>Leggo il testo sul computer. Controlla l’estratto prima di inserirlo nella chat: nessun invio all’AI avviene qui.</DialogDescription></DialogHeader>
    <label className="quote-support-upload"><Upload size={19} aria-hidden="true" /><span>{file ? file.name : 'Scegli una scheda, un capitolato o una foto'}<small>PDF, PNG o JPEG · massimo 12 MB</small></span><input type="file" aria-label="File materiali o documento" accept="application/pdf,image/png,image/jpeg" disabled={busy} onChange={e => { const chosen = e.target.files?.[0]; e.target.value = ''; if (chosen) { setFile(chosen); setPage(1); setPages(null); void read(chosen, 1); } }} /></label>
    {file && (pages ?? 1) > 1 && <div className="quote-support-pages"><label>Pagina <input aria-label="Pagina documento materiali" type="number" min={1} max={pages ?? 20} value={page} disabled={busy} onChange={e => { const next = Math.min(pages ?? 20, Math.max(1, Number(e.target.value) || 1)); if (next !== page) { setPage(next); setText(''); setError(''); } }} /></label><span>di {pages}</span><button type="button" disabled={busy} onClick={() => void read(file, page)}>Leggi pagina</button></div>}
    {busy && <p role="status" className="quote-support-status"><LoaderCircle size={15} className="animate-spin" aria-hidden="true" />Lettura locale in corso…</p>}
    {error && <p role="alert" className="quote-support-error">{error}</p>}
    <label className="quote-support-extract"><span><FileText size={15} aria-hidden="true" />Testo da usare nel preventivo <small>{text.length} caratteri</small></span><textarea aria-label="Estratto materiali da verificare" value={text} disabled={busy} onChange={e => setText(e.target.value)} placeholder="L’estratto comparirà qui. Puoi anche scrivere marca, modello, misure e caratteristiche…" /></label>
    <p className="quote-support-note">L’estratto viene conservato nel dossier locale con nome e pagina. Il file originale non è archiviato né sostituisce la planimetria. Le specifiche non diventano automaticamente quantità o prezzi.</p>
    <div className="quote-support-footer"><button type="button" onClick={onClose}>Annulla</button><button type="button" disabled={busy || !text.trim()} onClick={insert}>Inserisci nel messaggio</button></div>
  </DialogContent></Dialog>;
}
