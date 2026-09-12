import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, ExternalLink, ImageOff, Search, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { useMetaAdsReport, ReportLevel } from "@/hooks/useMetaAdsReport";
import type { NormalizedCampaignRow } from "@/lib/metaInsightsNormalizer";
import { RANKING_ETICHETTA, STATO_ETICHETTA } from "@/lib/metaAdsReportModel";
import { cn } from "@/lib/utils";

interface Props {
  report: ReturnType<typeof useMetaAdsReport>;
}

const fmtNum = (n: number) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 }).format(n);
const fmtCurrency = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 2, useGrouping: "always" }).format(n);
const fmtPct = (n: number) => new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + "%";
const fmtDec = (n: number) => new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtX = (n: number) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(n) + "x";

export interface ColonnaReport {
  key: string;
  label: string;
  /** Spiegazione nel drawer colonne e nell'intestazione. */
  aiuto?: string;
  format: (r: NormalizedCampaignRow) => string;
  align?: "right";
  /** Livelli in cui la colonna ha senso (default: tutti). */
  livelli?: ReportLevel[];
}

const budget = (r: NormalizedCampaignRow) => {
  if (r.budget_da_campagna) return "Budget campagna";
  if (r.budget_daily) return `${fmtCurrency(r.budget_daily)}/giorno`;
  if (r.budget_lifetime) return `${fmtCurrency(r.budget_lifetime)} totale`;
  return "—";
};

/** Catalogo unico delle colonne: la usano tabella, drawer ed esportazione. */
export const COLONNE: ColonnaReport[] = [
  { key: "name", label: "Nome", format: (r) => r.name || "—" },
  { key: "account_name", label: "Account BM", aiuto: "Account pubblicitario del Business Manager", format: (r) => r.account_name || r.account_id || "—" },
  { key: "status", label: "Stato", format: (r) => STATO_ETICHETTA[r.status ?? ""]?.testo ?? r.status ?? "—" },
  { key: "budget", label: "Budget", aiuto: "Budget giornaliero o totale impostato su Meta", format: budget, livelli: ["campaign", "adset"] },
  { key: "spend", label: "Spesa", format: (r) => fmtCurrency(r.spend), align: "right" },
  { key: "impressions", label: "Impressioni", format: (r) => fmtNum(r.impressions), align: "right" },
  { key: "reach", label: "Copertura", aiuto: "Persone diverse raggiunte", format: (r) => fmtNum(r.reach), align: "right" },
  { key: "frequency", label: "Frequenza", aiuto: "Quante volte in media la stessa persona ha visto l'annuncio. Sopra 3-4 il pubblico si stanca.", format: (r) => (r.frequency > 0 ? fmtDec(r.frequency) : "—"), align: "right" },
  { key: "link_clicks", label: "Clic sul link", format: (r) => fmtNum(r.link_clicks ?? 0), align: "right" },
  { key: "ctr", label: "CTR (link)", aiuto: "Clic sul link ogni 100 impressioni", format: (r) => (r.impressions > 0 ? fmtPct(r.ctr) : "—"), align: "right" },
  { key: "cpc", label: "CPC (link)", aiuto: "Costo per clic sul link", format: (r) => ((r.link_clicks ?? 0) > 0 ? fmtCurrency(r.cpc) : "—"), align: "right" },
  { key: "cpm", label: "CPM", aiuto: "Costo ogni 1.000 impressioni", format: (r) => (r.impressions > 0 ? fmtCurrency(r.cpm) : "—"), align: "right" },
  { key: "leads", label: "Lead Meta", aiuto: "Lead contati da Meta (moduli e pixel)", format: (r) => fmtNum(r.leads), align: "right" },
  { key: "cpl", label: "Costo per lead", format: (r) => (r.leads > 0 ? fmtCurrency(r.cpl) : "—"), align: "right" },
  { key: "lead_crm", label: "Lead nel CRM", aiuto: "Contatti entrati nel CRM nel periodo da questa campagna / gruppo / inserzione", format: (r) => fmtNum(r.lead_crm ?? 0), align: "right" },
  { key: "opportunita", label: "Trattative", aiuto: "Opportunità nate da quei lead", format: (r) => fmtNum(r.opportunita ?? 0), align: "right" },
  { key: "vinte", label: "Contratti", aiuto: "Opportunità vinte da quei lead, anche se firmate dopo il periodo", format: (r) => fmtNum(r.vinte ?? 0), align: "right" },
  { key: "valore_vinto", label: "Valore contratti", format: (r) => ((r.valore_vinto ?? 0) > 0 ? fmtCurrency(r.valore_vinto ?? 0) : "—"), align: "right" },
  { key: "costo_vinta", label: "Costo per contratto", format: (r) => ((r.vinte ?? 0) > 0 ? fmtCurrency(r.costo_vinta ?? 0) : "—"), align: "right" },
  { key: "roas", label: "ROAS reale", aiuto: "Valore dei contratti diviso la spesa", format: (r) => ((r.valore_vinto ?? 0) > 0 && r.spend > 0 ? fmtX(r.roas ?? 0) : "—"), align: "right" },
  { key: "quality_ranking", label: "Qualità", aiuto: "Classifiche di Meta rispetto agli annunci concorrenti (solo inserzioni con abbastanza impressioni)", format: (r) => RANKING_ETICHETTA[r.quality_ranking ?? ""]?.testo ?? "—", livelli: ["ad"] },
  { key: "clicks", label: "Clic (tutti)", aiuto: "Tutti i clic, anche su mi piace, commenti e foto", format: (r) => fmtNum(r.clicks), align: "right" },
  { key: "purchases", label: "Acquisti (pixel)", format: (r) => fmtNum(r.purchases), align: "right" },
  { key: "revenue", label: "Valore acquisti (pixel)", format: (r) => fmtCurrency(r.revenue), align: "right" },
];

