import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrderEconomicsBase } from "@/hooks/useOrderEconomicsBase";
import { useOrderControlTasks } from "@/hooks/useOrderControlTasks";
import { useCompanyStructure } from "@/hooks/controlloGestione/useCompanyStructure";
import { calculateOrderStructureImpact } from "@/lib/controlloGestione/strutturaCommessa";
import { fmtMesi, mesiApertura } from "@/lib/controlloGestione/tempoCommessa";
import { useCostoPrevistoCommessa } from "@/hooks/useCostoPrevistoCommessa";
import { useCostiDirettiPerTipo } from "@/hooks/useCostiDirettiPerTipo";
import { contoEconomicoCommessa } from "@/lib/orders/contoEconomicoCommessa";
import { ContoEconomicoMacroVoci } from "@/components/orders/ContoEconomicoMacroVoci";
import { PrintPreviewModal } from "@/components/shared/PrintPreviewModal";
import { caricaDossierEconomico } from "@/lib/orders/dossierEconomico";
import { htmlContoEconomico } from "@/lib/orders/contoEconomicoHtml";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import type { OrderControlCheck } from "@/lib/orders/controlWorkflow";
import { materialCostVariance } from "@/lib/orders/materialCostVariance";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DonutChart, type DonutChartSegment } from "@/components/ui/donut-chart";
import { TrendingUp, TrendingDown, AlertTriangle, Truck, CheckCircle2, Circle, ArrowRight, ListChecks, Loader2, Download } from "lucide-react";

/**
 * OrderEconomicsSummary — conto economico "a colpo d'occhio" in cima alla commessa.
 *
 * Legge ricavi, costi e margine dalla stessa vista usata dal Controllo di
 * Gestione. Il preventivo articoli resta un confronto pianificato; non viene
 * usato per sostituire il consuntivo ufficiale.
 *
 * Donut in CSS puro (conic-gradient): nessuna libreria grafica → non può crashare
 * il rendering (lezione: recharts ResponsiveContainer height="100%" buttava giù la
 * pagina). Componente OrderEconomics originale lasciato intatto (no regressioni).
 */

interface EconItem {
  name?: string;
  purchase_price?: number | null;
  quantity: number;
  vat_rate?: number | null;
}

interface OrderEconomicsSummaryProps {
  orderId: string;
  totalAmount: number;
  vatRate: number;
  items: EconItem[];
  collectedAmount: number; // NET già incassato (usato per margini/provvigioni)
  /** Cassa LORDA (IVA inclusa) = stesso numero del piano rate. Se presenti, la barra
   *  "Incassato / Da incassare" li usa al posto del netto, così non c'è un incassato
   *  diverso da quello mostrato in "€ Riepilogo" e "Avanzamento incassi". I margini
   *  sopra restano netti (non vengono toccati). */
  cashCollected?: number;
  cashTotal?: number;
  /** true mentre la query order_items del genitore è in corso: evita di mostrare
   *  un "Margine 100% / Costi 0" fuorviante prima che i costi articoli arrivino. */
  itemsLoading?: boolean;
  /** Avanzamento fisico (media % fasi lavorazione). Con ≥15% sblocca la
   *  proiezione del margine a fine lavori: costi a finire = consuntivo/avanzamento. */
  avanzamentoPct?: number | null;
  workStartDate?: string | null;
  workEndDate?: string | null;
  /** Stato di evasione: «completed» chiude il cantiere anche con l'avanzamento sotto il 100%. */
  fulfillmentStatus?: string | null;
  /** Fase della commessa: l'ultima operativa e quelle di supporto chiudono il cantiere. */
  currentStatusId?: string | null;
}

/** Percentuale it-IT a 1 decimale: 36,1 (virgola, non punto). */
const pct1 = (n: number) => n.toFixed(1).replace(".", ",");

const CHART = {
  articoli: "hsl(var(--chart-1))",
  magazzino: "hsl(var(--chart-6, 28 92% 54%))",
  manodopera: "hsl(var(--chart-4))",
  provvigioni: "hsl(var(--chart-3))",
  rimborsiKm: "hsl(199 89% 48%)",
  errori: "hsl(var(--chart-5))",
  diretti: "hsl(var(--chart-6, var(--chart-3)))",
  margine: "hsl(var(--chart-2))",
};

