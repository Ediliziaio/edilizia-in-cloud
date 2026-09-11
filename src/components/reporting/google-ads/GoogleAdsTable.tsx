import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, ExternalLink, Search } from "lucide-react";
import type { useGoogleAdsReport } from "@/hooks/useGoogleAdsReport";
import {
  CANALE,
  CORRISPONDENZA,
  EFFICACIA_ANNUNCIO,
  STATO_GOOGLE,
  type GoogleLevel,
  type GoogleRow,
} from "@/lib/googleAdsReportModel";
import { cn } from "@/lib/utils";

type Report = ReturnType<typeof useGoogleAdsReport>;

const fmtNum = (n: number) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 }).format(n);
const fmtDec = (n: number) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(n);
const fmtEur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n);
const fmtPct = (n: number) => new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + "%";
/** Google restituisce le quote come frazione 0-1. */
const fmtQuota = (v: number | null | undefined) => (v == null ? "—" : fmtPct(v * 100));

interface Colonna {
  key: string;
  label: string;
  aiuto?: string;
  livelli?: GoogleLevel[];
  align?: "right";
  format: (r: GoogleRow) => string;
}

const CRM: GoogleLevel[] = ["campaign", "ad_group", "ad"];

const COLONNE: Colonna[] = [
  { key: "name", label: "Nome", format: (r) => r.name ?? "—" },
  { key: "status", label: "Stato", livelli: ["campaign", "ad_group", "ad", "keyword", "search_term"], format: (r) => r.status ?? "—" },
  { key: "channel", label: "Tipo", livelli: ["campaign"], format: (r) => CANALE[r.channel ?? ""] ?? r.channel ?? "—" },
  { key: "budget_daily", label: "Budget/giorno", livelli: ["campaign"], align: "right", format: (r) => (r.budget_daily ? fmtEur(r.budget_daily) : "—") },
  { key: "match_type", label: "Corrispondenza", livelli: ["keyword"], format: (r) => CORRISPONDENZA[r.match_type ?? ""] ?? r.match_type ?? "—" },
  { key: "quality_score", label: "Punteggio qualità", aiuto: "Da 1 a 10: sotto 5 si paga di più ogni clic", livelli: ["keyword"], align: "right", format: (r) => (r.quality_score ? `${r.quality_score}/10` : "—") },
  { key: "ad_strength", label: "Efficacia", aiuto: "Giudizio di Google sull'annuncio adattabile", livelli: ["ad"], format: (r) => EFFICACIA_ANNUNCIO[r.ad_strength ?? ""]?.testo ?? "—" },
  { key: "spend", label: "Spesa", align: "right", format: (r) => fmtEur(r.spend) },
  { key: "impressions", label: "Impressioni", align: "right", format: (r) => fmtNum(r.impressions) },
  { key: "clicks", label: "Clic", align: "right", format: (r) => fmtNum(r.clicks) },
  { key: "ctr", label: "CTR", align: "right", format: (r) => (r.impressions > 0 ? fmtPct(r.ctr) : "—") },
  { key: "cpc", label: "CPC", aiuto: "Costo medio per clic", align: "right", format: (r) => (r.clicks > 0 ? fmtEur(r.cpc) : "—") },
  { key: "conversions", label: "Conversioni", aiuto: "Conversioni registrate da Google (moduli, chiamate, obiettivi)", align: "right", format: (r) => fmtDec(r.conversions) },
  { key: "cpa", label: "Costo/conv.", align: "right", format: (r) => (r.conversions > 0 ? fmtEur(r.cpa) : "—") },
  { key: "conversion_value", label: "Valore conv.", align: "right", format: (r) => (r.conversion_value > 0 ? fmtEur(r.conversion_value) : "—") },
  { key: "roas", label: "ROAS", aiuto: "Valore conversioni diviso la spesa (dati Google)", align: "right", format: (r) => (r.conversion_value > 0 ? `${fmtDec(r.roas)}x` : "—") },
  { key: "search_is", label: "Quota impr.", aiuto: "Su quante ricerche idonee l'annuncio è comparso", livelli: ["campaign", "ad_group", "keyword"], align: "right", format: (r) => fmtQuota(r.search_is) },
  { key: "lost_budget_is", label: "Persa: budget", aiuto: "Ricerche perse perché il budget finisce prima", livelli: ["campaign"], align: "right", format: (r) => fmtQuota(r.lost_budget_is) },
  { key: "lost_rank_is", label: "Persa: ranking", aiuto: "Ricerche perse per offerta o qualità troppo basse", livelli: ["campaign"], align: "right", format: (r) => fmtQuota(r.lost_rank_is) },
  { key: "lead_crm", label: "Lead nel CRM", aiuto: "Contatti entrati nel CRM nel periodo da questa campagna / gruppo / annuncio", livelli: CRM, align: "right", format: (r) => fmtNum(r.lead_crm ?? 0) },
  { key: "opportunita", label: "Trattative", livelli: CRM, align: "right", format: (r) => fmtNum(r.opportunita ?? 0) },
  { key: "vinte", label: "Contratti", livelli: CRM, align: "right", format: (r) => fmtNum(r.vinte ?? 0) },
  { key: "costo_vinta", label: "Costo per contratto", livelli: CRM, align: "right", format: (r) => ((r.vinte ?? 0) > 0 ? fmtEur(r.costo_vinta ?? 0) : "—") },
];