const LIVELLI: { value: ReportLevel; label: string }[] = [
  { value: "campaign", label: "Campagne" },
  { value: "adset", label: "Gruppi di inserzioni" },
  { value: "ad", label: "Inserzioni" },
];

const toni = {
  verde: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  grigio: "bg-slate-100 text-slate-600 hover:bg-slate-100",
  giallo: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  rosso: "bg-red-100 text-red-700 hover:bg-red-100",
};

const StatusBadge = ({ status }: { status?: string }) => {
  if (!status) return <span className="text-muted-foreground text-xs">—</span>;
  const s = STATO_ETICHETTA[status.toUpperCase()];
  return <Badge className={cn("text-xs font-medium whitespace-nowrap", toni[s?.tono ?? "grigio"])}>{s?.testo ?? status}</Badge>;
};

const QualitaBadge = ({ row }: { row: NormalizedCampaignRow }) => {
  const q = RANKING_ETICHETTA[row.quality_ranking ?? ""];
  if (!q) return <span className="text-muted-foreground text-xs">—</span>;
  const righe = [
    ["Qualità", row.quality_ranking],
    ["Interazione", row.engagement_rate_ranking],
    ["Conversione", row.conversion_rate_ranking],
  ] as const;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className={cn("text-xs font-medium whitespace-nowrap cursor-help", toni[q.tono])}>{q.testo.split(" (")[0]}</Badge>
      </TooltipTrigger>
      <TooltipContent className="text-xs space-y-0.5">
        {righe.map(([etichetta, v]) => (
          <p key={etichetta}>{etichetta}: {RANKING_ETICHETTA[v ?? ""]?.testo ?? "dato non disponibile"}</p>
        ))}
      </TooltipContent>
    </Tooltip>
  );
};

/** Verde sotto l'80% della media, rosso sopra il 130%: i costi da guardare. */
function tonoCosto(valore: number, media: number): string {
  if (!(valore > 0) || !(media > 0)) return "";
  if (valore < media * 0.8) return "text-emerald-700 font-medium";
  if (valore > media * 1.3) return "text-red-600 font-medium";
  return "";
}

