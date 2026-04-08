import { formatCurrency, formatDate } from '@/lib/formatters';
import { RitenuteGaranzia } from '@/hooks/useRitenuteGaranzia';
import { RitenutaBadge } from './RitenutaBadge';
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

interface Props {
  ritenute: RitenuteGaranzia[];
  isLoading: boolean;
  onSvincola: (id: string) => void;
  isSvincolando: boolean;
}

export function RitenuteTable({ ritenute, isLoading, onSvincola, isSvincolando }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (ritenute.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nessuna ritenuta registrata
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Data</TableHead>
          <TableHead>Importo</TableHead>
          <TableHead>Percentuale</TableHead>
          <TableHead>Stato</TableHead>
          <TableHead>Data Svincolo Prevista</TableHead>
          <TableHead>Data Svincolo Effettiva</TableHead>
          <TableHead>Azioni</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ritenute.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{formatDate(row.created_at)}</TableCell>
            <TableCell>{formatCurrency(row.importo)}</TableCell>
            <TableCell>
              {row.percentuale_applicata != null ? `${row.percentuale_applicata}%` : '—'}
            </TableCell>
            <TableCell>
              <RitenutaBadge stato={row.stato} />
            </TableCell>
            <TableCell>
              {row.data_svincolo_prevista ? formatDate(row.data_svincolo_prevista) : '—'}
            </TableCell>
            <TableCell>
              {row.data_svincolo_effettiva ? formatDate(row.data_svincolo_effettiva) : '—'}
            </TableCell>
            <TableCell>
              {row.stato === 'trattenuta' && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isSvincolando}
                  onClick={() => onSvincola(row.id)}
                >
                  Svincola
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
