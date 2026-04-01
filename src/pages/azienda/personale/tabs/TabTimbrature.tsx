import { useState } from "react";
import { useTimbratureAdmin, useLiveStatus } from "@/hooks/useTimbratura";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Clock, LogIn, LogOut, Coffee, MapPin } from "lucide-react";

const TIPO_ICONS: Record<string, { icon: typeof LogIn; label: string; color: string }> = {
  entrata: { icon: LogIn, label: "Entrata", color: "text-emerald-600" },
  uscita: { icon: LogOut, label: "Uscita", color: "text-red-500" },
  pausa_inizio: { icon: Coffee, label: "Inizio Pausa", color: "text-amber-500" },
  pausa_fine: { icon: Coffee, label: "Fine Pausa", color: "text-blue-500" },
  inizio_pausa: { icon: Coffee, label: "Inizio Pausa", color: "text-amber-500" },
  fine_pausa: { icon: Coffee, label: "Fine Pausa", color: "text-blue-500" },
};

export function TabTimbrature() {
  const today = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [filterName, setFilterName] = useState("");

  const { data: timbrature = [], isLoading } = useTimbratureAdmin(dateFrom, dateTo);
  const { data: liveStatus = [] } = useLiveStatus();

  const filtered = timbrature.filter((t: any) => {
    if (!filterName) return true;
    return `${t.profilo_nome} ${t.profilo_cognome}`.toLowerCase().includes(filterName.toLowerCase());
  });

  return (
    <div className="space-y-4">
      {/* Live Status Panel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Chi è in azienda oggi
          </CardTitle>
        </CardHeader>
        <CardContent>
          {liveStatus.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun profilo HR attivo</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {liveStatus.map((p: any) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-lg border p-2"
                >
                  <div className="relative">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: p.colore_avatar || "#0EA5E9" }}
                    >
                      {p.nome?.[0]}{p.cognome?.[0]}
                    </div>
                    <div
                      className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${
                        p.is_present ? "bg-emerald-500" : "bg-muted-foreground/40"
                      }`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{p.nome} {p.cognome}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.last_tipo
                        ? `${TIPO_ICONS[p.last_tipo]?.label || p.last_tipo} ${p.last_ora || ""}`
                        : "Non timbrato"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-[160px]"
        />
        <span className="text-sm text-muted-foreground">a</span>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-[160px]"
        />
        <Input
          placeholder="Filtra per nome..."
          value={filterName}
          onChange={(e) => setFilterName(e.target.value)}
          className="max-w-[200px]"
        />
      </div>

      {/* Timbrature Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Ora</TableHead>
                <TableHead>Dipendente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Fonte</TableHead>
                <TableHead>GPS</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Caricamento...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
                      <Clock className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
                      <p className="text-sm font-medium text-foreground">Nessuna timbratura trovata</p>
                      <p className="text-xs text-muted-foreground">
                        {filterName
                          ? `Nessuna timbratura per "${filterName}" nel periodo selezionato.`
                          : "Non ci sono timbrature nel periodo selezionato. Prova a cambiare le date."}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((t: any) => {
                    const tipoInfo = TIPO_ICONS[t.tipo] || { icon: Clock, label: t.tipo, color: "text-foreground" };
                  const TipoIcon = tipoInfo.icon;
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="text-sm">
                        <div>{t.data_evento}</div>
                        <div className="text-muted-foreground">{t.ora_evento?.slice(0, 5)}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                            style={{ backgroundColor: t.profilo_colore || "#0EA5E9" }}
                          >
                            {t.profilo_nome?.[0]}{t.profilo_cognome?.[0]}
                          </div>
                          <span className="text-sm">{t.profilo_nome} {t.profilo_cognome}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`gap-1 ${tipoInfo.color}`}>
                          <TipoIcon className="h-3 w-3" />
                          {tipoInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground capitalize">
                        {t.fonte || "—"}
                      </TableCell>
                      <TableCell>
                        {t.lat ? (
                          <MapPin className={`h-4 w-4 ${t.sede_id ? "text-emerald-500" : "text-amber-500"}`} />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {t.note || "—"}
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
