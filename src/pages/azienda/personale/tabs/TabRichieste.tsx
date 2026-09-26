import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { useRichieste, useCreateRichiesta, useUpdateRichiestaStato, type RichiestaWithProfilo } from "@/hooks/useRichieste";
import { useAllHrProfili } from "@/hooks/useOrganigramma";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Clock, CheckCircle2, XCircle, AlertCircle, Filter, Calendar, type LucideIcon } from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { it } from "date-fns/locale";
import type { HrProfilo, RichiestaTipo, RichiestaStato } from "@/types/hr";
import { useIsMobile } from "@/hooks/use-mobile";
import { CercaConFiltri, KpiMobili, PannelloFiltri, PilloleFiltro } from "@/components/mobile/FiltriMobile";

const TIPO_LABELS: Record<RichiestaTipo, string> = {
  ferie: "Ferie",
  permesso: "Permesso",
  malattia: "Malattia",
  straordinario: "Straordinario",
  cambio_turno: "Cambio turno",
  rimborso: "Rimborso",
  altro: "Altro",
  rol: "ROL",
  infortunio: "Infortunio",
  maternita: "Maternità",
  paternita: "Paternità",
  lutto: "Lutto",
  smart_working: "Smart Working",
  trasferta: "Trasferta",
  formazione: "Formazione",
  rettifica_timbratura: "Rettifica timbratura",
  segnalazione: "Segnalazione",
};

const STATO_STYLE: Record<RichiestaStato, { bg: string; text: string; icon: LucideIcon; label: string }> = {
  in_attesa: { bg: "bg-amber-100", text: "text-amber-700", icon: Clock, label: "In attesa" },
  approvata: { bg: "bg-emerald-100", text: "text-emerald-700", icon: CheckCircle2, label: "Approvata" },
  rifiutata: { bg: "bg-red-100", text: "text-red-600", icon: XCircle, label: "Rifiutata" },
  annullata: { bg: "bg-muted", text: "text-muted-foreground", icon: AlertCircle, label: "Annullata" },
  revocata: { bg: "bg-muted", text: "text-muted-foreground", icon: AlertCircle, label: "Revocata" },
};

const STATO_FILTER_VALUES = ["tutte", "in_attesa", "approvata", "rifiutata", "annullata"] as const;
type RichiestaStatoFilter = (typeof STATO_FILTER_VALUES)[number];

function isRichiestaStatoFilter(value: string): value is RichiestaStatoFilter {
  return STATO_FILTER_VALUES.includes(value as RichiestaStatoFilter);
}

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

