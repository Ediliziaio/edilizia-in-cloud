/**
 * TermoidraulicoIndex — landing del modulo Termoidraulico.
 *
 * Lista progetti (code, cliente, stato badge, totale, data) con:
 *  - Hero header gradient navy + accent arancione (coerente con Serramenti)
 *  - Search inline + filtro stato
 *  - Tabella desktop + card view mobile
 *  - Empty-state guidato per il primo accesso
 *
 * Pattern modellato su SerramentiIndex (versione essenziale: il dataset
 * Termoidraulico non richiede ancora i 20+ filtri avanzati dei serramenti).
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Hammer, Plus, Search, Trash2, Loader2, ChevronRight, ArrowLeft, FileText,
  Wallet, Layers, X, CopyPlus,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import {
  useTermoidraulicoProgetti,
  useDeleteProgetto,
  useClonaProgetto,
} from "@/hooks/useTermoidraulicoProgetto";
import { IDR_STATI_LABEL } from "./TermoidraulicoWizard/helpers";
import type { IdrStato } from "@/types/termoidraulico";

export default function TermoidraulicoIndex() {
  const navigate = useNavigate();
  const { data: progetti = [], isLoading, isError, refetch } = useTermoidraulicoProgetti();
  const deleteMut = useDeleteProgetto();
  const cloneMut = useClonaProgetto();

  const [search, setSearch] = useState("");
  const [filtroStato, setFiltroStato] = useState<string>("all");
  const [toDelete, setToDelete] = useState<{ id: string; code: string | null } | null>(null);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloningId, setCloningId] = useState<string | null>(null);

  const progettiFiltrati = useMemo(() => {
    const s = search.trim().toLowerCase();
    return progetti.filter((p) => {
      if (filtroStato !== "all" && p.stato !== filtroStato) return false;
      if (s) {
        const blob = `${p.code ?? ""} ${p.cliente_nome ?? ""} ${p.cliente_cognome ?? ""} ${p.cantiere_citta ?? ""} ${p.cantiere_provincia ?? ""}`.toLowerCase();
        if (!blob.includes(s)) return false;
      }
      return true;
    });
  }, [progetti, search, filtroStato]);

  const stats = useMemo(() => {
    const totale = progetti.length;
    const valore = progetti.reduce((acc, p) => acc + (Number(p.totale) || 0), 0);
    const aperti = progetti.filter(
      (p) => p.stato !== "accettato" && p.stato !== "rifiutato" && p.stato !== "archiviato",
    ).length;
    return { totale, valore, aperti };
  }, [progetti]);

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteMut.mutateAsync(toDelete.id);
      toast.success("Progetto eliminato");
    } catch (e) {
      toast.error("Eliminazione fallita", {
        description: e instanceof Error ? e.message : "Errore sconosciuto",
      });
    } finally {
      setToDelete(null);
    }
  };

  const handleClone = async (sourceId: string) => {
    setCloningId(sourceId);
    try {
      const nuovo = await cloneMut.mutateAsync(sourceId);
      toast.success("Preventivo duplicato", {
        description: "Computo e condizioni copiati. Compila il cliente del nuovo preventivo.",
      });
      setCloneOpen(false);
      navigate(`/azienda/termoidraulico/${nuovo.id}/modifica`);
    } catch (e) {
      toast.error("Duplicazione fallita", {
        description: e instanceof Error ? e.message : "Errore sconosciuto",
      });
    } finally {
      setCloningId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* HERO HEADER */}
      <div
        className="relative overflow-hidden text-white"
        style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2C5184 100%)" }}
      >
        <div
          className="absolute -top-1/3 -right-10 w-2/5 h-[160%] pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(249,115,22,0.20) 0%, transparent 60%)" }}
        />
        <div className="absolute right-8 top-6 opacity-10 select-none" aria-hidden>
          <Hammer className="h-28 w-28" strokeWidth={1.5} />
        </div>
        <div className="relative max-w-[1400px] mx-auto px-3 sm:px-8 py-4 sm:py-8 flex items-center justify-between flex-wrap gap-3 sm:gap-4">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => navigate("/azienda/marketing/preventivi")}
              className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-medium text-blue-100/90 hover:text-white mb-2 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Torna ai Preventivi
            </button>
            <div className="text-[10px] sm:text-[11px] uppercase tracking-widest font-semibold mb-1 text-orange-200">
              ★ MARKETING & VENDITA
            </div>
            <h1 className="text-xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
              <Hammer className="h-6 w-6 sm:h-7 sm:w-7 text-orange-400 shrink-0" />
              <span className="truncate">Termoidraulico</span>
            </h1>
            <p className="hidden sm:block text-sm text-blue-100 mt-1">
              Computo metrico e preventivi di termoidraulico sotto controllo.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={() => navigate("/azienda/termoidraulico/listino")}
              className="flex-1 sm:flex-initial h-10 sm:h-11 text-xs sm:text-sm border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              <Layers className="h-4 w-4 mr-1.5" />
              <span className="sm:hidden">Listino</span>
              <span className="hidden sm:inline">Listino lavorazioni</span>
            </Button>
            {progetti.length > 0 && (
              <Button
                variant="outline"
                onClick={() => setCloneOpen(true)}
                className="flex-1 sm:flex-initial h-10 sm:h-11 text-xs sm:text-sm border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              >
                <CopyPlus className="h-4 w-4 mr-1.5" />
                <span className="sm:hidden">Da esistente</span>
                <span className="hidden sm:inline">Inizia da esistente</span>
              </Button>
            )}
            <Button
              onClick={() => navigate("/azienda/termoidraulico/nuovo")}
              className="bg-gradient-to-br from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500 text-white shadow-lg border-0 flex-1 sm:flex-initial h-10 sm:h-11 text-xs sm:text-sm"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              <span className="sm:hidden">Nuovo</span>
              <span className="hidden sm:inline">Nuovo progetto</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-5 sm:py-6 space-y-4 sm:space-y-5">
        {/* KPI */}
        <div className="grid grid-cols-3 gap-3">
          <KpiCard label="Totale progetti" value={String(stats.totale)} icon={<FileText className="h-4 w-4" />} />
          <KpiCard label="Aperti" value={String(stats.aperti)} icon={<Layers className="h-4 w-4" />} />
          <KpiCard
            label="Valore totale"
            value={stats.valore > 0 ? formatCurrency(stats.valore) : "—"}
            icon={<Wallet className="h-4 w-4" />}
          />
        </div>

        {/* Toolbar */}
        <Card>
          <CardContent className="p-2.5 sm:p-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[160px] sm:min-w-[200px] w-full sm:w-auto">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Cerca per codice, cliente o città…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-10 sm:h-9"
                aria-label="Cerca progetto termoidraulico"
              />
            </div>
            <Select value={filtroStato} onValueChange={setFiltroStato}>
              <SelectTrigger className="h-10 sm:h-9 w-[160px]">
                <SelectValue placeholder="Stato" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli stati</SelectItem>
                {(Object.keys(IDR_STATI_LABEL) as IdrStato[]).map((k) => (
                  <SelectItem key={k} value={k}>{IDR_STATI_LABEL[k].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(search || filtroStato !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSearch(""); setFiltroStato("all"); }}
                className="h-10 sm:h-9 text-xs gap-1"
              >
                <X className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Azzera</span>
              </Button>
            )}
            <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
              {progettiFiltrati.length} di {progetti.length}
            </span>
          </CardContent>
        </Card>

        {/* Tabella / Lista */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-2">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            ) : isError ? (
              <div className="p-8 text-center space-y-3">
                <p className="text-sm text-rose-700 font-medium">Impossibile caricare i progetti.</p>
                <Button size="sm" variant="outline" onClick={() => refetch()} className="gap-1">
                  <Loader2 className="h-3.5 w-3.5" /> Riprova
                </Button>
              </div>
            ) : progetti.length === 0 ? (
              <EmptyStateFirstTime onCreate={() => navigate("/azienda/termoidraulico/nuovo")} />
            ) : progettiFiltrati.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <p className="text-sm text-muted-foreground">Nessun progetto con questi criteri.</p>
                <Button size="sm" variant="outline" onClick={() => { setSearch(""); setFiltroStato("all"); }}>
                  Azzera filtri
                </Button>
              </div>
            ) : (
              <>
                {/* Desktop tabella */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/60 hover:bg-slate-50/60">
                        <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-slate-600">Codice</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-slate-600">Cliente</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-slate-600">Cantiere</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-slate-600 text-right">Totale</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-slate-600">Stato</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-slate-600">Aggiornato</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {progettiFiltrati.map((p) => {
                        const statoCfg = IDR_STATI_LABEL[p.stato] ?? IDR_STATI_LABEL.bozza;
                        const cliente = [p.cliente_nome, p.cliente_cognome].filter(Boolean).join(" ");
                        return (
                          <TableRow
                            key={p.id}
                            className="cursor-pointer hover:bg-orange-50/40 transition-colors"
                            onClick={() => navigate(`/azienda/termoidraulico/${p.id}/modifica`)}
                          >
                            <TableCell className="font-mono text-xs font-semibold text-orange-600">
                              {p.code ?? "—"}
                            </TableCell>
                            <TableCell className="text-xs">
                              <div className="font-medium text-slate-900">
                                {cliente || <span className="text-muted-foreground">—</span>}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-slate-600">
                              {p.cantiere_citta ?? <span className="text-muted-foreground">—</span>}
                              {p.cantiere_provincia && (
                                <span className="text-muted-foreground"> ({p.cantiere_provincia})</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-right tabular-nums font-medium">
                              {Number(p.totale) > 0 ? formatCurrency(p.totale) : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={cn("text-[10px] font-medium", statoCfg.className)}>
                                {statoCfg.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-[11px] text-muted-foreground">
                              {p.updated_at
                                ? format(new Date(p.updated_at), "d MMM yyyy", { locale: it })
                                : "—"}
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-1 justify-end">
                                <Button
                                  size="icon" variant="ghost" className="h-9 w-9 md:h-7 md:w-7"
                                  onClick={() => setToDelete({ id: p.id, code: p.code })}
                                  aria-label="Elimina"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                                </Button>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile card list */}
                <div className="md:hidden p-2 space-y-2">
                  {progettiFiltrati.map((p) => {
                    const statoCfg = IDR_STATI_LABEL[p.stato] ?? IDR_STATI_LABEL.bozza;
                    const cliente = [p.cliente_nome, p.cliente_cognome].filter(Boolean).join(" ");
                    return (
                      <div
                        key={p.id}
                        className="rounded-lg border bg-card p-3 space-y-2 cursor-pointer hover:bg-orange-50/30"
                        onClick={() => navigate(`/azienda/termoidraulico/${p.id}/modifica`)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-mono text-xs font-semibold text-orange-600">{p.code ?? "—"}</span>
                              <Badge variant="outline" className={cn("text-[10px] font-medium", statoCfg.className)}>
                                {statoCfg.label}
                              </Badge>
                            </div>
                            <p className="text-sm font-medium truncate">{cliente || "—"}</p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {p.cantiere_citta ?? "—"}
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium tabular-nums">
                            {Number(p.totale) > 0 ? formatCurrency(p.totale) : <span className="text-muted-foreground">—</span>}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {p.updated_at ? format(new Date(p.updated_at), "d MMM yyyy", { locale: it }) : "—"}
                          </span>
                        </div>
                        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm" variant="outline" className="h-8 text-xs"
                            onClick={() => setToDelete({ id: p.id, code: p.code })}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Inizia da un preventivo esistente — clona computo + condizioni */}
      <Dialog open={cloneOpen} onOpenChange={(o) => { if (!cloneMut.isPending) setCloneOpen(o); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Inizia da un preventivo esistente</DialogTitle>
            <DialogDescription>
              Copia computo e condizioni di un preventivo passato in uno nuovo. Cliente, cantiere e immobile restano da compilare.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] space-y-1.5 overflow-y-auto px-0.5">
            {progetti.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Non hai ancora preventivi da cui partire.
              </p>
            ) : (
              progetti.map((p) => {
                const cliente = [p.cliente_nome, p.cliente_cognome].filter(Boolean).join(" ");
                const busy = cloningId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={cloneMut.isPending}
                    onClick={() => handleClone(p.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors hover:border-orange-300 hover:bg-orange-50/50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-orange-600">{p.code ?? "—"}</span>
                        <span className="truncate text-xs text-slate-700">{cliente || "Senza cliente"}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {Number(p.totale) > 0 ? formatCurrency(p.totale) : "Nessun totale"}
                        {p.tipo_intervento ? ` · ${p.tipo_intervento}` : ""}
                      </p>
                    </div>
                    {busy ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-orange-500" />
                    ) : (
                      <CopyPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il progetto?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete?.code ? `Il progetto ${toDelete.code} verrà eliminato definitivamente, ` : "Il progetto verrà eliminato definitivamente, "}
              insieme al suo computo e alle foto. L'azione non è reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-rose-600 hover:bg-rose-700"
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function KpiCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className="h-9 w-9 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">{label}</p>
          <p className="text-base font-bold tabular-nums truncate">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyStateFirstTime({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="p-10 text-center space-y-4">
      <div className="mx-auto h-14 w-14 rounded-full bg-orange-50 flex items-center justify-center">
        <Hammer className="h-7 w-7 text-orange-500" />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-slate-900">Nessun progetto di termoidraulico</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Crea il primo progetto: componi il computo metrico dai tuoi listini e genera un preventivo PDF brandizzato per il cliente.
        </p>
      </div>
      <Button onClick={onCreate} className="bg-orange-500 hover:bg-orange-600 gap-1.5">
        <Plus className="h-4 w-4" /> Nuovo progetto
      </Button>
    </div>
  );
}
