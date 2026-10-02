import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTimbratureAdmin, useLiveStatus, scaricaTimbratureAdmin, LIMITE_ELENCO_TIMBRATURE, type LiveStatusProfilo, type TimbraturaAdminRow } from "@/hooks/useTimbratura";
import { useRichieste } from "@/hooks/useRichieste";
import { toast } from "sonner";
import { PannelloPresenze } from "./PannelloPresenze";
import { filtraTimbrature, valoriDistinti, type Raggruppa, type RigaTimbratura } from "@/lib/personale/timbrature";
import { esportaTimbratureCsv, esportaTimbratureXlsx } from "@/lib/personale/esportaTimbrature";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { AlertCircle, Clock, LogIn, LogOut, Coffee, MapPin, ChevronDown, Download, Loader2 } from "lucide-react";
import { CercaConFiltri, PannelloFiltri, PilloleFiltro } from "@/components/mobile/FiltriMobile";

const TIPO_ICONS: Record<string, { icon: typeof LogIn; label: string; color: string }> = {
  entrata: { icon: LogIn, label: "Entrata", color: "text-emerald-600" },
  uscita: { icon: LogOut, label: "Uscita", color: "text-red-500" },
  pausa_inizio: { icon: Coffee, label: "Inizio Pausa", color: "text-amber-500" },
  pausa_fine: { icon: Coffee, label: "Fine Pausa", color: "text-blue-500" },
  inizio_pausa: { icon: Coffee, label: "Inizio Pausa", color: "text-amber-500" },
  fine_pausa: { icon: Coffee, label: "Fine Pausa", color: "text-blue-500" },
};

const TUTTI = "__tutti__";

/** La riga di hr_timbrature nel formato dei filtri e dell'esportazione. */
function aRiga(t: TimbraturaAdminRow): RigaTimbratura {
  return {
    id: t.id, data_evento: t.data_evento, ora_evento: t.ora_evento ?? null, timestamp: t.timestamp ?? null,
    tipo: t.tipo, fonte: t.fonte ?? null, note: t.note ?? null, lat: t.lat ?? null, lng: t.lng ?? null,
    profilo_id: t.profilo_id, profilo_nome: t.profilo_nome, profilo_cognome: t.profilo_cognome,
    reparto: t.profilo_reparto ?? null, mansione: t.profilo_mansione ?? null,
    cantiere_codice: t.cantiere_codice, cantiere_descrizione: t.cantiere_descrizione,
  };
}

