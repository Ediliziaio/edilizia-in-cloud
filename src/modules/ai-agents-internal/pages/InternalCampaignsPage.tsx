import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Play, Pause, Trash2, Phone, CheckCircle2, BarChart3, Megaphone, FileDown } from "lucide-react";
import { useInternalCampaigns } from "../hooks/useInternalCampaigns";
import { CampaignBuilder } from "../components/CampaignBuilder";
import type { CampaignStatus, InternalCampaign } from "../types/internalAgent.types";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Bozza", variant: "secondary" },
  scheduled: { label: "Programmata", variant: "outline" },
  running: { label: "In corso", variant: "default" },
  completed: { label: "Completata", variant: "secondary" },
  paused: { label: "In pausa", variant: "destructive" },
};

export default function InternalCampaignsPage() {
  const { campaigns, isLoading, stats, updateStatus, deleteCampaign, startCampaign } = useInternalCampaigns();
  const [showBuilder, setShowBuilder] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = statusFilter === "all" ? campaigns : campaigns.filter((c) => c.status === statusFilter);

  const responseRate = stats && stats.totalCalls > 0
    ? Math.round((stats.totalAnswered / stats.totalCalls) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Campagne Outbound</h1>
          <p className="text-muted-foreground text-sm">Gestisci campagne di chiamate in uscita con agenti interni</p>
        </div>
        <Button onClick={() => setShowBuilder(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nuova Campagna
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Attive</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold flex items-center gap-2"><Megaphone className="h-5 w-5 text-primary" />{stats?.active ?? 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Completate</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-primary/70" />{stats?.completed ?? 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Chiamate Totali</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold flex items-center gap-2"><Phone className="h-5 w-5 text-primary/60" />{stats?.totalCalls ?? 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Tasso Risposta</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary/50" />{responseRate}%</div></CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filtra per stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            <SelectItem value="draft">Bozza</SelectItem>
            <SelectItem value="scheduled">Programmata</SelectItem>
            <SelectItem value="running">In corso</SelectItem>
            <SelectItem value="completed">Completata</SelectItem>
            <SelectItem value="paused">In pausa</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="text-right">Chiamate</TableHead>
                <TableHead className="text-right">Risposte</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Caricamento...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nessuna campagna trovata</TableCell></TableRow>
              ) : (
                filtered.map((c) => (
                  <CampaignRow
                    key={c.id}
                    campaign={c}
                    onStart={() => startCampaign.mutate(c.id)}
                    onPause={() => updateStatus.mutate({ id: c.id, status: "paused" })}
                    onDelete={() => deleteCampaign.mutate(c.id)}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {showBuilder && <CampaignBuilder open={showBuilder} onClose={() => setShowBuilder(false)} />}
    </div>
  );
}

function exportCampaignPdf(c: InternalCampaign) {
  const responseRate = c.total_calls > 0
    ? Math.round((c.calls_answered / c.total_calls) * 100)
    : 0;

  const html = `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">
    <title>Report Campagna: ${c.name}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 40px; color: #111; }
      h1 { color: #1a56db; border-bottom: 2px solid #1a56db; padding-bottom: 8px; }
      table { width: 100%; border-collapse: collapse; margin: 20px 0; }
      th { background: #f3f4f6; text-align: left; padding: 8px 12px; border: 1px solid #e5e7eb; }
      td { padding: 8px 12px; border: 1px solid #e5e7eb; }
      .stat { display: inline-block; background: #eff6ff; padding: 8px 16px; border-radius: 8px; margin: 4px; text-align: center; }
      .stat-value { font-size: 24px; font-weight: bold; color: #1a56db; }
      .stat-label { font-size: 12px; color: #6b7280; }
    </style>
    </head><body>
    <h1>Report Campagna: ${c.name}</h1>
    <p>Generato il ${format(new Date(), "d MMMM yyyy 'alle' HH:mm", { locale: it })}</p>
    <table>
      <tr><th>Campo</th><th>Valore</th></tr>
      <tr><td>Tipo</td><td>${c.campaign_type.replace(/_/g, " ")}</td></tr>
      <tr><td>Stato</td><td>${STATUS_BADGE[c.status]?.label || c.status}</td></tr>
      <tr><td>Data creazione</td><td>${format(new Date(c.created_at), "dd/MM/yyyy HH:mm", { locale: it })}</td></tr>
      ${c.scheduled_at ? `<tr><td>Programmata per</td><td>${format(new Date(c.scheduled_at), "dd/MM/yyyy HH:mm", { locale: it })}</td></tr>` : ""}
    </table>
    <h2>Risultati</h2>
    <div style="display:flex; flex-wrap:wrap; gap:8px; margin: 16px 0;">
      <div class="stat"><div class="stat-value">${c.total_calls}</div><div class="stat-label">Chiamate totali</div></div>
      <div class="stat"><div class="stat-value">${c.calls_answered}</div><div class="stat-label">Risposte</div></div>
      <div class="stat"><div class="stat-value">${c.calls_failed ?? 0}</div><div class="stat-label">Fallite</div></div>
      <div class="stat"><div class="stat-value">${responseRate}%</div><div class="stat-label">Tasso risposta</div></div>
    </div>
    </body></html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 500);
}

function CampaignRow({ campaign: c, onStart, onPause, onDelete }: {
  campaign: InternalCampaign;
  onStart: () => void;
  onPause: () => void;
  onDelete: () => void;
}) {
  const badge = STATUS_BADGE[c.status] || STATUS_BADGE.draft;
  return (
    <TableRow>
      <TableCell className="font-medium">{c.name}</TableCell>
      <TableCell className="capitalize">{c.campaign_type.replace("_", " ")}</TableCell>
      <TableCell><Badge variant={badge.variant}>{badge.label}</Badge></TableCell>
      <TableCell className="text-right">{c.total_calls}</TableCell>
      <TableCell className="text-right">{c.calls_answered}</TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {format(new Date(c.created_at), "dd MMM yyyy", { locale: it })}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          {(c.status === "draft" || c.status === "scheduled" || c.status === "paused") && (
            <Button size="icon" variant="ghost" onClick={onStart} title="Avvia">
              <Play className="h-4 w-4" />
            </Button>
          )}
          {c.status === "running" && (
            <Button size="icon" variant="ghost" onClick={onPause} title="Pausa">
              <Pause className="h-4 w-4" />
            </Button>
          )}
          {(c.status === "completed" || c.total_calls > 0) && (
            <Button size="icon" variant="ghost" onClick={() => exportCampaignPdf(c)} title="Esporta PDF">
              <FileDown className="h-4 w-4" />
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" title="Elimina">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminare la campagna?</AlertDialogTitle>
                <AlertDialogDescription>Questa azione non può essere annullata.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete}>Elimina</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TableCell>
    </TableRow>
  );
}
