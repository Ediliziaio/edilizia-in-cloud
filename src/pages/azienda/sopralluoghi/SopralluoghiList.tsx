/**
 * SopralluoghiList — lista sopralluoghi (rilievi tecnici di cantiere).
 *
 * Visibile se feature flag 'surveys_module' attiva (modulo gratuito, default ON).
 */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listaSopralluoghiBacheca } from "@/lib/api/surveysBoard";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ClipboardList, Plus, MapPin, Search, Calendar, CalendarClock, AlertCircle, Settings, Phone, User, ArrowRight, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { PianificaSopralluogoDialog } from "@/components/sopralluoghi/PianificaSopralluogoDialog";
import {
  FASI, contaPerFase, cosaFareOra, fasePratica, filtraBacheca, ordinaBacheca, prossimaAzione, quando,
  type FasePratica, type FiltriBacheca, type PeriodoFiltro, type SopralluogoBacheca,
} from "@/lib/sopralluoghi/bacheca";

const COLORE_FASE: Record<FasePratica, string> = {
  da_pianificare: "bg-slate-100 text-slate-700 border-slate-300",
  pianificato: "bg-sky-100 text-sky-700 border-sky-300",
  in_corso: "bg-amber-100 text-amber-700 border-amber-300",
  completato: "bg-emerald-100 text-emerald-700 border-emerald-300",
  firmato: "bg-violet-100 text-violet-700 border-violet-300",
  preventivo: "bg-teal-100 text-teal-700 border-teal-300",
};
const TONO_QUANDO = { normale: "text-muted-foreground", oggi: "font-semibold text-orange-700", ritardo: "font-semibold text-red-600", nessuna: "text-muted-foreground italic" } as const;
const PERIODI: { value: PeriodoFiltro; label: string }[] = [
  { value: "tutti", label: "Tutte le date" },
  { value: "oggi", label: "Oggi" },
  { value: "settimana", label: "Prossimi 7 giorni" },
  { value: "mese", label: "Prossimi 30 giorni" },
  { value: "in_ritardo", label: "In ritardo" },
  { value: "senza_data", label: "Senza data" },
];