const ETICHETTA_ASSENZA: Record<string, string> = {
  ferie: "In ferie", permesso: "In permesso", malattia: "In malattia", rol: "In permesso (ROL)",
  infortunio: "Infortunio", maternita: "Maternità", paternita: "Paternità", lutto: "Lutto",
  smart_working: "Smart working", trasferta: "In trasferta", formazione: "In formazione",
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
  const [filtroReparto, setFiltroReparto] = useState(TUTTI);
  const [filtroRuolo, setFiltroRuolo] = useState(TUTTI);
  const [filtroTipo, setFiltroTipo] = useState(TUTTI);
  const [esportando, setEsportando] = useState(false);
  // Mobile: date in un pannello dal basso; chi non ha timbrato sta in una riga
  // che si apre (prima diciotto riquadri prima della lista).
  const [filtriMobileAperti, setFiltriMobileAperti] = useState(false);
  const [mostraAssenti, setMostraAssenti] = useState(false);
  const ieri = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" }); })();
  const settimana = (() => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" }); })();
  const periodoMobile = dateFrom === today && dateTo === today ? "oggi"
    : dateFrom === ieri && dateTo === ieri ? "ieri"
    : dateFrom === settimana && dateTo === today ? "settimana" : "altro";

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

  const righeAdmin = useMemo(() => (timbrature as TimbraturaAdminRow[]).map(aRiga), [timbrature]);
  const filtriAttivi = {
    testo: filterName,
    reparto: filtroReparto === TUTTI ? undefined : filtroReparto,
    mansione: filtroRuolo === TUTTI ? undefined : filtroRuolo,
    tipo: filtroTipo === TUTTI ? undefined : filtroTipo,
  };
  const reparti = useMemo(() => valoriDistinti(righeAdmin, "reparto"), [righeAdmin]);
  const ruoli = useMemo(() => valoriDistinti(righeAdmin, "mansione"), [righeAdmin]);
  const filtered = useMemo(() => {
    const ids = new Set(filtraTimbrature(righeAdmin, filtriAttivi).map((r) => r.id));
    return (timbrature as TimbraturaAdminRow[]).filter((t) => ids.has(t.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [righeAdmin, timbrature, filterName, filtroReparto, filtroRuolo, filtroTipo]);
  const nFiltri = [filtroReparto, filtroRuolo, filtroTipo].filter((v) => v !== TUTTI).length;

  // Ferie e permessi approvati che coprono oggi: chi non ha timbrato per questo non è «assente».
  const { data: richieste = [] } = useRichieste();
  const assentiGiustificati = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of richieste) {
      if (r.stato !== "approvata" || !r.profilo_id) continue;
      if (r.data_inizio <= today && today <= r.data_fine) m[r.profilo_id] = ETICHETTA_ASSENZA[r.tipo] ?? "Assente giustificato";
    }
    return m;
  }, [richieste, today]);

  const impostaPeriodo = (da: string, a: string) => { setDateFrom(da); setDateTo(a); };
  const inizioMese = (offset: number) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset);
    return d.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
  };
  const fineMese = (offset: number) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset + 1); d.setDate(0);
    return d.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
  };

  // Esporta TUTTE le timbrature del periodo (non solo le prime dell'elenco), con gli stessi filtri.
  const esporta = async (formato: "xlsx" | "csv", raggruppa: Raggruppa = "nessuno") => {
    if (!companyId) return;
    setEsportando(true);
    try {
      const tutte = (await scaricaTimbratureAdmin(companyId, rangeFrom, rangeTo)).map(aRiga);
      const righe = filtraTimbrature(tutte, filtriAttivi);
      if (righe.length === 0) { toast.info("Nessuna timbratura da esportare con questi filtri"); return; }
      if (formato === "csv") esportaTimbratureCsv({ righe, da: rangeFrom, a: rangeTo });
      else await esportaTimbratureXlsx({ righe, da: rangeFrom, a: rangeTo, raggruppa });
      toast.success(`${righe.length} timbrature esportate`);
    } catch (e) {
      toast.error("Esportazione non riuscita", { description: getErrorMessage(e) });
    } finally {
      setEsportando(false);
    }
  };

  const orfaneFiltrate = orfane.filter((t) => {
    if (!normalizedFilter) return true;
    const operaio = `${t.profile?.first_name ?? ""} ${t.profile?.last_name ?? ""}`.toLowerCase();
    const cantiere = `${t.order?.order_code ?? ""} ${t.order?.description ?? ""}`.toLowerCase();
    return operaio.includes(normalizedFilter) || cantiere.includes(normalizedFilter);
  });

  const presenti = (liveStatus as LiveStatusProfilo[]).filter((p) => p.is_present);
  const assenti = (liveStatus as LiveStatusProfilo[]).filter((p) => !p.is_present);
  const rigaPersona = (p: LiveStatusProfilo) => (
    <div key={p.id} className="flex items-center gap-2.5 px-3 py-2">
      <div className="relative shrink-0">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{ backgroundColor: p.colore_avatar || "#0EA5E9" }}
        >
          {p.nome?.[0]}{p.cognome?.[0]}
        </div>
        <div className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${p.is_present ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
      </div>
      <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{p.nome} {p.cognome}</p>
      {/* Chi non ha timbrato non ripete «Non timbrato» su ogni riga: lo dice il pallino grigio. */}
      {p.last_tipo && (
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {`${TIPO_ICONS[p.last_tipo]?.label || p.last_tipo} ${p.last_ora?.slice(0, 5) || ""}`}
        </span>
      )}
    </div>
  );

  return (
    <div className="space-y-4 max-sm:space-y-3">
      {/* Live Status Panel (desktop) */}
      <div className="max-sm:hidden">
        <PannelloPresenze persone={liveStatus as LiveStatusProfilo[]} assentiGiustificati={assentiGiustificati} />
      </div>

      {/* Mobile: chi è presente a righe, chi non ha timbrato in una riga che si
          apre. Dopo il riquadro del desktop: da primo figlio nascosto lo sposterebbe. */}
      {liveStatus.length > 0 && (
        <div className="divide-y divide-border overflow-hidden rounded-lg border bg-card sm:hidden max-sm:!mt-0">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[13px] font-semibold">In azienda ora</span>
            <span className="text-[13px] font-semibold tabular-nums text-emerald-600">{presenti.length}<span className="font-normal text-muted-foreground"> su {liveStatus.length}</span></span>
          </div>
          {presenti.map(rigaPersona)}
          {assenti.length > 0 && (
            <button
              type="button"
              onClick={() => setMostraAssenti((v) => !v)}
              className="tap-compact flex w-full items-center justify-between px-3 py-2 text-left text-[12px] text-muted-foreground"
            >
              {/* «Non in azienda» e non «non hanno timbrato»: qui c'è anche chi è già uscito. */}
              <span>{assenti.length} non in azienda</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${mostraAssenti ? "rotate-180" : ""}`} />
            </button>
          )}
          {mostraAssenti && assenti.map(rigaPersona)}
        </div>
      )}

      {/* Mobile: ricerca per nome e bottone delle date. */}
      <CercaConFiltri
        className="sm:hidden"
        valore={filterName}
        onCambia={setFilterName}
        segnaposto="Cerca persona o cantiere"
        filtriAttivi={periodoMobile === "oggi" ? 0 : 1}
        onApriFiltri={() => setFiltriMobileAperti(true)}
      />

      {/* Filters */}
      <div className="space-y-2 max-sm:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border p-0.5" role="group" aria-label="Periodo">
            {[
              { k: "oggi", label: "Oggi", da: today, a: today },
              { k: "ieri", label: "Ieri", da: ieri, a: ieri },
              { k: "7", label: "7 giorni", da: settimana, a: today },
              { k: "mese", label: "Questo mese", da: inizioMese(0), a: today },
              { k: "scorso", label: "Mese scorso", da: inizioMese(-1), a: fineMese(-1) },
            ].map((p) => (
              <button
                key={p.k}
                type="button"
                onClick={() => impostaPeriodo(p.da, p.a)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${dateFrom === p.da && dateTo === p.a ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[150px]" aria-label="Dal" />
          <span className="text-sm text-muted-foreground">a</span>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[150px]" aria-label="Al" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="ml-auto gap-1.5" disabled={esportando}>
                {esportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Scarica
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Tutto il periodo ({rangeFrom === rangeTo ? rangeFrom : `${rangeFrom} → ${rangeTo}`}), con i filtri scelti
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={() => esporta("xlsx")}>Excel: riepilogo ore + dettaglio</DropdownMenuItem>
              <DropdownMenuItem onClick={() => esporta("xlsx", "reparto")}>Excel diviso per reparto</DropdownMenuItem>
              <DropdownMenuItem onClick={() => esporta("xlsx", "mansione")}>Excel diviso per ruolo</DropdownMenuItem>
              <DropdownMenuItem onClick={() => esporta("xlsx", "dipendente")}>Excel diviso per dipendente</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => esporta("csv")}>CSV (una tabella sola)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Cerca persona o cantiere..." value={filterName} onChange={(e) => setFilterName(e.target.value)} className="max-w-[220px]" />
          <Select value={filtroReparto} onValueChange={setFiltroReparto}>
            <SelectTrigger className="h-9 w-[160px]" aria-label="Reparto"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TUTTI}>Tutti i reparti</SelectItem>
              {reparti.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtroRuolo} onValueChange={setFiltroRuolo}>
            <SelectTrigger className="h-9 w-[170px]" aria-label="Ruolo"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TUTTI}>Tutti i ruoli</SelectItem>
              {ruoli.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="h-9 w-[150px]" aria-label="Tipo"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TUTTI}>Tutti i tipi</SelectItem>
              <SelectItem value="entrata">Entrate</SelectItem>
              <SelectItem value="uscita">Uscite</SelectItem>
              <SelectItem value="pausa_inizio">Inizio pausa</SelectItem>
              <SelectItem value="pausa_fine">Fine pausa</SelectItem>
            </SelectContent>
          </Select>
          {nFiltri > 0 && (
            <Button variant="ghost" size="sm" onClick={() => { setFiltroReparto(TUTTI); setFiltroRuolo(TUTTI); setFiltroTipo(TUTTI); }}>
              Azzera filtri
            </Button>
          )}
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {isLoading ? "" : `${filtered.length} timbrature`}
          </span>
        </div>
        {!isLoading && timbrature.length >= LIMITE_ELENCO_TIMBRATURE && (
          <p className="text-xs text-amber-700">
            Sono mostrate le ultime {LIMITE_ELENCO_TIMBRATURE} timbrature del periodo: restringi le date o i filtri, oppure usa «Scarica» per averle tutte.
          </p>
        )}
      </div>

      {/* Mobile: una timbratura per riga (persona; tipo, cantiere e fonte; ora). */}
      {!isLoading && !isError && filtered.length > 0 && (
        <div className="divide-y divide-border overflow-hidden rounded-lg border bg-card sm:hidden">
          {filtered.map((t) => {
            const tipoInfo = TIPO_ICONS[t.tipo] || { icon: Clock, label: t.tipo, color: "text-foreground" };
            return (
              <div key={t.id} className="flex items-center gap-2.5 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold leading-tight">{t.profilo_nome} {t.profilo_cognome}</p>
                  <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">
                    <span className={tipoInfo.color}>{tipoInfo.label}</span>
                    {t.cantiere_codice ? ` · ${t.cantiere_codice}` : ""}
                    {t.fonte ? ` · ${t.fonte}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[13px] font-semibold leading-tight tabular-nums">{t.ora_evento?.slice(0, 5)}</p>
                  {dateFrom !== dateTo && <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{t.data_evento?.slice(8, 10)}/{t.data_evento?.slice(5, 7)}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Timbrature Table — mobile: solo per caricamento, errore e lista vuota,
          senza bordo (è una riga di testo, non una scheda). */}
      <Card className={!isLoading && !isError && filtered.length > 0 ? "max-sm:hidden" : "max-sm:border-0 max-sm:bg-transparent max-sm:shadow-none"}>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="max-sm:hidden">
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
                    {/* Mobile: una riga di testo. */}
                    <div className="flex flex-col items-center justify-center py-12 gap-2 text-center max-sm:py-1">
                      <Clock className="h-10 w-10 text-muted-foreground/40 max-sm:hidden" aria-hidden="true" />
                      <p className="text-sm font-medium text-foreground max-sm:text-xs max-sm:font-normal max-sm:text-muted-foreground">Nessuna timbratura trovata</p>
                      <p className="text-xs text-muted-foreground max-sm:hidden">
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
            {/* Mobile no: la spiegazione (il titolo dice già cosa manca). */}
            <p className="text-sm text-amber-900/80 dark:text-amber-200/80 max-sm:hidden">
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

      {/* Mobile: il periodo delle timbrature. */}
      <PannelloFiltri
        aperto={filtriMobileAperti}
        onAperto={setFiltriMobileAperti}
        attivi={periodoMobile === "oggi" ? 0 : 1}
        onAzzera={() => { setDateFrom(today); setDateTo(today); }}
        risultati={isLoading ? undefined : filtered.length}
      >
        <PilloleFiltro
          titolo="Periodo"
          valore={periodoMobile}
          onScegli={(v) => {
            if (v === "oggi") { setDateFrom(today); setDateTo(today); }
            if (v === "ieri") { setDateFrom(ieri); setDateTo(ieri); }
            if (v === "settimana") { setDateFrom(settimana); setDateTo(today); }
          }}
          scelte={[
            { value: "oggi", label: "Oggi" },
            { value: "ieri", label: "Ieri" },
            { value: "settimana", label: "Ultimi 7 giorni" },
          ]}
        />
        <div className="grid grid-cols-2 gap-2">
          <Input type="date" aria-label="Dal" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-xs" />
          <Input type="date" aria-label="Al" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-xs" />
        </div>
      </PannelloFiltri>
    </div>
  );
}
