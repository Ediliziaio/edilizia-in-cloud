import { useCostiVociCollegati } from "@/hooks/useCostiVociCollegati";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { ArrowUpRight, Euro, TrendingUp, Package, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { margineVoce } from "@/lib/marginalita/margineVoce";
import { margineAffidabile, vociConsuntivo } from "@/lib/marginalita/fasceMargine";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

interface MarginalitaRow {
  id: string;
  order_code: string | null;
  description: string;
  preventivo_totale: number;
  costo_acquisti: number;
  costo_materiali_magazzino: number;
  movimenti_magazzino_senza_costo: number;
  costo_manodopera?: number;
  costo_provvigioni?: number;
  costo_diretto?: number;
  costo_rimborsi_km?: number;
  costo_errori: number;
  consuntivo: number;
  margine: number;
  margine_perc: number;
  cliente_nome: string;
  variazioni_approvate: number;
  preventivo_contratto: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  row: MarginalitaRow | null;
  structureImpact?: { source: "automatic" | "fallback" | "none"; structureAmount: number; adjustedMargin: number; adjustedMarginPct: number; months: number | null };
  targetMarginPct?: number;
}

interface LinkedAnomaly {
  id: string;
  amount: number | null;
  description: string | null;
  error_type: string | null;
  error_category: string | null;
  detailed_cause?: string | null;
  review_status?: string | null;
}

function safeNumber(value: number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeReviewStatus(value: string | null | undefined) {
  const normalized = String(value ?? "aperta").toLowerCase();
  if (["risolta", "non_imputabile"].includes(normalized)) return normalized;
  if (["in_verifica", "assegnata"].includes(normalized)) return normalized;
  return "aperta";
}

function extractStructuredField(description: string | null | undefined, label: string) {
  if (!description) return null;
  const prefix = `${label}:`;
  const line = description
    .split(/\r?\n/)
    .find((item) => item.toLowerCase().startsWith(prefix.toLowerCase()));
  if (!line) return null;
  const value = line.slice(prefix.length).trim();
  return value || null;
}

export default function MargineVociDetail({ open, onClose, row, structureImpact, targetMarginPct }: Props) {
  const t = useT();
  // Fetch order items with costs
  const { data: items = [], isLoading: itemsLoading, error: itemsError, refetch: refetchItems } = useQuery({
    queryKey: ["margine-voci-detail", row?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("id, name, quantity, unit_price, purchase_price, standard_cost, status, position")
        .eq("order_id", row!.id)
        .order("position");
      if (error) throw error;
      return (data || []) as {
        id: string;
        name: string;
        quantity: number;
        unit_price: number | null;
        purchase_price: number | null;
        standard_cost: number | null;
        status: string;
        position: number;
      }[];
    },
    enabled: !!row?.id && open,
    staleTime: 2 * 60 * 1000,
  });

  const { data: anomalies = [], isLoading: anomaliesLoading, error: anomaliesError, refetch: refetchAnomalies } = useQuery({
    queryKey: ["margine-voci-anomalie", row?.id],
    queryFn: async () => {
      const rich = await (supabase.from("order_errors") as any)
        .select("id, amount, description, error_type, error_category, detailed_cause, review_status")
        .eq("order_id", row!.id)
        .order("error_date", { ascending: false });
      if (rich.error && /schema cache|column|detailed_cause|review_status/i.test(rich.error.message || "")) {
        const fallback = await (supabase.from("order_errors") as any)
          .select("id, amount, description, error_type, error_category")
          .eq("order_id", row!.id)
          .order("error_date", { ascending: false });
        if (fallback.error) throw fallback.error;
        return (fallback.data || []) as LinkedAnomaly[];
      }
      if (rich.error) throw rich.error;
      return (rich.data || []) as LinkedAnomaly[];
    },
    enabled: !!row?.id && open,
    staleTime: 2 * 60 * 1000,
  });

  const { data: costiCollegati, isLoading: costiLoading, error: costiError, refetch: refetchCosti } = useCostiVociCollegati(row?.id, open);

  if (!row) return null;

  const preventivoTotale = safeNumber(row.preventivo_totale);
  const variazioniApprovate = safeNumber(row.variazioni_approvate);
  const prelieviSenzaCosto = safeNumber(row.movimenti_magazzino_senza_costo);
  const costoErrori = safeNumber(row.costo_errori);
  const consuntivo = safeNumber(row.consuntivo);
  const margine = safeNumber(row.margine);
  const marginePerc = safeNumber(row.margine_perc);
  const affidabile = margineAffidabile(row);
  const vociCosto = vociConsuntivo(row);
  const margineTextColor =
    marginePerc >= 25 ? "text-green-600" : marginePerc >= 10 ? "text-amber-600" : "text-red-600";
  const openAnomalies = anomalies.filter((item) => {
    const status = normalizeReviewStatus(item.review_status);
    return status !== "risolta" && status !== "non_imputabile";
  });
  const openAnomalyTotal = openAnomalies.reduce((sum, item) => sum + safeNumber(item.amount), 0);

  // Per-voce computed values
  const vociWithMargin = items.map((item) => ({ ...item, ...margineVoce(item) }));

  const stimeComplete = vociWithMargin.length > 0 && vociWithMargin.every(item => item.ricavo !== null && item.costo !== null);
  const ricaviVoci = vociWithMargin.reduce((sum, item) => sum + (item.ricavo ?? 0), 0);
  const costiVoci = vociWithMargin.reduce((sum, item) => sum + (item.costo ?? 0), 0);
  const margineVoci = ricaviVoci - costiVoci;
  const percentualeVoci = ricaviVoci > 0 ? margineVoci / ricaviVoci * 100 : null;
  const vociConCosto = !costiError && !costiLoading ? vociWithMargin.filter(item => costiCollegati?.get(item.id)?.importo != null) : [];
  const totaleCollegato = vociConCosto.reduce((sum, item) => sum + (costiCollegati?.get(item.id)?.importo ?? 0), 0);
  const vociConfrontabili = vociConCosto.filter(item => item.costo !== null);
  const scostamentoCollegato = vociConfrontabili.reduce((sum, item) => sum + (costiCollegati?.get(item.id)?.importo ?? 0) - (item.costo ?? 0), 0);
  const percentuale = (value: number) => `${value.toLocaleString(intlCampo(), { maximumFractionDigits: 1 })}%`;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent ampiezza="spazio" struttura="scorrevole" className="top-[50%] rounded-xl gap-3 p-5">
        <DialogHeader className="pb-3 border-b">
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-7 text-left text-base">
            <TrendingUp className="h-5 w-5 text-primary" aria-hidden="true" />
            <span>{t("Marginalità della commessa")}</span>
            <Link
              to={`/azienda/ordini/${row.id}?tab=finanza`}
              className="flex items-center gap-1 text-sm text-primary hover:underline ml-1"
              onClick={onClose}
            >
              {row.order_code ? `#${row.order_code}` : t("Ordine")}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </DialogTitle>
          <DialogDescription>{t("Ricavi, costi diretti e risultato dopo struttura. Importi IVA esclusa.")}</DialogDescription>
          {row.description && (
            <p className="text-sm text-muted-foreground">{row.description}</p>
          )}
          {row.cliente_nome && (
            <p className="text-xs text-muted-foreground">{t("Cliente: {cliente_nome}", { cliente_nome: String(row.cliente_nome ?? "") })}</p>
          )}
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* Global summary */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("Ricavi contrattuali")}</p>
              <p className="text-lg font-bold text-primary">{formatCurrency(preventivoTotale)}</p>
              {variazioniApprovate > 0 && (
                <p className="text-xs text-muted-foreground">{t("+{variazioniApprovate} varianti", { variazioniApprovate: formatCurrency(variazioniApprovate) })}</p>
              )}
            </div>
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("Costi diretti registrati")}</p>
              <p className="text-lg font-bold">{formatCurrency(consuntivo)}</p>
            </div>
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("Margine diretto")}</p>
              {affidabile ? (
                <>
                  <p className={cn("inline-block mr-2 text-lg font-bold", margineTextColor)}>{formatCurrency(margine)}</p>
                  <Badge className={cn("text-xs border-0",
                    marginePerc >= 25 ? "bg-green-100 text-green-800" :
                    marginePerc >= 10 ? "bg-amber-100 text-amber-800" :
                    "bg-red-100 text-red-800"
                  )}>
                    {marginePerc.toFixed(1)}%
                  </Badge>
                </>
              ) : (
                <>
                  <p className="text-lg font-bold text-muted-foreground">—</p>
                  <p className="text-xs text-orange-700">
                    {preventivoTotale <= 0 ? t("Ricavo mancante") : prelieviSenzaCosto > 0 ? t("Costi di magazzino da completare") : t("Nessun costo registrato")}
                  </p>
                </>
              )}
            </div>
          {structureImpact && <section className="space-y-1 rounded-lg border border-amber-200 bg-amber-50/50 p-3" aria-label={t("Margine dopo struttura")}>
            <div className="space-y-1">
              <p className="text-sm font-semibold">{t("Dopo struttura stimata")}</p>
              <p className={cn("font-bold", structureImpact.adjustedMargin < 0 ? "text-red-700" : "text-slate-900")}>
                {affidabile && structureImpact.source !== "none" ? `${formatCurrency(structureImpact.adjustedMargin)} (${structureImpact.adjustedMarginPct.toFixed(1)}%)` : "—"}
              </p>
            </div>
            <p className="text-xs text-muted-foreground" title={structureImpact.source === "automatic" ? t("Ripartizione automatica su {months} mesi", { months: structureImpact.months?.toFixed(1) }) : t("Percentuale della vista corrente")}>{structureImpact.source === "none" ? t("Quota struttura non disponibile") : t("Struttura: {structureAmount}", { structureAmount: formatCurrency(structureImpact.structureAmount) })}{targetMarginPct !== undefined && t(" · target {targetMarginPct}%", { targetMarginPct: String(targetMarginPct ?? "") })}</p>
          </section>}

          </div>

          <EconomicAnalysis revenue={preventivoTotale} costs={consuntivo} margin={margine} reliable={affidabile} entries={vociCosto} structure={structureImpact} target={targetMarginPct} />
          <div className="space-y-2 border-y py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="text-xs font-semibold">{t("Anomalie e perdite collegate")}</p>
                <p className="text-xs text-muted-foreground">
                  {anomaliesLoading
                    ? t("Caricamento anomalie...")
                    : anomaliesError
                      ? t("Impossibile caricare le anomalie.")
                    : openAnomalies.length > 0
                      ? t("{n} anomalie aperte impattano per {openAnomalyTotal}.", { n: openAnomalies.length, openAnomalyTotal: formatCurrency(openAnomalyTotal) })
                      : t("Nessuna anomalia aperta su questa commessa.")}
                </p>
              </div>
              <Badge className="border border-orange-200 bg-white text-orange-700 hover:bg-white">
                {anomaliesLoading || anomaliesError ? "—" : formatCurrency(openAnomalyTotal)}
              </Badge>
            </div>
            {anomaliesError && <Button variant="outline" size="sm" onClick={() => refetchAnomalies()}>{t("Riprova anomalie")}</Button>}
            {!anomaliesLoading && !anomaliesError && anomalies.length > 0 && (
              <div className="space-y-2">
                {anomalies.map((item) => {
                  const status = normalizeReviewStatus(item.review_status);
                  const cause =
                    item.detailed_cause ||
                    extractStructuredField(item.description, "Causa precisa") ||
                    item.error_category ||
                    item.error_type ||
                    "Anomalia";
                  return (
                    <div key={item.id} className="rounded-lg border border-orange-100 bg-white px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-950">{cause}</p>
                          {item.description && (
                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold text-red-600">{formatCurrency(safeNumber(item.amount))}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {status === "risolta" ? t("risolta") : status === "non_imputabile" ? t("non imputabile") : t("aperta")}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Per-voce table */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Package className="h-4 w-4 text-primary" aria-hidden="true" />
              <h3 className="text-sm font-semibold">{t("Dettaglio economico per voce ({n})", { n: items.length })}</h3>
            </div>

            <p className="mb-3 text-xs text-muted-foreground">{t("Importi totali di riga, IVA esclusa. Collegati: consumi netti di magazzino o impegni da OdA emessi, non necessariamente fatturati. Scostamento = costo collegato − stima; positivo indica maggior costo. Dati parziali: lavoro e spese senza collegamento restano nel totale commessa.")}</p>
            {costiError && <p role="alert" className="mb-2 text-xs text-red-700">{t("Costi collegati non disponibili.")} <Button variant="link" size="sm" className="h-auto p-0" onClick={() => refetchCosti()}>{t("Riprova costi")}</Button></p>}
            {itemsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : itemsError ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-5 text-center">
                <p className="text-sm text-red-700">{t("Impossibile caricare le voci d'ordine.")}</p>
                <Button variant="outline" size="sm" onClick={() => refetchItems()}>
                  {t("Riprova")}
                </Button>
              </div>
            ) : vociWithMargin.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                {t("Nessuna voce d'ordine trovata")}
              </p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table aria-label={t("Ricavi e margini stimati per voce")} className="text-xs tabular-nums [&_th]:h-9 [&_th]:px-3 [&_td]:px-3 [&_td]:py-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">{t("Voce")}</TableHead>
                      <TableHead className="text-right">{t("Qta")}</TableHead>
                      <TableHead className="text-right whitespace-nowrap">{t("Ricavi")}</TableHead>
                      <TableHead className="text-right whitespace-nowrap">{t("Costo stimato")}</TableHead>
                      <TableHead className="text-right whitespace-nowrap">{t("Costo collegato")}</TableHead>
                      <TableHead className="text-right whitespace-nowrap">{t("Scostamento")}</TableHead>
                      <TableHead className="text-right bg-blue-50/60">{t("Margine diretto stimato")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vociWithMargin.map((item) => {
                      const collegato = costiCollegati?.get(item.id);
                      const costo = !costiError && !costiLoading ? collegato?.importo : null;
                      const delta = costo != null && item.costo !== null ? costo - item.costo : null;
                      return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <p className="text-sm font-medium leading-snug">{item.name}</p>
                        </TableCell>
                        <TableCell className="text-right text-sm">{item.quantity}</TableCell>
                        <TableCell className="text-right text-sm whitespace-nowrap">
                          {item.ricavo !== null ? formatCurrency(item.ricavo) : "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm whitespace-nowrap">
                          <span title={item.purchase_price !== null ? t("Stima da costo di acquisto unitario × quantità") : item.standard_cost !== null ? t("Stima da costo standard unitario × quantità") : t("Costo unitario mancante")} className={item.costo === null ? "text-amber-700" : undefined}>{item.costo !== null ? formatCurrency(item.costo) : t("Da completare")}</span>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap text-sm">
                          {costiLoading ? "…" : costiError ? t("Non disponibile") : collegato ? <span title={collegato.fonte}>{costo != null ? formatCurrency(costo) : t("Da valorizzare")}<span className="block text-[11px] text-muted-foreground">{collegato.fonte}</span></span> : <span className="text-xs text-muted-foreground">{t("Non collegato")}</span>}
                        </TableCell>
                        <TableCell className={cn("text-right whitespace-nowrap text-sm font-medium", delta !== null && delta > 0 ? "text-red-700" : delta !== null && delta < 0 ? "text-emerald-700" : "text-muted-foreground")} title={t("Confronto provvisorio sui soli costi collegati; non è il margine finale")}>
                          {delta !== null ? `${delta > 0 ? "+" : ""}${formatCurrency(delta)}` : "—"}
                        </TableCell>
                        <TableCell className={cn("text-right text-sm whitespace-nowrap bg-blue-50/40",
                          item.margineVoce !== null && item.margineVoce >= 0 ? "text-emerald-700" : item.margineVoce !== null ? "text-red-700" : "text-muted-foreground"
                        )}>
                          <span className="font-semibold">{item.margineVoce !== null ? formatCurrency(item.margineVoce) : "—"}</span>
                          {item.margineVocePerc !== null && <span className="ml-2 text-xs">{percentuale(item.margineVocePerc)}</span>}
                        </TableCell>
                      </TableRow>
                    ); })}
                  </TableBody>
                  <TableFooter className="bg-muted/40">
                    <TableRow>
                      <TableCell colSpan={2} className="font-semibold">{stimeComplete ? t("Totale stime delle voci") : t("Stime incomplete")}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{vociWithMargin.every(item => item.ricavo !== null) ? formatCurrency(ricaviVoci) : "—"}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{stimeComplete ? formatCurrency(costiVoci) : t("Totale non disponibile")}</TableCell>
                      <TableCell className="text-right whitespace-nowrap" title={t("Somma dei soli costi collegati, non costo finale della commessa")}>{vociConCosto.length ? <>{formatCurrency(totaleCollegato)}<span className="block text-[11px] font-normal text-muted-foreground">{vociConCosto.length}/{items.length} {t("voci · parziale")}</span></> : "—"}</TableCell>
                      <TableCell className={cn("text-right whitespace-nowrap", scostamentoCollegato > 0 ? "text-red-700" : scostamentoCollegato < 0 ? "text-emerald-700" : "text-muted-foreground")} title={t("Scostamento delle sole voci con stima e costo collegato disponibili")}>{vociConfrontabili.length ? `${scostamentoCollegato > 0 ? "+" : ""}${formatCurrency(scostamentoCollegato)}` : "—"}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{stimeComplete ? <><strong>{formatCurrency(margineVoci)}</strong>{percentualeVoci !== null && <span className="ml-2">{percentuale(percentualeVoci)}</span>}</> : "—"}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            )}
          </div>

          {/* Warnings */}
          {(costoErrori > 0 || (affidabile && marginePerc < 10)) && (
            <div className="space-y-2">
              {costoErrori > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm">
                  <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="font-medium text-red-800">{t("Costi da errori: {costoErrori}", { costoErrori: formatCurrency(costoErrori) })}</p>
                    <p className="text-xs text-red-700">{t("Analizza le cause per prevenire futuri errori su questo tipo di cantiere.")}</p>
                  </div>
                </div>
              )}
              {affidabile && marginePerc < 10 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm">
                  <Euro className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="font-medium text-amber-800">{t("Margine sotto soglia ({marginePerc}%)", { marginePerc: marginePerc.toFixed(1) })}</p>
                    <p className="text-xs text-amber-700">{t("Il margine è inferiore al 10%. Verifica i costi delle voci principali.")}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>{t("Chiudi dettaglio")}</Button><Button asChild><Link to={`/azienda/ordini/${row.id}?tab=finanza`} onClick={onClose}>{t("Apri commessa")} <ArrowUpRight className="ml-1 h-4 w-4" /></Link></Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EconomicAnalysis({ revenue, costs, margin, reliable, entries, structure, target }: {
  revenue: number; costs: number; margin: number; reliable: boolean;
  entries: ReturnType<typeof vociConsuntivo>; structure: Props["structureImpact"]; target?: number;
}) {
  const t = useT();
  const available = !!structure && structure.source !== "none";
  const overhead = available ? Math.max(0, structure.structureAmount) : 0;
  const result = available ? structure.adjustedMargin : margin;
  const scale = Math.max(revenue, Math.max(0, costs) + overhead, 1);
  const pct = (n: number) => revenue > 0 ? `${(n / revenue * 100).toLocaleString(intlCampo(), { maximumFractionDigits: 1 })}%` : "—";
  const width = (n: number) => `${Math.max(0, n) / scale * 100}%`;
  const positiveCosts = entries.reduce((sum, entry) => sum + Math.max(0, entry.importo), 0);
  const colors = ["#3b82f6", "#f97316", "#6366f1", "#64748b", "#a855f7", "#06b6d4", "#ef4444", "#94a3b8"];
  const slices = entries.map((entry, index) => {
    const share = positiveCosts > 0 ? Math.max(0, entry.importo) / positiveCosts * 100 : 0;
    const offset = positiveCosts > 0 ? entries.slice(0, index).reduce((sum, prior) => sum + Math.max(0, prior.importo), 0) / positiveCosts * 100 : 0;
    const slice = { ...entry, share, offset, color: colors[index % colors.length] };
    return slice;
  });
  const targetAmount = target !== undefined ? revenue * target / 100 : null;
  const gap = reliable && available && targetAmount !== null ? result - targetAmount : null;
  return <>
    <section aria-label={t("Barra economica")} className="space-y-2 py-2">
      <div className="flex flex-wrap justify-between gap-2 text-xs"><h3 className="font-semibold">{t("Come si distribuiscono i ricavi")}</h3><span className="text-muted-foreground">{t("Costi registrati · struttura stimata")}</span></div>
      <div className="relative">
        <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={t("Costi diretti {costi}, struttura {struttura}, {risultato}", { costi: formatCurrency(costs), struttura: available ? formatCurrency(overhead) : t("non disponibile"), risultato: reliable ? (result < 0 ? t("perdita {importo}", { importo: formatCurrency(Math.abs(result)) }) : t("margine residuo {importo}", { importo: formatCurrency(Math.abs(result)) })) : t("margine non disponibile") })}>
          <span className="bg-blue-500" style={{ width: width(costs) }} /><span className="bg-amber-400" style={{ width: width(overhead) }} />
          {reliable && result > 0 && <span className="bg-emerald-500" style={{ width: width(result) }} />}
        </div>
        {revenue > 0 && costs + overhead > revenue && <span className="absolute -top-1 h-5 w-0.5 bg-red-700" style={{ left: width(revenue) }} title={t("Limite dei ricavi")} />}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs"><span>{t("Costi diretti")} <strong>{pct(costs)}</strong></span><span>{t("Struttura")} <strong>{available ? pct(overhead) : t("non disponibile")}</strong></span><span className={result < 0 ? "text-red-700" : "text-emerald-700"}>{reliable ? t(result < 0 ? "Perdita: {importo} · {percentuale}" : "Margine residuo: {importo} · {percentuale}", { importo: formatCurrency(Math.abs(result)), percentuale: pct(Math.abs(result)) }) : t("Dati incompleti")}</span></div>
      {revenue > 0 && costs + overhead > revenue && <p className="text-xs text-red-700">{t("La linea rossa indica il limite dei ricavi; la barra si estende fino al totale dei costi.")}</p>}
    </section>
    <section aria-label={t("Analisi del margine")} className="grid gap-5 border-t py-3 lg:grid-cols-[1.2fr_1fr]">
      <div><h3 className="text-sm font-semibold">{t("Composizione dei costi diretti")}</h3><p className="mt-1 text-xs text-muted-foreground">{t("Quote sui costi positivi, senza struttura. Le rettifiche negative restano in elenco.")}</p>
        <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row">
          <svg viewBox="0 0 160 160" className="h-40 w-40 shrink-0" role="img" aria-label={t("Grafico a torta dei costi diretti")}>
            <circle cx="80" cy="80" r="60" fill="none" stroke="hsl(var(--muted))" strokeWidth="23" />
            {slices.filter(slice => slice.share > 0).map(slice => <circle key={slice.chiave} cx="80" cy="80" r="60" fill="none" stroke={slice.color} strokeWidth="23" pathLength="100" strokeDasharray={`${slice.share} ${100 - slice.share}`} strokeDashoffset={-slice.offset} transform="rotate(-90 80 80)"><title>{slice.etichetta}: {formatCurrency(slice.importo)}</title></circle>)}
            <text x="80" y="74" textAnchor="middle" className="fill-muted-foreground text-[10px]">{t("COSTI DIRETTI")}</text><text x="80" y="94" textAnchor="middle" className="fill-foreground text-[12px] font-semibold">{formatCurrency(costs)}</text>
          </svg>
          <ul className="w-full min-w-0 space-y-2 text-xs">{slices.map(slice => <li key={slice.chiave} className="flex justify-between gap-2"><span><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: slice.color }} />{slice.etichetta}</span><span className="shrink-0 text-right font-medium">{formatCurrency(slice.importo)}<span className="block font-normal text-muted-foreground">{slice.importo < 0 ? t("Rettifica") : t("{share}% dei costi positivi", { share: slice.share.toLocaleString(intlCampo(), { maximumFractionDigits: 1 }) })}</span></span></li>)}{slices.length === 0 && <li>{t("Nessun costo registrato.")}</li>}</ul>
        </div>
      </div>
      <div className="lg:border-l lg:pl-5"><h3 className="text-sm font-semibold">{t("Dai ricavi al margine")}</h3>
        <dl className="mt-3 space-y-2 text-xs">
          <div className="flex justify-between gap-2"><dt>{t("Ricavi contrattuali")}</dt><dd>{formatCurrency(revenue)}</dd></div>
          <div className="flex justify-between gap-2"><dt>{t("− Costi diretti registrati")}</dt><dd>{formatCurrency(costs)}</dd></div>
          <div className="flex justify-between gap-2 border-t pt-2 font-semibold text-blue-700"><dt>{margin < 0 ? t("Perdita diretta") : t("Margine diretto")}</dt><dd>{reliable ? `${formatCurrency(margin)} · ${pct(margin)}` : t("Non disponibile")}</dd></div>
          <div className="flex justify-between gap-2"><dt>{t("− Struttura stimata")}</dt><dd>{available ? formatCurrency(overhead) : t("Non disponibile")}</dd></div>
          <div className={cn("flex justify-between gap-2 border-t pt-2 font-semibold", result < 0 ? "text-red-700" : "text-emerald-700")}><dt>{t("Dopo struttura")}</dt><dd>{reliable && available ? `${formatCurrency(result)} · ${pct(result)}` : t("Non disponibile")}</dd></div>
          {targetAmount !== null && <div className="flex justify-between gap-2 text-muted-foreground"><dt>{t("Obiettivo dopo struttura · {target}%", { target: String(target ?? "") })}</dt><dd>{formatCurrency(targetAmount)}</dd></div>}
          {gap !== null && <div className="flex justify-between gap-2"><dt>{gap < 0 ? t("Da recuperare per il target") : t("Sopra il target")}</dt><dd className="font-semibold">{formatCurrency(Math.abs(gap))}</dd></div>}
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">{reliable ? t("Risultato sui costi registrati; eventuali costi futuri non inseriti sono esclusi.") : t("Dati incompleti: completa ricavi e costi prima di valutare il margine.")} {t("La struttura è una stima distinta dai costi diretti.")}</p>
      </div>
    </section>
  </>;
}
