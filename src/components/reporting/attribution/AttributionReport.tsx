import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAttributionReport } from "@/hooks/useAttributionReport";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, TrendingUp, Users, Target, Eye, Star, ChevronRight } from "lucide-react";
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

const SOURCE_COLORS: Record<string, string> = {
  google: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  facebook: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  meta: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  instagram: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  linkedin: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  tiktok: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  organic: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  direct: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

function SourceBadge({ source }: { source: string }) {
  const s = source.toLowerCase();
  const colorClass = SOURCE_COLORS[s] || SOURCE_COLORS.direct;
  return <Badge variant="outline" className={`text-[10px] ${colorClass}`}>{source}</Badge>;
}

export default function AttributionReport() {
  const { effectiveCompany } = useAuth();
  const companyId = (effectiveCompany as any)?.id;
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [groupBy, setGroupBy] = useState<GroupBy>("source");
  const [drillSource, setDrillSource] = useState<string | null>(null);

  const effectiveGroupBy = drillSource ? "campaign" : groupBy;

  const { data: rows = [], isLoading } = useAttributionReport(
    companyId, dateRange.from, dateRange.to, effectiveGroupBy, drillSource
  );

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

  const topSource = useMemo(() => {
    if (!rows.length || effectiveGroupBy !== "source") return null;
    return rows[0]?.dimension || null;
  }, [rows, effectiveGroupBy]);

  const conversionRate = totals.sessions > 0
    ? ((totals.contacts / totals.sessions) * 100).toFixed(1)
    : "0";

  const handleRowClick = (dimension: string) => {
    if (groupBy === "source" && !drillSource) {
      setDrillSource(dimension);
    }
  };

  const handleBackToSources = () => {
    setDrillSource(null);
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      {drillSource && (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <button onClick={handleBackToSources} className="hover:text-foreground transition-colors underline">
            Tutte le sorgenti
          </button>
          <ChevronRight className="h-3.5 w-3.5" />
          <SourceBadge source={drillSource} />
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground font-medium">Campagne</span>
        </div>
      )}

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

        {!drillSource && (
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
        )}
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
        {topSource && !drillSource ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <Star className="h-4 w-4" /> Sorgente principale
              </CardTitle>
            </CardHeader>
            <CardContent><SourceBadge source={topSource} /></CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4" /> Tasso conversione
              </CardTitle>
            </CardHeader>
            <CardContent><p className="text-2xl font-bold">{conversionRate}%</p></CardContent>
          </Card>
        )}
      </div>

      {/* Chart */}
      {!isLoading && rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Distribuzione per {drillSource ? "campagna" : GROUP_LABELS[groupBy].toLowerCase()}
            </CardTitle>
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
          <CardTitle>
            Dettaglio attribuzione per {drillSource ? "campagna" : GROUP_LABELS[groupBy].toLowerCase()}
          </CardTitle>
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
                  <TableHead>{drillSource ? "Campagna" : GROUP_LABELS[groupBy]}</TableHead>
                  <TableHead className="text-right">Sessioni</TableHead>
                  <TableHead className="text-right">Visitatori</TableHead>
                  <TableHead className="text-right">Contatti</TableHead>
                  <TableHead className="text-right">Conversioni</TableHead>
                  <TableHead className="text-right">Conv. %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow
                    key={i}
                    className={groupBy === "source" && !drillSource ? "cursor-pointer hover:bg-muted/50" : ""}
                    onClick={() => handleRowClick(r.dimension)}
                  >
                    <TableCell className="font-medium">
                      {groupBy === "source" && !drillSource ? (
                        <SourceBadge source={r.dimension} />
                      ) : (
                        r.dimension
                      )}
                    </TableCell>
                    <TableCell className="text-right">{r.sessions}</TableCell>
                    <TableCell className="text-right">{r.unique_visitors}</TableCell>
                    <TableCell className="text-right">{r.contacts_created}</TableCell>
                    <TableCell className="text-right">{r.conversions}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {r.sessions > 0 ? ((r.contacts_created / r.sessions) * 100).toFixed(1) + "%" : "0%"}
                    </TableCell>
                  </TableRow>
                ))}
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
