/**
 * SerramentiIndex — landing del modulo Preventivatore Serramenti.
 *
 * Layout V3 ispirato a FotovoltaicoIndex:
 *  - Hero header gradient navy + accent arancione brand
 *  - 6 KPI: totale, aperti (pipeline), vinti, persi, tasso conversione,
 *    valore pipeline aperta
 *  - Filtri estesi: search + stato + periodo + sort
 *  - Tabella desktop + card view mobile
 *
 * Categorie di stato (gruppi logici):
 *  - APERTI (in lavorazione): bozza, da_consegnare, consegnato, in_valutazione
 *  - VINTI (contratti chiusi): accettato
 *  - PERSI: rifiutato, scaduto
 *  - ARCHIVIATI: archiviato
 */
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  RectangleVertical, Plus, Search, Trash2, ExternalLink, Loader2,
  ChevronRight, Settings, TrendingUp, FileText, Layers, Trophy,
  XCircle, Wallet, Filter,
} from "lucide-react";
import { useProgetti, useDeleteProgetto } from "@/lib/serramenti/queries";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { it } from "date-fns/locale";
import type { SrStatoProgetto } from "@/types/serramenti";

const STATI_LABEL: Record<SrStatoProgetto, { label: string; className: string }> = {
  bozza:           { label: "Bozza",          className: "bg-slate-100 text-slate-700 border-slate-200" },
  da_consegnare:   { label: "Da consegnare",  className: "bg-amber-100 text-amber-800 border-amber-200" },
  consegnato:      { label: "Consegnato",     className: "bg-sky-100 text-sky-800 border-sky-200" },
  in_valutazione:  { label: "In valutazione", className: "bg-blue-50 text-[#173b67] border-blue-200" },
  accettato:       { label: "Accettato",      className: "bg-orange-100 text-orange-700 border-orange-200" },
  rifiutato:       { label: "Rifiutato",      className: "bg-rose-100 text-rose-700 border-rose-200" },
  scaduto:         { label: "Scaduto",        className: "bg-slate-100 text-slate-500 border-slate-200" },
  archiviato:      { label: "Archiviato",     className: "bg-slate-100 text-slate-400 border-slate-200" },
};

const STATI_APERTI: SrStatoProgetto[] = ["bozza", "da_consegnare", "consegnato", "in_valutazione"];
const STATI_VINTI: SrStatoProgetto[] = ["accettato"];
const STATI_PERSI: SrStatoProgetto[] = ["rifiutato", "scaduto"];

type PeriodKey = "all" | "7d" | "30d" | "90d" | "ytd";
const PERIOD_LABELS: Record<PeriodKey, string> = {
  all: "Sempre",
  "7d": "Ultimi 7 giorni",
  "30d": "Ultimi 30 giorni",
  "90d": "Ultimi 90 giorni",
  ytd: "Anno corrente",
};

const fmtEur = (n: number) =>
  `€ ${Number(n).toLocaleString("it-IT", { maximumFractionDigits: 0 })}`;

