import { useState, useMemo } from "react";
import { useRichieste, useCreateRichiesta, useUpdateRichiestaStato, type RichiestaWithProfilo } from "@/hooks/useRichieste";
import { useAllHrProfili } from "@/hooks/useOrganigramma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Clock, CheckCircle2, XCircle, AlertCircle, Filter, Calendar } from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { it } from "date-fns/locale";
import type { RichiestaTipo, RichiestaStato } from "@/types/hr";

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
};

const STATO_STYLE: Record<RichiestaStato, { bg: string; text: string; icon: any; label: string }> = {
  in_attesa: { bg: "bg-amber-100", text: "text-amber-700", icon: Clock, label: "In attesa" },
  approvata: { bg: "bg-emerald-100", text: "text-emerald-700", icon: CheckCircle2, label: "Approvata" },
  rifiutata: { bg: "bg-red-100", text: "text-red-600", icon: XCircle, label: "Rifiutata" },
  annullata: { bg: "bg-muted", text: "text-muted-foreground", icon: AlertCircle, label: "Annullata" },
  revocata: { bg: "bg-muted", text: "text-muted-foreground", icon: AlertCircle, label: "Revocata" },
};

export function TabRichieste() {
  const [statoFilter, setStatoFilter] = useState<RichiestaStato | "tutte">("tutte");
  const [searchText, setSearchText] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [detailReq, setDetailReq] = useState<RichiestaWithProfilo | null>(null);

  const { data: richieste = [], isLoading } = useRichieste(
    statoFilter !== "tutte" ? { stato: statoFilter } : undefined
  );
  const { data: profili = [] } = useAllHrProfili();

  const filtered = useMemo(() => {
    if (!searchText) return richieste;
    const s = searchText.toLowerCase();
    return richieste.filter((r) => {
      const nome = `${r.profilo?.nome ?? ""} ${r.profilo?.cognome ?? ""}`.toLowerCase();
      return nome.includes(s) || TIPO_LABELS[r.tipo]?.toLowerCase().includes(s);
    });
  }, [richieste, searchText]);

  // KPIs
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
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard title="Totali" value={kpis.totali} icon={Calendar} />
        <KpiCard title="In attesa" value={kpis.in_attesa} icon={Clock} className="border-amber-200" />
        <KpiCard title="Approvate" value={kpis.approvate} icon={CheckCircle2} className="border-emerald-200" />
        <KpiCard title="Rifiutate" value={kpis.rifiutate} icon={XCircle} className="border-red-200" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statoFilter} onValueChange={(v) => setStatoFilter(v as any)}>
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

      {/* List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Caricamento...</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nessuna richiesta trovata.</CardContent></Card>
      ) : (
        <div className="space-y-2">
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
    </div>
  );
}

function KpiCard({ title, value, icon: Icon, className }: { title: string; value: number; icon: any; className?: string }) {
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
    <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={onClick}>
      <CardContent className="p-3 flex items-center gap-3">
        {/* Avatar */}
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
          style={{ backgroundColor: r.profilo?.colore_avatar || "hsl(var(--primary))" }}
        >
          {(r.profilo?.nome?.[0] ?? "")}{(r.profilo?.cognome?.[0] ?? "")}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{r.profilo?.nome} {r.profilo?.cognome}</span>
            <Badge variant="outline" className="text-xs">{TIPO_LABELS[r.tipo] || r.tipo}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {format(new Date(r.data_inizio), "dd MMM", { locale: it })} → {format(new Date(r.data_fine), "dd MMM yyyy", { locale: it })}
            {" · "}{days} {days === 1 ? "giorno" : "giorni"}
            {r.ore_richieste ? ` · ${r.ore_richieste}h` : ""}
          </p>
        </div>

        {/* Status badge */}
        <Badge className={`${st.bg} ${st.text} gap-1`}>
          <Icon className="h-3 w-3" />
          {st.label}
        </Badge>
      </CardContent>
    </Card>
  );
}

/* ── New request dialog ── */
function NuovaRichiestaDialog({ profili, open, onClose }: { profili: any[]; open: boolean; onClose: () => void }) {
  const create = useCreateRichiesta();
  const [profiloId, setProfiloId] = useState("");
  const [tipo, setTipo] = useState<RichiestaTipo>("ferie");
  const [dataInizio, setDataInizio] = useState("");
  const [dataFine, setDataFine] = useState("");
  const [ore, setOre] = useState("");
  const [motivo, setMotivo] = useState("");

  const handleSubmit = () => {
    if (!profiloId || !dataInizio || !dataFine) {
      toast_missing();
      return;
    }
    create.mutate(
      { profilo_id: profiloId, tipo, data_inizio: dataInizio, data_fine: dataFine, ore_richieste: ore ? Number(ore) : null, motivo: motivo || null },
      { onSuccess: onClose }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuova Richiesta</DialogTitle>
          <DialogDescription>Crea una richiesta di ferie, permesso o assenza.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Dipendente</Label>
            <Select value={profiloId} onValueChange={setProfiloId}>
              <SelectTrigger><SelectValue placeholder="Seleziona..." /></SelectTrigger>
              <SelectContent>
                <ScrollArea className="max-h-[200px]">
                  {profili.filter((p) => p.attivo).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome} {p.cognome}</SelectItem>
                  ))}
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
          <div>
            <Label>Ore richieste (opzionale)</Label>
            <Input type="number" min={0} step={0.5} value={ore} onChange={(e) => setOre(e.target.value)} placeholder="Es. 4" />
          </div>
          <div>
            <Label>Motivo</Label>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo della richiesta..." rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending ? "Invio..." : "Crea Richiesta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toast_missing() {
  const { toast } = require("sonner");
  toast.error("Compila tutti i campi obbligatori");
}

/* ── Detail / approval dialog ── */
function DettaglioRichiestaDialog({ richiesta: r, open, onClose }: { richiesta: RichiestaWithProfilo; open: boolean; onClose: () => void }) {
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
        <DialogHeader>
          <DialogTitle>Dettaglio Richiesta</DialogTitle>
          <DialogDescription>
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
          <div className="flex justify-between">
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
