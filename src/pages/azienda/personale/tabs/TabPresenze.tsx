import { useState, useMemo } from "react";
import { useGiornateSummary, type GiornataWithProfilo } from "@/hooks/useGiornate";
import { useAllHrProfili } from "@/hooks/useOrganigramma";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronLeft, ChevronRight, Users, Clock, CalendarDays, AlertTriangle, Palmtree, Thermometer } from "lucide-react";

const STATO_COLORS: Record<string, { bg: string; text: string; label: string; short: string }> = {
  presente: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Presente", short: "P" },
  assente: { bg: "bg-red-100", text: "text-red-600", label: "Assente", short: "A" },
  ferie: { bg: "bg-sky-100", text: "text-sky-700", label: "Ferie", short: "F" },
  permesso: { bg: "bg-purple-100", text: "text-purple-700", label: "Permesso", short: "Pe" },
  malattia: { bg: "bg-amber-100", text: "text-amber-700", label: "Malattia", short: "M" },
  smart_working: { bg: "bg-blue-100", text: "text-blue-700", label: "Smart Working", short: "SW" },
  trasferta: { bg: "bg-indigo-100", text: "text-indigo-700", label: "Trasferta", short: "T" },
  festivita: { bg: "bg-slate-100", text: "text-slate-500", label: "Festività", short: "Fe" },
  infortunio: { bg: "bg-red-100", text: "text-red-700", label: "Infortunio", short: "In" },
};

function getStatoStyle(stato: string) {
  return STATO_COLORS[stato] || { bg: "bg-muted", text: "text-muted-foreground", label: stato, short: "?" };
}

const DAYS_IT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const MONTHS_IT = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  // Monday = 0
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const days: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  // Fill remaining cells
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

