import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

interface Props {
  entries: Array<{
    data: string;
    descrizione: string;
    importo_dare: number;
    importo_avere: number;
    conto: string;
  }>;
  anno: number;
}

export function PrimaNotaXBRL({ entries, anno }: Props) {
  const handleExport = () => {
    const entryElements = entries
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
  };

  return (
    <Button variant="outline" onClick={handleExport}>
      <Download className="h-4 w-4 mr-2" />
      Esporta XBRL
    </Button>
  );
}