export function OrderEconomicsSummary({
  orderId,
  totalAmount,
  vatRate,
  items,
  collectedAmount,
  cashCollected,
  cashTotal,
  itemsLoading = false,
  avanzamentoPct = null,
  workStartDate = null,
  workEndDate = null,
  fulfillmentStatus = null,
  currentStatusId = null,
}: OrderEconomicsSummaryProps) {
  const t = useT();
  void vatRate; // tenuto per parità d'interfaccia col conto economico esistente

  const {
    actual,
    quality: baseQuality,
    vehicleCosts,
    vehicleCostsError,
    isPending: basePending,
    isError: baseError,
    employees,
    teams,
  } = useOrderEconomicsBase(orderId, totalAmount, items);
  const previsto = useCostoPrevistoCommessa(orderId, true);
  const direttiPerTipo = useCostiDirettiPerTipo(orderId, true);
  const structure = useCompanyStructure();
  const structureImpact = useMemo(
    () => calculateOrderStructureImpact({
      directMargin: actual.margin,
      revenue: actual.revenue,
      monthlyPerActiveOrder: structure.data?.monthlyPerActiveOrder ?? null,
      workStartDate,
      workEndDate,
      progressPercent: avanzamentoPct,
      fulfillmentStatus,
      currentStatusId,
      statiChiusi: structure.data?.statiChiusi,
      today: structure.data?.today ?? "",
    }),
    [actual.margin, actual.revenue, avanzamentoPct, currentStatusId, fulfillmentStatus, structure.data, workEndDate, workStartDate],
  );
  // La manodopera interna arriva come aggregato: per aprire la riga serve la
  // ripartizione per fase, dalla stessa funzione che il documento già usa.
  const manodoperaPerFase = useQuery({
    queryKey: ["oes-manodopera-per-fase", orderId],
    enabled: !!orderId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [perFase, fasi] = await Promise.all([
        db.rpc("commessa_costo_personale_per_fase", { p_order_id: orderId }),
        db.from("order_work_phases_visibili").select("id, name, position").eq("order_id", orderId),
      ]);
      if (perFase.error) throw perFase.error;
      const nomi = new Map<string, { nome: string; position: number }>(
        ((fasi.data ?? []) as Array<{ id: string | null; name: string | null; position: number | null }>)
          .filter((f) => !!f.id)
          .map((f) => [f.id as string, { nome: f.name ?? "", position: Number(f.position) || 0 }]),
      );
      return ((perFase.data ?? []) as Array<{ phase_id: string | null; total_cost: number | null }>)
        .map((r) => ({
          id: r.phase_id ?? "senza-fase",
          nome: (r.phase_id && nomi.get(r.phase_id)?.nome) || "",
          position: (r.phase_id && nomi.get(r.phase_id)?.position) || 0,
          costo: Number(r.total_cost) || 0,
        }))
        .sort((a, b) => a.position - b.position);
    },
  });
  const conto = useMemo(() => contoEconomicoCommessa({
    ricavi: actual.revenue,
    avanzamentoPct,
    consuntivo: {
      acquisti: actual.purchases,
      magazzino: actual.warehouseMaterials,
      manodopera: actual.labor,
      persone: employees.reduce((s, e) => s + (Number(e.total_cost) || 0), 0),
      provvigioni: actual.commissions,
      rimborsi: actual.mileageReimbursements,
      errori: actual.errors,
      diretti: actual.directCosts,
      direttiPerTipo: direttiPerTipo.data ?? {},
    },
    previsto: previsto.isError ? null : previsto.previsto,
    struttura: {
      mensile: structure.data?.monthlyPerActiveOrder ?? null,
      mesiPrevisti: workStartDate && workEndDate ? mesiApertura(workStartDate, workEndDate, workEndDate) : null,
      mesiMaturati: structureImpact.months,
    },
  }), [actual, avanzamentoPct, employees, direttiPerTipo.data, previsto.isError, previsto.previsto, structure.data, structureImpact.months, workEndDate, workStartDate]);
  // Da dove arriva ogni macro-voce del consuntivo: la riga si apre e lo mostra.
  // Nessun numero nuovo — sono le stesse fonti che compongono il totale.
  const dettagliVoci = useMemo(() => {
    const perTipo = direttiPerTipo.data ?? {};
    const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const vivi = (righe: Array<{ id: string; label: string; value: number; nota?: string }>) =>
      righe.filter((r) => Math.abs(r.value) >= 0.005);
    const materiali = vivi([
      { id: "acquisti", label: t("Acquisti e ordini ai fornitori"), value: n(actual.purchases) },
      { id: "magazzino", label: t("Scarichi di magazzino"), value: n(actual.warehouseMaterials) },
      { id: "fatture-materiali", label: t("Fatture materiali"), value: n(perTipo.materiali) },
    ]);
    // La manodopera interna si apre per fase: la somma delle fasi non copre
    // sempre il totale (ore non ancora assegnate a una fase), e il residuo
    // diventa una riga sua, così il dettaglio chiude sempre sul totale.
    const totaleManodopera = n(conto.righe.find((r) => r.key === "manodopera")?.consuntivo);
    const fasi = (manodoperaPerFase.data ?? []).filter((f) => Math.abs(f.costo) >= 0.005);
    const sommaFasi = fasi.reduce((somma, f) => somma + f.costo, 0);
    const residuo = totaleManodopera - sommaFasi;
    const manodopera = totaleManodopera > 0 && fasi.length > 0
      ? vivi([
        ...fasi.map((f, i) => ({ id: `fase-${f.id}-${i}`, label: f.nome || t("Fase senza nome"), value: f.costo })),
        { id: "fuori-fase", label: t("Ore non assegnate a una fase"), value: residuo },
      ])
      : [];
    // Le ditte, una per una, stanno nella scheda «Dipendenti e operai interni».
    const ditte = vivi([
      { id: "ditte", label: t("Ditte esterne (squadre assegnate)"), value: teams.reduce((somma, x) => somma + n(x.total_cost) / (1 + n(x.vat_rate) / 100), 0) },
      { id: "fatture-subappalti", label: t("Fatture di subappalto"), value: n(perTipo.subappalto) },
    ]);
    const noleggi = vivi([
      { id: "noli", label: t("Noli e servizi fatturati"), value: n(perTipo.noli_servizi) },
      { id: "mezzi-fatturati", label: t("Mezzi fatturati"), value: n(perTipo.mezzi) },
    ]);
    return {
      ...(materiali.length > 1 ? { materiali } : {}),
      ...(manodopera.length > 1 ? { manodopera } : {}),
      ...(ditte.length > 1 ? { subappalti: ditte } : {}),
      ...(noleggi.length > 1 ? { noleggi } : {}),
    };
  }, [actual.purchases, actual.warehouseMaterials, conto.righe, direttiPerTipo.data, manodoperaPerFase.data, t, teams]);
  const [controlliAperti, setControlliAperti] = useState(false);
  // «Scarica conto economico»: macro-voci, fasi, incassi e pagamenti in un documento da stampare o salvare in PDF.
  const permessi = usePermissions();
  const quality = { ...baseQuality, canShowMargin: baseQuality.canShowMargin && permessi.canViewMargins };
  const [documento, setDocumento] = useState<{ html: string; nome: string } | null>(null);
  const [preparando, setPreparando] = useState(false);
  const scaricaConto = async () => {
    if (preparando) return;
    setPreparando(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [dossier, azienda] = await Promise.all([
        caricaDossierEconomico(db, orderId, { strutturaMensile: structure.data?.monthlyPerActiveOrder ?? null, conUscite: permessi.canViewCosts }),
        db.from("orders").select("company_id").eq("id", orderId).maybeSingle()
          .then(async (r: { data: { company_id: string } | null }) => r.data?.company_id
            ? (await db.from("companies").select("name, logo_url").eq("id", r.data.company_id).maybeSingle()).data
            : null),
      ]);
      const html = htmlContoEconomico(dossier, { ragione_sociale: azienda?.name ?? "", logo_url: azienda?.logo_url ?? null },
        { mostraMargini: quality.canShowMargin, mostraIncassi: permessi.canViewOrderAmounts });
      setDocumento({ html, nome: `conto-economico-${dossier.ordine.codice ?? orderId.slice(0, 8)}` });
    } catch (e) {
      console.error("[conto economico] documento non preparato:", e);
      toast.error(t("Non riesco a preparare il conto economico. Riprova."));
    } finally {
      setPreparando(false);
    }
  };

  // CONSUNTIVO materiali = somma degli ordini fornitore (ODA) realmente emessi.
  const { data: oda = [], isPending: odaPending } = useQuery({
    queryKey: ["oes-oda", orderId], // chiave DEDICATA
    enabled: !!orderId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      // Solo ODA realmente emessi: escludi bozza (e annullato) dal consuntivo
      // materiali, altrimenti una bozza mai inviata gonfia costo/margine.
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("subtotal")
        .eq("order_id", orderId)
        .in("status", ["inviato", "confermato", "parziale", "ricevuto"]);
      if (error) throw error;
      return (data ?? []) as { subtotal: number | null }[];
    },
  });

  // ── PIANIFICATO vs IMPEGNATO (costi materiali) ──────────────────────────────
  // L'ODA emesso e' un impegno verso il fornitore, non consumo di cantiere.
  const consuntivo = useMemo(() => {
    const materialiPianificati = (items ?? []).reduce(
      (s, i) => s + (Number(i.purchase_price) || 0) * (Number(i.quantity) || 0),
      0,
    );
    const materialiOrdinati = oda.reduce((s, o) => s + (Number(o.subtotal) || 0), 0);
    const odaCount = oda.length;
    const variance = materialCostVariance(materialiPianificati, materialiOrdinati, actual.warehouseMaterials);
    const scostamento = variance.amount;
    const scostamentoPct = variance.percent;

    return {
      materialiPianificati, materialiOrdinati, odaCount, scostamento, scostamentoPct,
    };
  }, [items, oda, actual.warehouseMaterials]);

  const controlChecks = useMemo<OrderControlCheck[]>(() => [
    {
      key: "revenue",
      label: t("Contratto valorizzato"),
      taskLabel: "Valorizza il contratto",
      done: actual.revenue > 0,
      priority: "alta",
      fixTo: `/azienda/ordini/${orderId}/modifica`,
    },
    {
      key: "costs",
      label: t("Almeno un costo diretto registrato"),
      taskLabel: "Registra i costi diretti",
      done: actual.costs > 0,
      priority: "alta",
      fixTo: `/azienda/ordini/${orderId}?tab=articoli`,
    },
    {
      key: "materials",
      label: t("Materiali previsti con acquisti o consumi registrati"),
      taskLabel: "Verifica gli acquisti dei materiali previsti",
      done: consuntivo.materialiPianificati <= 0 || actual.purchases + actual.warehouseMaterials > 0,
      priority: "alta",
      fixTo: `/azienda/ordini/${orderId}?tab=articoli&vista_materiali=acquisti`,
    },
    {
      key: "dates",
      label: t("Data di inizio lavori impostata"),
      taskLabel: "Imposta la data di inizio lavori",
      done: Boolean(workStartDate),
      priority: "normale",
      fixTo: `/azienda/ordini/${orderId}?tab=panoramica&section=section-pianificazione`,
    },
    {
      key: "labor-budget",
      label: t("Costi previsti della manodopera definiti"),
      taskLabel: "Completa i costi previsti della manodopera",
      done: !quality.issues.some(issue => issue.code === "labor_without_budget"),
      priority: "alta",
      fixTo: `/azienda/ordini/${orderId}?tab=costi&vista_costi=manodopera`,
    },
    {
      key: "vehicles",
      label: vehicleCosts.vehiclesUsed > 0 ? t("Costi dei mezzi configurati") : t("Nessun mezzo da valorizzare"),
      taskLabel: "Completa i costi dei mezzi",
      done: vehicleCosts.vehiclesUsed === 0 || vehicleCosts.vehiclesWithoutCost === 0,
      priority: "normale",
      fixTo: `/azienda/ordini/${orderId}?tab=panoramica`,
    },
    {
      key: "mileage",
      label: actual.pendingMileageReimbursementsCount > 0
        ? t("{n} rimborsi km da approvare", { n: actual.pendingMileageReimbursementsCount })
        : t("Rimborsi km verificati"),
      taskLabel: "Verifica i rimborsi chilometrici",
      done: actual.pendingMileageReimbursementsCount === 0,
      priority: "alta",
      fixTo: "/azienda/personale?tab=richieste",
    },
  ], [actual.costs, actual.purchases, actual.warehouseMaterials, actual.pendingMileageReimbursementsCount, actual.revenue, consuntivo.materialiPianificati, quality.issues, orderId, vehicleCosts, workStartDate, t]);
  const controlWorkflow = useOrderControlTasks(orderId, controlChecks);
  const completedControlChecks = controlWorkflow.controls.filter((check) => check.resolved).length;

  const composition = useMemo(
    () =>
      [
        { key: "articoli", label: t("Acquisti impegnati"), value: actual.purchases, color: CHART.articoli },
        { key: "magazzino", label: t("Materiali da scorta"), value: actual.warehouseMaterials, color: CHART.magazzino },
        { key: "manodopera", label: t("Manodopera"), value: actual.labor, color: CHART.manodopera },
        { key: "provvigioni", label: t("Provvigioni"), value: actual.commissions, color: CHART.provvigioni },
        { key: "rimborsi-km", label: t("Rimborsi km approvati"), value: actual.mileageReimbursements, color: CHART.rimborsiKm },
        { key: "errori", label: t("Errori/perdite"), value: actual.errors, color: CHART.errori },
        { key: "diretti", label: t("Costi diretti da contabilità"), value: actual.directCosts, color: CHART.diretti },
        ...(quality.canShowMargin && actual.margin > 0
          ? [{ key: "margine", label: t("Margine diretto"), value: actual.margin, color: CHART.margine }]
          : []),
      ].filter((d) => d.value > 0),
    [actual, quality.canShowMargin, t],
  );

  // Donut interattivo: hover su segmento (o sulla legenda) → dettaglio al centro.
  // useCallback obbligatorio: l'effetto interno del DonutChart dipende dal
  // callback — un'identità nuova a ogni render azzererebbe l'hover della legenda.
  const compositionTotal = useMemo(
    () => composition.reduce((s, d) => s + d.value, 0),
    [composition],
  );
  const [hoverSeg, setHoverSeg] = useState<DonutChartSegment | null>(null);
  const handleSegmentHover = useCallback(
    (seg: DonutChartSegment | null) => setHoverSeg(seg),
    [],
  );

  const marginColor =
    actual.marginPct >= 30
      ? "text-emerald-600 dark:text-emerald-400"
      : actual.marginPct >= 20
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";
  const marginBadge =
    quality.status === "missing" || quality.status === "unavailable"
      ? "bg-slate-100 text-slate-700 border-slate-300"
      : quality.status === "partial"
        ? "bg-amber-100 text-amber-700 border-amber-300"
        : actual.marginPct >= 30
          ? "bg-emerald-100 text-emerald-700 border-emerald-300"
          : actual.marginPct >= 20
            ? "bg-amber-100 text-amber-700 border-amber-300"
            : "bg-red-100 text-red-700 border-red-300";

  // Cassa: usa il LORDO (IVA inclusa) quando fornito → stesso incassato del piano rate
  // ("€ Riepilogo" / "Avanzamento incassi"). Fallback al netto per retro-compatibilità.
  const cashColl = cashCollected ?? collectedAmount;
  const cashTot = cashTotal ?? totalAmount;
  const dueAmount = Math.max(0, cashTot - cashColl);
  const collectedPct = cashTot > 0 ? Math.min(100, (cashColl / cashTot) * 100) : 0;

  // Finché una qualsiasi fonte di costo è in caricamento (articoli dal genitore,
  // o dipendenti/squadre/provvigioni/errori), i costi sarebbero parziali → il
  // margine apparirebbe gonfiato (es. "100%"). Mostriamo uno skeleton: la card
  // di testata non deve MAI lampeggiare numeri sbagliati.
  const costsLoading = itemsLoading || basePending || odaPending || previsto.isLoading || direttiPerTipo.isLoading;
  if (baseError) return <Card id="section-conto-economico" className="scroll-mt-24"><CardContent className="p-4 text-sm text-muted-foreground">{t("Conto economico non disponibile: impossibile caricare tutti i costi.")}</CardContent></Card>;
  if (costsLoading) {
    return (
      <Card id="section-conto-economico" className="scroll-mt-24">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            {t("Conto economico")}
          </CardTitle>
          <Skeleton className="h-5 w-20 rounded-full" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px] md:items-center xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <Skeleton className="h-16 rounded-lg" />
                <Skeleton className="h-16 rounded-lg" />
                <Skeleton className="h-16 rounded-lg" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
            <div className="flex h-[160px] items-center justify-center">
              <Skeleton className="h-[140px] w-[140px] rounded-full" />
            </div>
          </div>


      </CardContent>
      </Card>
    );
  }

  // Mobile: i tre numeri, gli avvisi e le voci di costo in riga. Grafico,
  // pianificato/consuntivo e barra incassi (già in testata) al computer.
  return (
    <Card id="section-conto-economico" className="scroll-mt-24">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3 max-sm:p-3 max-sm:pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {quality.canShowMargin && actual.margin >= 0 ? (
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          ) : (
            quality.canShowMargin
              ? <TrendingDown className="h-4 w-4 text-red-500" />
              : <AlertTriangle className="h-4 w-4 text-amber-500" />
          )}
          {t("Conto economico")}
        </CardTitle>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void scaricaConto()} disabled={preparando}
            className="inline-flex h-7 items-center gap-1 rounded-md border bg-white px-2 text-xs font-medium hover:bg-muted disabled:opacity-60 max-sm:hidden"
            title={t("Conto per voce, fasi, incassi e pagamenti: da stampare o salvare in PDF")}>
            {preparando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}{t("Scarica conto economico")}
          </button>
          <Badge variant="outline" className={`text-xs font-semibold ${marginBadge}`}>
            {quality.canShowMargin ? t("Margine diretto {percentuale}%", { percentuale: pct1(actual.marginPct) }) : quality.label}
          </Badge>
        </div>
        {documento && (
          <PrintPreviewModal htmlContent={documento.html} fileName={documento.nome} title={t("Conto economico della commessa")}
            open onOpenChange={(o) => { if (!o) setDocumento(null); }} />
        )}
      </CardHeader>
      <CardContent className="max-sm:p-3 max-sm:pt-0">
        {/* Controlli della commessa: una riga sola. Se sono tutti a posto basta
            il segno di spunta; quelli da sistemare si leggono come pillole e il
            dettaglio si apre a richiesta (prima erano sette riquadri grandi). */}
        {(() => {
          const totale = controlWorkflow.controls.length;
          const daFare = controlWorkflow.controls.filter((c) => !c.resolved);
          const tuttoOk = daFare.length === 0;
          return (
            <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-950/30">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="inline-flex items-center gap-1 font-medium text-foreground">
                  {tuttoOk ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <ListChecks className="h-3.5 w-3.5 text-orange-500" />}
                  {t("Controllo commessa")}
                </span>
                <span className={tuttoOk ? "text-emerald-700" : "text-orange-700"}>{completedControlChecks}/{totale}</span>
                {daFare.slice(0, 3).map((check) => (
                  <Link key={check.key} to={check.state === "scheduled" ? "/azienda/attivita" : check.fixTo}
                    className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] hover:bg-white",
                      check.state === "scheduled" ? "border-blue-200 text-blue-700" : "border-orange-200 text-orange-700")}
                    title={check.state === "scheduled" ? t("In agenda: apri l'attività") : t("Da sistemare: apri dove si corregge")}>
                    <Circle className="h-2 w-2 fill-current" />{check.label}
                  </Link>
                ))}
                {daFare.length > 3 && <span className="text-muted-foreground">+{daFare.length - 3}</span>}
                <span className="ml-auto flex items-center gap-2">
                  {controlWorkflow.controlsToCreate.length > 0 && !controlWorkflow.isError && (
                    <button type="button" onClick={controlWorkflow.createMissing}
                      disabled={controlWorkflow.isCreating || controlWorkflow.isLoading}
                      className="inline-flex items-center gap-1 font-semibold text-orange-700 hover:underline disabled:opacity-60">
                      {controlWorkflow.isCreating && <Loader2 className="h-3 w-3 animate-spin" />}
                      {t("Metti in agenda ({n})", { n: controlWorkflow.controlsToCreate.length })}
                    </button>
                  )}
                  <button type="button" onClick={() => setControlliAperti((v) => !v)} aria-expanded={controlliAperti}
                    className="text-muted-foreground hover:text-foreground hover:underline">
                    {controlliAperti ? t("Chiudi") : t("Dettaglio")}
                  </button>
                </span>
              </div>
              {controlliAperti && (
                <ul className="mt-1.5 grid gap-x-4 gap-y-0.5 border-t pt-1.5 sm:grid-cols-2">
                  {controlWorkflow.controls.map((check) => {
                    const state = CONTROL_STATE[check.state];
                    const Icon = check.resolved ? CheckCircle2 : Circle;
                    return (
                      <li key={check.key} className="flex min-w-0 items-center gap-1.5">
                        <Icon className={cn("h-3 w-3 shrink-0", state.icon)} />
                        <span className="truncate text-foreground">{check.label}</span>
                        <span className={cn("shrink-0 text-[10px]", state.text)}>· {t(state.label)}</span>
                        {!check.resolved && (
                          <Link to={check.state === "scheduled" ? "/azienda/attivita" : check.fixTo}
                            className="ml-auto inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-orange-700 hover:underline">
                            {check.state === "scheduled" ? t("Apri") : t("Sistema")}<ArrowRight className="h-3 w-3" />
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {controlWorkflow.isError && (
                <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">{t("Le attività non sono disponibili; i controlli automatici restano attivi.")}</p>
              )}
            </div>
          );
        })()}

        {/* Su desktop la colonna donut si allarga (era fissa 200px mentre la
            colonna KPI si stirava a nastro sui monitor larghi → donut minuscolo
            e sbilanciato). minmax(0,1fr) evita l'overflow del contenuto denso. */}
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px] md:items-center xl:grid-cols-[minmax(0,1fr)_300px] max-sm:gap-2">
          {/* KPI + cassa */}
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <Kpi label={t("Ricavi")} value={formatCurrency(actual.revenue)} valueCompact={formatCurrencyCompact(actual.revenue)} hint={t("contratto + varianti")} />
              <Kpi label={t("Costi diretti")} value={formatCurrency(actual.costs)} valueCompact={formatCurrencyCompact(actual.costs)} hint={t("registrati")} />
              <Kpi
                label={t("Margine diretto")}
                value={quality.canShowMargin ? formatCurrency(actual.margin) : "—"}
                valueCompact={quality.canShowMargin ? formatCurrencyCompact(actual.margin) : "—"}
                valueClass={marginColor}
                hint={quality.canShowMargin ? quality.label : t("da calcolare")}
              />
            </div>

            {actual.approvedVariations !== 0 && (
              <p className="text-xs text-muted-foreground max-sm:hidden">
                {t("Varianti approvate incluse nei ricavi:")}{" "}
                <strong className={actual.approvedVariations >= 0 ? "text-emerald-600" : "text-red-600"}>
                  {actual.approvedVariations > 0 ? "+" : ""}{formatCurrency(actual.approvedVariations)}
                </strong>
              </p>
            )}

            {/* Cassa — mobile no: incassato e residuo sono già nella testata della commessa. */}
            <div className="max-sm:hidden">
              {/* gap + flex-wrap: a 375px "Incassato …" e "Da incassare …" si
                  attaccavano (justify-between senza spazio) → ora minimo gap e
                  vanno a capo se non entrano. */}
              <div className="mb-1 flex items-center justify-between flex-wrap gap-x-3 gap-y-0.5 text-xs">
                <span className="text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                  {t("Incassato {importo}", { importo: formatCurrency(cashColl) })}
                </span>
                <span className="text-muted-foreground whitespace-nowrap">
                  {t("Da incassare {importo}", { importo: formatCurrency(dueAmount) })}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${collectedPct}%` }}
                />
              </div>
            </div>

            {quality.status !== "ready" && quality.issues.length > 0 && (
              <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong>{quality.label}</strong>: {quality.issues.map((issue) => issue.label).join(" · ")}.
                  {!quality.canShowMargin && t(" Il margine resta nascosto finché non esiste almeno un costo registrato.")}
                </span>
              </p>
            )}
            {actual.errors > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {t("Errori/perdite registrati: {importo} — incidono sul margine.", { importo: formatCurrency(actual.errors) })}
              </p>
            )}
            {quality.canShowMargin && actual.margin < 0 && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {t("Commessa in perdita: i costi superano i ricavi.")}
              </p>
            )}
          </div>

          {/* Donut composizione interattivo (SVG a dimensioni fisse, niente
              ResponsiveContainer → non può rompere il layout). Hover su
              segmento o legenda → dettaglio della voce al centro. */}
          <div className="flex min-h-[190px] items-center justify-center rounded-xl border bg-muted/20 p-3 md:h-full max-sm:hidden">
            {composition.length > 0 && compositionTotal > 0 ? (
              <DonutChart
                data={composition}
                size={168}
                strokeWidth={20}
                animationDuration={0.9}
                activeLabel={hoverSeg?.label ?? null}
                onSegmentHover={handleSegmentHover}
                aria-label={quality.canShowMargin ? t("Margine diretto {percentuale}%", { percentuale: Math.round(actual.marginPct) }) : quality.label}
                centerContent={
                  hoverSeg ? (
                    <div className="flex flex-col items-center text-center">
                      <span className="max-w-[90px] truncate text-[10px] text-muted-foreground">
                        {hoverSeg.label}
                      </span>
                      <span className="text-sm font-bold leading-tight">
                        {formatCurrency(hoverSeg.value)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {((hoverSeg.value / compositionTotal) * 100).toFixed(0)}%
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <span className={`text-lg font-bold leading-none ${marginColor}`}>
                        {quality.canShowMargin ? `${pct1(actual.marginPct)}%` : "—"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{t("margine diretto")}</span>
                    </div>
                  )
                }
              />
            ) : (
              <span className="text-xs text-muted-foreground">{t("Dati costi non ancora disponibili")}</span>
            )}
          </div>
        </div>

          {vehicleCostsError && (
          <p className="mt-3 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
            {t("La stima dei mezzi non è disponibile; ricavi, costi diretti e margine restano invariati.")}
          </p>
        )}

        {/* Conto economico per macro-voci: preventivo, consuntivo, incidenze,
            struttura e margine netto (contoEconomicoCommessa). */}
        <div className="mt-3">
          {/* Da telefono bastano i tre numeri: il dettaglio per voce è da scrivania. */}
          <div className="max-md:hidden"><ContoEconomicoMacroVoci conto={conto} mostraMargini={quality.canShowMargin} mezziStimati={vehicleCosts.dataVisible && vehicleCosts.vehiclesUsed > 0 ? vehicleCosts : null} dettagli={dettagliVoci} /></div>
          {quality.canShowMargin && !structure.isLoading && (structure.isError || !structure.data?.monthlyPerActiveOrder || structureImpact.months === null) && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {structure.isError
                ? t("Costi di struttura non disponibili con i permessi correnti.")
                : !structure.data?.monthlyPerActiveOrder
                  ? structure.data?.monthlyStructure
                    ? t("Costi di struttura: nessun cantiere attivo su cui dividerli.")
                    : t("Costi di struttura: inserisci i costi fissi e il personale d'ufficio per calcolarne la quota.")
                  : !workStartDate
                    ? t("Costi di struttura: imposta la data di inizio lavori per calcolare la quota maturata.")
                    : Date.parse(workStartDate) > Date.parse(structure.data?.today ?? "")
                      ? t("Costi di struttura: i lavori non sono ancora iniziati; la quota non è ancora maturata.")
                      : t("Costi di struttura: verifica le date dei lavori per calcolare la quota maturata.")}
            </p>
          )}
          {quality.canShowMargin && structure.data?.monthlyPerActiveOrder != null && structureImpact.months != null && (
            <p className="mt-1 text-[11px] text-muted-foreground max-md:hidden">
              {t("Struttura: {mensile}/mese su {cantieri} cantieri attivi = {perCommessa}/mese per commessa, {mesi} mesi maturati.", { mensile: formatCurrency(structure.data.monthlyStructure), cantieri: structure.data.activeOrders, perCommessa: formatCurrency(structure.data.monthlyPerActiveOrder), mesi: fmtMesi(structureImpact.months) })}
            </p>
          )}
        </div>

        {/* Legenda composizione: hover su una voce → highlight del segmento nel donut */}
        {composition.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-[11px] max-sm:mt-2">
            {composition.map((d) => (
              <span
                key={d.key}
                className={`flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors ${
                  hoverSeg?.label === d.label ? "bg-muted" : ""
                }`}
                onMouseEnter={() => setHoverSeg(d)}
                onMouseLeave={() => setHoverSeg(null)}
              >
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />
                <span className="text-muted-foreground">{d.label}</span>
                <span className="font-medium">{formatCurrency(d.value)}</span>
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StructureKpi({ label, value, valueClass = "text-foreground" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/80 bg-white/70 p-2.5 shadow-sm dark:border-white/10 dark:bg-background/50">
      <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 truncate text-sm font-semibold tabular-nums ${valueClass}`} title={value}>{value}</p>
    </div>
  );
}

const CONTROL_STATE = {
  automatic: {
    label: "Automatico",
    card: "border-emerald-100",
    icon: "text-emerald-600",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  verified: {
    label: "Verificato",
    card: "border-emerald-100",
    icon: "text-emerald-600",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  scheduled: {
    label: "In agenda",
    card: "border-blue-200 bg-blue-50/40 dark:border-blue-900/60 dark:bg-blue-950/20",
    icon: "text-blue-600",
    text: "text-blue-700 dark:text-blue-300",
  },
  missing: {
    label: "Da sistemare",
    card: "border-orange-200 bg-orange-50/50 dark:border-orange-900/60 dark:bg-orange-950/20",
    icon: "text-orange-500",
    text: "text-orange-700 dark:text-orange-300",
  },
} as const;

function Kpi({
  label,
  value,
  valueCompact,
  hint,
  valueClass,
}: {
  label: string;
  value: string;
  /** Variante corta per mobile (es. "€85k"): 3 colonne a 375px non reggono
      l'importo pieno. Se assente, si usa `value` con truncate di sicurezza. */
  valueCompact?: string;
  hint?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-2 sm:p-2.5 min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground truncate">{label}</p>
      <p className={`text-sm sm:text-base font-bold leading-tight tabular-nums truncate ${valueClass ?? ""}`} title={value}>
        {valueCompact ? (
          <>
            <span className="sm:hidden">{valueCompact}</span>
            <span className="hidden sm:inline">{value}</span>
          </>
        ) : value}
      </p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