export function TabPresenze() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const dateFrom = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const dateTo = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const { giornate, isLoading, summary } = useGiornateSummary(dateFrom, dateTo);
  useAllHrProfili();

  const days = useMemo(() => getMonthDays(year, month), [year, month]);

  // Group giornate by date
  const giornateByDate = useMemo(() => {
    const map = new Map<string, GiornataWithProfilo[]>();
    giornate.forEach((g) => {
      const list = map.get(g.data) || [];
      list.push(g);
      map.set(g.data, list);
    });
    return map;
  }, [giornate]);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  const handleDayClick = (dateStr: string) => {
    setSelectedDay(dateStr);
    setDrawerOpen(true);
  };

  const todayDate = new Date();
  const today = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, "0")}-${String(todayDate.getDate()).padStart(2, "0")}`;
  const selectedDayGiornate = selectedDay ? giornateByDate.get(selectedDay) || [] : [];

  return (
    <div className="space-y-4">
      {/* KPI Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <Users className="h-5 w-5 mx-auto text-emerald-500 mb-1" />
            <p className="text-xl font-bold">{summary.presenti}</p>
            <p className="text-[10px] text-muted-foreground">Giorni Presenti</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Clock className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-xl font-bold">{Math.round(summary.oreTotali)}h</p>
            <p className="text-[10px] text-muted-foreground">Ore Lavorate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Palmtree className="h-5 w-5 mx-auto text-sky-500 mb-1" />
            <p className="text-xl font-bold">{summary.ferie}</p>
            <p className="text-[10px] text-muted-foreground">Giorni Ferie</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Thermometer className="h-5 w-5 mx-auto text-amber-500 mb-1" />
            <p className="text-xl font-bold">{summary.malattia}</p>
            <p className="text-[10px] text-muted-foreground">Giorni Malattia</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <CalendarDays className="h-5 w-5 mx-auto text-red-500 mb-1" />
            <p className="text-xl font-bold">{summary.assenti}</p>
            <p className="text-[10px] text-muted-foreground">Giorni Assenza</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <AlertTriangle className="h-5 w-5 mx-auto text-orange-500 mb-1" />
            <p className="text-xl font-bold">{summary.anomalie}</p>
            <p className="text-[10px] text-muted-foreground">Anomalie</p>
          </CardContent>
        </Card>
      </div>

      {/* Month Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-lg font-semibold min-w-0 sm:min-w-[180px] flex-1 sm:flex-initial text-center">
            {MONTHS_IT[month]} {year}
          </h3>
          <Button variant="outline" size="icon" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={goToday}>Oggi</Button>
        </div>
        {/* Legend */}
        <div className="hidden md:flex gap-2 flex-wrap">
          {["presente", "ferie", "permesso", "malattia", "assente", "smart_working"].map((s) => {
            const style = getStatoStyle(s);
            return (
              <span key={s} className={`text-[10px] px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>
                {style.label}
              </span>
            );
          })}
        </div>
      </div>

      {/* Calendar Grid */}
      <Card>
        <CardContent className="p-2">
          {isLoading ? (
            <div className="h-[400px] flex items-center justify-center text-muted-foreground">
              Caricamento...
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-px bg-border rounded overflow-hidden">
              {/* Header */}
              {DAYS_IT.map((d) => (
                <div key={d} className="bg-muted px-2 py-1.5 text-center text-xs font-semibold text-muted-foreground">
                  {d}
                </div>
              ))}
              {/* Days */}
              {days.map((date, i) => {
                if (!date) {
                  return <div key={`empty-${i}`} className="bg-background min-h-[80px]" />;
                }
                const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                const isToday = dateStr === today;
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                const dayGiornate = giornateByDate.get(dateStr) || [];

                return (
                  <button
                    key={dateStr}
                    onClick={() => handleDayClick(dateStr)}
                    className={`bg-background min-h-[80px] p-1 text-left hover:bg-muted/50 transition-colors relative ${
                      isWeekend ? "bg-muted/30" : ""
                    }`}
                  >
                    <span
                      className={`text-xs font-medium ${
                        isToday
                          ? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center"
                          : "text-foreground"
                      }`}
                    >
                      {date.getDate()}
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {dayGiornate.slice(0, 3).map((g) => {
                        const style = getStatoStyle(g.stato);
                        return (
                          <div
                            key={g.id}
                            className={`text-[9px] leading-tight px-1 py-0.5 rounded truncate ${style.bg} ${style.text}`}
                          >
                            {g.profilo_cognome?.[0]}.{g.profilo_nome?.[0]} [{style.short}]
                            {g.stato === "presente" && g.ore_lavorate > 0 && ` ${g.ore_lavorate}h`}
                          </div>
                        );
                      })}
                      {dayGiornate.length > 3 && (
                        <div className="text-[9px] text-muted-foreground px-1">
                          +{dayGiornate.length - 3} altri...
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Day Detail Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              Presenze —{" "}
              {selectedDay &&
                new Date(selectedDay + "T00:00:00").toLocaleDateString("it-IT", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(100%-60px)] mt-4">
            {selectedDayGiornate.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nessun dato per questa giornata
              </p>
            ) : (
              <div className="space-y-3">
                {selectedDayGiornate.map((g) => {
                  const style = getStatoStyle(g.stato);
                  return (
                    <div key={g.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                            style={{ backgroundColor: g.profilo_colore || "#0EA5E9" }}
                          >
                            {g.profilo_nome?.[0]}{g.profilo_cognome?.[0]}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{g.profilo_nome} {g.profilo_cognome}</p>
                            {g.profilo_mansione && (
                              <p className="text-xs text-muted-foreground">{g.profilo_mansione}</p>
                            )}
                          </div>
                        </div>
                        <Badge className={`${style.bg} ${style.text} border-0`} variant="secondary">
                          {style.label}
                        </Badge>
                      </div>
                      {g.stato === "presente" && (
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <p className="text-[10px] text-muted-foreground">Entrata</p>
                            <p className="font-medium">{g.prima_entrata?.slice(0, 5) || "—"}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">Uscita</p>
                            <p className="font-medium">{g.ultima_uscita?.slice(0, 5) || "—"}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">Ore</p>
                            <p className="font-medium">{g.ore_lavorate || 0}h</p>
                          </div>
                        </div>
                      )}
                      {g.anomalia && g.anomalia_motivo && (
                        <div className="flex items-center gap-1.5 text-xs text-orange-600 bg-orange-50 rounded p-1.5">
                          <AlertTriangle className="h-3 w-3" />
                          {g.anomalia_motivo}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}