export function TabRichieste() {
  const [statoFilter, setStatoFilter] = useState<RichiestaStatoFilter>("tutte");
  const [searchText, setSearchText] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [detailReq, setDetailReq] = useState<RichiestaWithProfilo | null>(null);
  // Mobile: lo stato sta in un pannello dal basso accanto alla ricerca.
  const [filtriMobileAperti, setFiltriMobileAperti] = useState(false);

  // Fetch SEMPRE tutte le richieste: il filtro per stato è applicato lato client
  // così le KPI (In attesa/Approvate/Rifiutate) restano coerenti anche quando è
  // selezionato un filtro (prima erano calcolate sulla lista già filtrata dal
  // server → contatori sbagliati).
  const { data: richieste = [], isLoading, isError, error, refetch, isFetching } = useRichieste();
  const { data: profili = [] } = useAllHrProfili();
  const loadingTimedOut = useLoadingTimeout(isLoading);

  const filtered = useMemo(() => {
    let list = richieste;
    if (statoFilter !== "tutte") list = list.filter((r) => r.stato === statoFilter);
    if (searchText) {
      const s = searchText.toLowerCase();
      list = list.filter((r) => {
        const nome = `${r.profilo?.nome ?? ""} ${r.profilo?.cognome ?? ""}`.toLowerCase();
        return nome.includes(s) || TIPO_LABELS[r.tipo]?.toLowerCase().includes(s);
      });
    }
    return list;
  }, [richieste, searchText, statoFilter]);

  // KPIs — sempre sull'intero set (non filtrato) per contatori corretti
  const kpis = useMemo(() => {
    const all = richieste;
    return {
      totali: all.length,
      in_attesa: all.filter((r) => r.stato === "in_attesa").length,
      approvate: all.filter((r) => r.stato === "approvata").length,
      rifiutate: all.filter((r) => r.stato === "rifiutata").length,
    };
  }, [richieste]);

  return (
    <div className="space-y-4 max-sm:space-y-3">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-sm:hidden">
        <KpiCard title="Totali" value={kpis.totali} icon={Calendar} />
        <KpiCard title="In attesa" value={kpis.in_attesa} icon={Clock} className="border-amber-200" />
        <KpiCard title="Approvate" value={kpis.approvate} icon={CheckCircle2} className="border-emerald-200" />
        <KpiCard title="Rifiutate" value={kpis.rifiutate} icon={XCircle} className="border-red-200" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 max-sm:hidden">
        <div className="flex items-center gap-1.5">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statoFilter} onValueChange={(value) => {
            if (isRichiestaStatoFilter(value)) setStatoFilter(value);
          }}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tutte">Tutte</SelectItem>
              <SelectItem value="in_attesa">In attesa</SelectItem>
              <SelectItem value="approvata">Approvate</SelectItem>
              <SelectItem value="rifiutata">Rifiutate</SelectItem>
              <SelectItem value="annullata">Annullate</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Input
          placeholder="Cerca dipendente o tipo..."
          className="max-w-[220px] h-9"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <div className="ml-auto">
          <Button size="sm" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nuova Richiesta
          </Button>
        </div>
      </div>

      {/* Mobile: da approvare (tocca e filtra) e approvate, nome e cifra. Dopo
          i blocchi del desktop: da primi figli nascosti lo sposterebbero. */}
      <KpiMobili
        className="sm:hidden max-sm:!mt-0"
        voci={[
          {
            label: "Da approvare",
            valore: String(kpis.in_attesa),
            tono: kpis.in_attesa > 0 ? "text-amber-600" : undefined,
            onClick: () => setStatoFilter((s) => (s === "in_attesa" ? "tutte" : "in_attesa")),
            attivo: statoFilter === "in_attesa",
          },
          { label: "Approvate", valore: String(kpis.approvate) },
        ]}
      />
      {/* Mobile: ricerca, filtri e «+» su una riga. */}
      <div className="flex items-center gap-2 sm:hidden">
        <CercaConFiltri
          className="min-w-0 flex-1"
          valore={searchText}
          onCambia={setSearchText}
          filtriAttivi={statoFilter !== "tutte" ? 1 : 0}
          onApriFiltri={() => setFiltriMobileAperti(true)}
        />
        <Button size="icon" onClick={() => setShowNew(true)} aria-label="Nuova richiesta" className="tap-compact h-9 w-9 shrink-0">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* List */}
      {isLoading && !loadingTimedOut ? (
        <div className="text-center py-12 text-muted-foreground">Caricamento...</div>
      ) : isError || loadingTimedOut ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="mx-auto mb-3 h-10 w-10 text-amber-500" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">Richieste non caricate</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
              {isError ? getErrorMessage(error) : "La risposta sta impiegando troppo tempo. Puoi riprovare senza uscire dalla pagina."}
            </p>
            <Button className="mt-4" size="sm" variant="outline" onClick={() => refetch()}>
              {isFetching ? "Forza nuovo tentativo" : "Riprova"}
            </Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        // Mobile: una riga di testo, senza riquadro.
        <Card className="max-sm:border-0 max-sm:bg-transparent max-sm:shadow-none"><CardContent className="py-12 text-center text-muted-foreground max-sm:p-0 max-sm:text-left max-sm:text-xs">Nessuna richiesta trovata.</CardContent></Card>
      ) : (
        <div className="space-y-2 max-sm:space-y-0 max-sm:divide-y max-sm:divide-border max-sm:overflow-hidden max-sm:rounded-lg max-sm:border max-sm:bg-card">
          {filtered.map((r) => (
            <RichiestaRow key={r.id} richiesta={r} onClick={() => setDetailReq(r)} />
          ))}
        </div>
      )}

      {/* New request dialog */}
      {showNew && (
        <NuovaRichiestaDialog
          profili={profili}
          open={showNew}
          onClose={() => setShowNew(false)}
        />
      )}

      {/* Detail / approval dialog */}
      {detailReq && (
        <DettaglioRichiestaDialog
          richiesta={detailReq}
          open={!!detailReq}
          onClose={() => setDetailReq(null)}
        />
      )}

      <PannelloFiltri
        aperto={filtriMobileAperti}
        onAperto={setFiltriMobileAperti}
        attivi={statoFilter !== "tutte" ? 1 : 0}
        onAzzera={() => setStatoFilter("tutte")}
        risultati={filtered.length}
      >
        <PilloleFiltro<RichiestaStatoFilter>
          titolo="Stato"
          valore={statoFilter}
          onScegli={setStatoFilter}
          scelte={[
            { value: "tutte", label: "Tutte", n: kpis.totali },
            { value: "in_attesa", label: "In attesa", n: kpis.in_attesa },
            { value: "approvata", label: "Approvate", n: kpis.approvate },
            { value: "rifiutata", label: "Rifiutate", n: kpis.rifiutate },
            { value: "annullata", label: "Annullate" },
          ]}
        />
      </PannelloFiltri>
    </div>
  );
}