const LIVELLI: { value: GoogleLevel; label: string }[] = [
  { value: "campaign", label: "Campagne" },
  { value: "ad_group", label: "Gruppi di annunci" },
  { value: "ad", label: "Annunci" },
  { value: "keyword", label: "Parole chiave" },
  { value: "search_term", label: "Termini di ricerca" },
];

const UNITA: Record<GoogleLevel, string> = {
  campaign: "campagne",
  ad_group: "gruppi di annunci",
  ad: "annunci",
  keyword: "parole chiave",
  search_term: "termini di ricerca",
};

const toni = {
  verde: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  grigio: "bg-slate-100 text-slate-600 hover:bg-slate-100",
  giallo: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  rosso: "bg-red-100 text-red-700 hover:bg-red-100",
};

function Stato({ r, level }: { r: GoogleRow; level: GoogleLevel }) {
  // Per le campagne lo stato "primario" dice se stanno davvero girando
  // (idonea, limitata, non idonea); lo stato semplice dice solo acceso/spento.
  const chiave = level === "campaign" && r.status === "ENABLED" && r.primary_status ? r.primary_status : r.status ?? "";
  const s = STATO_GOOGLE[chiave];
  if (!chiave) return <span className="text-xs text-muted-foreground">—</span>;
  return <Badge className={cn("text-xs font-medium whitespace-nowrap", toni[s?.tono ?? "grigio"])}>{s?.testo ?? chiave}</Badge>;
}

function tonoCosto(v: number, media: number) {
  if (!(v > 0) || !(media > 0)) return "";
  if (v < media * 0.8) return "text-emerald-700 font-medium";
  if (v > media * 1.3) return "text-red-600 font-medium";
  return "";
}

