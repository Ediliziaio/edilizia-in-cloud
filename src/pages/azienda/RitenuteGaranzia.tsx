import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { RitenutaBadge } from '@/components/ritenute/RitenutaBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ShieldCheck } from 'lucide-react';

export default function RitenuteGaranzia() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data, isLoading } = useQuery({
    queryKey: ['ritenute-garanzia', 'all', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ritenute_garanzia')
        .select(
          'id, contratto_id, importo, percentuale_applicata, stato, data_svincolo_prevista, data_svincolo_effettiva, note, created_at'
        )
        .eq('company_id', companyId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const ritenute = data ?? [];

  const totaleRitenuto = ritenute
    .filter((r) => r.stato === 'trattenuta')
    .reduce((sum, r) => sum + Number(r.importo ?? 0), 0);

  const totaleSvincolato = ritenute
    .filter((r) => r.stato === 'svincolata')
    .reduce((sum, r) => sum + Number(r.importo ?? 0), 0);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ritenute di Garanzia</h1>
        <p className="text-muted-foreground mt-1">
          Gestione delle ritenute di garanzia sui contratti di subappalto
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Totale ritenute
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <p className="text-2xl font-bold">{ritenute.length}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Totale trattenuto
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-7 w-28" />
            ) : (
              <p className="text-2xl font-bold text-orange-600">
                {formatCurrency(totaleRitenuto)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Totale svincolato
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-7 w-28" />
            ) : (
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(totaleSvincolato)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contratto ID</TableHead>
                <TableHead className="text-right">Importo</TableHead>
                <TableHead className="text-right">Percentuale</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Data Svincolo Prevista</TableHead>
                <TableHead>Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : ritenute.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    <ShieldCheck className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    <p>Nessuna ritenuta di garanzia registrata</p>
                  </TableCell>
                </TableRow>
              ) : (
                ritenute.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.contratto_id ?? '—'}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(Number(r.importo ?? 0))}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.percentuale_applicata != null
                        ? `${Number(r.percentuale_applicata).toFixed(2)}%`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <RitenutaBadge stato={r.stato} />
                    </TableCell>
                    <TableCell>
                      {r.data_svincolo_prevista
                        ? formatDate(r.data_svincolo_prevista)
                        : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {r.note ?? '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