export default function SopralluoghiList() {
  const permessi = usePermissions();
  // In sola lettura i sopralluoghi si consultano ma non si creano (policy in DB).
  const puoCreare = !permessi.solaLettura;
  const navigate = useNavigate();
  const companyId = useEffectiveCompanyId();
  const [filtri, setFiltri] = useState<FiltriBacheca>({ fase: "tutte", periodo: "tutti", tecnico: "tutti", testo: "", soloSenzaPreventivo: false });
  const [daPianificare, setDaPianificare] = useState<SopralluogoBacheca | null>(null);

  const { data: tutti = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["sopralluoghi-bacheca", companyId],
    enabled: !!companyId,
    queryFn: () => listaSopralluoghiBacheca(companyId as string),
  });
  const { data: staff = [] } = useCompanyStaffUsers(companyId);

  const adesso = useMemo(() => new Date(), [tutti]); // eslint-disable-line react-hooks/exhaustive-deps
  const conteggi = useMemo(() => contaPerFase(tutti), [tutti]);
  const ora = useMemo(() => cosaFareOra(tutti, adesso), [tutti, adesso]);
  const elenco = useMemo(() => ordinaBacheca(filtraBacheca(tutti, filtri, adesso), adesso), [tutti, filtri, adesso]);

  const imposta = (p: Partial<FiltriBacheca>) => setFiltri((f) => ({ ...f, ...p }));
  const filtriAttivi = (filtri.fase && filtri.fase !== "tutte") || (filtri.periodo && filtri.periodo !== "tutti")
    || (filtri.tecnico && filtri.tecnico !== "tutti") || !!filtri.testo?.trim() || filtri.soloSenzaPreventivo;
  const azzera = () => setFiltri({ fase: "tutte", periodo: "tutti", tecnico: "tutti", testo: "", soloSenzaPreventivo: false });

  const voceOra = [
    { chiave: "oggi", n: ora.oggi.length, testo: "oggi in agenda", tono: "text-orange-700", azione: () => imposta({ fase: "tutte", periodo: "oggi", soloSenzaPreventivo: false }) },
    { chiave: "ritardo", n: ora.inRitardo.length, testo: "in ritardo", tono: "text-red-600", azione: () => imposta({ fase: "tutte", periodo: "in_ritardo", soloSenzaPreventivo: false }) },
    { chiave: "ferme", n: ora.bozzeFerme.length, testo: "bozze ferme da oltre 2 settimane", tono: "text-slate-700", azione: () => imposta({ fase: "da_pianificare", periodo: "tutti", soloSenzaPreventivo: false }) },
    { chiave: "prev", n: ora.senzaPreventivo.length, testo: "finiti senza preventivo", tono: "text-violet-700", azione: () => imposta({ fase: "tutte", periodo: "tutti", soloSenzaPreventivo: true }) },
  ].filter((v) => v.n > 0);

  return (
    <div className="mx-auto max-w-6xl p-0 sm:p-2 md:p-6 space-y-3 sm:space-y-4">
      {/* Header — telefono: resta solo «Nuovo sopralluogo» a tutta riga; il
          titolo lo dice già la scheda in alto e le impostazioni sono dal computer. */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 max-sm:hidden">
          <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br from-orange-500 to-eic-amber-strong flex items-center justify-center text-white shadow-lg shrink-0">
            <ClipboardList className="h-4 w-4 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-2xl font-bold">Sopralluoghi</h1>
            <p className="hidden sm:block text-sm text-muted-foreground mt-0.5">
              Rilievi tecnici sul cantiere — pianificati in calendario, con foto, audio e firma cliente
            </p>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {/* Modelli dei sopralluoghi: prima stavano tra le impostazioni dei preventivi. */}
          {(permessi.isAdmin || permessi.canViewSettingsCustomization) && (
            <Button asChild variant="outline" className="gap-2 w-full sm:w-auto max-sm:hidden">
              <Link to="/azienda/impostazioni/sopralluoghi"><Settings className="h-4 w-4" />Impostazioni</Link>
            </Button>
          )}
          {puoCreare ? (
            <Button asChild className="gap-2 bg-orange-600 hover:bg-orange-700 w-full sm:w-auto">
              <Link to="/azienda/sopralluoghi/nuovo"><Plus className="h-4 w-4" />Nuovo sopralluogo</Link>
            </Button>
          ) : (
            <Button disabled title="Sei in sola lettura" className="gap-2 w-full sm:w-auto"><Plus className="h-4 w-4" />Nuovo sopralluogo</Button>
          )}
        </div>
      </div>

      {/* Avanzamento: a che punto sono i sopralluoghi. Un clic filtra, un secondo clic toglie. */}
      {!isLoading && !isError && tutti.length > 0 && (
        <div className="grid grid-cols-3 gap-2 lg:grid-cols-6" role="tablist" aria-label="Fase dei sopralluoghi">
          {FASI.map(({ fase, etichetta }) => (
            <button
              key={fase}
              type="button"
              role="tab"
              aria-selected={filtri.fase === fase}
              onClick={() => imposta({ fase: filtri.fase === fase ? "tutte" : fase })}
              className={cn(
                "rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:border-orange-300",
                filtri.fase === fase && "border-orange-500 bg-orange-50",
              )}
            >
              <span className="block text-xl font-bold leading-none tabular-nums">{conteggi[fase]}</span>
              <span className="mt-1 block truncate text-[11px] text-muted-foreground">{etichetta}</span>
            </button>
          ))}
        </div>
      )}

      {/* Cosa fare ora */}
      {!isLoading && !isError && voceOra.length > 0 && (
        <Card className="border-orange-200 bg-orange-50/40">
          <CardContent className="flex flex-wrap items-center gap-x-5 gap-y-2 p-3">
            <span className="flex items-center gap-1.5 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-orange-600" />Cosa fare ora</span>
            {voceOra.map((v) => (
              <button key={v.chiave} type="button" onClick={v.azione} className="flex items-center gap-1.5 text-sm hover:underline">
                <span className={cn("text-lg font-bold tabular-nums", v.tono)}>{v.n}</span>
                <span className="text-muted-foreground">{v.testo}</span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Filtri */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Cerca per cliente, telefono, indirizzo, codice…"
            value={filtri.testo ?? ""}
            onChange={(e) => imposta({ testo: e.target.value })}
            className="pl-8 h-10 sm:h-9 text-sm"
            aria-label="Cerca per cliente, telefono, indirizzo o codice"
          />
        </div>
        <Select value={filtri.periodo ?? "tutti"} onValueChange={(v) => imposta({ periodo: v as PeriodoFiltro })}>
          <SelectTrigger className="h-10 w-[170px] text-sm sm:h-9" aria-label="Periodo"><SelectValue /></SelectTrigger>
          <SelectContent>{PERIODI.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filtri.tecnico ?? "tutti"} onValueChange={(v) => imposta({ tecnico: v })}>
          <SelectTrigger className="h-10 w-[170px] text-sm sm:h-9" aria-label="Tecnico"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti i tecnici</SelectItem>
            <SelectItem value="nessuno">Senza tecnico</SelectItem>
            {staff.map((u) => <SelectItem key={u.id} value={u.id}>{[u.first_name, u.last_name].filter(Boolean).join(" ") || "Utente"}</SelectItem>)}
          </SelectContent>
        </Select>
        {filtriAttivi && <Button variant="ghost" size="sm" onClick={azzera}>Azzera filtri</Button>}
        {!isLoading && <span className="ml-auto text-xs text-muted-foreground tabular-nums">{elenco.length} sopralluoghi</span>}
      </div>

      {/* Elenco */}
      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : isError ? (
        <Card className="border-red-200 dark:border-red-900/40">
          <CardContent className="p-6 sm:p-12 text-center">
            <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-500/70" />
            <p className="font-semibold mb-1">Impossibile caricare i sopralluoghi</p>
            <p className="text-sm text-muted-foreground mb-4">Si è verificato un errore. Controlla la connessione e riprova.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Riprova</Button>
          </CardContent>
        </Card>
      ) : elenco.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-6 sm:p-12 text-center">
            <div className="mx-auto h-14 w-14 sm:h-16 sm:w-16 rounded-full bg-orange-100 flex items-center justify-center mb-3">
              <ClipboardList className="h-7 w-7 sm:h-8 sm:w-8 text-orange-600" />
            </div>
            <p className="font-semibold">Nessun sopralluogo</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              {filtriAttivi ? "Nessun risultato per i filtri attivi." : "Usa il pulsante \"Nuovo sopralluogo\" in alto per crearne uno."}
            </p>
            {filtriAttivi && <Button variant="outline" size="sm" className="mt-3" onClick={azzera}>Azzera filtri</Button>}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {elenco.map((s) => {
            const fase = fasePratica(s) as FasePratica;
            const faseTesto = FASI.find((f) => f.fase === fase)?.etichetta ?? "";
            const fatto = fase === "completato" || fase === "firmato" || fase === "preventivo";
            const q = quando(s.scheduled_at, adesso, fatto);
            const azione = prossimaAzione(s, adesso);
            const modificabile = puoCreare && (fase === "da_pianificare" || fase === "pianificato");
            return (
              <Card
                key={s.id}
                className="hover:border-orange-300 hover:shadow-sm active:bg-orange-50/40 transition-all cursor-pointer"
                onClick={() => navigate(`/azienda/sopralluoghi/${s.id}`)}
              >
                <CardContent className="p-3 sm:p-4 flex items-start gap-2.5 sm:gap-3">
                  <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                    <ClipboardList className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-bold text-orange-700">{s.code}</span>
                      <Badge variant="outline" className={cn("text-[10px]", COLORE_FASE[fase])}>{faseTesto}</Badge>
                      <span className={cn("flex items-center gap-1 text-xs", TONO_QUANDO[q.tono])}>
                        <Calendar className="h-3 w-3 shrink-0" />{q.testo}
                      </span>
                    </div>
                    {(s.cliente_nome || s.cliente_telefono) && (
                      <div className="flex items-center gap-3 flex-wrap text-sm">
                        {s.cliente_nome && <span className="flex items-center gap-1 font-medium"><User className="h-3.5 w-3.5 text-muted-foreground" />{s.cliente_nome}</span>}
                        {s.cliente_telefono && (
                          <a href={`tel:${s.cliente_telefono}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 text-xs text-sky-700 hover:underline">
                            <Phone className="h-3 w-3" />{s.cliente_telefono}
                          </a>
                        )}
                      </div>
                    )}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 gap-0.5 text-xs text-muted-foreground">
                      {(s.address || s.city) && (
                        <span className="flex items-start gap-1 min-w-0">
                          <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                          <span className="truncate">{[s.address, s.city].filter(Boolean).join(", ")}</span>
                        </span>
                      )}
                      <span>{s.tecnico_nome ? `Tecnico: ${s.tecnico_nome}` : "Nessun tecnico"}</span>
                    </div>
                    {azione && (
                      <p className="flex items-center gap-1 text-xs font-medium text-orange-800"><ArrowRight className="h-3 w-3" />{azione}</p>
                    )}
                    {fase === "preventivo" && <p className="flex items-center gap-1 text-xs text-teal-700"><CheckCircle2 className="h-3 w-3" />Preventivo fatto</p>}
                  </div>
                  {modificabile && (
                    <Button
                      size="sm"
                      variant={fase === "da_pianificare" ? "default" : "outline"}
                      className={cn("shrink-0 gap-1.5", fase === "da_pianificare" && "bg-orange-600 hover:bg-orange-700")}
                      onClick={(e) => { e.stopPropagation(); setDaPianificare(s); }}
                    >
                      <CalendarClock className="h-3.5 w-3.5" />
                      {fase === "da_pianificare" ? "Pianifica" : "Sposta"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <PianificaSopralluogoDialog sopralluogo={daPianificare} onClose={() => setDaPianificare(null)} />
    </div>
  );
}