function KpiCard({ title, value, icon: Icon, className }: { title: string; value: number; icon: LucideIcon; className?: string }) {
  return (
    <Card className={className}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{title}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function RichiestaRow({ richiesta: r, onClick }: { richiesta: RichiestaWithProfilo; onClick: () => void }) {
  const st = STATO_STYLE[r.stato] || STATO_STYLE.in_attesa;
  const Icon = st.icon;
  const days = differenceInCalendarDays(new Date(r.data_fine), new Date(r.data_inizio)) + 1;

  return (
    // Mobile: una riga da ~52px (persona; tipo, periodo e giorni; stato a
    // parole), senza scheda, avatar e badge.
    <Card className="cursor-pointer hover:shadow-md transition-shadow max-sm:rounded-none max-sm:border-0 max-sm:shadow-none max-sm:active:bg-muted" onClick={onClick}>
      <CardContent className="p-3 flex items-center gap-3 max-sm:gap-2.5 max-sm:py-2.5">
        {/* Avatar */}
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 max-sm:hidden"
          style={{ backgroundColor: r.profilo?.colore_avatar || "hsl(var(--primary))" }}
        >
          {(r.profilo?.nome?.[0] ?? "")}{(r.profilo?.cognome?.[0] ?? "")}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate max-sm:text-[13px] max-sm:font-semibold max-sm:leading-tight">
              {r.profilo?.nome} {r.profilo?.cognome}
              {/* Mobile: senza profilo collegato la riga resterebbe senza titolo. */}
              {!r.profilo && <span className="sm:hidden">Dipendente non trovato</span>}
            </span>
            <Badge variant="outline" className="text-xs max-sm:hidden">{TIPO_LABELS[r.tipo] || r.tipo}</Badge>
          </div>
          <p className="text-xs text-muted-foreground max-sm:mt-0.5 max-sm:truncate max-sm:text-[11px] max-sm:leading-tight">
            <span className="sm:hidden">{TIPO_LABELS[r.tipo] || r.tipo} · </span>
            {format(new Date(r.data_inizio), "dd MMM", { locale: it })} → {format(new Date(r.data_fine), "dd MMM yyyy", { locale: it })}
            {" · "}{days} {days === 1 ? "giorno" : "giorni"}
            {r.ore_richieste ? ` · ${r.ore_richieste}h` : ""}
          </p>
        </div>

        {/* Status badge */}
        <Badge className={`${st.bg} ${st.text} gap-1 max-sm:hidden`}>
          <Icon className="h-3 w-3" />
          {st.label}
        </Badge>
        <span className={`shrink-0 text-[11px] font-medium sm:hidden ${st.text}`}>{st.label}</span>
      </CardContent>
    </Card>
  );
}

/* ── New request dialog ── */
function NuovaRichiestaDialog({ profili, open, onClose }: { profili: HrProfilo[]; open: boolean; onClose: () => void }) {
  const create = useCreateRichiesta();
  const [profiloId, setProfiloId] = useState("");
  const [tipo, setTipo] = useState<RichiestaTipo>("ferie");
  const [dataInizio, setDataInizio] = useState("");
  const [dataFine, setDataFine] = useState("");
  const [ore, setOre] = useState("");
  const [motivo, setMotivo] = useState("");
  const activeProfili = useMemo(() => profili.filter((p) => p.attivo), [profili]);
  const selectedProfilo = useMemo(() => profili.find((p) => p.id === profiloId), [profili, profiloId]);
  const durataGiorni = dataInizio && dataFine && dataFine >= dataInizio
    ? differenceInCalendarDays(new Date(dataFine), new Date(dataInizio)) + 1
    : 0;
  const oreStimate = ore.trim()
    ? Number(ore)
    : durataGiorni * Number(selectedProfilo?.ore_giornaliere || 8);

  const saldoHint = useMemo(() => {
    if (!selectedProfilo || durataGiorni <= 0) return null;
    if (tipo === "ferie") {
      return {
        label: "Ferie",
        available: `${Number(selectedProfilo.ferie_residue ?? 0)} gg disponibili`,
        requested: `${durataGiorni} gg richiesti`,
      };
    }
    if (tipo === "permesso") {
      return {
        label: "Permessi",
        available: `${Number(selectedProfilo.permessi_residui_ore ?? 0)}h disponibili`,
        requested: `${oreStimate || 0}h richieste`,
      };
    }
    if (tipo === "rol") {
      return {
        label: "ROL",
        available: `${Number(selectedProfilo.rol_residuo_ore ?? 0)}h disponibili`,
        requested: `${oreStimate || 0}h richieste`,
      };
    }
    return null;
  }, [durataGiorni, oreStimate, selectedProfilo, tipo]);

  const handleSubmit = () => {
    if (!profiloId || !dataInizio || !dataFine) {
      toastMissing();
      return;
    }

    if (dataFine < dataInizio) {
      toast.error("La data fine non può essere precedente alla data inizio");
      return;
    }

    const oreRichieste = ore.trim() ? Number(ore) : null;
    if (oreRichieste != null && (!Number.isFinite(oreRichieste) || oreRichieste <= 0)) {
      toast.error("Le ore richieste devono essere maggiori di zero");
      return;
    }

    create.mutate(
      { profilo_id: profiloId, tipo, data_inizio: dataInizio, data_fine: dataFine, ore_richieste: oreRichieste, motivo: motivo.trim() || null },
      { onSuccess: onClose }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuova Richiesta</DialogTitle>
          <DialogDescription className="max-sm:sr-only">Crea una richiesta di ferie, permesso o assenza.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Dipendente</Label>
            <Select value={profiloId} onValueChange={setProfiloId}>
              <SelectTrigger><SelectValue placeholder="Seleziona..." /></SelectTrigger>
              <SelectContent>
                <ScrollArea className="max-h-[200px]">
                  {activeProfili.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">Nessun profilo attivo disponibile</div>
                  ) : (
                    activeProfili.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nome} {p.cognome}</SelectItem>
                    ))
                  )}
                </ScrollArea>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as RichiestaTipo)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TIPO_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Data inizio</Label>
              <Input type="date" value={dataInizio} onChange={(e) => setDataInizio(e.target.value)} />
            </div>
            <div>
              <Label>Data fine</Label>
              <Input type="date" value={dataFine} onChange={(e) => setDataFine(e.target.value)} />
            </div>
          </div>
          {/* Mobile no: le ore si calcolano dai giorni e dall'orario del profilo. */}
          <div className="max-sm:hidden">
            <Label>Ore richieste (opzionale)</Label>
            <Input type="number" min={0} step={0.5} value={ore} onChange={(e) => setOre(e.target.value)} placeholder="Es. 4" />
          </div>
          {saldoHint && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">{saldoHint.label}: {saldoHint.requested}</p>
                  <p className="text-amber-800">{saldoHint.available}<span className="max-sm:hidden">. Il sistema blocca richieste sopra saldo o sovrapposte.</span></p>
                </div>
              </div>
            </div>
          )}
          <div>
            <Label>Motivo</Label>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo della richiesta..." rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="max-sm:hidden">Annulla</Button>
          <Button onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending ? "Invio..." : "Crea Richiesta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toastMissing() {
  toast.error("Compila tutti i campi obbligatori");
}

