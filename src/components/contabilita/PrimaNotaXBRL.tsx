import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Download, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

type XbrlEntry = {
  data: string;
  descrizione: string;
  importo_dare: number;
  importo_avere: number;
  conto: string;
};

interface Props {
  entries: XbrlEntry[];
  anno: number;
  /** Se fornito, l'export XBRL usa TUTTE le righe filtrate (non solo la pagina
   *  corrente). Senza, ricade su `entries` (retro-compatibile). */
  fetchAll?: () => Promise<XbrlEntry[]>;
  /** Voce di un menu «⋯» invece di un bottone (testata della Prima Nota). */
  comeVoceMenu?: boolean;
}

export function PrimaNotaXBRL({ entries, anno, fetchAll, comeVoceMenu = false }: Props) {
  const [busy, setBusy] = useState(false);

  const handleExport = async () => {
    setBusy(true);
    try {
      const data = fetchAll ? await fetchAll() : entries;
      if (data.length === 0) {
        toast.info('Nessun movimento da esportare');
        return;
      }
      const entryElements = data
        .map(e => {
          const importo = (e.importo_dare - e.importo_avere).toFixed(2);
          return `  <it-gaap:primanota contextRef="c_${anno}" decimals="2" unitRef="EUR">${importo}</it-gaap:primanota>`;
        })
        .join('\n');

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<xbrl xmlns="http://www.xbrl.org/2003/instance" xmlns:link="http://www.xbrl.org/2003/linkbase" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:it-gaap="http://xbrl.it/taxonomy/it-gaap/2025-01-01">
  <link:schemaRef xlink:href="http://xbrl.it/taxonomy/it-gaap/2025-01-01/it-gaap-ci-2025-01-01.xsd" xlink:type="simple"/>
${entryElements}
</xbrl>`;

      const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prima_nota_${anno}.xbrl`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Errore durante l'export XBRL");
    } finally {
      setBusy(false);
    }
  };

  if (comeVoceMenu) {
    return (
      <DropdownMenuItem onSelect={() => { void handleExport(); }} disabled={busy} className="gap-2">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Esporta XBRL
      </DropdownMenuItem>
    );
  }

  return (
    <Button variant="outline" onClick={handleExport} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
      Esporta XBRL
    </Button>
  );
}
