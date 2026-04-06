import { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { esportaPercorsoExcel } from '@/lib/gps/exportExcel';
import { esportaPercorsoPdf } from '@/lib/gps/exportPdf';
import type { GpsPositionExport } from '@/lib/gps/exportExcel';

interface Props {
  posizioni: GpsPositionExport[];
  nomeTecnico: string;
  data: string; // YYYY-MM-DD
}

export function ExportPercorsiButton({ posizioni, nomeTecnico, data }: Props) {
  const [isExporting, setIsExporting] = useState(false);

  const nomeFile = `percorso_${nomeTecnico.replace(/\s+/g, '_')}_${data}`;

  const handleExcel = async () => {
    if (!posizioni.length) return;
    setIsExporting(true);
    try {
      await esportaPercorsoExcel(posizioni, nomeFile, nomeTecnico, data);
      toast.success('Esportazione Excel completata');
    } catch (err) {
      console.error(err);
      toast.error("Errore durante l'esportazione Excel");
    } finally {
      setIsExporting(false);
    }
  };

  const handlePdf = async () => {
    if (!posizioni.length) return;
    setIsExporting(true);
    try {
      await esportaPercorsoPdf(posizioni, nomeFile, nomeTecnico, data);
      toast.success('Esportazione PDF completata');
    } catch (err) {
      console.error(err);
      toast.error("Errore durante l'esportazione PDF");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          disabled={isExporting || posizioni.length === 0}
        >
          {isExporting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Esporta
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleExcel} className="gap-2">
          <FileSpreadsheet className="h-4 w-4 text-green-600" />
          Esporta Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handlePdf} className="gap-2">
          <FileText className="h-4 w-4 text-red-600" />
          Esporta PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