export default function SerramentiIndex() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: progetti = [], isLoading, isError, refetch } = useProgetti();
  const deleteMut = useDeleteProgetto();

  // Filtri (statoGroup persistente in URL ?gruppo=)
  const initialGroup = searchParams.get("gruppo") ?? "all";
  const [search, setSearch] = useState("");
  const [statoGroup, setStatoGroupState] = useState<string>(initialGroup);
  const [filtroStato, setFiltroStato] = useState<string>("all");
  const [periodo, setPeriodo] = useState<PeriodKey>("all");
  const [sortBy, setSortBy] = useState<"recent" | "value_desc" | "value_asc">("recent");
  const [toDelete, setToDelete] = useState<{ id: string; code: string } | null>(null);

  const setStatoGroup = (v: string) => {
    setStatoGroupState(v);
    setFiltroStato("all"); // reset stato specifico quando cambia gruppo
    const next = new URLSearchParams(searchParams);
    if (v === "all") next.delete("gruppo"); else next.set("gruppo", v);
    setSearchParams(next, { replace: true });
  };

  // Cutoff date in base al periodo
  const cutoff = useMemo(() => {
    const now = new Date();
    switch (periodo) {
      case "7d": return subDays(now, 7);
      case "30d": return subDays(now, 30);
      case "90d": return subDays(now, 90);
      case "ytd": return new Date(now.getFullYear(), 0, 1);
      default: return null;
    }
  }, [periodo]);

  // Lista filtrata + sortata
  const progettiFiltrati = useMemo(() => {
    const s = search.trim().toLowerCase();
    let out = progetti.filter((p) => {
      // Gruppo stato
      if (statoGroup === "aperti" && !STATI_APERTI.includes(p.stato as SrStatoProgetto)) return false;
      if (statoGroup === "vinti" && !STATI_VINTI.includes(p.stato as SrStatoProgetto)) return false;
      if (statoGroup === "persi" && !STATI_PERSI.includes(p.stato as SrStatoProgetto)) return false;
      // Stato specifico
      if (filtroStato !== "all" && p.stato !== filtroStato) return false;
      // Periodo (su updated_at)
      if (cutoff && p.updated_at && new Date(p.updated_at) < cutoff) return false;
      // Search
      if (s) {
        const blob = `${p.code ?? ""} ${p.cliente_nome ?? ""} ${p.cliente_cognome ?? ""} ${p.cantiere_citta ?? ""}`.toLowerCase();
        if (!blob.includes(s)) return false;
      }
      return true;
    });

    // Sort
    out = [...out].sort((a, b) => {
      if (sortBy === "value_desc") return Number(b.totale_max ?? 0) - Number(a.totale_max ?? 0);
      if (sortBy === "value_asc") return Number(a.totale_max ?? 0) - Number(b.totale_max ?? 0);
      const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return tb - ta;
    });
    return out;
  }, [progetti, search, statoGroup, filtroStato, cutoff, sortBy]);

  // KPI globali (sempre sul dataset completo + filtro periodo)
  const stats = useMemo(() => {
    const inPeriod = cutoff
      ? progetti.filter((p) => p.updated_at && new Date(p.updated_at) >= cutoff)
      : progetti;
    const aperti = inPeriod.filter((p) => STATI_APERTI.includes(p.stato as SrStatoProgetto));
    const vinti = inPeriod.filter((p) => STATI_VINTI.includes(p.stato as SrStatoProgetto));
    const persi = inPeriod.filter((p) => STATI_PERSI.includes(p.stato as SrStatoProgetto));
    const decisi = vinti.length + persi.length;
    const conv = decisi > 0 ? Math.round((vinti.length / decisi) * 100) : null;
    // Valore pipeline aperta: media di (min+max)/2 sugli aperti
    const valorePipeline = aperti.reduce(
      (acc, p) => acc + (Number(p.totale_min ?? 0) + Number(p.totale_max ?? 0)) / 2,
      0,
    );
    const valoreVinti = vinti.reduce(
      (acc, p) => acc + (Number(p.totale_min ?? 0) + Number(p.totale_max ?? 0)) / 2,
      0,
    );
    const ticketMedio = vinti.length > 0 ? valoreVinti / vinti.length : null;
    return {
      totale: inPeriod.length,
      aperti: aperti.length,
      vinti: vinti.length,
      persi: persi.length,
      conv,
      valorePipeline,
      valoreVinti,
      ticketMedio,
    };
  }, [progetti, cutoff]);

  const resetFiltri = () => {
    setSearch("");
    setStatoGroup("all");
    setFiltroStato("all");
    setPeriodo("all");
    setSortBy("recent");
  };

  return (
    <TooltipProvider delayDuration={200}>
    <div className="min-h-screen bg-slate-50">
      {/* HERO HEADER gradient navy + accent arancione */}
      <div
        className="relative overflow-hidden text-white"
        style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2C5184 100%)" }}
      >
        <div
          className="absolute -top-1/3 -right-10 w-2/5 h-[160%] pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(249,115,22,0.20) 0%, transparent 60%)",
          }}
        />
        <div
          className="absolute right-8 top-6 opacity-10 select-none"
          aria-hidden
        >
          <RectangleVertical className="h-28 w-28" strokeWidth={1.5} />
        </div>
        <div className="relative max-w-[1400px] mx-auto px-4 sm:px-8 py-6 sm:py-8 flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-widest font-semibold mb-1 text-orange-200">
              ★ MARKETING & VENDITA
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
              <RectangleVertical className="h-7 w-7 text-orange-400" />
              Preventivatore Serramenti
            </h1>
            <p className="text-sm text-blue-100 mt-1">
              I tuoi preventivi di finestre, porte e persiane sotto controllo.
            </p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              onClick={() => navigate("/azienda/impostazioni/template-preventivi?tab=moduli-vendita&modulo=serramenti")}
              size="lg"
              variant="outline"
              className="bg-white/10 backdrop-blur border-white/20 text-white hover:bg-white/20 flex-1 sm:flex-initial"
            >
              <Settings className="h-4 w-4 mr-1.5" />
              Impostazioni
            </Button>
            <Button
              onClick={() => navigate("/azienda/serramenti/nuovo")}
              size="lg"
              className="bg-gradient-to-br from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500 text-white shadow-lg border-0 flex-1 sm:flex-initial"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Nuovo preventivo
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-5 sm:py-6 space-y-4 sm:space-y-5">
        {/* KPI Dashboard — 6 KPI, brand-coerent */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard
            label="Totale preventivi"
            value={stats.totale}
            icon={<FileText className="h-4 w-4" />}
            tone="slate"
            onClick={() => setStatoGroup("all")}
            active={statoGroup === "all"}
          />
          <KpiCard
            label="Aperte (pipeline)"
            value={stats.aperti}
            icon={<Layers className="h-4 w-4" />}
            tone="navy"
            hint={stats.valorePipeline > 0 ? fmtEur(stats.valorePipeline) : undefined}
            onClick={() => setStatoGroup("aperti")}
            active={statoGroup === "aperti"}
          />
          <KpiCard
            label="Vinte (contratti)"
            value={stats.vinti}
            icon={<Trophy className="h-4 w-4" />}
            tone="orange"
            hint={stats.valoreVinti > 0 ? fmtEur(stats.valoreVinti) : undefined}
            onClick={() => setStatoGroup("vinti")}
            active={statoGroup === "vinti"}
          />
          <KpiCard
            label="Perse"
            value={stats.persi}
            icon={<XCircle className="h-4 w-4" />}
            tone="rose"
            onClick={() => setStatoGroup("persi")}
            active={statoGroup === "persi"}
          />
          <KpiCard
            label="Tasso conversione"
            value={stats.conv != null ? `${stats.conv}` : "—"}
            unit={stats.conv != null ? "%" : undefined}
            icon={<TrendingUp className="h-4 w-4" />}
            tone="emerald"
            hint={stats.vinti + stats.persi > 0 ? `su ${stats.vinti + stats.persi} decise` : "no dati"}
          />
          <KpiCard
            label="Ticket medio"
            value={stats.ticketMedio != null ? Math.round(stats.ticketMedio).toLocaleString("it-IT") : "—"}
            unit={stats.ticketMedio != null ? "€" : undefined}
            icon={<Wallet className="h-4 w-4" />}
            tone="slate"
            hint={stats.vinti > 0 ? `su ${stats.vinti} vint${stats.vinti === 1 ? "a" : "e"}` : undefined}
          />
        </div>

        {/* Filtri */}
        <Card>
          <CardContent className="p-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Cerca per codice, cliente o città…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            <Select value={filtroStato} onValueChange={setFiltroStato}>
              <SelectTrigger className="w-full sm:w-44 h-9">
                <SelectValue placeholder="Stato" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli stati</SelectItem>
                {(Object.keys(STATI_LABEL) as SrStatoProgetto[]).map((k) => (
                  <SelectItem key={k} value={k}>{STATI_LABEL[k].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={periodo} onValueChange={(v) => setPeriodo(v as PeriodKey)}>
              <SelectTrigger className="w-full sm:w-40 h-9">
                <SelectValue placeholder="Periodo" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((k) => (
                  <SelectItem key={k} value={k}>{PERIOD_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="w-full sm:w-44 h-9">
                <SelectValue placeholder="Ordina" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Più recenti</SelectItem>
                <SelectItem value="value_desc">Importo (alto → basso)</SelectItem>
                <SelectItem value="value_asc">Importo (basso → alto)</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground ml-auto">
              {progettiFiltrati.length} di {progetti.length}
            </span>
            {(search || statoGroup !== "all" || filtroStato !== "all" || periodo !== "all" || sortBy !== "recent") && (
              <Button variant="ghost" size="sm" onClick={resetFiltri} className="h-9 text-xs gap-1">
                <Filter className="h-3.5 w-3.5" />
                Azzera filtri
              </Button>
            )}
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
                <p className="text-sm text-rose-700 font-medium">Impossibile caricare i preventivi.</p>
                <p className="text-xs text-muted-foreground">
                  Controlla la connessione e riprova.
                </p>
                <Button size="sm" variant="outline" onClick={() => refetch()} className="gap-1">
                  <Loader2 className="h-3.5 w-3.5" /> Riprova
                </Button>
              </div>
            ) : progetti.length === 0 ? (
              <EmptyStateFirstTime onCreate={() => navigate("/azienda/serramenti/nuovo")} onConfig={() => navigate("/azienda/impostazioni/template-preventivi?tab=moduli-vendita&modulo=serramenti")} />
            ) : progettiFiltrati.length === 0 ? (
              <EmptyStateNoMatches onReset={resetFiltri} />
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
                        <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-slate-600 text-right">N° pezzi</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-slate-600 text-right">Importo</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-slate-600">Stato</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-slate-600">Aggiornato</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {progettiFiltrati.map((p) => {
                        const statoCfg = STATI_LABEL[p.stato as SrStatoProgetto] ?? STATI_LABEL.bozza;
                        const cliente = [p.cliente_nome, p.cliente_cognome].filter(Boolean).join(" ");
                        const isAperto = STATI_APERTI.includes(p.stato as SrStatoProgetto);
                        return (
                          <TableRow
                            key={p.id}
                            className="cursor-pointer hover:bg-orange-50/40 transition-colors"
                            onClick={() => navigate(`/azienda/serramenti/${p.id}/modifica`)}
                          >
                            <TableCell className="font-mono text-xs font-semibold text-orange-600">
                              {p.code}
                            </TableCell>
                            <TableCell className="text-xs">
                              <div className="font-medium text-slate-900">
                                {cliente || <span className="text-muted-foreground">—</span>}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-slate-600">
                              {p.cantiere_citta ?? <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-xs text-right tabular-nums">{p.totale_serramenti ?? 0}</TableCell>
                            <TableCell className="text-xs text-right tabular-nums font-medium">
                              {p.totale_min && p.totale_max ? (
                                <span>
                                  {fmtEur(Number(p.totale_min))} – {fmtEur(Number(p.totale_max))}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={cn("text-[10px] font-medium", statoCfg.className)}>
                                {isAperto && <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1 animate-pulse" />}
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
                                {p.pdf_url && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button asChild size="icon" variant="ghost" className="h-7 w-7" aria-label="Apri PDF">
                                        <a href={p.pdf_url} target="_blank" rel="noopener noreferrer">
                                          <ExternalLink className="h-3.5 w-3.5 text-orange-600" />
                                        </a>
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Apri PDF</TooltipContent>
                                  </Tooltip>
                                )}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon" variant="ghost" className="h-7 w-7"
                                      onClick={() => setToDelete({ id: p.id, code: p.code })}
                                      aria-label="Elimina"
                                    >
                                      <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Elimina</TooltipContent>
                                </Tooltip>
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
                    const statoCfg = STATI_LABEL[p.stato as SrStatoProgetto] ?? STATI_LABEL.bozza;
                    const cliente = [p.cliente_nome, p.cliente_cognome].filter(Boolean).join(" ");
                    const isAperto = STATI_APERTI.includes(p.stato as SrStatoProgetto);
                    return (
                      <div
                        key={p.id}
                        className="rounded-lg border bg-card p-3 space-y-2 cursor-pointer hover:bg-orange-50/30"
                        onClick={() => navigate(`/azienda/serramenti/${p.id}/modifica`)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-mono text-xs font-semibold text-orange-600">{p.code}</span>
                              <Badge variant="outline" className={cn("text-[10px] font-medium", statoCfg.className)}>
                                {isAperto && <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1 animate-pulse" />}
                                {statoCfg.label}
                              </Badge>
                            </div>
                            <p className="text-sm font-medium truncate">{cliente || "—"}</p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {p.cantiere_citta ?? "—"} · {p.totale_serramenti ?? 0} pezzi
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium tabular-nums">
                            {p.totale_min && p.totale_max ? (
                              <>{fmtEur(Number(p.totale_min))} – {fmtEur(Number(p.totale_max))}</>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {p.updated_at ? format(new Date(p.updated_at), "d MMM yyyy", { locale: it }) : "—"}
                          </span>
                        </div>
                        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                          {p.pdf_url && (
                            <Button asChild size="sm" variant="outline" className="flex-1 h-8 text-xs">
                              <a href={p.pdf_url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3.5 w-3.5 mr-1.5 text-orange-600" /> PDF
                              </a>
                            </Button>
                          )}
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

      {/* Confirm delete */}
      <AlertDialog
        open={!!toDelete}
        onOpenChange={(o) => {
          if (!o && !deleteMut.isPending) setToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il preventivo {toDelete?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              Verranno eliminati anche serramenti, accessori e foto associati. L'azione non è reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              disabled={deleteMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!toDelete) return;
                deleteMut.mutate(toDelete.id, {
                  onSettled: () => setToDelete(null),
                });
              }}
            >
              {deleteMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  );
}

/* ─── Componenti interni ──────────────────────────────────────────────── */

type KpiTone = "slate" | "navy" | "orange" | "rose" | "emerald";

const TONE_CLASS: Record<KpiTone, { border: string; iconBg: string; iconText: string; valueText: string }> = {
  slate:   { border: "border-l-slate-400",         iconBg: "bg-slate-100",         iconText: "text-slate-600",         valueText: "text-slate-900" },
  navy:    { border: "border-l-[#173b67]",         iconBg: "bg-blue-50",           iconText: "text-[#173b67]",         valueText: "text-[#173b67]" },
  orange:  { border: "border-l-orange-500",        iconBg: "bg-orange-100",        iconText: "text-orange-600",        valueText: "text-orange-600" },
  rose:    { border: "border-l-rose-400",          iconBg: "bg-rose-100",          iconText: "text-rose-600",          valueText: "text-rose-700" },
  emerald: { border: "border-l-emerald-500",       iconBg: "bg-emerald-100",       iconText: "text-emerald-600",       valueText: "text-emerald-700" },
};

function KpiCard({
  label, value, unit, icon, tone = "slate", hint, onClick, active,
}: {
  label: string;
  value: string | number;
  unit?: string;
  icon: React.ReactNode;
  tone?: KpiTone;
  hint?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const c = TONE_CLASS[tone];
  const clickable = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={cn(
        "text-left bg-white border-l-4 rounded-lg shadow-sm transition-all p-3 sm:p-4",
        c.border,
        clickable && "hover:shadow-md hover:-translate-y-0.5 cursor-pointer",
        !clickable && "cursor-default",
        active && "ring-2 ring-offset-1 ring-orange-300",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] sm:text-[11px] font-medium text-muted-foreground uppercase tracking-wide truncate">
          {label}
        </p>
        <span className={cn("h-7 w-7 rounded-md flex items-center justify-center shrink-0", c.iconBg, c.iconText)}>
          {icon}
        </span>
      </div>
      <p className={cn("text-2xl font-bold mt-1 tabular-nums", c.valueText)}>
        {value}
        {unit && <span className="text-base font-normal ml-0.5">{unit}</span>}
      </p>
      {hint && (
        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{hint}</p>
      )}
    </button>
  );
}

function EmptyStateFirstTime({
  onCreate, onConfig,
}: { onCreate: () => void; onConfig: () => void }) {
  return (
    <div className="p-8 md:p-12 text-center">
      <div className="relative inline-block mb-4">
        <div className="h-20 w-20 rounded-full bg-orange-50 flex items-center justify-center">
          <RectangleVertical className="h-10 w-10 text-orange-600" />
        </div>
        <div className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-amber-100 border-2 border-white flex items-center justify-center">
          <Plus className="h-4 w-4 text-amber-700" />
        </div>
      </div>
      <h3 className="text-lg font-bold text-slate-900 mb-1">
        Crea il tuo primo preventivo Serramenti
      </h3>
      <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
        Preventivo professionale con BOM, Ecobonus, ROI 10 anni e firma digitale. Il cliente firma dal cellulare.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-w-md mx-auto mb-5 text-[11px] text-slate-600">
        <div className="rounded-md bg-orange-50/50 border border-orange-100 p-2">
          📋 BOM completo
          <p className="text-[10px] text-muted-foreground mt-0.5">Tipologia, vetro, misure</p>
        </div>
        <div className="rounded-md bg-orange-50/50 border border-orange-100 p-2">
          💰 ROI 10 anni
          <p className="text-[10px] text-muted-foreground mt-0.5">Risparmio + Ecobonus</p>
        </div>
        <div className="rounded-md bg-orange-50/50 border border-orange-100 p-2">
          ✍️ Firma digitale
          <p className="text-[10px] text-muted-foreground mt-0.5">Cliente firma online</p>
        </div>
      </div>
      <div className="flex gap-2 justify-center flex-wrap">
        <Button onClick={onCreate} className="bg-orange-500 hover:bg-orange-600 gap-2">
          <Plus className="h-4 w-4" /> Crea il primo preventivo
        </Button>
        <Button variant="outline" onClick={onConfig} className="gap-2">
          <Settings className="h-4 w-4" /> Configura template
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground mt-4">
        💡 <strong>Suggerimento:</strong> imposta logo, recensioni e USP nel template — ogni preventivo li userà automaticamente.
      </p>
    </div>
  );
}

function EmptyStateNoMatches({ onReset }: { onReset: () => void }) {
  return (
    <div className="p-10 text-center">
      <Search className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
      <p className="text-sm font-medium">Nessun risultato con i filtri attuali</p>
      <p className="text-xs text-muted-foreground mt-1">Prova a modificare i criteri di ricerca o azzera i filtri.</p>
      <Button variant="ghost" size="sm" onClick={onReset} className="mt-3 text-xs gap-1">
        <Filter className="h-3.5 w-3.5" />
        Azzera filtri
      </Button>
    </div>
  );
}
