import { useEffect, useRef, useState } from 'react';
import type { DocumentProps } from '@react-pdf/renderer';
import type { ChatDocument } from '@/lib/preventivi/quoteChatDocument';
import type { LocalBagniDraft } from '@/lib/preventivi/quoteBagniBridge';
import type { QuoteProject } from '@/lib/preventivi/quoteProject';
import { useQuoteModuleTemplate } from './QuoteModuleTemplateContext';
export function QuoteLocalPdfButton(props: { document: ChatDocument; draft: LocalBagniDraft; project: QuoteProject; companyId: string; companyName: string; scheduleScope?: string }) {
  const live = useQuoteModuleTemplate();
  const appearanceReady = !live || !live.loading && !live.error && live.companyId === props.companyId && live.source?.module === 'bagni' && live.source.modelId === props.draft.modelId;
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [file, setFile] = useState<{ url: string; signature: string } | null>(null);
  const url = useRef<string | null>(null); const mounted = useRef(true);
  const signature = JSON.stringify([props.document, props.draft, props.project.address, props.project.propertyType, props.project.notes, props.project.proposalNotes, props.project.schedule, props.scheduleScope, props.companyName, live?.source, live?.company]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (url.current) URL.revokeObjectURL(url.current); }; }, []);
  const create = async () => {
    setBusy(true); setError(''); setFile(null);
    try {
      if (live && (live.loading || live.error || live.source?.module !== 'bagni')) throw new Error('Attendi la verifica del modello aggiornato prima di esportare.');
      const [{ buildLocalQuotePdfData, prepareLocalQuoteAppearance }, { DocumentoEdilePDF }, { pdf }, React] = await Promise.all([import('@/lib/preventivi/localQuotePdf'), import('@/components/preventivi/pdf/DocumentoEdilePDF'), import('@react-pdf/renderer'), import('react')]);
      const appearance = live?.source?.module === 'bagni' ? await prepareLocalQuoteAppearance({ template: live.source.template, company: live.company }) : undefined;
      const data = buildLocalQuotePdfData(props.document, props.draft, props.project, props.companyId, props.companyName,
        appearance, props.scheduleScope);
      const blob = await pdf(React.createElement(DocumentoEdilePDF, { dati: data }) as React.ReactElement<DocumentProps>).toBlob();
      if (!mounted.current) return;
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(blob); setFile({ url: url.current, signature });
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'PDF non generato; la bozza resta intatta.'); }
    finally { if (mounted.current) setBusy(false); }
  };
  return <div className="space-y-2 rounded-lg border border-blue-100 bg-white p-3 text-sm" aria-label="PDF locale del preventivo">
    <button type="button" className="rounded-lg border border-blue-200 px-3 py-2 font-medium text-blue-900 disabled:opacity-50" disabled={busy || !appearanceReady} onClick={() => void create()}>{busy ? 'Preparo il PDF locale…' : 'Genera PDF della bozza locale'}</button>
    <p className="text-xs text-slate-500">Stessa impaginazione condivisa dei preventivatori. Nessun salvataggio remoto, firma o invio; non include costi e margini interni.</p>
    {!busy && appearanceReady && file && file.signature === signature && <p className="flex gap-4"><a href={file.url} target="_blank" rel="noreferrer" className="text-blue-700 underline">Apri PDF locale</a><a href={file.url} download="Bozza-locale-bagno.pdf" className="text-blue-700 underline">Scarica PDF locale</a></p>}
    {file && file.signature !== signature && <p role="status" className="text-orange-700">La bozza è cambiata: rigenera il PDF. Quello precedente non viene proposto come aggiornato.</p>}
    {error && <p role="alert" className="text-orange-800">{error}</p>}
  </div>;
}
