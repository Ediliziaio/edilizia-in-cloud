import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useTemplateFields } from '@/hooks/useDocumentoTemplates';
import { useDocumentoTemplateFile } from '@/hooks/useDocumentoTemplateFile';
import { compilaPdfTemplate } from '@/lib/documenti/templateCompilazione';
import { testoErrore } from '@/lib/impostazioni/testoErrore';
import type { DocumentoTemplate } from '@/types/fea';

/** Preview/download only: it never sends email, requests a signature or creates
 * a business document as a side effect of testing a template. */
export function TemplateDocumentUse({ template }: { template: DocumentoTemplate }) {
  const { fields, isLoading, error: fieldsError, refetch: refetchFields } = useTemplateFields(template.id);
  const file = useDocumentoTemplateFile(template);
  const [values, setValues] = useState<Record<string, string>>({});
  const [generated, setGenerated] = useState<{ url: string; fingerprint: string } | null>(null);
  const outputRef = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fingerprint = JSON.stringify([fields, values, template.file_url]);
  const output = generated?.fingerprint === fingerprint ? generated.url : null;
  const invalidate = () => { if (outputRef.current) URL.revokeObjectURL(outputRef.current); outputRef.current = null; setGenerated(null); };
  useEffect(() => () => { if (outputRef.current) URL.revokeObjectURL(outputRef.current); }, []);

  const compile = async () => {
    if (!file.data || isLoading || fieldsError) return;
    setBusy(true); setError(''); invalidate();
    try {
      const bytes = template.file_type === 'pdf'
        ? await compilaPdfTemplate(file.data, fields, values)
        : await (await import('@/lib/documenti/templateDocx')).compilaDocxTemplate(file.data, fields, values);
      const mime = template.file_type === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: mime }));
      outputRef.current = url; setGenerated({ url, fingerprint });
    } catch (e) { setError(testoErrore(e)); }
    finally { setBusy(false); }
  };
  return <section className="space-y-4 rounded-xl border bg-white p-5 text-left">
    <div><h3 className="text-lg font-semibold">Compila il modello</h3><p className="text-sm text-slate-600">I valori vengono inseriti in una copia. Nessun invio o richiesta di firma.</p></div>
    {isLoading && <p role="status">Caricamento campi…</p>}
    {fieldsError && <p role="alert" className="text-sm text-red-700">Impossibile caricare i campi. <button className="underline" onClick={() => void refetchFields()}>Riprova</button></p>}
    {!isLoading && fields.length === 0 && <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">Modello statico: non ci sono campi personalizzati. Configurali per inserire dati nel documento.</p>}
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map(f => <div key={f.id} className="space-y-1">
        <Label htmlFor={`value-${f.id}`}>{f.etichetta}{f.obbligatorio ? ' *' : ''}</Label>
        {f.tipo === 'scelta' ? <select id={`value-${f.id}`} value={values[f.nome] ?? f.valore_default ?? ''} disabled={busy}
          onChange={e => { invalidate(); setValues(v => ({ ...v, [f.nome]: e.target.value })); }} className="w-full rounded-md border p-2">
          <option value="">Seleziona</option>{(f.opzioni_scelta ?? []).map(o => <option key={o}>{o}</option>)}
        </select> : f.tipo === 'testo' && f.posizioni_pdf?.some(p => p.altezza > .025) ? <Textarea
          id={`value-${f.id}`} rows={3} disabled={busy} value={values[f.nome] ?? f.valore_default ?? ''}
          onChange={e => { invalidate(); setValues(v => ({ ...v, [f.nome]: e.target.value })); }} /> : <Input id={`value-${f.id}`} type={f.tipo === 'data' ? 'date' : f.tipo === 'email' ? 'email' : 'text'}
          disabled={busy} inputMode={['numero', 'valuta'].includes(f.tipo) ? 'decimal' : undefined}
          value={values[f.nome] ?? f.valore_default ?? ''} onChange={e => { invalidate(); setValues(v => ({ ...v, [f.nome]: e.target.value })); }} />}
      </div>)}
    </div>
    {(error || file.error) && <p role="alert" className="whitespace-pre-line rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error || testoErrore(file.error)}</p>}
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={() => void compile()} disabled={busy || isLoading || !!fieldsError || !file.data}>{busy ? 'Generazione…' : template.file_type === 'pdf' ? 'Genera anteprima PDF' : 'Genera DOCX compilato'}</Button>
      {output && <a className="text-sm font-medium text-blue-700 underline" href={output}
        download={`${template.nome.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 100)}-compilato.${template.file_type}`}>Scarica documento compilato</a>}
    </div>
    {output && template.file_type === 'pdf' && <iframe title="Anteprima del modello compilato" src={output} className="h-[75vh] w-full rounded border" />}
    {output && template.file_type === 'docx' && <p className="text-sm text-slate-600">Apri il DOCX scaricato in Word per verificare l’impaginazione. L’originale non è stato modificato.</p>}
  </section>;
}