export default function GoogleAdsTable({ report }: { report: Report }) {
  const level = report.level;
  const colonne = COLONNE.filter((c) => !c.livelli || c.livelli.includes(level));
  const t = report.rows.reduce(
    (a, r) => ({
      spend: a.spend + r.spend,
      impressions: a.impressions + r.impressions,
      clicks: a.clicks + r.clicks,
      conversions: a.conversions + r.conversions,
      conversion_value: a.conversion_value + r.conversion_value,
      lead_crm: a.lead_crm + (r.lead_crm ?? 0),
      opportunita: a.opportunita + (r.opportunita ?? 0),
      vinte: a.vinte + (r.vinte ?? 0),
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversion_value: 0, lead_crm: 0, opportunita: 0, vinte: 0 },
  );
  const div = (a: number, b: number) => (b > 0 ? a / b : 0);
  const mediaCpa = div(t.spend, t.conversions);
  const mediaVinta = div(t.spend, t.vinte);
  const totali: Record<string, string> = {
    spend: fmtEur(t.spend),
    impressions: fmtNum(t.impressions),
    clicks: fmtNum(t.clicks),
    ctr: t.impressions > 0 ? fmtPct(div(t.clicks * 100, t.impressions)) : "—",
    cpc: t.clicks > 0 ? fmtEur(div(t.spend, t.clicks)) : "—",
    conversions: fmtDec(t.conversions),
    cpa: t.conversions > 0 ? fmtEur(mediaCpa) : "—",
    conversion_value: t.conversion_value > 0 ? fmtEur(t.conversion_value) : "—",
    roas: t.conversion_value > 0 && t.spend > 0 ? `${fmtDec(div(t.conversion_value, t.spend))}x` : "—",
    lead_crm: fmtNum(t.lead_crm),
    opportunita: fmtNum(t.opportunita),
    vinte: fmtNum(t.vinte),
    costo_vinta: t.vinte > 0 ? fmtEur(mediaVinta) : "—",
  };

  const SortIcon = ({ col }: { col: string }) =>
    report.sortColumn !== col ? <ArrowUpDown className="h-3 w-3 opacity-30" /> : report.sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;

  const nome = (r: GoogleRow): ReactNode => {
    const apribile = level === "campaign" || level === "ad_group";
    const contesto = [
      level !== "campaign" && !report.percorso.campaignId ? r.campaign_name : null,
      (level === "ad" || level === "keyword" || level === "search_term") && !report.percorso.adGroupId ? r.ad_group_name : null,
    ].filter(Boolean).join(" · ");
    if (level === "ad") {
      const titolo = (r.headlines ?? []).slice(0, 3).join(" | ") || r.name || `Annuncio ${r.id}`;
      const dominio = (() => {
        try { return r.final_url ? new URL(r.final_url).hostname.replace(/^www\./, "") : null; } catch { return null; }
      })();
      return (
        <div className="min-w-[260px] max-w-[420px]">
          <p className="truncate font-medium text-blue-700" title={(r.headlines ?? []).join("\n")}>{titolo}</p>
          {dominio && (
            <a href={r.final_url!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline">
              {dominio} <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {r.descriptions?.[0] && <p className="truncate text-xs text-muted-foreground" title={r.descriptions.join("\n")}>{r.descriptions[0]}</p>}
          {contesto && <p className="truncate text-[11px] text-muted-foreground/80">{contesto}</p>}
        </div>
      );
    }
    const sotto =
      level === "campaign"
        ? r.figli ? `${r.figli} ${r.figli === 1 ? "gruppo" : "gruppi"} di annunci` : ""
        : level === "ad_group"
          ? [contesto, r.figli ? `${r.figli} annunc${r.figli === 1 ? "io" : "i"}` : null].filter(Boolean).join(" · ")
          : contesto;
    return (
      <div className="min-w-[200px] max-w-[340px]">
        {apribile ? (
          <button
            type="button"
            onClick={() => (level === "campaign" ? report.apriCampagna(r) : report.apriGruppo(r))}
            className="group/n flex items-center gap-1 text-left font-medium text-primary hover:underline"
            title={level === "campaign" ? "Vedi i gruppi di annunci" : "Vedi gli annunci"}
          >
            <span className="truncate">{r.name || "—"}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50 group-hover/n:opacity-100" />
          </button>
        ) : (
          <p className="truncate font-medium" title={r.name ?? ""}>{r.name || "—"}</p>
        )}
        {sotto && <p className="truncate text-xs text-muted-foreground" title={sotto}>{sotto}</p>}
      </div>
    );
  };

  const cella = (c: Colonna, r: GoogleRow): ReactNode => {
    if (c.key === "name") return nome(r);
    if (c.key === "status") return <Stato r={r} level={level} />;
    if (c.key === "ad_strength") {
      const e = EFFICACIA_ANNUNCIO[r.ad_strength ?? ""];
      return e && e.testo !== "—" ? <Badge className={cn("text-xs", toni[e.tono])}>{e.testo}</Badge> : <span className="text-xs text-muted-foreground">—</span>;
    }
    const tono =
      c.key === "cpa" && r.conversions > 0 ? tonoCosto(r.cpa, mediaCpa)
        : c.key === "costo_vinta" && (r.vinte ?? 0) > 0 ? tonoCosto(r.costo_vinta ?? 0, mediaVinta)
          : c.key === "quality_score" && r.quality_score ? (r.quality_score <= 4 ? "text-red-600 font-medium" : r.quality_score >= 8 ? "text-emerald-700 font-medium" : "")
            : c.key === "lost_budget_is" && (r.lost_budget_is ?? 0) > 0.2 ? "text-amber-700 font-medium"
              : "";
    return <span className={cn("text-sm", tono)}>{c.format(r)}</span>;
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Card className="overflow-hidden">
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

        {level !== "campaign" && (report.percorso.campaignId || report.percorso.adGroupId) && (
          <div className="flex flex-wrap items-center gap-1 border-b bg-primary/5 px-4 py-2 text-xs">
            <button type="button" className="text-primary hover:underline" onClick={() => report.setLevel("campaign")}>Tutte le campagne</button>
            {report.percorso.campaignId && (
              <>
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                {level !== "ad_group" ? (
                  <button type="button" className="max-w-[280px] truncate text-primary hover:underline" onClick={() => report.setLevel("ad_group")}>
                    {report.percorso.campaignName}
                  </button>
                ) : (
                  <span className="max-w-[280px] truncate font-medium">{report.percorso.campaignName}</span>
                )}
              </>
            )}
            {report.percorso.adGroupId && level !== "ad_group" && (
              <>
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                <span className="max-w-[280px] truncate font-medium">{report.percorso.adGroupName}</span>
              </>
            )}
          </div>
        )}

        {level === "search_term" && (
          <p className="border-b bg-amber-50/60 px-4 py-2 text-xs text-amber-900">
            Cosa hanno cercato davvero le persone prima di cliccare. Le ricerche che costano senza portare contatti
            (es. «lavoro», «fai da te», «usato») vanno aggiunte come parole chiave negative in Google Ads.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={`Cerca ${UNITA[level]}...`}
              value={report.search}
              onChange={(e) => report.setSearch(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
          {level !== "search_term" && (
            <div className="flex items-center gap-1.5">
              <Switch checked={report.soloAttive} onCheckedChange={report.setSoloAttive} className="h-4 w-7" />
              <span className="whitespace-nowrap text-xs text-muted-foreground">Solo attive</span>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {colonne.map((c) => (
                  <th
                    key={c.key}
                    onClick={() => report.toggleSort(c.key)}
                    className={cn(
                      "cursor-pointer select-none whitespace-nowrap px-3 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground",
                      c.align === "right" ? "text-right" : "text-left",
                      c.key === "name" && "sticky left-0 z-10 bg-muted",
                    )}
                  >
                    {c.aiuto ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2">{c.label}<SortIcon col={c.key} /></span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[240px] text-xs">{c.aiuto}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="inline-flex items-center gap-1">{c.label}<SortIcon col={c.key} /></span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t border-border/50">
                    {colonne.map((c) => <td key={c.key} className="px-3 py-3"><Skeleton className="h-4 w-16" /></td>)}
                  </tr>
                ))
              ) : report.rows.length === 0 ? (
                <tr>
                  <td colSpan={colonne.length} className="py-12 text-center text-sm text-muted-foreground">
                    Nessun dato per {UNITA[level]} nel periodo selezionato
                  </td>
                </tr>
              ) : (
                report.rows.map((r) => (
                  <tr key={`${level}-${r.id}`} className="group border-t border-border/50 transition-colors hover:bg-muted/20">
                    {colonne.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          "whitespace-nowrap px-3 py-2.5",
                          c.align === "right" ? "text-right tabular-nums" : "text-left",
                          c.key === "name" && "sticky left-0 z-[1] bg-card group-hover:bg-muted/20",
                        )}
                      >
                        {cella(c, r)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
            {!report.isLoading && report.rows.length > 1 && (
              <tfoot>
                <tr className="border-t-2 bg-muted/40 font-semibold">
                  {colonne.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        "whitespace-nowrap px-3 py-2.5 text-sm",
                        c.align === "right" ? "text-right tabular-nums" : "text-left",
                        c.key === "name" && "sticky left-0 z-[1] bg-muted",
                      )}
                    >
                      {c.key === "name" ? `Totale · ${report.rows.length} ${UNITA[level]}` : totali[c.key] ?? ""}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </TooltipProvider>
  );
}
