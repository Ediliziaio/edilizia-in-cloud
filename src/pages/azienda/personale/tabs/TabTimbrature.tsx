import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTimbratureAdmin, useLiveStatus, type LiveStatusProfilo, type TimbraturaAdminRow } from "@/hooks/useTimbratura";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AlertCircle, Clock, LogIn, LogOut, Coffee, MapPin, Loader2 } from "lucide-react";

const TIPO_ICONS: Record<string, { icon: typeof LogIn; label: string; color: string }> = {
  entrata: { icon: LogIn, label: "Entrata", color: "text-emerald-600" },
  uscita: { icon: LogOut, label: "Uscita", color: "text-red-500" },
  pausa_inizio: { icon: Coffee, label: "Inizio Pausa", color: "text-amber-500" },
  pausa_fine: { icon: Coffee, label: "Fine Pausa", color: "text-blue-500" },
  inizio_pausa: { icon: Coffee, label: "Inizio Pausa", color: "text-amber-500" },
  fine_pausa: { icon: Coffee, label: "Fine Pausa", color: "text-blue-500" },
};

type CampoTimbraturaRow = Tables<"campo_timbrature"> & {
  profile?: { first_name: string | null; last_name: string | null } | null;
  order?: { order_code: string | null; description: string | null } | null;
};

function useLoadingTimeout(isLoading: boolean, delayMs = 8000) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setTimedOut(false);
      return;
    }

    const timer = window.setTimeout(() => setTimedOut(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, isLoading]);

  return timedOut;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Dati temporaneamente non disponibili";
}

export function TabTimbrature() {
  const today = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [filterName, setFilterName] = useState("");

  const companyId = useEffectiveCompanyId();
  const rangeFrom = dateFrom <= dateTo ? dateFrom : dateTo;
  const rangeTo = dateFrom <= dateTo ? dateTo : dateFrom;

  const { data: timbrature = [], isLoading, isError, error, refetch, isFetching } = useTimbratureAdmin(rangeFrom, rangeTo);
  const { data: liveStatus = [] } = useLiveStatus();

  const { data: timbratureCampo = [], isLoading: loadingCampo, isError: isCampoError, error: campoError, refetch: refetchCampo, isFetching: isFetchingCampo } = useQuery({
    queryKey: ["campo-timbrature-admin", companyId, rangeFrom, rangeTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campo_timbrature")
        .select(`
          *,
          profile:profiles(first_name, last_name),
          order:orders(order_code, description)
        `)
        .eq("company_id", companyId)
        .gte("timestamp_evento", `${rangeFrom}T00:00:00`)
        .lte("timestamp_evento", `${rangeTo}T23:59:59`)
        .order("timestamp_evento", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CampoTimbraturaRow[];
    },
    enabled: !!companyId,
  });
  const timbratureTimedOut = useLoadingTimeout(isLoading);
  const campoTimedOut = useLoadingTimeout(loadingCampo);

  const normalizedFilter = filterName.trim().toLowerCase();

  const filtered = (timbrature as TimbraturaAdminRow[]).filter((t) => {
    if (!normalizedFilter) return true;
    return `${t.profilo_nome} ${t.profilo_cognome}`.toLowerCase().includes(normalizedFilter);
  });

  const filteredCampo = timbratureCampo.filter((t) => {
    if (!normalizedFilter) return true;
    const operaio = `${t.profile?.first_name ?? ""} ${t.profile?.last_name ?? ""}`.toLowerCase();
    const cantiere = `${t.order?.order_code ?? ""} ${t.order?.description ?? ""}`.toLowerCase();
    return operaio.includes(normalizedFilter) || cantiere.includes(normalizedFilter);
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
              {(liveStatus as LiveStatusProfilo[]).map((p) => (
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
              {isLoading && !timbratureTimedOut ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Caricamento...
                  </TableCell>
                </TableRow>
              ) : isError || timbratureTimedOut ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
                      <AlertCircle className="h-10 w-10 text-amber-500" aria-hidden="true" />
                      <p className="text-sm font-medium text-foreground">Timbrature non caricate</p>
                      <p className="max-w-md text-xs text-muted-foreground">
                        {isError ? getErrorMessage(error) : "La risposta sta impiegando troppo tempo. Puoi riprovare senza cambiare pagina."}
                      </p>
                      <Button size="sm" variant="outline" onClick={() => refetch()}>
                        {isFetching ? "Forza nuovo tentativo" : "Riprova"}
                      </Button>
                    </div>
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
                filtered.map((t) => {
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
                        {t.lat != null && t.lng != null ? (
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

      {/* Sezione Timbrature App Campo */}
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-base font-semibold">Timbrature App Campo</h3>
          <Badge className="bg-amber-100 text-amber-800 border-amber-200">
            {filteredCampo.length} timbrature
          </Badge>
        </div>
        {loadingCampo && !campoTimedOut ? (
          <div className="flex justify-center py-4"><Loader2 className="animate-spin h-5 w-5" /></div>
        ) : isCampoError || campoTimedOut ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8 text-center">
            <AlertCircle className="mb-2 h-8 w-8 text-amber-500" aria-hidden="true" />
            <p className="text-sm font-medium">Timbrature App Campo non caricate</p>
            <p className="mt-1 max-w-md text-xs text-muted-foreground">
              {isCampoError ? getErrorMessage(campoError) : "La risposta sta impiegando troppo tempo. Puoi riprovare."}
            </p>
            <Button className="mt-3" size="sm" variant="outline" onClick={() => refetchCampo()}>
              {isFetchingCampo ? "Forza nuovo tentativo" : "Riprova"}
            </Button>
          </div>
        ) : filteredCampo.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {filterName
              ? `Nessuna timbratura app campo per "${filterName}" nel periodo selezionato`
              : "Nessuna timbratura dall'app campo nel periodo selezionato"}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Operaio</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Orario</TableHead>
                <TableHead className="hidden md:table-cell">Cantiere</TableHead>
                <TableHead className="hidden lg:table-cell">GPS</TableHead>
                <TableHead>Fonte</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCampo.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium text-sm">
                    {t.profile?.first_name} {t.profile?.last_name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize text-[11px]">
                      {t.tipo.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {new Date(t.timestamp_evento).toLocaleString("it-IT", {
                      day: "2-digit", month: "2-digit", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {t.order?.order_code ?? "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                    {t.gps_lat != null && t.gps_lng != null ? `${t.gps_lat.toFixed(4)}, ${t.gps_lng.toFixed(4)}` : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]">
                      App Campo
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
