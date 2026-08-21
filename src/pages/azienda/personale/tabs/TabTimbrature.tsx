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
import { AlertCircle, Clock, LogIn, LogOut, Coffee, MapPin } from "lucide-react";

const TIPO_ICONS: Record<string, { icon: typeof LogIn; label: string; color: string }> = {
  entrata: { icon: LogIn, label: "Entrata", color: "text-emerald-600" },
  uscita: { icon: LogOut, label: "Uscita", color: "text-red-500" },
  pausa_inizio: { icon: Coffee, label: "Inizio Pausa", color: "text-amber-500" },
  pausa_fine: { icon: Coffee, label: "Fine Pausa", color: "text-blue-500" },
  inizio_pausa: { icon: Coffee, label: "Inizio Pausa", color: "text-amber-500" },
  fine_pausa: { icon: Coffee, label: "Fine Pausa", color: "text-blue-500" },
};

// Timbrature dal cantiere che il trigger DB non ha potuto specchiare nel
// registro HR (l'operaio non ha un profilo HR collegato). Non spariscono in
// silenzio: restano qui finché l'ufficio non collega la persona.
type CampoOrfanaRow = Tables<"campo_timbrature"> & {
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
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [filterName, setFilterName] = useState("");

  const companyId = useEffectiveCompanyId();
  const rangeFrom = dateFrom <= dateTo ? dateFrom : dateTo;
  const rangeTo = dateFrom <= dateTo ? dateTo : dateFrom;

  const { data: timbrature = [], isLoading, isError, error, refetch, isFetching } = useTimbratureAdmin(rangeFrom, rangeTo);
  const { data: liveStatus = [] } = useLiveStatus();

  const { data: orfane = [], isLoading: loadingOrfane } = useQuery({
    queryKey: ["campo-timbrature-orfane", companyId, rangeFrom, rangeTo],
    queryFn: async () => {
      // hr_timbratura_id non è ancora nei types generati: convenzione del repo.
      const { data, error } = await (supabase as any)
        .from("campo_timbrature")
        .select(`
          *,
          profile:profiles(first_name, last_name),
          order:orders(order_code, description)
        `)
        .eq("company_id", companyId)
        .is("hr_timbratura_id", null)
        .gte("timestamp_evento", `${rangeFrom}T00:00:00`)
        .lte("timestamp_evento", `${rangeTo}T23:59:59`)
        .order("timestamp_evento", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CampoOrfanaRow[];
    },
    enabled: !!companyId,
  });
  const timbratureTimedOut = useLoadingTimeout(isLoading);

  const normalizedFilter = filterName.trim().toLowerCase();

  const filtered = (timbrature as TimbraturaAdminRow[]).filter((t) => {
    if (!normalizedFilter) return true;
    const persona = `${t.profilo_nome} ${t.profilo_cognome}`.toLowerCase();
    const cantiere = `${t.cantiere_codice ?? ""} ${t.cantiere_descrizione ?? ""}`.toLowerCase();
    return persona.includes(normalizedFilter) || cantiere.includes(normalizedFilter);
  });

  const orfaneFiltrate = orfane.filter((t) => {
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
                <TableHead className="hidden md:table-cell">Cantiere</TableHead>
                <TableHead>Fonte</TableHead>
                <TableHead>GPS</TableHead>
                <TableHead className="hidden lg:table-cell">Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && !timbratureTimedOut ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Caricamento...
                  </TableCell>
                </TableRow>
              ) : isError || timbratureTimedOut ? (
                <TableRow>
                  <TableCell colSpan={7}>
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
                  <TableCell colSpan={7}>
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
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {t.cantiere_codice ?? "—"}
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
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground max-w-[200px] truncate">
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

      {/* Timbrature dal cantiere rimaste fuori dal registro.
          Prima qui c'era una seconda tabella con TUTTE le timbrature campo: la
          stessa timbrata compariva due volte (una per tabella) senza che nulla
          dicesse che era lo stesso evento. Ora il registro è uno solo e qui
          resta l'unica cosa che l'ufficio deve davvero sapere: chi timbra senza
          avere un profilo HR, e quindi non entra nelle ore né nel cedolino. */}
      {!loadingOrfane && orfaneFiltrate.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-amber-900 dark:text-amber-200">
              <AlertCircle className="h-4 w-4" />
              {orfaneFiltrate.length} timbrature senza profilo HR
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-amber-900/80 dark:text-amber-200/80">
              Queste persone hanno timbrato dall'app di cantiere ma non hanno un profilo HR
              collegato: le loro ore non entrano nelle presenze né nel cedolino. Creane il
              profilo in <span className="font-medium">Profili</span> (o collega l'utente al
              dipendente in anagrafica) e le timbrature successive arriveranno da sole.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Persona</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Quando</TableHead>
                  <TableHead className="hidden md:table-cell">Cantiere</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orfaneFiltrate.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium text-sm">
                      {`${t.profile?.first_name ?? ""} ${t.profile?.last_name ?? ""}`.trim() || "Utente sconosciuto"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize text-[11px]">
                        {t.tipo.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(t.timestamp_evento!).toLocaleString("it-IT", {
                        day: "2-digit", month: "2-digit", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {t.order?.order_code ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
