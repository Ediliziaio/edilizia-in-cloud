import { ArchivioDocument } from '@/hooks/useArchivioSostitutivo';
import { formatDate } from '@/lib/formatters';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AlertTriangle, Download, FolderOpen } from 'lucide-react';

interface Props {
  documenti: ArchivioDocument[];
  isLoading: boolean;
  inScadenzaProssimi365gg: ArchivioDocument[];
  getSignedUrl: (path: string) => Promise<string | null>;
}

const TIPO_DOCUMENTO_LABELS: Record<ArchivioDocument['tipo_documento'], string> = {
  fattura_attiva: 'Fattura attiva',
  fattura_passiva: 'Fattura passiva',
  nota_credito: 'Nota di credito',
  altro: 'Altro',
};

function isScadenzaVicina(scadenza: string): boolean {
  const diff = (new Date(scadenza).getTime() - Date.now()) / 86400000;
  return diff >= 0 && diff < 365;
}

export function ArchivioTable({ documenti, isLoading, inScadenzaProssimi365gg, getSignedUrl }: Props) {
  const handleScarica = async (storagePath: string) => {
    const url = await getSignedUrl(storagePath);
    if (url) {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="space-y-4">
      {/* Scadenza warning */}
      {inScadenzaProssimi365gg.length > 0 && (
        <Alert className="border-orange-300 bg-orange-50">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800">
            Hai {inScadenzaProssimi365gg.length} document{inScadenzaProssimi365gg.length === 1 ? 'o' : 'i'} con scadenza di conservazione entro 12 mesi
          </AlertDescription>
        </Alert>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo Documento</TableHead>
              <TableHead>Anno Fiscale</TableHead>
              <TableHead>Data Archiviazione</TableHead>
              <TableHead>Scadenza Conservazione</TableHead>
              <TableHead>Hash SHA-256</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : documenti.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <FolderOpen className="h-8 w-8 opacity-40" />
                    <span>Nessun documento archiviato</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              documenti.map(doc => {
                const vicina = isScadenzaVicina(doc.scadenza_conservazione);
                return (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium text-sm">
                      {TIPO_DOCUMENTO_LABELS[doc.tipo_documento]}
                    </TableCell>
                    <TableCell className="text-sm">{doc.anno_fiscale}</TableCell>
                    <TableCell className="text-sm">{formatDate(doc.data_archivio)}</TableCell>
                    <TableCell className="text-sm">
                      <span className={vicina ? 'text-red-600 font-medium' : undefined}>
                        {formatDate(doc.scadenza_conservazione)}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {doc.hash_sha256.substring(0, 8)}...
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleScarica(doc.storage_path)}
                      >
                        <Download className="h-4 w-4 mr-1.5" />
                        Scarica
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
