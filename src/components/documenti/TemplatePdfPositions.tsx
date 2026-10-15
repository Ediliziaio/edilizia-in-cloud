import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDocumentoTemplateFile } from '@/hooks/useDocumentoTemplateFile';
import { testoErrore } from '@/lib/impostazioni/testoErrore';
import type { DocumentoTemplate, DocumentoTemplateField, PosizioneCampoPdf } from '@/types/fea';

interface Props {
  template: DocumentoTemplate;
  fields: DocumentoTemplateField[];
  onPosition: (id: string, positions: PosizioneCampoPdf[]) => void;
  busy?: boolean;
}

/** Click on the real PDF: stored coordinates do not depend on zoom or viewport. */
export function TemplatePdfPositions({ template, fields, onPosition, busy }: Props) {
  const file = useDocumentoTemplateFile(template);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [selected, setSelected] = useState('');
  const [repeat, setRepeat] = useState(false);
  const [font, setFont] = useState(9);
  const [width, setWidth] = useState(35);
  const [height, setHeight] = useState(3);
  const [rendering, setRendering] = useState(false);
  const [renderedPage, setRenderedPage] = useState(0);
  const [error, setError] = useState('');
  const field = fields.find(f => f.id === selected);

  useEffect(() => {
    if (!file.data) return;
    let disposed = false;
    let loading: { destroy: () => Promise<void> } | undefined;
    void (async () => {
      const pdfjs = await import('pdfjs-dist');
      if (disposed) return;
      setRendering(true);
      setError('');
      pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      if (disposed) return;
      const task = pdfjs.getDocument({ data: file.data.slice() });
      loading = task;
      const doc = await task.promise;
      if (disposed) return;
      setPages(doc.numPages);
      const p = await doc.getPage(page);
      if (p.rotate !== 0) throw new Error('Normalizza la rotazione delle pagine con gli strumenti PDF prima di inserire i campi.');
      const viewport = p.getViewport({ scale: 1.3 });
      const target = canvas.current;
      if (!target || disposed) return;
      target.width = Math.ceil(viewport.width);
      target.height = Math.ceil(viewport.height);
      const context = target.getContext('2d');
      if (!context) throw new Error('Anteprima PDF non disponibile.');
      await p.render({ canvas: target, canvasContext: context, viewport }).promise;
      if (!disposed) setRenderedPage(page);
    })().catch(e => { if (!disposed) setError(testoErrore(e)); })
      .finally(() => { if (!disposed) setRendering(false); });
    return () => { disposed = true; void loading?.destroy(); };
  }, [file.data, page]);

  return <section className="space-y-3 rounded-xl border bg-slate-50 p-4">
    <div><h3 className="font-semibold">Posiziona i campi sul PDF</h3>
      <p className="text-sm text-slate-600">Scegli un campo e clicca nel punto in cui deve iniziare il valore. L’originale resta intatto.</p></div>
    {fields.length === 0 ? <p className="text-sm">Aggiungi prima un campo personalizzato.</p> : <>
      <Label htmlFor="pdf-field">Campo da posizionare</Label>
      <select id="pdf-field" value={selected} onChange={e => setSelected(e.target.value)} className="w-full rounded-md border bg-white p-2">
        <option value="">Scegli un campo</option>
        {fields.map(f => <option key={f.id} value={f.id}>{f.etichetta} — {f.posizioni_pdf?.length ?? 0} posizioni</option>)}
      </select>
      <div className="grid grid-cols-3 gap-3">
        <div><Label htmlFor="pdf-font">Carattere (pt)</Label><Input id="pdf-font" type="number" min={6} max={36} value={font} onChange={e => setFont(Number(e.target.value))} /></div>
        <div><Label htmlFor="pdf-width">Larghezza (%)</Label><Input id="pdf-width" type="number" min={1} max={100} value={width} onChange={e => setWidth(Number(e.target.value))} /></div>
        <div><Label htmlFor="pdf-height">Altezza (%)</Label><Input id="pdf-height" type="number" min={1} max={100} value={height} onChange={e => setHeight(Number(e.target.value))} /></div>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={repeat} onChange={e => setRepeat(e.target.checked)} />Ripeti lo stesso campo in un altro punto</label>
        {field?.posizioni_pdf?.length ? <Button size="sm" variant="outline" disabled={busy} onClick={() => onPosition(field.id, [])}>Rimuovi posizioni</Button> : null}
      </div>
    </>}
    <div className="flex items-center justify-between gap-2">
      <Button variant="outline" size="sm" disabled={page <= 1 || rendering} onClick={() => setPage(page - 1)}>Pagina precedente</Button>
      <span className="text-sm">Pagina {page} di {pages}</span>
      <Button variant="outline" size="sm" disabled={page >= pages || rendering} onClick={() => setPage(page + 1)}>Pagina successiva</Button>
    </div>
    {(error || file.error) && <p role="alert" className="text-sm text-red-700">{error || testoErrore(file.error)} <button onClick={() => void file.refetch()} className="underline">Riprova</button></p>}
    {rendering && <p role="status" className="text-sm">Caricamento pagina…</p>}
    <div className="relative overflow-hidden border bg-white" style={{ cursor: field ? 'crosshair' : 'default' }}>
      <canvas ref={canvas} aria-label="Pagina PDF su cui posizionare il campo" className="block h-auto w-full" onClick={e => {
        if (!field || renderedPage !== page || rendering || busy || error || ![font, width, height].every(Number.isFinite) || font < 6 || font > 36 || width <= 0 || height <= 0) return;
        const bounds = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - bounds.left) / bounds.width;
        const y = (e.clientY - bounds.top) / bounds.height;
        const position = { pagina: page, x, y, larghezza: Math.min(width / 100, 1 - x), altezza: Math.min(height / 100, 1 - y), font_size: font };
        onPosition(field.id, [...(repeat ? field.posizioni_pdf ?? [] : []), position]);
      }} />
      {!rendering && fields.flatMap(f => (f.posizioni_pdf ?? []).filter(p => p.pagina === page).map((p, index) =>
        <div key={`${f.id}-${index}`} className={`pointer-events-none absolute overflow-hidden border text-[10px] ${f.id === selected ? 'border-blue-600 bg-blue-100/70' : 'border-amber-500 bg-amber-100/60'}`}
          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: `${p.larghezza * 100}%`, height: `${p.altezza * 100}%` }}>{f.etichetta}</div>))}
    </div>
  </section>;
}