const CampaignTable = ({ report }: Props) => {
  const navigate = useNavigate();
  const level = report.level;
  const multiAccount = report.adAccounts.length > 1;
  const columns = COLONNE.filter(
    (c) =>
      report.visibleColumns.includes(c.key) &&
      (!c.livelli || c.livelli.includes(level)) &&
      (c.key !== "account_name" || multiAccount),
  );

  // Totali della vista (sommabili; copertura e frequenza no).
  const tot = report.rows.reduce(
    (t, r) => ({
      spend: t.spend + r.spend,
      impressions: t.impressions + r.impressions,
      link_clicks: t.link_clicks + (r.link_clicks ?? 0),
      clicks: t.clicks + r.clicks,
      leads: t.leads + r.leads,
      lead_crm: t.lead_crm + (r.lead_crm ?? 0),
      opportunita: t.opportunita + (r.opportunita ?? 0),
      vinte: t.vinte + (r.vinte ?? 0),
      valore_vinto: t.valore_vinto + (r.valore_vinto ?? 0),
      purchases: t.purchases + r.purchases,
      revenue: t.revenue + r.revenue,
    }),
    { spend: 0, impressions: 0, link_clicks: 0, clicks: 0, leads: 0, lead_crm: 0, opportunita: 0, vinte: 0, valore_vinto: 0, purchases: 0, revenue: 0 },
  );
  const div = (a: number, b: number) => (b > 0 ? a / b : 0);
  const mediaCpl = div(tot.spend, tot.leads);
  const mediaCostoVinta = div(tot.spend, tot.vinte);
  const totali: Record<string, string> = {
    name: "Totale",
    spend: fmtCurrency(tot.spend),
    impressions: fmtNum(tot.impressions),
    reach: "—",
    frequency: "—",
    link_clicks: fmtNum(tot.link_clicks),
    ctr: tot.impressions > 0 ? fmtPct(div(tot.link_clicks * 100, tot.impressions)) : "—",
    cpc: tot.link_clicks > 0 ? fmtCurrency(div(tot.spend, tot.link_clicks)) : "—",
    cpm: tot.impressions > 0 ? fmtCurrency(div(tot.spend * 1000, tot.impressions)) : "—",
    leads: fmtNum(tot.leads),
    cpl: tot.leads > 0 ? fmtCurrency(mediaCpl) : "—",
    lead_crm: fmtNum(tot.lead_crm),
    opportunita: fmtNum(tot.opportunita),
    vinte: fmtNum(tot.vinte),
    valore_vinto: tot.valore_vinto > 0 ? fmtCurrency(tot.valore_vinto) : "—",
    costo_vinta: tot.vinte > 0 ? fmtCurrency(mediaCostoVinta) : "—",
    roas: tot.valore_vinto > 0 && tot.spend > 0 ? fmtX(div(tot.valore_vinto, tot.spend)) : "—",
    clicks: fmtNum(tot.clicks),
    purchases: fmtNum(tot.purchases),
    revenue: fmtCurrency(tot.revenue),
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (report.sortColumn !== col) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return report.sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const cellaNome = (row: NormalizedCampaignRow): ReactNode => {
    const apribile = level !== "ad";
    const sotto =
      level === "campaign"
        ? row.figli ? `${row.figli} ${row.figli === 1 ? "gruppo" : "gruppi"} di inserzioni` : row.objective ? row.objective.replace("OUTCOME_", "").toLowerCase() : ""
        : level === "adset"
          ? [report.drill.campaignId ? null : row.campaign_name, row.figli ? `${row.figli} inserzion${row.figli === 1 ? "e" : "i"}` : null].filter(Boolean).join(" · ")
          : [report.drill.adsetId ? null : row.adset_name, row.creative_title].filter(Boolean).join(" · ");
    return (
      <div className="flex items-center gap-3 min-w-[220px] max-w-[360px]">
        {level === "ad" && (
          row.thumbnail_url ? (
            <a
              href={row.preview_link ?? undefined}
              target="_blank"
              rel="noreferrer"
              className={cn("shrink-0", !row.preview_link && "pointer-events-none")}
              title={row.preview_link ? "Apri l'anteprima su Facebook" : undefined}
            >
              <img src={row.thumbnail_url} alt="" loading="lazy" className="h-11 w-11 rounded-md object-cover border" />
            </a>
          ) : (
            <div className="h-11 w-11 shrink-0 rounded-md border bg-muted flex items-center justify-center">
              <ImageOff className="h-4 w-4 text-muted-foreground" />
            </div>
          )
        )}
        <div className="min-w-0">
          {apribile ? (
            <button
              type="button"
              onClick={() => (level === "campaign" ? report.apriCampagna(row) : report.apriGruppo(row))}
              className="group/nome flex items-center gap-1 text-left font-medium text-primary hover:underline"
              title={level === "campaign" ? "Vedi i gruppi di inserzioni" : "Vedi le inserzioni"}
            >
              <span className="truncate">{row.name || "—"}</span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50 group-hover/nome:opacity-100" />
            </button>
          ) : (
            <div className="flex items-center gap-1 font-medium">
              <span className="truncate" title={row.name}>{row.name || "—"}</span>
              {row.preview_link && (
                <a href={row.preview_link} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" title="Anteprima su Facebook">
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}
          {sotto && <p className="truncate text-xs text-muted-foreground" title={sotto}>{sotto}</p>}
        </div>
      </div>
    );
  };

  const cella = (col: ColonnaReport, row: NormalizedCampaignRow): ReactNode => {
    if (col.key === "name") return cellaNome(row);
    if (col.key === "status") return <StatusBadge status={row.status} />;
    if (col.key === "quality_ranking") return <QualitaBadge row={row} />;
    const tono =
      col.key === "cpl" && row.leads > 0 ? tonoCosto(row.cpl, mediaCpl)
        : col.key === "costo_vinta" && (row.vinte ?? 0) > 0 ? tonoCosto(row.costo_vinta ?? 0, mediaCostoVinta)
          : col.key === "frequency" && row.frequency > 4 ? "text-amber-700 font-medium"
            : "";
    return <span className={cn("text-sm", tono)}>{col.format(row)}</span>;
  };

  const unita = level === "ad" ? "inserzioni" : level === "adset" ? "gruppi di inserzioni" : "campagne";

  return (
    <TooltipProvider delayDuration={200}>
      <Card className="overflow-hidden">
        {/* Livelli: campagne → gruppi → inserzioni */}
        <div className="flex flex-wrap items-center gap-1 border-b px-3 pt-3">
          {LIVELLI.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => report.setLevel(l.value)}
              className={cn(
                "-mb-px flex items-center gap-2 border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors",
                level === l.value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {l.label}
              <span className={cn("rounded-full px-1.5 py-0.5 text-[11px] tabular-nums", level === l.value ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                {report.isLoading ? "…" : report.conteggi[l.value]}
              </span>
            </button>
          ))}
        </div>

        {/* Percorso */}
        {(report.drill.campaignId || report.drill.adsetId) && level !== "campaign" && (
          <div className="flex flex-wrap items-center gap-1 border-b bg-primary/5 px-4 py-2 text-xs">
            <button type="button" className="text-primary hover:underline" onClick={() => report.setLevel("campaign")}>
              Tutte le campagne
            </button>
            {report.drill.campaignId && (
              <>
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                {level === "ad" ? (
                  <button type="button" className="text-primary hover:underline max-w-[280px] truncate" onClick={() => report.setLevel("adset")}>
                    {report.drill.campaignName}
                  </button>
                ) : (
                  <span className="font-medium max-w-[280px] truncate">{report.drill.campaignName}</span>
                )}
              </>
            )}
            {report.drill.adsetId && level === "ad" && (
              <>
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                <span className="font-medium max-w-[280px] truncate">{report.drill.adsetName}</span>
              </>
            )}
          </div>
        )}

        {/* Filtri */}
        <div className="flex flex-wrap items-center gap-2 p-3 border-b bg-muted/30">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder={`Cerca ${unita}...`}
              value={report.filters.search}
              onChange={(e) => report.setFilters({ ...report.filters, search: e.target.value })}
              className="pl-8 h-8 text-xs"
            />
          </div>

          <Select
            value={report.filters.status}
            onValueChange={(v) => report.setFilters({ ...report.filters, status: v as typeof report.filters.status })}
          >
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              <SelectItem value="ACTIVE">Attive</SelectItem>
              <SelectItem value="PAUSED">In pausa</SelectItem>
            </SelectContent>
          </Select>

          {report.objectives.length > 1 && (
            <Select
              value={report.filters.objective || "all"}
              onValueChange={(v) => report.setFilters({ ...report.filters, objective: v === "all" ? "" : v })}
            >
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue placeholder="Obiettivo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli obiettivi</SelectItem>
                {report.objectives.map((o) => (
                  <SelectItem key={o} value={o!}>{o!.replace("OUTCOME_", "").toLowerCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Input
            type="number"
            placeholder="Spesa min"
            value={report.filters.minSpend ?? ""}
            onChange={(e) => report.setFilters({ ...report.filters, minSpend: e.target.value ? Number(e.target.value) : null })}
            className="w-[90px] h-8 text-xs"
          />
          <Input
            type="number"
            placeholder="Spesa max"
            value={report.filters.maxSpend ?? ""}
            onChange={(e) => report.setFilters({ ...report.filters, maxSpend: e.target.value ? Number(e.target.value) : null })}
            className="w-[90px] h-8 text-xs"
          />

          <div className="flex items-center gap-1.5">
            <Switch
              checked={report.filters.onlyWithLeads}
              onCheckedChange={(v) => report.setFilters({ ...report.filters, onlyWithLeads: v })}
              className="h-4 w-7"
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">Solo con lead</span>
          </div>
        </div>

        {/* Tabella */}
        <div className="overflow-x-auto">
          {/* border-separate: con i bordi uniti il browser non rispetta lo z-index
                delle celle fisse e il contenuto che scorre ci passa sopra. */}
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="bg-muted/50">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      "px-3 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap cursor-pointer select-none hover:text-foreground transition-colors",
                      col.align === "right" ? "text-right" : "text-left",
                      col.key === "name" && "sticky left-0 z-[3] bg-muted",
                    )}
                    onClick={() => report.toggleSort(col.key)}
                    title={col.aiuto}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      <SortIcon col={col.key} />
                    </span>
                  </th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {report.isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="[&>td]:border-t [&>td]:border-border/50">
                    {columns.map((col) => (
                      <td key={col.key} className="px-3 py-3">
                        <Skeleton className="h-4 w-16" />
                      </td>
                    ))}
                    <td />
                  </tr>
                ))
              ) : report.rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} className="text-center py-12 text-muted-foreground text-sm">
                    Nessun{level === "campaign" ? "a campagna" : level === "adset" ? " gruppo di inserzioni" : "a inserzione"} con dati nel periodo selezionato
                  </td>
                </tr>
              ) : (
                report.rows.map((row, i) => (
                  <tr key={`${row.id}-${row.account_id}-${i}`} className="hover:bg-muted/20 transition-colors group [&>td]:border-t [&>td]:border-border/50">
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          "px-3 py-2.5 whitespace-nowrap",
                          col.align === "right" ? "text-right tabular-nums" : "text-left",
                          col.key === "name" &&
                            "sticky left-0 z-[2] bg-card bg-gradient-to-r from-transparent to-transparent " +
                            "group-hover:from-muted/20 group-hover:to-muted/20",
                        )}
                      >
                        {cella(col, row)}
                      </td>
                    ))}
                    <td className="px-2 py-2.5 w-8">
                      {(row.lead_crm ?? 0) > 0 && row.campaign_name && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label={`Vedi lead CRM per ${row.campaign_name}`}
                              className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 flex items-center justify-center rounded hover:bg-primary/10 text-primary"
                              onClick={() => navigate(`/azienda/marketing/contatti?q=${encodeURIComponent(row.campaign_name!)}`)}
                            >
                              <Users className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Vedi lead CRM per "{row.campaign_name}"</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {!report.isLoading && report.rows.length > 1 && (
              <tfoot>
                <tr className="bg-muted/40 font-semibold [&>td]:border-t-2 [&>td]:border-border">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-3 py-2.5 whitespace-nowrap text-sm",
                        col.align === "right" ? "text-right tabular-nums" : "text-left",
                        col.key === "name" && "sticky left-0 z-[2] bg-muted",
                      )}
                    >
                      {col.key === "name" ? `Totale · ${report.rows.length} ${unita}` : totali[col.key] ?? ""}
                    </td>
                  ))}
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </TooltipProvider>
  );
};

export default CampaignTable;
