import { useState } from 'react';
import { formatDate } from '@/lib/formatters';
import { useGanttOrdini } from '@/hooks/useGanttOrdini';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CalendarDays } from 'lucide-react';

export default function GanttOrdini() {
  const [filtroStatoId, setFiltroStatoId] = useState<string | undefined>(undefined);

  const { orders, statuses, isLoading } = useGanttOrdini(filtroStatoId);

  const ordersWithDates = orders.filter(
    (o) => o.work_start_date && o.work_end_date
  );

  const maxDuration = ordersWithDates.reduce((max, o) => {
    const d = Math.ceil(
      (new Date(o.work_end_date!).getTime() - new Date(o.work_start_date!).getTime()) / 86400000
    );
    return d > max ? d : max;
  }, 1);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Gantt Multi-Cantiere</h1>
        <p className="text-muted-foreground mt-1">
          Visualizzazione temporale di tutti i cantieri attivi
        </p>
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-3">
        <Label htmlFor="filtro-stato" className="whitespace-nowrap text-sm">
          Filtra per stato
        </Label>
        <Select
          value={filtroStatoId ?? 'tutti'}
          onValueChange={(v) => setFiltroStatoId(v === 'tutti' ? undefined : v)}
        >
          <SelectTrigger id="filtro-stato" className="w-52">
            <SelectValue placeholder="Tutti gli stati" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti gli stati</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Gantt table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ordine</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Inizio</TableHead>
                <TableHead>Fine</TableHead>
                <TableHead className="text-right">Durata (giorni)</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="min-w-[200px]">Barra visuale</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : ordersWithDates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    <CalendarDays className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    <p>Nessun ordine con date di inizio e fine impostate</p>
                  </TableCell>
                </TableRow>
              ) : (
                ordersWithDates.map((o) => {
                  const duration = Math.ceil(
                    (new Date(o.work_end_date!).getTime() -
                      new Date(o.work_start_date!).getTime()) /
                      86400000
                  );
                  const barWidth = Math.max(4, Math.round((duration / maxDuration) * 100));
                  const statusColor =
                    (o.order_statuses as { color?: string } | null)?.color ?? '#6366f1';
                  const statusName =
                    (o.order_statuses as { name?: string } | null)?.name ?? '—';
                  const customerName =
                    (o.customers as { name?: string } | null)?.name ?? '—';

                  return (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">
                        <span className="text-xs text-muted-foreground mr-1">{o.order_code}</span>
                        {o.title}
                      </TableCell>
                      <TableCell>{customerName}</TableCell>
                      <TableCell>{formatDate(o.work_start_date!)}</TableCell>
                      <TableCell>{formatDate(o.work_end_date!)}</TableCell>
                      <TableCell className="text-right">{duration}</TableCell>
                      <TableCell>
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
                          style={{ backgroundColor: statusColor }}
                        >
                          {statusName}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center h-6">
                          <div
                            className="h-4 rounded-sm opacity-80"
                            style={{
                              width: `${barWidth}%`,
                              backgroundColor: statusColor,
                              minWidth: '4px',
                            }}
                            title={`${duration} giorni`}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
