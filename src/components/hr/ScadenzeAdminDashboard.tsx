/**
 * Dashboard admin scadenze documenti operai.
 * KPI semaforo + tabella filtrata + export CSV.
 */
import { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import {
  AlertTriangle, Clock, ShieldCheck, Shield, Download, Filter,
  Loader2, Users, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useDocumentiCompany, useScadenzeKPI } from "@/hooks/useDocumentiOperaio";
import { useTipiDocumento } from "@/hooks/useDocumentiOperaio";
import { statoColor, statoLabel, giorniAllaScadenza } from "@/types/documenti";
import type { StatoScadenza } from "@/types/documenti";

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({
  icon: Icon, label, value, color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-4 ${color}`}>
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/60">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold leading-none">{value}</p>
        <p className="text-xs mt-0.5 font-medium">{label}</p>
      </div>
    </div>
  );
}

// ── Export CSV ────────────────────────────────────────────────────────────────
function exportCSV(rows: ReturnType<typeof useDocumentiCompany>["data"]) {
  if (!rows?.length) return;
  const headers = ["Operaio", "Tipo documento", "Data emissione", "Data scadenza", "Giorni mancanti", "Stato"];
  const csvRows = rows.map(r => {
    const nome = r.operaio
      ? `${r.operaio.first_name ?? ""} ${r.operaio.last_name ?? ""}`.trim()
      : "—";
    const giorni = giorniAllaScadenza(r.data_scadenza);
    return [
      nome,
      r.tipo?.nome ?? "—",
      r.data_emissione
        ? format(parseISO(r.data_emissione), "dd/MM/yyyy") : "",
      r.data_scadenza
        ? format(parseISO(r.data_scadenza), "dd/MM/yyyy") : "",
      giorni !== null ? String(giorni) : "",
      statoLabel(r.stato),
    ].map(v => `"${v.replace(/"/g, '""')}"`).join(",");
  });
  const csv = [headers.join(","), ...csvRows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `scadenze_documenti_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Dashboard principale ──────────────────────────────────────────────────────
export function ScadenzeAdminDashboard() {
  const { data: documenti = [], isLoading } = useDocumentiCompany();
  const { data: tipi = [] } = useTipiDocumento();
  const kpi = useScadenzeKPI();

  const [filtroStato, setFiltroStato] = useState<StatoScadenza | "tutti">("tutti");
  const [filtroTipo, setFiltroTipo] = useState<string>("tutti");
  const [filtroOperaio, setFiltroOperaio] = useState("");

  // Documenti con scadenza per la tabella
  const rows = useMemo(() => {
    return documenti
      .filter(d => d.data_scadenza !== null || d.stato === "scaduto")
      .filter(d => filtroStato === "tutti" || d.stato === filtroStato)
      .filter(d => filtroTipo === "tutti" || d.tipo_id === filtroTipo)
      .filter(d => {
        if (!filtroOperaio.trim()) return true;
        const nome = d.operaio
          ? `${d.operaio.first_name ?? ""} ${d.operaio.last_name ?? ""}`.toLowerCase()
          : "";
        return nome.includes(filtroOperaio.toLowerCase().trim());
      })
      .sort((a, b) => {
        const orderMap: Record<StatoScadenza, number> = { scaduto: 0, in_scadenza: 1, valido: 2, senza_scadenza: 3 };
        const diff = orderMap[a.stato] - orderMap[b.stato];
        if (diff !== 0) return diff;
        const ga = giorniAllaScadenza(a.data_scadenza) ?? 9999;
        const gb = giorniAllaScadenza(b.data_scadenza) ?? 9999;
        return ga - gb;
      });
  }, [documenti, filtroStato, filtroTipo, filtroOperaio]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={AlertTriangle} label="Scaduti"
          value={kpi.scaduti}
          color="border-red-200 bg-red-50 text-red-700"
        />
        <KpiCard
          icon={Clock} label="Scadono entro 30gg"
          value={kpi.in_scadenza_30}
          color="border-amber-200 bg-amber-50 text-amber-700"
        />
        <KpiCard
          icon={Clock} label="Scadono entro 60gg"
          value={kpi.in_scadenza_60}
          color="border-yellow-200 bg-yellow-50 text-yellow-700"
        />
        <KpiCard
          icon={ShieldCheck} label="Validi"
          value={kpi.validi}
          color="border-green-200 bg-green-50 text-green-700"
        />
      </div>

      {/* Filtri + Export */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          Filtri
        </div>
        <Input
          placeholder="Cerca operaio…"
          value={filtroOperaio}
          onChange={e => setFiltroOperaio(e.target.value)}
          className="w-40"
        />
        <Select value={filtroStato} onValueChange={v => setFiltroStato(v as StatoScadenza | "tutti")}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti gli stati</SelectItem>
            <SelectItem value="scaduto">Scaduti</SelectItem>
            <SelectItem value="in_scadenza">In scadenza</SelectItem>
            <SelectItem value="valido">Validi</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti i tipi</SelectItem>
            {tipi.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          variant="outline" size="sm" className="ml-auto"
          onClick={() => exportCSV(rows)}
          disabled={rows.length === 0}
        >
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Export CSV ({rows.length})
        </Button>
      </div>

      {/* Tabella */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
          <Shield className="h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            {documenti.length === 0
              ? "Nessun documento caricato"
              : "Nessun documento corrisponde ai filtri"}
          </p>
          {documenti.length === 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Carica i documenti degli operai dalla scheda individuale
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="font-semibold">Operaio</TableHead>
                <TableHead className="font-semibold">Tipo documento</TableHead>
                <TableHead className="font-semibold">Scadenza</TableHead>
                <TableHead className="font-semibold">Mancanti</TableHead>
                <TableHead className="font-semibold">Stato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(doc => {
                const nome = doc.operaio
                  ? `${doc.operaio.first_name ?? ""} ${doc.operaio.last_name ?? ""}`.trim()
                  : "—";
                const giorni = giorniAllaScadenza(doc.data_scadenza);
                return (
                  <TableRow
                    key={doc.id}
                    className={
                      doc.stato === "scaduto"     ? "bg-red-50/50 hover:bg-red-50" :
                      doc.stato === "in_scadenza" ? "bg-amber-50/50 hover:bg-amber-50" : ""
                    }
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium">{nome}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm">{doc.tipo?.nome ?? "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {doc.data_scadenza
                        ? format(parseISO(doc.data_scadenza), "d MMM yyyy", { locale: it })
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {giorni === null ? (
                        <span className="text-muted-foreground text-sm">—</span>
                      ) : doc.stato === "scaduto" ? (
                        <span className="font-semibold text-red-600 text-sm">{Math.abs(giorni)}gg fa</span>
                      ) : giorni <= 30 ? (
                        <span className="font-semibold text-amber-600 text-sm">tra {giorni}gg</span>
                      ) : giorni <= 60 ? (
                        <span className="font-semibold text-yellow-600 text-sm">tra {giorni}gg</span>
                      ) : (
                        <span className="text-green-600 text-sm">tra {giorni}gg</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] py-0 px-1.5 ${statoColor(doc.stato)}`}
                      >
                        {statoLabel(doc.stato)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
