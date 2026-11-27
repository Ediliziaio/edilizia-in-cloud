import { RapportiPeriodoDialog } from "@/components/documentiOperativi/RapportiPeriodoDialog";
import { AzioniRapportino } from "./AzioniRapportino";
import { NuoviRapportiniUfficio } from "./RapportiniUfficio";
import { FILTRI_VUOTI, filtraRapportini, filtriAttivi, rapportinoDiTrasporto, type FiltriRapportini, type FiltroStato, type FiltroTipo } from "@/lib/orders/filtriRapportini";
import { Input } from "@/components/ui/input";
/**
 * Componente per la lista dei rapportini campo di un ordine.
 * Gestisce approvazione e rifiuto con motivo; ogni rapportino si apre in un popup.
 * Usato nel tab "Campo" di OrderDetail.tsx.
 */
import { COLONNE_RAPPORTINO_CON_AUTORE } from "@/lib/campo/colonneRapportino";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ImgRiservata } from "@/components/common/ImgRiservata";
import { RapportinoBlocchi } from "@/components/campo/RapportinoBlocchi";
import { CampiDaCompletare } from "@/components/orders/CampiDaCompletare";
import { compilatoDa } from "../../../supabase/functions/genera-pdf-rapportino/model";
import { TotaliCampiCommessa } from "@/components/orders/TotaliCampiCommessa";
import { useModuloRapportino } from "@/hooks/useModuliCantiere";
import { linkFileRiservato } from "@/lib/storage/fileRiservati";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { format, parseISO } from "date-fns";
import { dateFnsCampo, intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";
import {
  ClipboardList, Check, ChevronDown, Image as ImageIcon, PenLine,
  Loader2, X, Clock, Search, Truck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { RapportinoStato } from "@/types/rapportino";
import { SourceBadge } from "@/components/whatsapp/SourceBadge";
import { LaborApprovalDialog } from "@/components/orders/LaborApprovalDialog";
import { PulsantePdfRapportino } from "@/components/orders/PulsantePdfRapportino";
import { StoricoRapportino } from "@/components/orders/CorreggiRapportino";

const StoricoSpazio = ({ rapportinoId }: { rapportinoId: string }) => <div className="w-full"><StoricoRapportino rapportinoId={rapportinoId} /></div>;
import { QuadroEconomicoRapportino } from "@/components/orders/QuadroEconomicoRapportino";
import { CostiDaCompletareCommessa } from "@/components/orders/CostiDaCompletareCommessa";
import { RifiutaRapportinoDialog, useDecisioneRapportino } from "@/components/orders/DecisioneRapportino";
import { orePersoneRapportino } from "@/lib/campo/orePersone";
import { rendicontoDaRapportino } from "@/lib/rendiconti/rendicontiGiornalieri";
import { messaggioErrore } from "@/lib/messaggioErrore";
import { toast } from "sonner";

const NESSUN_VIAGGIO: ReadonlySet<string> = new Set();

interface Props {
  orderId: string;
  /** Bottoni Approva/Rifiuta/PDF direttamente sulla riga (per il popup di Attività). */
  azioniInRiga?: boolean;
  soloDaApprovare?: boolean;
  rapportinoIniziale?: string | null;
  onChiudiRapportinoIniziale?: () => void;
  /** Dopo «Crea il rendiconto di questo giorno»: porta alla vista Rendiconti e lo apre. */
  onApriRendiconto?: (rendicontoId: string) => void;
}

const fmtSafeDate = (value: string | null | undefined, pattern: string) => {
  if (!value) return "—";
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return format(parsed, pattern, { locale: dateFnsCampo() });
};

// ── Badge stato ────────────────────────────────────────────────────────────────
function StatoBadge({ stato }: { stato: RapportinoStato }) {
  const t = useT();
  const map: Record<RapportinoStato, { label: string; cls: string }> = {
    bozza:     { label: "Bozza",     cls: "bg-slate-100 text-slate-600 border-slate-300" },
    inviato:   { label: "Da approvare", cls: "border-amber-400 text-amber-600 bg-amber-50" },
    approvato: { label: "Approvato", cls: "bg-green-600 text-white border-green-600" },
    rifiutato: { label: "Rifiutato", cls: "bg-red-100 text-red-600 border-red-300" },
  };
  const s = map[stato] ?? map.bozza;
  return (
    <Badge variant="outline" className={`text-[10px] py-0 ${s.cls}`}>
      {t(s.label)}
    </Badge>
  );
}

const BadgeAnnullato = () => { const t = useT(); return <Badge variant="outline" className="text-[10px] py-0 border-slate-300 bg-slate-100 text-slate-600">{t("Annullato")}</Badge>; };

const ETICHETTA_SEZIONE = "text-[11px] font-semibold uppercase tracking-wide text-slate-500";

/** Stato del rapportino, anche per i record vecchi senza il campo `stato`. */
function statoDi(r: { stato?: string | null; approvato?: boolean | null }): RapportinoStato {
  const raw = r.stato ?? (r.approvato ? "approvato" : "inviato");
  return raw === "inviato" || raw === "approvato" || raw === "rifiutato" ? raw : "bozza";
}

const formatOre = (ore: number) =>
  `${Number.isInteger(ore) ? ore : ore.toLocaleString(intlCampo(), { maximumFractionDigits: 1 })} h`;

const TESSERA_STATO: Record<RapportinoStato, string> = {
  approvato: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  inviato: "bg-amber-50 text-amber-800 ring-amber-300",
  rifiutato: "bg-red-50 text-red-800 ring-red-200",
  bozza: "bg-slate-100 text-slate-700 ring-slate-200",
};

/** Il giorno come una tessera di calendario: il colore dice a che punto è il rapportino. */
function TesseraGiorno({ data, stato }: { data: string | null | undefined; stato: RapportinoStato }) {
  return (
    <div className={cn("flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-lg ring-1", TESSERA_STATO[stato])}>
      <span className="text-lg font-bold leading-none tabular-nums">{fmtSafeDate(data, "d")}</span>
      <span className="mt-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide">{fmtSafeDate(data, "MMM")}</span>
      <span className="mt-0.5 text-[9px] leading-none opacity-70">{fmtSafeDate(data, "yyyy")}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

type RigaOre = { presenze?: unknown; ore_lavorate?: unknown; ore_straordinario?: unknown };
const presenzeDi = (r: RigaOre) => (Array.isArray(r.presenze) ? (r.presenze as Array<{ ore?: unknown; employee_id?: unknown }>) : []);
const haPresenze = (r: RigaOre) => presenzeDi(r).length > 0;
export { orePersoneRapportino };

export function OrdineRapportiniCampo({ orderId, azioniInRiga = false, soloDaApprovare = false, rapportinoIniziale = null, onChiudiRapportinoIniziale, onApriRendiconto }: Props) {
  const qc = useQueryClient();
  const t = useT();
  const { schema: moduloCantiere } = useModuloRapportino(orderId);
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const { canEditOrders, canViewCosts, canViewOrderAmounts } = usePermissions();
  const [creandoRendiconto, setCreandoRendiconto] = useState<string | null>(null);
  // Il rapportino è il diario interno: il foglio per il committente è un documento suo, che nasce in bozza.
  const creaRendiconto = async (rapportinoId: string) => {
    setCreandoRendiconto(rapportinoId);
    try {
      const nuovo = await rendicontoDaRapportino(rapportinoId);
      toast.success(t("Rendiconto del giorno aperto: controlla i prezzi e conferma"));
      if (onApriRendiconto) onApriRendiconto(nuovo);
    } catch (e) {
      toast.error(messaggioErrore(e, t("Rendiconto non creato")));
    } finally {
      setCreandoRendiconto(null);
    }
  };

  // Stato della vista legato alla commessa: nessun frame con la pagina o il
  // rapporto espanso della commessa precedente, né reset asincrono delle scelte.
  const [expanded, setExpanded] = useState({ orderId, id: rapportinoIniziale });
  const expandedId = expanded.orderId === orderId ? expanded.id : null;
  const setExpandedId = (id: string | null) => {
    setExpanded({ orderId, id });
    if (id === null && rapportinoIniziale && expandedId === rapportinoIniziale) onChiudiRapportinoIniziale?.();
  };
  const [page, setPage] = useState({ orderId, count: 10 });
  const visibleCount = page.orderId === orderId ? page.count : 10;
  const setVisibleCount = (value: number | ((previous: number) => number)) => setPage(previous => ({
    orderId, count: typeof value === "function" ? value(previous.orderId === orderId ? previous.count : 10) : value,
  }));
  const [approvalId, setApprovalId] = useState<string | null>(null);
  const [fotoModal, setFotoModal] = useState<string | null>(null);
  const [firmaModal, setFirmaModal] = useState<{ url: string; title: string } | null>(null);

  // Rifiuto dialog
  const [rifiutaId, setRifiutaId] = useState<string | null>(null);
  const [motivoRifiuto, setMotivoRifiuto] = useState("");

  const { data: tuttiRapportini = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["order-campo-rapportini", orderId, companyId, ...(soloDaApprovare ? ["da-approvare"] : [])],
    refetchOnWindowFocus: true,
    queryFn: async () => {
      let query = supabase
        .from("campo_rapportini")
        // NB: FK esplicita — campo_rapportini ha DUE relazioni verso profiles
        // (user_id e approvato_da): senza disambiguare PostgREST rifiuta l'embed.
        .select(COLONNE_RAPPORTINO_CON_AUTORE)
        .eq("order_id", orderId)
        .eq("company_id", companyId!)
        .order("data_lavoro", { ascending: false });
      if (soloDaApprovare) query = query.eq("stato", "inviato");
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orderId && !!companyId,
  });

  // Gli annullati non contano e non si vedono, salvo chiederli.
  const [mostraAnnullati, setMostraAnnullati] = useState(false);
  const quantiAnnullati = useMemo(() => tuttiRapportini.filter((r) => r.annullato_at).length, [tuttiRapportini]);
  const rapportini = useMemo(() => (mostraAnnullati ? tuttiRapportini : tuttiRapportini.filter((r) => !r.annullato_at)), [mostraAnnullati, tuttiRapportini]);

  // Filtri dell'elenco (25/11/2026), legati alla commessa come le altre scelte della vista.
  const conFiltri = !azioniInRiga && !soloDaApprovare;
  const [filtriStato, setFiltriStato] = useState({ orderId, f: FILTRI_VUOTI });
  const filtri = filtriStato.orderId === orderId ? filtriStato.f : FILTRI_VUOTI;
  const cambiaFiltri = (patch: Partial<FiltriRapportini>) => { setFiltriStato({ orderId, f: { ...filtri, ...patch } }); setVisibleCount(10); };
  // I rapportini con una voce di viaggio: le voci le legge solo chi vede i costi, gli altri si affidano alla descrizione.
  const { data: viaggiLetti } = useQuery({
    queryKey: ["order-campo-rapportini-viaggi", orderId, companyId],
    enabled: conFiltri && canViewCosts && !!orderId && !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("rapportino_voci_libere").select("rapportino_id, descrizione, unita, viaggio").eq("order_id", orderId);
      if (error) throw error;
      return (((data ?? []) as Array<{ rapportino_id: string; descrizione: string; unita: string; viaggio: unknown }>)
        .filter((v) => v.viaggio || /^viaggi[oi]$/i.test(v.unita?.trim() ?? "") || /^(trasport[oi]|viaggi[oi])\b/i.test(v.descrizione?.trim() ?? ""))
        .map((v) => v.rapportino_id));
    },
  });
  const conViaggi = useMemo(() => (Array.isArray(viaggiLetti) ? new Set(viaggiLetti) : NESSUN_VIAGGIO), [viaggiLetti]);
  const filtrati = useMemo(() => (conFiltri ? filtraRapportini<(typeof rapportini)[number]>(rapportini, filtri, statoDi, conViaggi) : rapportini), [conFiltri, rapportini, filtri, conViaggi]);
  const conteggi = useMemo(() => {
    const c = { inviato: 0, approvato: 0, rifiutato: 0, trasporti: 0 };
    for (const r of rapportini) {
      const st = statoDi(r);
      if (st === "inviato" || st === "approvato" || st === "rifiutato") c[st] += 1;
      if (rapportinoDiTrasporto(r, conViaggi)) c.trasporti += 1;
    }
    return c;
  }, [rapportini, conViaggi]);
  const mesi = useMemo(() => [...new Set(rapportini.map((r) => (r.data_lavoro ?? "").slice(0, 7)).filter(Boolean))], [rapportini]);

  // phase_id → nome della fase: i rapportini scritti prima che il nome entrasse nella voce hanno solo l'id.
  const { data: nomiFasi } = useQuery({
    queryKey: ["order-campo-fasi-nomi", orderId, companyId],
    queryFn: async (): Promise<ReadonlyMap<string, string>> => {
      // order_work_phases non è nei tipi generati → cast
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("order_work_phases").select("id, name").eq("order_id", orderId);
      if (error) throw error;
      return new Map(((data ?? []) as { id: string; name: string | null }[]).map((f) => [f.id, f.name ?? ""] as const));
    },
    enabled: !!orderId && !!companyId,
    staleTime: 60_000,
  });

  const { canApprove, puoDecidereSu, approvaMutation, rifiutaMutation } = useDecisioneRapportino(orderId, {
    onApprovato: () => setApprovalId(null),
    onRifiutato: () => { setRifiutaId(null); setMotivoRifiuto(""); },
  });

  const handleRifiuta = () => {
    if (!rifiutaId) return;
    const originale = rapportini.find((r) => r.id === rifiutaId);
    rifiutaMutation.mutate({ id: rifiutaId, motivo: motivoRifiuto, originale });
  };


  // Riepilogo e gruppi per mese. I totali del mese contano TUTTI i rapportini,
  // anche quelli non ancora mostrati dalla paginazione.
  const { riepilogo, gruppi } = useMemo(() => {
    const mese = (data: string | null | undefined) => (data ?? "").slice(0, 7);
    const perMese = new Map<string, { totale: number; ore: number }>();
    let ore = 0;
    let daApprovare = 0;
    let avanzamento: number | null = null;
    for (const r of rapportini) {
      // Un rapportino respinto non porta ore; quello di squadra porta le ore delle persone,
      // senza quelle delle ditte: le stesse che diventano costo all'approvazione.
      const oreRiga = statoDi(r) === "rifiutato" ? 0 : orePersoneRapportino(r);
      ore += oreRiga;
      if (statoDi(r) === "inviato") daApprovare += 1;
      // l'elenco è dal più recente: il primo avanzamento trovato è l'ultimo dichiarato
      if (avanzamento == null && r.percentuale_avanzamento != null) avanzamento = Math.round(Number(r.percentuale_avanzamento) || 0);
    }
    // I titoli dei mesi contano quello che si vede: con un filtro, solo i rapportini filtrati.
    for (const r of filtrati) {
      const oreRiga = statoDi(r) === "rifiutato" ? 0 : orePersoneRapportino(r);
      const m = mese(r.data_lavoro);
      const corrente = perMese.get(m) ?? { totale: 0, ore: 0 };
      corrente.totale += 1;
      corrente.ore += oreRiga;
      perMese.set(m, corrente);
    }
    const gruppi: Array<{ mese: string; etichetta: string; totale: number; ore: number; righe: typeof rapportini }> = [];
    for (const r of filtrati.filter((r, indice) => indice < visibleCount || r.id === expandedId)) {
      const m = mese(r.data_lavoro);
      let gruppo = gruppi[gruppi.length - 1];
      if (!gruppo || gruppo.mese !== m) {
        gruppo = { mese: m, etichetta: fmtSafeDate(r.data_lavoro, "LLLL yyyy"), ...(perMese.get(m) ?? { totale: 0, ore: 0 }), righe: [] };
        gruppi.push(gruppo);
      }
      gruppo.righe.push(r);
    }
    return { riepilogo: { ore, daApprovare, avanzamento }, gruppi };
  }, [rapportini, filtrati, visibleCount, expandedId]);

  return (
    <Card>
      <CardHeader className="gap-4 pb-3 max-sm:p-3 max-sm:pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          {soloDaApprovare ? t("Rapportini da approvare") : t("Rapportini Campo")} ({isLoading ? "…" : isError ? "—" : rapportini.length})
        </CardTitle>
        {/* Nuovo rapportino e documenti in una riga sola, in testa all'elenco (25/11/2026). */}
        {!azioniInRiga && (
          <div className="flex flex-wrap items-center gap-2">
            {!soloDaApprovare && canEditOrders && <NuoviRapportiniUfficio orderId={orderId} />}
            {!isLoading && !isError && <RapportiPeriodoDialog companyId={companyId} orderId={orderId} mese="Rapportini della commessa" righe={rapportini.filter((r) => !r.annullato_at)} conDatiEconomici={canViewCosts} />}
          </div>
        )}
        {/* Colpo d'occhio: quante ore, cosa aspetta l'ufficio, a che punto sono i lavori.
            Nel popup di Attività (azioniInRiga) si nasconde: lì serve solo approvare. */}
        {!azioniInRiga && quantiAnnullati > 0 && (
          <Button variant="ghost" size="sm" className="w-fit px-0 text-xs" onClick={() => setMostraAnnullati((v) => !v)}>
            {mostraAnnullati ? t("Nascondi annullati") : t("Mostra annullati ({n})", { n: quantiAnnullati })}
          </Button>
        )}
        {!azioniInRiga && !isLoading && !isError && rapportini.length > 0 && (
          <dl className="flex flex-wrap gap-x-8 gap-y-3">
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{t("Ore registrate")}</dt>
              <dd className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{formatOre(riepilogo.ore)}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{t("Da approvare")}</dt>
              <dd className={cn("mt-0.5 text-lg font-bold tabular-nums", riepilogo.daApprovare > 0 ? "text-amber-700" : "text-emerald-700")}>
                {riepilogo.daApprovare > 0 ? riepilogo.daApprovare : t("Nessuno")}
              </dd>
            </div>
            {riepilogo.avanzamento != null && (
              <div>
                <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{t("Ultimo avanzamento")}</dt>
                <dd className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{riepilogo.avanzamento}%</dd>
              </div>
            )}
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{t("Ultimo rapportino")}</dt>
              <dd className="mt-0.5 text-lg font-bold text-slate-900">{fmtSafeDate(rapportini[0]?.data_lavoro, "d MMM yyyy")}</dd>
            </div>
          </dl>
        )}
      </CardHeader>
      <CardContent className="max-sm:p-3 max-sm:pt-0">
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="animate-spin h-5 w-5" /></div>
        ) : isError ? (
          <div role="alert" className="space-y-2 text-sm"><p>{t("Rapportini non disponibili. Non è possibile verificare il consuntivo.")}</p><Button variant="outline" onClick={() => refetch()}>{t("Riprova")}</Button></div>
        ) : rapportini.length === 0 ? (
          <p className="text-sm text-muted-foreground">{soloDaApprovare ? t("Nessun rapportino da approvare") : t("Nessun rapportino caricato dagli operai")}</p>
        ) : (
          <div className="space-y-4">
            {!soloDaApprovare && canViewCosts && <CostiDaCompletareCommessa orderId={orderId} />}
            {!soloDaApprovare && <TotaliCampiCommessa orderId={orderId} rapportini={rapportini} />}
            {conFiltri && (
              <div role="search" aria-label={t("Filtra i rapportini")} className="space-y-2 rounded-lg border bg-slate-50/60 p-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {([
                    ["tutti", t("Tutti"), rapportini.length],
                    ["inviato", t("Da approvare"), conteggi.inviato],
                    ["approvato", t("Approvati"), conteggi.approvato],
                    ["rifiutato", t("Rifiutati"), conteggi.rifiutato],
                  ] as Array<[FiltroStato, string, number]>).filter(([v, , n]) => v === "tutti" || n > 0 || filtri.stato === v).map(([v, etichetta, n]) => (
                    <button key={v} type="button" aria-pressed={filtri.stato === v} onClick={() => cambiaFiltri({ stato: v })}
                      className={cn("rounded-full border px-2.5 py-1 text-xs font-medium",
                        filtri.stato === v ? "border-slate-900 bg-slate-900 text-white" : "border-border bg-white text-slate-700 hover:bg-slate-100")}>
                      {etichetta} <span className="tabular-nums opacity-70">{n}</span>
                    </button>
                  ))}
                  <span className="mx-1 h-5 w-px bg-border" aria-hidden />
                  {([
                    ["tutti", t("Tutti i tipi")],
                    ["lavori", t("Lavori")],
                    ["trasporti", t("Trasporti")],
                  ] as Array<[FiltroTipo, string]>).map(([v, etichetta]) => (
                    <button key={v} type="button" aria-pressed={filtri.tipo === v} onClick={() => cambiaFiltri({ tipo: v })}
                      className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                        filtri.tipo === v ? "border-blue-700 bg-blue-700 text-white" : "border-border bg-white text-slate-700 hover:bg-slate-100")}>
                      {v === "trasporti" && <Truck className="h-3 w-3" />}{etichetta}
                      {v === "trasporti" && <span className="tabular-nums opacity-70">{conteggi.trasporti}</span>}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[12rem] flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input value={filtri.cerca} onChange={(e) => cambiaFiltri({ cerca: e.target.value })} placeholder={t("Cerca nei lavori, nelle note o per persona…")}
                      aria-label={t("Cerca nei rapportini")} className="h-8 pl-8 text-sm" />
                  </div>
                  {mesi.length > 1 && (
                    <select value={filtri.mese} onChange={(e) => cambiaFiltri({ mese: e.target.value })} aria-label={t("Mese dei rapportini")}
                      className="h-8 rounded-md border bg-white px-2 text-sm">
                      <option value="">{t("Tutti i mesi")}</option>
                      {mesi.map((m) => <option key={m} value={m}>{fmtSafeDate(`${m}-01`, "LLLL yyyy")}</option>)}
                    </select>
                  )}
                  {filtriAttivi(filtri) && (
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => cambiaFiltri(FILTRI_VUOTI)}>
                      <X className="mr-1 h-3.5 w-3.5" />{t("Togli i filtri")}
                    </Button>
                  )}
                </div>
                {filtriAttivi(filtri) && (
                  <p className="text-xs text-muted-foreground" aria-live="polite">{t("{n} di {totale} rapportini con questi filtri", { n: filtrati.length, totale: rapportini.length })}</p>
                )}
              </div>
            )}
            {conFiltri && filtrati.length === 0 && (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{t("Nessun rapportino con questi filtri.")}</p>
            )}
            {gruppi.map((gruppo) => (
              <section key={gruppo.mese} aria-label={gruppo.etichetta} className="space-y-2">
                {/* Un titolo per mese: con molti rapportini si trova il periodo senza leggerli tutti. */}
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 px-0.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">{gruppo.etichetta}</h3>
                  <span className="text-xs text-slate-500">
                    {t(gruppo.totale === 1 ? "{n} rapportino" : "{n} rapportini", { n: gruppo.totale })} · {formatOre(gruppo.ore)}
                  </span>
                </div>
                <div className="divide-y overflow-hidden rounded-lg border bg-card">
                  {gruppo.righe.map((r) => {
                    const stato = statoDi(r);
                    const aperto = expandedId === r.id;
                    const pct = r.percentuale_avanzamento == null ? null : Math.min(100, Math.max(0, Number(r.percentuale_avanzamento) || 0));
                    const autore = [r.autore?.first_name, r.autore?.last_name].filter(Boolean).join(" ") || t("Registrazione manuale");
                    const nFoto = Array.isArray(r.foto_urls) ? r.foto_urls.length : 0;
                    return (
                      <div key={r.id} className={cn(aperto && "bg-slate-50/60")}>
                        {/* Riga del rapportino */}
                        <div className="flex items-center">
                        <button
                          type="button"
                          aria-expanded={aperto}
                          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 p-3 text-left transition-colors max-sm:gap-2.5 max-sm:p-2.5 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                          onClick={() => {
                            // Da approvare: il popup con i dettagli e la decisione. Altrimenti il popup di lettura.
                            if (stato === "inviato" && puoDecidereSu(r.user_id)) setApprovalId(r.id);
                            else setExpandedId(aperto ? null : r.id);
                          }}
                        >
                          <TesseraGiorno data={r.data_lavoro} stato={stato} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span dir="auto" className="text-sm font-semibold text-slate-900">{autore}</span>
                              {/* sul telefono lo stato sta accanto al nome: la colonna di destra si libera */}
                              <span className="sm:hidden">{r.annullato_at ? <BadgeAnnullato /> : <StatoBadge stato={stato} />}</span>
                              {r.lavoro_completato && (
                                <Badge variant="outline" className="border-emerald-600 bg-emerald-600 py-0 text-[10px] text-white">
                                  {t("Fine lavori")}
                                </Badge>
                              )}
                              {r.lavoro_completato && r.firma_cliente_url && (
                                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 py-0 text-[10px] text-emerald-700">
                                  <PenLine className="mr-0.5 h-2.5 w-2.5" />
                                  {t("Firmato dal cliente")}
                                </Badge>
                              )}
                              <SourceBadge source={r.source} />
                            </div>
                            {/* Una riga di cosa si è fatto: con la sola data i rapportini sembrano tutti uguali. */}
                            {r.descrizione_lavori && !aperto && (
                              <p dir="auto" className="mt-0.5 truncate text-xs text-slate-600">{r.descrizione_lavori}</p>
                            )}
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                              {haPresenze(r) ? (
                                <span className="inline-flex items-center gap-1 font-medium text-slate-800" title={t("Ore delle persone della squadra, senza le ditte")}>
                                  <Clock className="h-3 w-3 text-slate-400" aria-hidden="true" />
                                  {t("{ore}h di squadra", { ore: orePersoneRapportino(r).toLocaleString(intlCampo()) })}
                                </span>
                              ) : r.ore_lavorate != null && (
                                <span className="inline-flex items-center gap-1 font-medium text-slate-800" title={t("Ore lavorate")}>
                                  <Clock className="h-3 w-3 text-slate-400" aria-hidden="true" />
                                  {r.ore_lavorate}h
                                </span>
                              )}
                              {!haPresenze(r) && r.ore_straordinario > 0 && (
                                <span className="font-medium text-amber-700" title={t("Ore di straordinario")}>{t("+{ore}h str.", { ore: r.ore_straordinario })}</span>
                              )}
                              {pct != null && (
                                <span className="inline-flex items-center gap-1.5" title={t("Avanzamento dichiarato nel rapportino")}>
                                  <span className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-200">
                                    <span className="block h-full rounded-full bg-orange-500" style={{ width: `${pct}%` }} />
                                  </span>
                                  <span className="tabular-nums">{t("{pct}% avanz.", { pct })}</span>
                                </span>
                              )}
                              {nFoto > 0 && (
                                <span className="inline-flex items-center gap-1" title={t("{n} foto allegate", { n: nFoto })}>
                                  <ImageIcon className="h-3 w-3 text-slate-400" aria-hidden="true" />{nFoto}
                                </span>
                              )}
                              {r.firma_cliente_url && <span title={t("Firma del cliente")}><PenLine className="h-3 w-3 text-blue-500" aria-label={t("Firma del cliente")} /></span>}
                              {r.firma_operaio_url && <span title={t("Firma dell'operaio")}><PenLine className="h-3 w-3 text-amber-500" aria-label={t("Firma dell'operaio")} /></span>}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <span className="max-sm:hidden">{r.annullato_at ? <BadgeAnnullato /> : <StatoBadge stato={stato} />}</span>
                            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", aperto && "rotate-180")} aria-hidden="true" />
                          </div>
                        </button>
                        {/* Azioni rapide sulla riga (popup di Attività): approva/rifiuta senza aprire il dettaglio. */}
                        {azioniInRiga && puoDecidereSu(r.user_id) && stato === "inviato" && (
                          <div className="flex shrink-0 items-center gap-1.5 pl-1 pr-3 max-sm:pr-2.5">
                            <Button size="sm" onClick={() => setApprovalId(r.id)} disabled={approvaMutation.isPending}>
                              <Check className="h-3.5 w-3.5 sm:mr-1" /><span className="max-sm:hidden">{t("Approva")}</span>
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => { setRifiutaId(r.id); setMotivoRifiuto(""); }}>
                              <X className="h-3.5 w-3.5 sm:mr-1" /><span className="max-sm:hidden">{t("Rifiuta")}</span>
                            </Button>
                          </div>
                        )}
                        </div>

                        {/* Dettaglio espandibile: allineato al testo della riga, a sezioni con etichetta */}
                        {aperto && (
                          <Dialog open onOpenChange={(o) => { if (!o) setExpandedId(null); }}>
                          <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
                          <DialogHeader>
                            <DialogTitle dir="auto">{t("Rapportino · {autore} · {data}", { autore, data: fmtSafeDate(r.data_lavoro, "d MMMM yyyy") })}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            {r.descrizione_lavori && (
                              <div>
                                <p className={ETICHETTA_SEZIONE}>{t("Lavori svolti")}</p>
                                <p dir="auto" className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-800">{r.descrizione_lavori}</p>
                              </div>
                            )}

                            {/* Motivo rifiuto */}
                            {stato === "rifiutato" && r.motivo_rifiuto && (
                              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                                <p className="text-xs font-medium text-red-700">{r.annullato_at ? t("Motivo annullamento") : t("Motivo rifiuto")}</p>
                                <p dir="auto" className="text-xs text-red-600 mt-0.5">{r.motivo_rifiuto}</p>
                              </div>
                            )}

                            {/* Squadra del giorno dichiarata dal capocantiere:
                                un rapportino solo per tutto il cantiere. */}
                            {Array.isArray(r.presenze) && r.presenze.length > 0 && (
                              <div>
                                <p className={ETICHETTA_SEZIONE}>{t("Squadra del giorno")}</p>
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                  {(r.presenze as Array<{ nome?: string; ore?: number; subappaltatore_id?: string }>).map((pz, i) => (
                                    <span
                                      key={i}
                                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
                                    >
                                      <span className="font-medium">{pz.nome ?? "—"}</span> · {Number(pz.ore) || 0}h
                                      {pz.subappaltatore_id ? ` · ${t("sub")}` : ""}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Mezzi e attrezzi usati: li scrive l'ufficio nel suo rapportino (31/10/2026). */}
                            {(() => {
                              // Colonna nuova, non ancora nei tipi generati.
                              const mezziUsati = (r as { mezzi_usati?: unknown }).mezzi_usati;
                              return Array.isArray(mezziUsati) && mezziUsati.length > 0 && (
                              <div>
                                <p className={ETICHETTA_SEZIONE}>{t("Mezzi usati")}</p>
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                  {(mezziUsati as Array<{ nome?: string; ore?: number }>).map((m, i) => (
                                    <span key={i} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                                      <span className="font-medium">{m.nome ?? "—"}</span>{m.ore != null ? ` · ${Number(m.ore)}h` : ""}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              );
                            })()}

                            {/* Lavorazioni con i loro materiali e le loro foto, poi quello che non è legato a una fase */}
                            {compilatoDa(r as unknown as Record<string, unknown>) && <p className="text-xs text-muted-foreground">{compilatoDa(r as unknown as Record<string, unknown>)}</p>}
                            <CampiDaCompletare report={r} schema={moduloCantiere} puoModificare={canEditOrders}
                              onSalvato={() => void qc.invalidateQueries({ queryKey: ["order-campo-rapportini", orderId] })} />
                            <RapportinoBlocchi report={r} nomiFasi={nomiFasi} onFoto={(url) => { void linkFileRiservato(url).then((u) => setFotoModal(u)); }} />

                            {/* Firme */}
                            {(r.firma_cliente_url || r.firma_operaio_url) && (
                              <div>
                                <p className={ETICHETTA_SEZIONE}>{t("Firme")}</p>
                                <div className="mt-1.5 flex flex-wrap gap-4">
                                  {r.firma_cliente_url && (
                                    <div>
                                      <p className="mb-1 text-xs text-muted-foreground">
                                        {t("Cliente")}{r.firma_cliente_nome ? `: ${r.firma_cliente_nome}` : ""}
                                      </p>
                                      <ImgRiservata loading="lazy"
                                        src={r.firma_cliente_url} alt={t("Firma cliente")}
                                        className="h-16 cursor-pointer rounded-md border bg-white"
                                        onClick={() => setFirmaModal({ url: r.firma_cliente_url, title: t("Firma cliente") })}
                                      />
                                    </div>
                                  )}
                                  {r.firma_operaio_url && (
                                    <div>
                                      <p className="mb-1 text-xs text-muted-foreground">{t("Operaio")}</p>
                                      <ImgRiservata loading="lazy"
                                        src={r.firma_operaio_url} alt={t("Firma operaio")}
                                        className="h-16 cursor-pointer rounded-md border bg-white"
                                        onClick={() => setFirmaModal({ url: r.firma_operaio_url, title: t("Firma operaio") })}
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Azioni admin */}
                            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                              {canViewCosts && <div className="w-full"><QuadroEconomicoRapportino rapportinoId={r.id} puoModificare={!r.annullato_at && canEditOrders} /></div>}
                              <StoricoSpazio rapportinoId={r.id} />
                              <AzioniRapportino report={r} orderId={orderId} onFatto={() => setExpandedId(null)} />
                              <PulsantePdfRapportino report={r} orderId={orderId} />
                              {canEditOrders && canViewOrderAmounts && stato !== "rifiutato" && !r.annullato_at && (
                                <Button size="sm" variant="outline" disabled={creandoRendiconto === r.id} onClick={() => void creaRendiconto(r.id)}>
                                  {t("Crea il rendiconto di questo giorno")}
                                </Button>
                              )}
                              {puoDecidereSu(r.user_id) && stato === "rifiutato" && !r.annullato_at && !(r as { ufficio_employee_id?: string | null }).ufficio_employee_id && (
                                <Button
                                  size="sm"
                                  onClick={() => setApprovalId(r.id)}
                                  disabled={approvaMutation.isPending}
                                >
                                  <Check className="h-3 w-3 mr-1" /> {t("Approva ora")}
                                </Button>
                              )}

                              {stato === "approvato" && r.approvato_at && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  {t("Approvato il {data}", { data: fmtSafeDate(r.approvato_at, "d MMM yyyy HH:mm") })}
                                </div>
                              )}
                            </div>
                          </div>
                          </DialogContent>
                          </Dialog>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
            {filtrati.length > 10 && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <p className="text-xs text-muted-foreground" aria-live="polite">{t("Mostrati {visibili} di {totale} rapportini", { visibili: Math.min(visibleCount, filtrati.length), totale: filtrati.length })}</p>
                {visibleCount < filtrati.length && <Button variant="outline" size="sm" onClick={() => setVisibleCount(count => count + 10)}>{t("Mostra altri 10")}</Button>}
              </div>
            )}
          </div>
        )}
      </CardContent>
      {approvalId && companyId && canApprove && <LaborApprovalDialog
        key={companyId + ":" + approvalId + ":" + canViewCosts}
        companyId={companyId} orderId={orderId} reportId={approvalId} showCosts={canViewCosts}
        busy={approvaMutation.isPending} onClose={() => setApprovalId(null)}
        onInspect={id => {
          setApprovalId(null);
          setVisibleCount(count => Math.max(count, rapportini.findIndex(report => report.id === id) + 1));
          setExpandedId(id);
        }}
        onApprove={(fingerprint, acknowledged) => approvaMutation.mutate({rapportinoId: approvalId, fingerprint, acknowledged})}
        onReject={puoDecidereSu(rapportini.find((r) => r.id === approvalId)?.user_id) ? () => { const id = approvalId; setApprovalId(null); setMotivoRifiuto(""); setRifiutaId(id); } : undefined}
      />}

      {/* Modal foto fullscreen */}
      <Dialog open={!!fotoModal} onOpenChange={() => setFotoModal(null)}>
        <DialogContent className="max-w-2xl">
          {fotoModal && <ImgRiservata loading="lazy" src={fotoModal} alt={t("Foto")} className="w-full rounded-lg" />}
        </DialogContent>
      </Dialog>

      {/* Modal firma */}
      <Dialog open={!!firmaModal} onOpenChange={() => setFirmaModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{firmaModal?.title ?? t("Firma")}</DialogTitle>
          </DialogHeader>
          {firmaModal && (
            <ImgRiservata loading="lazy" src={firmaModal.url} alt={firmaModal.title} className="w-full bg-white rounded-lg" />
          )}
        </DialogContent>
      </Dialog>

      {rifiutaId && <RifiutaRapportinoDialog motivo={motivoRifiuto} onMotivo={setMotivoRifiuto} busy={rifiutaMutation.isPending}
        onClose={() => { setRifiutaId(null); setMotivoRifiuto(""); }} onConferma={handleRifiuta} />}
    </Card>
  );
}
