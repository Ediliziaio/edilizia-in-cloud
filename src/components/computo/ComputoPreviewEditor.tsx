/**
 * Tabella editabile per revisione voci estratte da computo metrico.
 * Raggruppa per capitolo, consente edit prezzo/ricarico con ricalcolo live.
 *
 * Stato match listino:
 *  - Voci NON abbinate: badge ambra "Da abbinare" + bottone "Abbina dal listino"
 *  - Voci abbinate manualmente: badge verde "→ <nome listino>" + bottone "Cambia"
 *  - L'utente può anche lasciare voci senza abbinamento (sono lavorazioni
 *    da computo metrico non necessariamente presenti nel listino aziendale)
 */
import { useState, useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ChevronDown,
  ChevronRight,
  Percent,
  Search,
  Link2,
  Link2Off,
  Sparkles,
  MoveRight,
  AlertTriangle,
  ShieldCheck,
  Filter,
  Wrench,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import {
  buildComputoReviewSummary,
  filterComputoReviewRows,
  getComputoReviewIssues,
  type ComputoReviewFilter,
} from "@/lib/computo/reviewQuality";
import {
  inferComputoItemCategory,
  isComputoProductMatch,
  isComputoTariffaMatch,
} from "@/lib/computo/quoteItemMapping";
import type { ComputoVoceLocal } from "@/types/computo";

interface Props {
  voci: ComputoVoceLocal[];
  onChange: (voci: ComputoVoceLocal[]) => void;
  /** Apre il picker prodotto del listino. Riceve l'id voce + descrizione iniziale. */
  onMatchClick?: (voceId: string, initialQuery: string) => void;
  /** Apre il picker tariffe/manodopera del listino. */
  onTariffaMatchClick?: (voceId: string, initialQuery: string) => void;
}

function ConfidenceBadge({ value }: { value: number }) {
  const label = `${(value * 100).toFixed(0)}%`;
  const colorClass =
    value >= 0.9
      ? "border-green-400 text-green-600"
      : value >= 0.7
        ? "border-amber-400 text-amber-600"
        : "border-red-400 text-red-600";
  const hint =
    value >= 0.9
      ? "Alta confidenza"
      : value >= 0.7
        ? "Confidenza media — verifica"
        : "Bassa confidenza — verifica attentamente";
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`text-[9px] py-0 cursor-help ${colorClass}`}>
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-xs">
          {hint}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Colore di sfondo riga basato sulla confidenza AI */
function rowBg(v: ComputoVoceLocal): string {
  if (!v._isIncluded) return "";
  const conf = v.confidence ?? 1;
  if (conf < 0.5) return "bg-red-50/60 dark:bg-red-950/10";
  if (conf < 0.75) return "bg-amber-50/40 dark:bg-amber-950/10";
  return "";
}

export function ComputoPreviewEditor({ voci, onChange, onMatchClick, onTariffaMatchClick }: Props) {
  const [collapsedCaps, setCollapsedCaps] = useState<Set<string>>(new Set());
  const [expandedDesc, setExpandedDesc] = useState<Set<string>>(new Set());
  const [bulkRicarico, setBulkRicarico] = useState(15);
  const [reviewFilter, setReviewFilter] = useState<ComputoReviewFilter>("all");

  const reviewIssues = useMemo(() => getComputoReviewIssues(voci), [voci]);
  const reviewSummary = useMemo(() => buildComputoReviewSummary(voci), [voci]);
  const filteredVoci = useMemo(
    () => filterComputoReviewRows(voci, reviewFilter, reviewIssues),
    [reviewFilter, reviewIssues, voci],
  );
  const issuesByVoceId = useMemo(() => {
    const map = new Map<string, typeof reviewIssues>();
    for (const issue of reviewIssues) {
      const prev = map.get(issue.voceId) ?? [];
      map.set(issue.voceId, [...prev, issue]);
    }
    return map;
  }, [reviewIssues]);

  // Group by capitolo
  const capitoli = useMemo(() => {
    const map = new Map<string, ComputoVoceLocal[]>();
    for (const v of filteredVoci) {
      const key = v.capitolo_nome || "Generale";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    }
    return [...map.entries()];
  }, [filteredVoci]);

  const updateVoce = useCallback(
    (id: string, updates: Partial<ComputoVoceLocal>) => {
      onChange(
        voci.map((v) => {
          if (v.id !== id) return v;
          const updated = { ...v, ...updates };
          // Recalc importo if price or ricarico changed
          if ("_prezzoImpresa" in updates) {
            updated._importoImpresa = updated.quantita * updated._prezzoImpresa;
            updated._ricarico =
              updated.prezzo_unitario_computo > 0
                ? ((updated._prezzoImpresa - updated.prezzo_unitario_computo) /
                    updated.prezzo_unitario_computo) *
                  100
                : 0;
          }
          if ("_ricarico" in updates) {
            updated._prezzoImpresa =
              updated.prezzo_unitario_computo * (1 + updated._ricarico / 100);
            updated._importoImpresa = updated.quantita * updated._prezzoImpresa;
          }
          if ("quantita" in updates) {
            updated._importoImpresa = updated.quantita * updated._prezzoImpresa;
          }
          return updated;
        })
      );
    },
    [voci, onChange]
  );

  const toggleAll = (checked: boolean) => {
    onChange(voci.map((v) => ({ ...v, _isIncluded: checked })));
  };

  const applyBulkRicaricoToAll = () => {
    onChange(
      voci.map((v) => ({
        ...v,
        _ricarico: bulkRicarico,
        _prezzoImpresa: v.prezzo_unitario_computo * (1 + bulkRicarico / 100),
        _importoImpresa: v.quantita * v.prezzo_unitario_computo * (1 + bulkRicarico / 100),
      }))
    );
  };

  const applyBulkRicaricoToCapitolo = (capNome: string) => {
    onChange(
      voci.map((v) => {
        // Match on capitolo_nome, treating null as "Generale"
        const voceCapNome = v.capitolo_nome || "Generale";
        if (voceCapNome !== capNome) return v;
        return {
          ...v,
          _ricarico: bulkRicarico,
          _prezzoImpresa: v.prezzo_unitario_computo * (1 + bulkRicarico / 100),
          _importoImpresa: v.quantita * v.prezzo_unitario_computo * (1 + bulkRicarico / 100),
        };
      })
    );
  };

  const toggleCapitolo = (capNome: string) => {
    setCollapsedCaps((prev) => {
      const next = new Set(prev);
      if (next.has(capNome)) next.delete(capNome);
      else next.add(capNome);
      return next;
    });
  };

  const clearMatch = useCallback(
    (id: string) => {
      onChange(
        voci.map((v) =>
          v.id === id
            ? {
                ...v,
                _matched_template_id: undefined,
                _matched_family_id: undefined,
                _matched_tariffa_id: undefined,
                _matched_name: undefined,
                _matched_tariffa_tipo: undefined,
                _matched_tariffa_cost: undefined,
                _matched_tariffa_unita: undefined,
                _match_type: "none",
                _matched_unit_price: undefined,
              }
            : v,
        ),
      );
    },
    [voci, onChange],
  );

  // Stats abbinamento per il header
  const matchStats = useMemo(() => {
    const hasAnyMatch = (v: ComputoVoceLocal) => isComputoProductMatch(v) || isComputoTariffaMatch(v);
    const manual = voci.filter((v) => v._isIncluded && v._match_type === "manual" && hasAnyMatch(v)).length;
    const auto = voci.filter((v) => v._isIncluded && (v._match_type === "vector" || v._match_type === "alias") && hasAnyMatch(v)).length;
    const tariffs = voci.filter((v) => v._isIncluded && isComputoTariffaMatch(v)).length;
    const unmatched = voci.filter((v) => v._isIncluded && (!v._match_type || v._match_type === "none" || !hasAnyMatch(v))).length;
    return { manual, auto, tariffs, unmatched };
  }, [voci]);

  const hasCatalogPicker = onMatchClick || onTariffaMatchClick;
  const gridCols = hasCatalogPicker
    ? "grid-cols-[32px_60px_1fr_170px_50px_70px_80px_80px_70px_80px_40px]"
    : "grid-cols-[32px_60px_1fr_50px_70px_80px_80px_70px_80px_40px]";

  return (
    <div className="space-y-1">
      {/* Controllo qualità */}
      <div className="rounded-lg border bg-slate-50/70 p-3 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-2">
            <div className={`mt-0.5 rounded-md p-1.5 ${reviewSummary.hasBlockingIssues ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
              {reviewSummary.hasBlockingIssues ? <AlertTriangle className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            </div>
            <div>
              <div className="text-sm font-semibold">
                Controllo qualità computo
              </div>
              <p className="text-xs text-muted-foreground">
                {reviewSummary.hasBlockingIssues
                  ? `${reviewSummary.blockingCount} correzioni bloccanti prima della generazione.`
                  : "Nessun blocco: puoi generare il preventivo dopo la revisione commerciale."}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[520px]">
            <div className="rounded-md border bg-background px-2 py-1.5">
              <div className="text-[10px] uppercase text-muted-foreground">Totale impresa</div>
              <div className="text-sm font-semibold text-orange-600">{formatCurrency(reviewSummary.totalImpresa)}</div>
            </div>
            <div className="rounded-md border bg-background px-2 py-1.5">
              <div className="text-[10px] uppercase text-muted-foreground">Delta computo</div>
              <div className={reviewSummary.deltaImpresaVsComputo >= 0 ? "text-sm font-semibold text-emerald-700" : "text-sm font-semibold text-rose-700"}>
                {reviewSummary.deltaImpresaVsComputo >= 0 ? "+" : ""}{formatCurrency(reviewSummary.deltaImpresaVsComputo)}
              </div>
            </div>
            <div className="rounded-md border bg-background px-2 py-1.5">
              <div className="text-[10px] uppercase text-muted-foreground">Match listino</div>
              <div className="text-sm font-semibold">{reviewSummary.matchRatePct}%</div>
            </div>
            <div className="rounded-md border bg-background px-2 py-1.5">
              <div className="text-[10px] uppercase text-muted-foreground">Confidenza AI</div>
              <div className="text-sm font-semibold">{Math.round(reviewSummary.averageConfidence * 100)}%</div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 flex items-center gap-1 text-[10px] font-medium uppercase text-muted-foreground">
            <Filter className="h-3 w-3" />
            Filtri
          </span>
          {[
            { value: "all", label: `Tutte ${reviewSummary.totalRows}` },
            { value: "blocking", label: `Blocchi ${reviewSummary.blockingCount}` },
            { value: "warnings", label: `Avvisi ${reviewSummary.warningCount}` },
            { value: "low_confidence", label: `Bassa AI ${reviewSummary.lowConfidenceCount}` },
            { value: "unmatched", label: `Da listino ${reviewSummary.unmatchedCount}` },
            { value: "duplicates", label: `Duplicate ${reviewSummary.duplicateCount}` },
          ].map((item) => (
            <Button
              key={item.value}
              type="button"
              size="sm"
              variant={reviewFilter === item.value ? "default" : "outline"}
              className="h-7 px-2 text-[11px]"
              onClick={() => setReviewFilter(item.value as ComputoReviewFilter)}
            >
              {item.label}
            </Button>
          ))}
          {reviewSummary.zeroPriceCount > 0 && (
            <Badge variant="outline" className="ml-auto border-amber-300 bg-amber-50 text-amber-700">
              {reviewSummary.zeroPriceCount} prezzi a zero
            </Badge>
          )}
          {reviewSummary.zeroQuantityCount > 0 && (
            <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-700">
              {reviewSummary.zeroQuantityCount} quantità da correggere
            </Badge>
          )}
        </div>
      </div>

      {/* Bulk actions */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => toggleAll(true)}>
          Seleziona tutto
        </Button>
        <Button variant="outline" size="sm" onClick={() => toggleAll(false)}>
          Deseleziona
        </Button>
        {/* Stats abbinamento listino */}
        {(matchStats.manual > 0 || matchStats.auto > 0 || matchStats.unmatched > 0) && hasCatalogPicker ? (
          <div className="flex items-center gap-2 text-[10px]">
            {matchStats.manual > 0 ? (
              <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50">
                <Link2 className="h-2.5 w-2.5 mr-0.5" />
                {matchStats.manual} abbinate
              </Badge>
            ) : null}
            {matchStats.auto > 0 ? (
              <Badge variant="outline" className="border-blue-300 text-blue-700 bg-blue-50">
                <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                {matchStats.auto} suggerite AI
              </Badge>
            ) : null}
            {matchStats.tariffs > 0 ? (
              <Badge variant="outline" className="border-orange-300 text-orange-700 bg-orange-50">
                <Wrench className="h-2.5 w-2.5 mr-0.5" />
                {matchStats.tariffs} tariffe
              </Badge>
            ) : null}
            {matchStats.unmatched > 0 ? (
              <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50">
                {matchStats.unmatched} da abbinare
              </Badge>
            ) : null}
          </div>
        ) : null}
        <div className="flex items-center gap-1 ml-auto">
          <Input
            type="number"
            value={bulkRicarico}
            onChange={(e) => setBulkRicarico(Math.max(0, Math.min(200, Number(e.target.value))))}
            className="w-16 h-7 text-xs"
            min={0}
            max={200}
          />
          <span className="text-xs">%</span>
          <Button variant="outline" size="sm" onClick={applyBulkRicaricoToAll}>
            <Percent className="h-3 w-3 mr-1" /> Applica a tutto
          </Button>
        </div>
      </div>

      {/* Fix 17: Legenda match — visibile solo se picker attivo */}
      {hasCatalogPicker && (matchStats.manual > 0 || matchStats.auto > 0) && (
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground pb-1">
          <span className="font-medium">Legenda:</span>
          <span className="flex items-center gap-0.5">
            <Link2 className="h-2.5 w-2.5 text-emerald-600" />
            <span className="text-emerald-700">Abbinamento manuale</span>
          </span>
          <MoveRight className="h-2.5 w-2.5" />
          <span className="flex items-center gap-0.5">
            <Sparkles className="h-2.5 w-2.5 text-blue-500" />
            <span className="text-blue-700">Suggerito AI</span>
          </span>
        </div>
      )}

      {/* Fix 1: Scroll orizzontale su mobile — min-w garantisce layout desktop intatto */}
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="min-w-[780px]">
          {/* Table header */}
          <div
            className={`grid ${gridCols} gap-1 text-[10px] font-medium text-muted-foreground px-1 border-b pb-1`}
          >
            <span></span>
            <span>Codice</span>
          <span>Descrizione</span>
            {hasCatalogPicker ? <span>Listino</span> : null}
            <span>U.M.</span>
            <span className="text-right">Q.tà</span>
            <span className="text-right text-slate-400">Pr. Computo</span>
            <span className="text-right text-orange-500">Pr. Impresa</span>
            <span className="text-right">Ric. %</span>
            <span className="text-right text-orange-500">Importo</span>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-center cursor-help">AI</span>
                </TooltipTrigger>
                <TooltipContent className="text-xs">
                  Confidenza estrazione AI
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Capitoli + voci */}
          {capitoli.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nessuna voce corrisponde al filtro selezionato.
            </div>
          ) : capitoli.map(([capNome, capVoci]) => {
            const collapsed = collapsedCaps.has(capNome);
            const totaleCapitolo = capVoci
              .filter((v) => v._isIncluded)
              .reduce((s, v) => s + v._importoImpresa, 0);

            return (
              <div key={capNome}>
                {/* Capitolo header */}
                <div
                  className="flex items-center gap-2 py-1.5 px-1 bg-slate-50 rounded cursor-pointer hover:bg-slate-100 group"
                  onClick={() => toggleCapitolo(capNome)}
                >
                  {collapsed ? (
                    <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                  )}
                  <span className="text-xs font-semibold flex-1">{capNome}</span>
                  <span className="text-xs text-muted-foreground">{capVoci.length} voci</span>
                  <span className="text-xs font-semibold text-orange-600">
                    {formatCurrency(totaleCapitolo)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 text-[10px] opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      applyBulkRicaricoToCapitolo(capNome);
                    }}
                  >
                    <Percent className="h-2.5 w-2.5 mr-0.5" />
                    {bulkRicarico}%
                  </Button>
                </div>

                {/* Voci */}
                {!collapsed &&
                  capVoci.map((v) => {
                    const rowIssues = issuesByVoceId.get(v.id) ?? [];
                    const isMatched = !!v._match_type && v._match_type !== "none" &&
                      (isComputoProductMatch(v) || isComputoTariffaMatch(v));
                    const isTariffa = isComputoTariffaMatch(v);
                    const isAutoMatch = isMatched && (v._match_type === "vector" || v._match_type === "alias");
                    const inferredCategory = inferComputoItemCategory(v);
                    return (
                    <div
                      key={v.id}
                      className={`grid ${gridCols} gap-1 items-center text-xs px-1 py-1 border-b border-slate-100 transition-colors ${
                        !v._isIncluded ? "opacity-40" : rowBg(v)
                      }`}
                    >
                      {/* Checkbox */}
                      <Checkbox
                        checked={v._isIncluded}
                        onCheckedChange={(c) => updateVoce(v.id, { _isIncluded: !!c })}
                        className="h-3.5 w-3.5"
                        aria-label={`Includi voce: ${v.descrizione_breve}`}
                      />

                      {/* Codice */}
                      <span className="text-[10px] text-muted-foreground truncate" title={v.codice_voce || ""}>
                        {v.codice_voce}
                      </span>

                      {/* Descrizione */}
                      <div className="min-w-0">
                        <div
                          className="truncate cursor-pointer hover:text-clip"
                          title={v.descrizione_estesa || v.descrizione_breve}
                          onClick={() =>
                            setExpandedDesc((prev) => {
                              const next = new Set(prev);
                              if (next.has(v.id)) next.delete(v.id);
                              else next.add(v.id);
                              return next;
                            })
                          }
                        >
                          {expandedDesc.has(v.id)
                            ? v.descrizione_estesa || v.descrizione_breve
                            : v.descrizione_breve}
                        </div>
                        {rowIssues.length > 0 && (
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {rowIssues.slice(0, 2).map((issue) => (
                              <span
                                key={`${issue.code}-${issue.message}`}
                                className={`rounded px-1 py-0.5 text-[9px] ${
                                  issue.type === "blocking"
                                    ? "bg-rose-50 text-rose-700"
                                    : "bg-amber-50 text-amber-700"
                                }`}
                                title={issue.message}
                              >
                                {issue.message}
                              </span>
                            ))}
                            {rowIssues.length > 2 && (
                              <span className="rounded bg-slate-100 px-1 py-0.5 text-[9px] text-slate-600">
                                +{rowIssues.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Colonna Listino */}
                      {hasCatalogPicker ? (
                        <div className="flex items-center gap-0.5">
                          {isMatched ? (
                            <>
                              <button
                                type="button"
                                className={`flex-1 min-w-0 text-left text-[10px] truncate hover:underline ${
                                  isTariffa ? "text-orange-700" : isAutoMatch ? "text-blue-600" : "text-emerald-700"
                                }`}
                                title={`${v._matched_name ?? ""}${isAutoMatch ? " (suggerito AI)" : " (abbinato)"}`}
                                onClick={() => {
                                  if (isTariffa && onTariffaMatchClick) onTariffaMatchClick(v.id, v.descrizione_breve);
                                  else onMatchClick?.(v.id, v.descrizione_breve);
                                }}
                                aria-label={`Cambia abbinamento: ${v._matched_name}`}
                              >
                                {isTariffa ? (
                                  <Wrench className="inline h-2.5 w-2.5 mr-0.5 text-orange-500" />
                                ) : isAutoMatch ? (
                                  <Sparkles className="inline h-2.5 w-2.5 mr-0.5 text-blue-400" />
                                ) : (
                                  <Link2 className="inline h-2.5 w-2.5 mr-0.5" />
                                )}
                                {v._matched_name ?? (isTariffa ? "tariffa" : "abbinato")}
                              </button>
                              <button
                                type="button"
                                className="text-muted-foreground hover:text-rose-600 p-0.5"
                                title="Rimuovi abbinamento"
                                aria-label={`Rimuovi abbinamento per: ${v.descrizione_breve}`}
                                onClick={() => clearMatch(v.id)}
                              >
                                <Link2Off className="h-3 w-3" />
                              </button>
                            </>
                          ) : (
                            <div className="grid w-full grid-cols-2 gap-1">
                              <button
                                type="button"
                                className="min-w-0 truncate rounded border border-amber-300 bg-amber-50 px-1 py-0.5 text-[10px] text-amber-700 hover:bg-amber-100"
                                onClick={() => onMatchClick?.(v.id, v.descrizione_breve)}
                                aria-label={`Abbina prodotto dal listino: ${v.descrizione_breve}`}
                                disabled={!onMatchClick}
                              >
                                <Search className="inline h-2.5 w-2.5 mr-0.5" />
                                Prod.
                              </button>
                              <button
                                type="button"
                                className={`min-w-0 truncate rounded border px-1 py-0.5 text-[10px] hover:bg-orange-100 ${
                                  inferredCategory !== "prodotto"
                                    ? "border-orange-300 bg-orange-50 text-orange-700"
                                    : "border-slate-200 bg-background text-muted-foreground"
                                }`}
                                onClick={() => onTariffaMatchClick?.(v.id, v.descrizione_breve)}
                                aria-label={`Abbina tariffa o manodopera: ${v.descrizione_breve}`}
                                disabled={!onTariffaMatchClick}
                              >
                                <Wrench className="inline h-2.5 w-2.5 mr-0.5" />
                                Tar.
                              </button>
                            </div>
                          )}
                        </div>
                      ) : null}

                      {/* U.M. */}
                      <span className="text-[10px] text-muted-foreground">{v.unita_misura}</span>

                      {/* Fix 13: step + min su quantità */}
                      <Input
                        type="number"
                        value={v.quantita}
                        onChange={(e) =>
                          updateVoce(v.id, { quantita: Math.max(0, Number(e.target.value)) })
                        }
                        className="h-6 text-[11px] text-right px-1"
                        step="0.01"
                        min="0"
                        aria-label="Quantità"
                      />

                      {/* Prezzo computo (read-only) */}
                      <span className="text-right text-[10px] text-slate-400">
                        {formatCurrency(v.prezzo_unitario_computo)}
                      </span>

                      {/* Fix 2: Prezzo impresa — min="0" blocca negativi */}
                      <Input
                        type="number"
                        value={Math.round(v._prezzoImpresa * 100) / 100}
                        onChange={(e) =>
                          updateVoce(v.id, { _prezzoImpresa: Math.max(0, Number(e.target.value)) })
                        }
                        className="h-6 text-[11px] text-right px-1 border-orange-200 focus:border-orange-400"
                        step="0.01"
                        min="0"
                        aria-label="Prezzo impresa"
                      />

                      {/* Fix 2: Ricarico — min="0" max="200" */}
                      <Input
                        type="number"
                        value={Math.round(v._ricarico * 10) / 10}
                        onChange={(e) =>
                          updateVoce(v.id, { _ricarico: Math.max(0, Math.min(200, Number(e.target.value))) })
                        }
                        className="h-6 text-[10px] text-right px-1"
                        step="0.5"
                        min="0"
                        max="200"
                        aria-label="Ricarico %"
                      />

                      {/* Importo impresa (calculated) */}
                      <span className="text-right text-[11px] font-medium text-orange-600">
                        {formatCurrency(v._importoImpresa)}
                      </span>

                      {/* Fix 16: Confidence con tooltip */}
                      <div className="flex justify-center">
                        <ConfidenceBadge value={v.confidence} />
                      </div>
                    </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
