import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAttributionReport } from "@/hooks/useAttributionReport";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, TrendingUp, Users, Target, Eye } from "lucide-react";
import { format, subDays } from "date-fns";
import { it } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface DateRange {
  from: Date;
  to: Date;
}

type GroupBy = "source" | "medium" | "campaign" | "content";

const DATE_PRESETS = [
  { label: "7gg", days: 7 },
  { label: "30gg", days: 30 },
  { label: "90gg", days: 90 },
];

const GROUP_LABELS: Record<GroupBy, string> = {
  source: "Sorgente",
  medium: "Mezzo",
  campaign: "Campagna",
  content: "Contenuto",
};

export default function AttributionReport() {
  const { effectiveCompany } = useAuth();
  const companyId = (effectiveCompany as any)?.id;
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [groupBy, setGroupBy] = useState<GroupBy>("source");

  const { data: rows = [], isLoading } = useAttributionReport(companyId, dateRange.from, dateRange.to, groupBy);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        sessions: acc.sessions + (r.sessions || 0),
        visitors: acc.visitors + (r.unique_visitors || 0),
        contacts: acc.contacts + (r.contacts_created || 0),
        conversions: acc.conversions + (r.conversions || 0),
      }),
      { sessions: 0, visitors: 0, contacts: 0, conversions: 0 }
    );
  }, [rows]);

  const conversionRate = totals.sessions > 0
    ? ((totals.contacts / totals.sessions) * 100).toFixed(1)
    : "0";

  return (
    <div className="space-y-6">
      {/* Date controls + GroupBy */}
      <div className="flex flex-wrap items-center gap-2">
        {DATE_PRESETS.map((p) => (
          <Button
            key={p.days}
            variant="outline"
            size="sm"
            onClick={() => setDateRange({ from: subDays(new Date(), p.days), to: new Date() })}
          >
            {p.label}
          </Button>
        ))}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5" />
              {format(dateRange.from, "dd/MM", { locale: it })} – {format(dateRange.to, "dd/MM", { locale: it })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={{ from: dateRange.from, to: dateRange.to }}
              onSelect={(range) => {
                if (range?.from && range?.to) setDateRange({ from: range.from, to: range.to });
              }}
              locale={it}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>

        <div className="ml-auto">
          <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
            <TabsList className="h-8">
              {(Object.keys(GROUP_LABELS) as GroupBy[]).map((g) => (
                <TabsTrigger key={g} value={g} className="text-xs px-3 h-7">
                  {GROUP_LABELS[g]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Eye className="h-4 w-4" /> Sessioni
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{totals.sessions.toLocaleString("it-IT")}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Users className="h-4 w-4" /> Visitatori unici
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{totals.visitors.toLocaleString("it-IT")}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Target className="h-4 w-4" /> Contatti creati
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{totals.contacts.toLocaleString("it-IT")}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4" /> Tasso conversione
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{conversionRate}%</p></CardContent>
        </Card>
      </div>

      {/* Chart */}
      {!isLoading && rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribuzione per {GROUP_LABELS[groupBy].toLowerCase()}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows.slice(0, 10)} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="dimension" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="sessions" fill="hsl(var(--primary))" name="Sessioni" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="contacts_created" fill="hsl(var(--chart-2))" name="Contatti" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="conversions" fill="hsl(var(--chart-3))" name="Conversioni" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Attribution table */}
      <Card>
        <CardHeader>
          <CardTitle>Dettaglio attribuzione per {GROUP_LABELS[groupBy].toLowerCase()}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nessun dato di attribuzione per il periodo selezionato. Installa lo snippet di tracking sul tuo sito per raccogliere dati.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{GROUP_LABELS[groupBy]}</TableHead>
                  <TableHead className="text-right">Sessioni</TableHead>
                  <TableHead className="text-right">Visitatori</TableHead>
                  <TableHead className="text-right">Contatti</TableHead>
                  <TableHead className="text-right">Conversioni</TableHead>
                  <TableHead className="text-right">Conv. %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{r.dimension}</TableCell>
                    <TableCell className="text-right">{r.sessions}</TableCell>
                    <TableCell className="text-right">{r.unique_visitors}</TableCell>
                    <TableCell className="text-right">{r.contacts_created}</TableCell>
                    <TableCell className="text-right">{r.conversions}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {r.sessions > 0 ? ((r.contacts_created / r.sessions) * 100).toFixed(1) + "%" : "0%"}
                    </TableCell>
                  </TableRow>
                ))}
                {/* Totals row */}
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell>Totale</TableCell>
                  <TableCell className="text-right">{totals.sessions}</TableCell>
                  <TableCell className="text-right">{totals.visitors}</TableCell>
                  <TableCell className="text-right">{totals.contacts}</TableCell>
                  <TableCell className="text-right">{totals.conversions}</TableCell>
                  <TableCell className="text-right">{conversionRate}%</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
