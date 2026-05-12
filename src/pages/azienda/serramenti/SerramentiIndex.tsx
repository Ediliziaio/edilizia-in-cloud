/**
 * SerramentiIndex — landing del modulo Stima Serramenti.
 *
 * Lista progetti dell'azienda + filtri + CTA "Nuova stima".
 * Mirror dello stile di FotovoltaicoIndex ma più snello.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  RectangleVertical, Plus, Search, Trash2, ExternalLink, Loader2,
  ChevronRight, Settings,
} from "lucide-react";
import { useProgetti, useDeleteProgetto } from "@/lib/serramenti/queries";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const STATI_LABEL: Record<string, { label: string; className: string }> = {
  bozza:           { label: "Bozza",          className: "bg-slate-100 text-slate-700" },
  da_consegnare:   { label: "Da consegnare",  className: "bg-amber-100 text-amber-700" },
  consegnato:      { label: "Consegnato",     className: "bg-sky-100 text-sky-700" },
  in_valutazione:  { label: "In valutazione", className: "bg-indigo-100 text-indigo-700" },
  accettato:       { label: "Accettato",      className: "bg-orange-100 text-orange-700" },
  rifiutato:       { label: "Rifiutato",      className: "bg-rose-100 text-rose-700" },
  scaduto:         { label: "Scaduto",        className: "bg-slate-100 text-slate-500" },
  archiviato:      { label: "Archiviato",     className: "bg-slate-100 text-slate-400" },
};

export default function SerramentiIndex() {
  const navigate = useNavigate();
  const { data: progetti = [], isLoading } = useProgetti();
  const deleteMut = useDeleteProgetto();

  const [search, setSearch] = useState("");
  const [filtroStato, setFiltroStato] = useState<string>("all");
  const [toDelete, setToDelete] = useState<{ id: string; code: string } | null>(null);

  const progettiFiltrati = useMemo(() => {
    const s = search.trim().toLowerCase();
    return progetti.filter((p) => {
      if (filtroStato !== "all" && p.stato !== filtroStato) return false;
      if (s) {
        const blob = `${p.code ?? ""} ${p.cliente_nome ?? ""} ${p.cliente_cognome ?? ""} ${p.cantiere_citta ?? ""}`.toLowerCase();
        if (!blob.includes(s)) return false;
      }
      return true;
    });
  }, [progetti, search, filtroStato]);

  const stats = useMemo(() => {
    const totale = progetti.length;
    const bozze = progetti.filter((p) => p.stato === "bozza").length;
    const consegnati = progetti.filter((p) => p.stato === "consegnato" || p.stato === "in_valutazione").length;
    const accettati = progetti.filter((p) => p.stato === "accettato").length;
    const valore = progetti
      .filter((p) => p.stato === "accettato")
      .reduce((acc, p) => acc + Number(p.totale_max ?? 0), 0);
    return { totale, bozze, consegnati, accettati, valore };
  }, [progetti]);

  return (
    <div className="container mx-auto p-3 md:p-6 max-w-7xl space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <RectangleVertical className="h-6 w-6 text-orange-700" />
            Stima Serramenti
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Crea preventivi professionali per finestre, porte e persiane
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => navigate("/azienda/impostazioni/template-preventivi?tab=moduli-vendita&modulo=serramenti")}
            variant="outline"
            size="lg"
            className="gap-2"
          >
            <Settings className="h-4 w-4" />
            Impostazioni
          </Button>
          <Button
            onClick={() => navigate("/azienda/serramenti/nuovo")}
            className="bg-orange-700 hover:bg-orange-800 gap-2"
            size="lg"
          >
            <Plus className="h-4 w-4" />
            Nuova stima
          </Button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-orange-100">
          <CardContent className="p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Totale stime</p>
            <p className="text-2xl font-bold mt-1">{stats.totale}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Bozze</p>
            <p className="text-2xl font-bold mt-1 text-slate-600">{stats.bozze}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">In valutazione</p>
            <p className="text-2xl font-bold mt-1 text-sky-700">{stats.consegnati}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-orange-50 to-white border-orange-200">
          <CardContent className="p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Accettati</p>
            <p className="text-2xl font-bold mt-1 text-orange-700">{stats.accettati}</p>
            {stats.valore > 0 && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                € {stats.valore.toLocaleString("it-IT", { maximumFractionDigits: 0 })}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filtri */}
      <Card>
        <CardContent className="p-3 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Cerca per codice, cliente o città..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <Select value={filtroStato} onValueChange={setFiltroStato}>
            <SelectTrigger className="w-full sm:w-48 h-9">
              <SelectValue placeholder="Tutti gli stati" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              {Object.entries(STATI_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Tabella */}
      <Card>
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm">
            {progettiFiltrati.length} {progettiFiltrati.length === 1 ? "stima" : "stime"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : progettiFiltrati.length === 0 ? (
            progetti.length === 0 ? (
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
                  Inizia la tua prima stima Serramenti
                </h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
                  Crea un preventivo professionale di 3 pagine con BOM serramenti, calcolo Ecobonus, ROI 10 anni e firma digitale. Il cliente lo riceve in un link condivisibile e firma dal cellulare.
                </p>
                <div className="grid grid-cols-3 gap-2 max-w-md mx-auto mb-5 text-[11px] text-slate-600">
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
                  <Button
                    onClick={() => navigate("/azienda/serramenti/nuovo")}
                    className="bg-orange-700 hover:bg-orange-800 gap-2"
                  >
                    <Plus className="h-4 w-4" /> Crea la prima stima
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => navigate("/azienda/impostazioni/template-preventivi?tab=moduli-vendita&modulo=serramenti")}
                    className="gap-2"
                  >
                    ⚙ Configura prima il template
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-4">
                  💡 <strong>Suggerimento:</strong> imposta una volta sola logo, recensioni e USP nel template — ogni preventivo successivo li userà automaticamente.
                </p>
              </div>
            ) : (
              <div className="p-8 text-center">
                <Search className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">
                  Nessun risultato con i filtri attuali.
                </p>
                <Button
                  variant="ghost" size="sm" onClick={() => { setSearch(""); setFiltroStato("all"); }}
                  className="mt-2 text-xs"
                >
                  Pulisci filtri
                </Button>
              </div>
            )
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Codice</TableHead>
                    <TableHead className="text-xs">Cliente</TableHead>
                    <TableHead className="text-xs">Cantiere</TableHead>
                    <TableHead className="text-xs">N° pezzi</TableHead>
                    <TableHead className="text-xs">Importo</TableHead>
                    <TableHead className="text-xs">Stato</TableHead>
                    <TableHead className="text-xs">Aggiornato</TableHead>
                    <TableHead className="text-xs w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {progettiFiltrati.map((p) => {
                    const statoCfg = STATI_LABEL[p.stato] ?? STATI_LABEL.bozza;
                    const cliente = [p.cliente_nome, p.cliente_cognome].filter(Boolean).join(" ");
                    return (
                      <TableRow
                        key={p.id}
                        className="cursor-pointer hover:bg-orange-50/30"
                        onClick={() => navigate(`/azienda/serramenti/${p.id}/modifica`)}
                      >
                        <TableCell className="font-mono text-xs font-semibold text-orange-700">
                          {p.code}
                        </TableCell>
                        <TableCell className="text-xs">
                          {cliente || <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-xs">
                          {p.cantiere_citta ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-xs">{p.totale_serramenti ?? 0}</TableCell>
                        <TableCell className="text-xs">
                          {p.totale_min && p.totale_max ? (
                            <span>
                              € {Number(p.totale_min).toLocaleString("it-IT", { maximumFractionDigits: 0 })} – {" "}
                              € {Number(p.totale_max).toLocaleString("it-IT", { maximumFractionDigits: 0 })}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-[10px]", statoCfg.className)}>
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
                              <Button asChild size="icon" variant="ghost" className="h-7 w-7">
                                <a href={p.pdf_url} target="_blank" rel="noopener noreferrer" title="PDF">
                                  <ExternalLink className="h-3.5 w-3.5 text-orange-700" />
                                </a>
                              </Button>
                            )}
                            <Button
                              size="icon" variant="ghost" className="h-7 w-7"
                              onClick={() => setToDelete({ id: p.id, code: p.code })}
                              title="Elimina"
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
          )}
        </CardContent>
      </Card>

      {/* Confirm delete — il dialog resta aperto mentre la mutation è in
          corso, così l'utente vede lo spinner sul bottone Elimina e capisce
          che l'azione sta procedendo. Si chiude solo a mutation completata. */}
      <AlertDialog
        open={!!toDelete}
        onOpenChange={(o) => {
          if (!o && !deleteMut.isPending) setToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la stima {toDelete?.code}?</AlertDialogTitle>
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
                e.preventDefault(); // evita auto-close del dialog
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
  );
}
