import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, LoaderCircle, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '../WorkspaceContext';
import type { GareDocument } from '../types';

interface Page { document_id: string; image_base64: string; page: number; page_count: number }
export function TemplatePdfPreview({ document }: { document: GareDocument }) {
  const { api, member } = useWorkspace();
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const preview = useQuery({
    queryKey: ['gare', member.company_id, member.user_id, 'template-preview', document.id, document.preview_sha256, page],
    queryFn: () => api.local<Page>('templates', 'preview', { document_id: document.id, page }),
    staleTime: 300_000, retry: false,
  });
  if (preview.isError) return <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs leading-5">{preview.error.message}<p>Puoi scaricare il PDF conservato e verificarlo con un lettore locale.</p><Button className="mt-3" size="sm" variant="outline" onClick={() => preview.refetch()}>Riprova anteprima</Button></div>;
  if (preview.isPending) return <div role="status" className="flex min-h-60 items-center justify-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />Preparo la pagina del modello…</div>;
  return <div className="min-w-0 overflow-hidden rounded-lg border bg-slate-50">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-white px-3 py-2 text-xs text-muted-foreground"><span aria-live="polite">Pagina {preview.data.page} di {preview.data.page_count}</span><div className="flex items-center gap-1"><Button size="icon" variant="ghost" aria-label="Riduci anteprima del modello" disabled={zoom === 100} onClick={() => setZoom(n => n - 25)}><ZoomOut /></Button><span aria-live="polite">{zoom}%</span><Button size="icon" variant="ghost" aria-label="Ingrandisci anteprima del modello" disabled={zoom === 250} onClick={() => setZoom(n => n + 25)}><ZoomIn /></Button><Button size="icon" variant="ghost" aria-label="Pagina precedente del modello" disabled={page === 1} onClick={() => setPage(n => n - 1)}><ChevronLeft /></Button><Button size="icon" variant="ghost" aria-label="Pagina successiva del modello" disabled={page >= preview.data.page_count} onClick={() => setPage(n => n + 1)}><ChevronRight /></Button></div></div>
    <div className="max-h-[60dvh] overflow-auto p-2"><img src={`data:image/png;base64,${preview.data.image_base64}`} alt={`Pagina ${page} di ${preview.data.page_count} del modello ${document.name}`} style={{width:`${zoom}%`,maxWidth:'none'}} className="mx-auto h-auto bg-white shadow-sm" /></div>
  </div>;
}
