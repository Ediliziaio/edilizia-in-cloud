import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, FileText, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { useSuperAdminPermissions } from '@/hooks/useSuperAdminPermissions';
import { AccessDenied } from '@/components/admin/AccessDenied';
import { exportToCSV } from '@/lib/csvExport';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value);
}

interface InvoiceRow {
  id: string;
  amount_eur: number;
  invoice_number: string | null;
  created_at: string;
  company: { name: string; vat_number: string | null } | null;
}

const CSV_COLUMNS = [
  { key: 'azienda', label: 'Azienda' },
  { key: 'piva', label: 'P.IVA' },
  { key: 'importo_eur', label: 'Importo EUR' },
  { key: 'numero_fattura', label: 'N. Fattura' },
  { key: 'data', label: 'Data' },
];

export default function AdminInvoiceHistory() {
  const { permissions } = useSuperAdminPermissions();
  const [monthFilter, setMonthFilter] = useState('all');

  const { data = [], isLoading } = useQuery<InvoiceRow[]>({
    queryKey: ['admin-invoice-history', monthFilter],
    queryFn: async () => {
      const q = supabase
        .from('email_credit_topups' as never)
        .select('*, company:companies!company_id(name,vat_number)' as never)
        .eq('status' as never, 'completed' as never)
        .order('created_at' as never, { ascending: false });

      const { data: rows, error } = await q;
      if (error) throw error;

      let result = (rows ?? []) as InvoiceRow[];

      if (monthFilter !== 'all') {
        const [y, m] = monthFilter.split('-').map(Number);
        const start = new Date(y, m - 1, 1).getTime();
        const end = new Date(y, m, 1).getTime();
        result = result.filter((r) => {
          const t = new Date(r.created_at).getTime();
          return t >= start && t < end;
        });
      }

      return result;
    },
    staleTime: 5 * 60 * 1000,
  });

  if (!permissions.billing_read) return <AccessDenied />;

  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return { value: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy', { locale: it }) };
  });

  const totalAmount = data.reduce((s, r) => s + (r.amount_eur ?? 0), 0);

  const handleExport = () => {
    exportToCSV(
      data.map((r) => ({
        azienda: r.company?.name ?? '',
        piva: r.company?.vat_number ?? '',
        importo_eur: String(r.amount_eur),
        numero_fattura: r.invoice_number ?? '',
        data: format(new Date(r.created_at), 'dd/MM/yyyy'),
      })),
      CSV_COLUMNS,
      `fatture-${monthFilter}.csv`,
    );
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="hidden md:block">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" /> Storico Fatture Platform
          </h1>
          <p className="text-muted-foreground">Cronologia pagamenti ricevuti dalla piattaforma</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:self-auto">
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Tutti i mesi" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i mesi</SelectItem>
              {months.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Export CSV nascosto su mobile (feedback_no_mobile_export). */}
          <Button variant="outline" onClick={handleExport} disabled={data.length === 0} className="hidden sm:inline-flex sm:w-auto">
            <Download className="h-4 w-4 mr-2" /> Esporta CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs sm:text-sm text-muted-foreground">Totale periodo</p>
            <p className="text-xl sm:text-2xl font-bold text-emerald-600 break-words">{formatCurrency(totalAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs sm:text-sm text-muted-foreground">Numero fatture</p>
            <p className="text-xl sm:text-2xl font-bold">{data.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Hint scroll orizzontale visibile solo su mobile (la tabella ha min-w-[550px]) */}
      <p className="md:hidden text-[11px] text-muted-foreground/80 px-1">
        ← Scorri orizzontalmente per vedere tutte le colonne →
      </p>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[550px]">
            <TableHeader>
              <TableRow>
                <TableHead>Azienda</TableHead>
                <TableHead>P.IVA</TableHead>
                <TableHead>N. Fattura</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Importo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Nessuna fattura per questo periodo
                  </TableCell>
                </TableRow>
              ) : (
                data.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.company?.name ?? '---'}</TableCell>
                    <TableCell className="font-mono text-xs">{r.company?.vat_number ?? '---'}</TableCell>
                    <TableCell>
                      {r.invoice_number ?? <span className="text-muted-foreground">---</span>}
                    </TableCell>
                    <TableCell>
                      {format(new Date(r.created_at), 'dd/MM/yyyy', { locale: it })}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(r.amount_eur)}
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
