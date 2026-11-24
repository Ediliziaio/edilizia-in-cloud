import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '../WorkspaceContext';
import { TemplatePdfPreview } from '../pages/TemplatePdfPreview';
import type { GareDocument } from '../types';
import { xmlSections } from './xml-content';

export function ReviewContent({ document: doc, focus = '' }: { document: GareDocument; focus?: string }) {
  const { api } = useWorkspace();
  const [content, setContent] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const [raw, setRaw] = useState(false), [query, setQuery] = useState('');
  const area = useRef<HTMLDivElement>(null);
  const xml = /\.xml$/i.test(doc.name);
  useEffect(() => {
    if (!xml) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if(cancelled)return;
      setLoading(true); setError('');
      return api.blob(doc).then(blob => blob.text()).then(value => { if (!cancelled) setContent(value); }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); }).finally(() => { if (!cancelled) setLoading(false); });
    });
    return () => { cancelled = true; };
  }, [api, doc.id, doc.sha256, xml]);
  const parsed = useMemo(() => { if (!content) return { sections: [], error: '' }; try { return { sections: xmlSections(content), error: '' }; } catch (e) { return { sections: [], error: e instanceof Error ? e.message : String(e) }; } }, [content]);
  useEffect(() => { if (!focus) return; const timer=setTimeout(()=>{setQuery('');setRaw(false);},0);return()=>clearTimeout(timer); }, [focus]);
  useEffect(() => {
    if (!focus || !parsed.sections.length || raw) return;
    const match = [...(area.current?.querySelectorAll<HTMLElement>('[data-xml-refs]') || [])].find(e => (e.dataset.xmlRefs || '').split('|').includes(focus));
    match?.scrollIntoView({ block: 'center' }); match?.focus({ preventScroll: true });
  }, [focus, parsed.sections, raw]);
  if (doc.preview_path) return <TemplatePdfPreview key={doc.id} document={doc} />;
  if (!xml) return <div className="ga-review-no-preview"><p>Anteprima non disponibile per questo formato.</p><p>Usa «Scarica il documento» per leggerlo nel programma dedicato.</p></div>;
  const rows = parsed.sections.filter(s => !query || `${s.title} ${s.text} ${s.references.join(' ')}`.toLocaleLowerCase('it').includes(query.toLocaleLowerCase('it')));
  return <div className="ga-xml-content" ref={area}>
    <div className="ga-xml-toolbar"><strong>Contenuto del file XML</strong><Button size="sm" variant="outline" onClick={() => setRaw(v => !v)}>{raw ? 'Dati e risposte' : 'XML integrale'}</Button></div>
    {loading && <p role="status">Lettura del file…</p>}{(error || parsed.error) && <p role="alert">{error || parsed.error}</p>}
    {content && (raw ? <pre className="ga-xml-raw" tabIndex={0}>{content.replace(/>\s*</g, '>\n<')}</pre> : <>
      <input aria-label="Cerca nel contenuto XML" placeholder="Cerca testo, criterio o domanda…" value={query} onChange={e => setQuery(e.target.value)} />
      <p className="ga-xml-count">{rows.length} sezioni · lettura dal file originale</p>
      {focus && !parsed.sections.some(s => s.references.includes(focus)) && <p role="status">Riferimento non trovato nel contenuto leggibile. Consulta l’XML integrale.</p>}
      {rows.map(s => <section key={s.key} tabIndex={-1} data-xml-refs={s.references.join('|')} className={focus && s.references.includes(focus) ? 'is-focused' : ''}><h3>{s.title}</h3><p>{s.text}</p></section>)}
      {!rows.length && <p>Nessuna sezione con questa ricerca.</p>}
    </>)}
  </div>;
}
