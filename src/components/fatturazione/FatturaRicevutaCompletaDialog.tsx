import { Download, FileText, Paperclip, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { FatturaRicevutaVista } from '@/lib/fatturazione/fatturaRicevutaHtml';
import { scaricaAllegatoXml } from '@/lib/fatturazione/downloadAllegatoXml';
import { stampaPreventivoNativo } from '@/lib/fotovoltaico/htmlToPdf';

export function FatturaRicevutaCompletaDialog({ vista, onClose, onScaricaOriginale }: {
  vista: FatturaRicevutaVista | null;
  onClose: () => void;
  onScaricaOriginale: () => void | Promise<void>;
}) {
  const allegati = vista?.allegatiFile ?? vista?.allegatiPdf.map(a => ({ ...a, formato: 'PDF', compressione: '', descrizione: '' })) ?? [];
  return <Dialog open={!!vista} onOpenChange={o => { if (!o) onClose(); }}>
    <DialogContent className="max-w-4xl h-[90dvh] flex flex-col p-0 gap-0">
      <DialogHeader className="px-4 py-3 pr-14 border-b shrink-0 space-y-2">
        <DialogTitle className="flex items-start gap-2 text-sm font-medium">
          <FileText className="h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{vista?.titolo}</span>
        </DialogTitle>
        <DialogDescription className="sr-only">Fattura con i dati dell’XML originale, pronta da stampare. Il file originale e tutti gli allegati si scaricano da questa finestra.</DialogDescription>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => void onScaricaOriginale()}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Scarica originale
          </Button>
          {allegati.length > 0 && <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="h-8 text-xs"><Paperclip className="h-3.5 w-3.5 mr-1.5" /> Allegati ({allegati.length})</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 max-w-[min(90vw,28rem)] overflow-auto">
              {allegati.map((a, i) => <DropdownMenuItem key={`${i}:${a.nome}`} title={a.descrizione || a.nome} onClick={() => {
                try { scaricaAllegatoXml(a); }
                catch { toast.error('Allegato non leggibile', { description: 'Scarica il file originale per recuperare il contenuto completo.' }); }
              }}>
                <Download className="h-4 w-4 mr-2 shrink-0" /><span className="min-w-0 break-words">{a.nome}{(a.formato || a.compressione) && <span className="block text-xs text-muted-foreground">{[a.formato, a.compressione ? `Compresso ${a.compressione}` : ''].filter(Boolean).join(' · ')}</span>}</span>
              </DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>}
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => {
            if (vista) stampaPreventivoNativo(vista.html, vista.titolo).catch((e: unknown) => toast.error('Impossibile preparare la stampa', { description: e instanceof Error ? e.message : undefined }));
          }}><Printer className="h-3.5 w-3.5 mr-1.5" /> Stampa / Salva PDF</Button>
        </div>
      </DialogHeader>
      {vista && <iframe title={vista.titolo} srcDoc={vista.html} sandbox="" className="flex-1 min-h-0 w-full bg-white border-0" />}
    </DialogContent>
  </Dialog>;
}
