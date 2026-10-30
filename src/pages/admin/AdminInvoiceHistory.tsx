import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Loader2, FileText } from 'lucide-react';
import { RigaRiepilogo, StatoVuoto } from '@/components/admin/fatturato/AreaUI';
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
        // email_credit_topups non e' mai esistita: le ricariche col numero di
        // fattura stanno in ai_credit_topups, stessi campi e stesso significato.
        .from('ai_credit_topups')
        .select('id, amount_eur, invoice_number, created_at, company:companies!company_id(name,vat_number)')
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        // Tetto di sicurezza: oltre 2.000 ricariche servirà il filtro lato server.
        .limit(2000);

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
    // dal primo del mese: il 30, «30 febbraio» diventava marzo (marzo due volte, febbraio sparito)
    const oggi = new Date();
    const d = new Date(oggi.getFullYear(), oggi.getMonth() - i, 1);
    return { value: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy', { locale: it }) };
  });

  const totalAmount = data.reduce((s, r) => s + (r.amount_eur ?? 0), 0);
  const perMese = (() => {
    const m = new Map<string, InvoiceRow[]>();
    for (const r of data) {
      const k = r.created_at.slice(0, 7);
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.entries()].map(([mese, righe]) => ({
      mese,
      etichetta: format(new Date(`${mese}-01T00:00:00`), 'MMMM yyyy', { locale: it }),
      righe,
      totale: righe.reduce((t, r) => t + (r.amount_eur ?? 0), 0),
    }));
  })();

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
      {/* Titolo e sottotitolo li dà già l'hub Fatturato (unico punto d'accesso): qui solo le azioni. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
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

      <RigaRiepilogo
        voci={[
          { etichetta: "Totale periodo", valore: isLoading ? "…" : formatCurrency(totalAmount), tono: "buono" },
          { etichetta: "Fatture", valore: isLoading ? "…" : data.length },
          { etichetta: "Importo medio", valore: isLoading ? "…" : data.length ? formatCurrency(totalAmount / data.length) : "—" },
          { etichetta: "Aziende", valore: isLoading ? "…" : new Set(data.map((r) => r.company?.name ?? r.id)).size, dettaglio: "che hanno pagato" },
        ]}
      />

      {/* Raggruppate per mese: col filtro «Tutti i mesi» si legge l'andamento. */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
          ) : data.length === 0 ? (
            <StatoVuoto
              icona={FileText}
              titolo="Nessuna fattura in questo periodo"
              testo="Qui compaiono le ricariche pagate dalle aziende (credito AI) con il loro numero di fattura. Prova con «Tutti i mesi»."
              azione={monthFilter !== 'all' ? <Button variant="outline" size="sm" onClick={() => setMonthFilter('all')}>Tutti i mesi</Button> : undefined}
            />
          ) : (
            <>
              {/* Da telefono: righe dense, niente scorrimento orizzontale. */}
              <div className="md:hidden">
                {perMese.map((g) => (
                  <section key={g.mese}>
                    <h2 className="flex justify-between bg-muted/50 px-3 py-1.5 text-xs font-semibold capitalize">
                      <span>{g.etichetta} · {g.righe.length}</span>
                      <span className="tabular-nums">{formatCurrency(g.totale)}</span>
                    </h2>
                    <ul className="divide-y">
                      {g.righe.map((r) => (
                        <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{r.company?.name ?? '---'}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {format(new Date(r.created_at), 'dd/MM/yyyy', { locale: it })}{r.invoice_number ? ` · n. ${r.invoice_number}` : ''}
                            </p>
                          </div>
                          <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(r.amount_eur)}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Azienda</TableHead>
                      <TableHead>P.IVA</TableHead>
                      <TableHead>N. Fattura</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Importo</TableHead>
                    </TableRow>
                  </TableHeader>
                  {perMese.map((g) => (
                    <TableBody key={g.mese}>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={4} className="py-1.5 text-xs font-semibold capitalize">{g.etichetta} · {g.righe.length} {g.righe.length === 1 ? 'fattura' : 'fatture'}</TableCell>
                        <TableCell className="py-1.5 text-right text-xs font-semibold tabular-nums">{formatCurrency(g.totale)}</TableCell>
                      </TableRow>
                      {g.righe.map((r) => (
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
                      ))}
                    </TableBody>
                  ))}
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