/* ── Detail / approval dialog ── */
function DettaglioRichiestaDialog({ richiesta: r, open, onClose }: { richiesta: RichiestaWithProfilo; open: boolean; onClose: () => void }) {
  const isMobile = useIsMobile();
  const update = useUpdateRichiestaStato();
  const [noteRisposta, setNoteRisposta] = useState(r.note_risposta || "");
  const st = STATO_STYLE[r.stato] || STATO_STYLE.in_attesa;
  const days = differenceInCalendarDays(new Date(r.data_fine), new Date(r.data_inizio)) + 1;

  const handleAction = (stato: RichiestaStato) => {
    update.mutate({ id: r.id, stato, note_risposta: noteRisposta || undefined }, { onSuccess: onClose });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        {/* Mobile: chi e che cosa nel titolo, senza la descrizione sotto. */}
        <DialogHeader>
          <DialogTitle>{isMobile ? `${r.profilo?.nome ?? ""} ${r.profilo?.cognome ?? ""} — ${TIPO_LABELS[r.tipo] || r.tipo}` : "Dettaglio Richiesta"}</DialogTitle>
          <DialogDescription className="max-sm:sr-only">
            {r.profilo?.nome} {r.profilo?.cognome} — {TIPO_LABELS[r.tipo] || r.tipo}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Stato</span>
            <Badge className={`${st.bg} ${st.text}`}>{st.label}</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Periodo</span>
            <span>{format(new Date(r.data_inizio), "dd/MM/yyyy")} → {format(new Date(r.data_fine), "dd/MM/yyyy")}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Durata</span>
            <span>{days} {days === 1 ? "giorno" : "giorni"}{r.ore_richieste ? ` (${r.ore_richieste}h)` : ""}</span>
          </div>
          {r.motivo && (
            <div>
              <span className="text-muted-foreground block mb-1">Motivo</span>
              <p className="bg-muted p-2 rounded text-sm">{r.motivo}</p>
            </div>
          )}
          {r.approvata_il && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Approvata il</span>
              <span>{format(new Date(r.approvata_il), "dd/MM/yyyy HH:mm")}</span>
            </div>
          )}
          <div className="flex justify-between max-sm:hidden">
            <span className="text-muted-foreground">Creata il</span>
            <span>{format(new Date(r.created_at), "dd/MM/yyyy HH:mm")}</span>
          </div>

          {r.stato === "in_attesa" && (
            <>
              <div>
                <Label>Note risposta</Label>
                <Textarea value={noteRisposta} onChange={(e) => setNoteRisposta(e.target.value)} rows={2} placeholder="Note opzionali..." />
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" variant="outline" onClick={() => handleAction("rifiutata")} disabled={update.isPending}>
                  <XCircle className="h-4 w-4 mr-1" /> Rifiuta
                </Button>
                <Button className="flex-1" onClick={() => handleAction("approvata")} disabled={update.isPending}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Approva
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
