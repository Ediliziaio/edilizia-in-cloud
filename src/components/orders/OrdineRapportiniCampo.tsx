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
import { it } from "date-fns/locale";
import {
  ClipboardList, Check, ChevronDown, Image as ImageIcon, PenLine,
  Loader2, X, Clock,
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
import { CorreggiRapportino, StoricoRapportino } from "@/components/orders/CorreggiRapportino";

const StoricoSpazio = ({ rapportinoId }: { rapportinoId: string }) => <div className="w-full"><StoricoRapportino rapportinoId={rapportinoId} /></div>;
import { QuadroEconomicoRapportino } from "@/components/orders/QuadroEconomicoRapportino";
import { CostiDaCompletareCommessa } from "@/components/orders/CostiDaCompletareCommessa";
import { AnnullaRapportinoDialog, RifiutaRapportinoDialog, useDecisioneRapportino } from "@/components/orders/DecisioneRapportino";
import { orePersoneRapportino } from "@/lib/campo/orePersone";

interface Props { orderId: string; /** Bottoni Approva/Rifiuta/PDF direttamente sulla riga (per il popup di Attività). */ azioniInRiga?: boolean; soloDaApprovare?: boolean; }

const fmtSafeDate = (value: string | null | undefined, pattern: string) => {
  if (!value) return "—";
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return format(parsed, pattern, { locale: it });
};

// ── Badge stato ────────────────────────────────────────────────────────────────
function StatoBadge({ stato }: { stato: RapportinoStato }) {
  const map: Record<RapportinoStato, { label: string; cls: string }> = {
    bozza:     { label: "Bozza",     cls: "bg-slate-100 text-slate-600 border-slate-300" },
    inviato:   { label: "Da approvare", cls: "border-amber-400 text-amber-600 bg-amber-50" },
    approvato: { label: "Approvato", cls: "bg-green-600 text-white border-green-600" },
    rifiutato: { label: "Rifiutato", cls: "bg-red-100 text-red-600 border-red-300" },
  };
  const s = map[stato] ?? map.bozza;
  return (
    <Badge variant="outline" className={`text-[10px] py-0 ${s.cls}`}>
      {s.label}
    </Badge>
  );
}

const BadgeAnnullato = () => <Badge variant="outline" className="text-[10px] py-0 border-slate-300 bg-slate-100 text-slate-600">Annullato</Badge>;

const ETICHETTA_SEZIONE = "text-[11px] font-semibold uppercase tracking-wide text-slate-500";

/** Stato del rapportino, anche per i record vecchi senza il campo `stato`. */
function statoDi(r: { stato?: string | null; approvato?: boolean | null }): RapportinoStato {
  const raw = r.stato ?? (r.approvato ? "approvato" : "inviato");
  return raw === "inviato" || raw === "approvato" || raw === "rifiutato" ? raw : "bozza";
}

const formatOre = (ore: number) =>
  `${Number.isInteger(ore) ? ore : ore.toLocaleString("it-IT", { maximumFractionDigits: 1 })} h`;

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

export function OrdineRapportiniCampo({ orderId, azioniInRiga = false, soloDaApprovare = false }: Props) {
  const qc = useQueryClient();
  const { schema: moduloCantiere } = useModuloRapportino(orderId);
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const { canEditOrders, canViewCosts } = usePermissions();

  // Stato della vista legato alla commessa: nessun frame con la pagina o il
  // rapporto espanso della commessa precedente, né reset asincrono delle scelte.
  const [expanded, setExpanded] = useState({ orderId, id: null as string | null });
  const expandedId = expanded.orderId === orderId ? expanded.id : null;
  const setExpandedId = (id: string | null) => setExpanded({ orderId, id });
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
  const [annulla, setAnnulla] = useState<{ id: string; updatedAt: string } | null>(null);
  const [motivoAnnulla, setMotivoAnnulla] = useState("");
  const quantiAnnullati = useMemo(() => tuttiRapportini.filter((r) => r.annullato_at).length, [tuttiRapportini]);
  const rapportini = useMemo(() => (mostraAnnullati ? tuttiRapportini : tuttiRapportini.filter((r) => !r.annullato_at)), [mostraAnnullati, tuttiRapportini]);

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

  const { canApprove, puoDecidereSu, approvaMutation, rifiutaMutation, annullaMutation } = useDecisioneRapportino(orderId, {
    onApprovato: () => setApprovalId(null),
    onRifiutato: () => { setRifiutaId(null); setMotivoRifiuto(""); },
    onAnnullato: () => { setAnnulla(null); setMotivoAnnulla(""); setExpandedId(null); },
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
      const m = mese(r.data_lavoro);
      const corrente = perMese.get(m) ?? { totale: 0, ore: 0 };
      corrente.totale += 1;
      corrente.ore += oreRiga;
      perMese.set(m, corrente);
    }
    const gruppi: Array<{ mese: string; etichetta: string; totale: number; ore: number; righe: typeof rapportini }> = [];
    for (const r of rapportini.slice(0, visibleCount)) {
      const m = mese(r.data_lavoro);
      let gruppo = gruppi[gruppi.length - 1];
      if (!gruppo || gruppo.mese !== m) {
        gruppo = { mese: m, etichetta: fmtSafeDate(r.data_lavoro, "LLLL yyyy"), ...(perMese.get(m) ?? { totale: 0, ore: 0 }), righe: [] };
        gruppi.push(gruppo);
      }
      gruppo.righe.push(r);
    }
    return { riepilogo: { ore, daApprovare, avanzamento }, gruppi };
  }, [rapportini, visibleCount]);

  return (
    <Card>
      <CardHeader className="gap-4 pb-3 max-sm:p-3 max-sm:pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          {soloDaApprovare ? "Rapportini da approvare" : "Rapportini Campo"} ({isLoading ? "…" : isError ? "—" : rapportini.length})
        </CardTitle>
        {/* Colpo d'occhio: quante ore, cosa aspetta l'ufficio, a che punto sono i lavori.
            Nel popup di Attività (azioniInRiga) si nasconde: lì serve solo approvare. */}
        {!azioniInRiga && quantiAnnullati > 0 && (
          <Button variant="ghost" size="sm" className="w-fit px-0 text-xs" onClick={() => setMostraAnnullati((v) => !v)}>
            {mostraAnnullati ? "Nascondi annullati" : `Mostra annullati (${quantiAnnullati})`}
          </Button>
        )}
        {!azioniInRiga && !isLoading && !isError && rapportini.length > 0 && (
          <dl className="flex flex-wrap gap-x-8 gap-y-3">
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Ore registrate</dt>
              <dd className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{formatOre(riepilogo.ore)}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Da approvare</dt>
              <dd className={cn("mt-0.5 text-lg font-bold tabular-nums", riepilogo.daApprovare > 0 ? "text-amber-700" : "text-emerald-700")}>
                {riepilogo.daApprovare > 0 ? riepilogo.daApprovare : "Nessuno"}
              </dd>
            </div>
            {riepilogo.avanzamento != null && (
              <div>
                <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Ultimo avanzamento</dt>
                <dd className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{riepilogo.avanzamento}%</dd>
              </div>
            )}
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Ultimo rapportino</dt>
              <dd className="mt-0.5 text-lg font-bold text-slate-900">{fmtSafeDate(rapportini[0]?.data_lavoro, "d MMM yyyy")}</dd>
            </div>
          </dl>
        )}
      </CardHeader>
      <CardContent className="max-sm:p-3 max-sm:pt-0">
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="animate-spin h-5 w-5" /></div>
        ) : isError ? (
          <div role="alert" className="space-y-2 text-sm"><p>Rapportini non disponibili. Non è possibile verificare il consuntivo.</p><Button variant="outline" onClick={() => refetch()}>Riprova</Button></div>
        ) : rapportini.length === 0 ? (
          <p className="text-sm text-muted-foreground">{soloDaApprovare ? "Nessun rapportino da approvare" : "Nessun rapportino caricato dagli operai"}</p>
        ) : (
          <div className="space-y-4">
            {!soloDaApprovare && canViewCosts && <CostiDaCompletareCommessa orderId={orderId} />}
            {!soloDaApprovare && <TotaliCampiCommessa orderId={orderId} rapportini={rapportini} />}
            {gruppi.map((gruppo) => (
              <section key={gruppo.mese} aria-label={gruppo.etichetta} className="space-y-2">
                {/* Un titolo per mese: con molti rapportini si trova il periodo senza leggerli tutti. */}
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 px-0.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">{gruppo.etichetta}</h3>
                  <span className="text-xs text-slate-500">
                    {gruppo.totale} {gruppo.totale === 1 ? "rapportino" : "rapportini"} · {formatOre(gruppo.ore)}
                  </span>
                </div>
                <div className="divide-y overflow-hidden rounded-lg border bg-card">
                  {gruppo.righe.map((r) => {
                    const stato = statoDi(r);
                    const aperto = expandedId === r.id;
                    const pct = r.percentuale_avanzamento == null ? null : Math.min(100, Math.max(0, Number(r.percentuale_avanzamento) || 0));
                    const autore = [r.autore?.first_name, r.autore?.last_name].filter(Boolean).join(" ") || "Registrazione manuale";
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
                              <span className="text-sm font-semibold text-slate-900">{autore}</span>
                              {/* sul telefono lo stato sta accanto al nome: la colonna di destra si libera */}
                              <span className="sm:hidden">{r.annullato_at ? <BadgeAnnullato /> : <StatoBadge stato={stato} />}</span>
                              {r.lavoro_completato && (
                                <Badge variant="outline" className="border-emerald-600 bg-emerald-600 py-0 text-[10px] text-white">
                                  Fine lavori
                                </Badge>
                              )}
                              {r.lavoro_completato && r.firma_cliente_url && (
                                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 py-0 text-[10px] text-emerald-700">
                                  <PenLine className="mr-0.5 h-2.5 w-2.5" />
                                  Firmato dal cliente
                                </Badge>
                              )}
                              <SourceBadge source={r.source} />
                            </div>
                            {/* Una riga di cosa si è fatto: con la sola data i rapportini sembrano tutti uguali. */}
                            {r.descrizione_lavori && !aperto && (
                              <p className="mt-0.5 truncate text-xs text-slate-600">{r.descrizione_lavori}</p>
                            )}
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                              {haPresenze(r) ? (
                                <span className="inline-flex items-center gap-1 font-medium text-slate-800" title="Ore delle persone della squadra, senza le ditte">
                                  <Clock className="h-3 w-3 text-slate-400" aria-hidden="true" />
                                  {orePersoneRapportino(r).toLocaleString("it-IT")}h di squadra
                                </span>
                              ) : r.ore_lavorate != null && (
                                <span className="inline-flex items-center gap-1 font-medium text-slate-800" title="Ore lavorate">
                                  <Clock className="h-3 w-3 text-slate-400" aria-hidden="true" />
                                  {r.ore_lavorate}h
                                </span>
                              )}
                              {!haPresenze(r) && r.ore_straordinario > 0 && (
                                <span className="font-medium text-amber-700" title="Ore di straordinario">+{r.ore_straordinario}h str.</span>
                              )}
                              {pct != null && (
                                <span className="inline-flex items-center gap-1.5" title="Avanzamento dichiarato nel rapportino">
                                  <span className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-200">
                                    <span className="block h-full rounded-full bg-orange-500" style={{ width: `${pct}%` }} />
                                  </span>
                                  <span className="tabular-nums">{pct}% avanz.</span>
                                </span>
                              )}
                              {nFoto > 0 && (
                                <span className="inline-flex items-center gap-1" title={`${nFoto} ${nFoto === 1 ? "foto" : "foto"} allegate`}>
                                  <ImageIcon className="h-3 w-3 text-slate-400" aria-hidden="true" />{nFoto}
                                </span>
                              )}
                              {r.firma_cliente_url && <span title="Firma del cliente"><PenLine className="h-3 w-3 text-blue-500" aria-label="Firma del cliente" /></span>}
                              {r.firma_operaio_url && <span title="Firma dell'operaio"><PenLine className="h-3 w-3 text-amber-500" aria-label="Firma dell'operaio" /></span>}
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
                              <Check className="h-3.5 w-3.5 sm:mr-1" /><span className="max-sm:hidden">Approva</span>
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => { setRifiutaId(r.id); setMotivoRifiuto(""); }}>
                              <X className="h-3.5 w-3.5 sm:mr-1" /><span className="max-sm:hidden">Rifiuta</span>
                            </Button>
                          </div>
                        )}
                        </div>

                        {/* Dettaglio espandibile: allineato al testo della riga, a sezioni con etichetta */}
                        {aperto && (
                          <Dialog open onOpenChange={(o) => { if (!o) setExpandedId(null); }}>
                          <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
                          <DialogHeader>
                            <DialogTitle>Rapportino · {autore} · {fmtSafeDate(r.data_lavoro, "d MMMM yyyy")}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            {r.descrizione_lavori && (
                              <div>
                                <p className={ETICHETTA_SEZIONE}>Lavori svolti</p>
                                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-800">{r.descrizione_lavori}</p>
                              </div>
                            )}

                            {/* Motivo rifiuto */}
                            {stato === "rifiutato" && r.motivo_rifiuto && (
                              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                                <p className="text-xs font-medium text-red-700">{r.annullato_at ? "Motivo annullamento" : "Motivo rifiuto"}</p>
                                <p className="text-xs text-red-600 mt-0.5">{r.motivo_rifiuto}</p>
                              </div>
                            )}

                            {/* Squadra del giorno dichiarata dal capocantiere:
                                un rapportino solo per tutto il cantiere. */}
                            {Array.isArray(r.presenze) && r.presenze.length > 0 && (
                              <div>
                                <p className={ETICHETTA_SEZIONE}>Squadra del giorno</p>
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                  {(r.presenze as Array<{ nome?: string; ore?: number; subappaltatore_id?: string }>).map((pz, i) => (
                                    <span
                                      key={i}
                                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
                                    >
                                      <span className="font-medium">{pz.nome ?? "—"}</span> · {Number(pz.ore) || 0}h
                                      {pz.subappaltatore_id ? " · sub" : ""}
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
                                <p className={ETICHETTA_SEZIONE}>Mezzi usati</p>
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
                                <p className={ETICHETTA_SEZIONE}>Firme</p>
                                <div className="mt-1.5 flex flex-wrap gap-4">
                                  {r.firma_cliente_url && (
                                    <div>
                                      <p className="mb-1 text-xs text-muted-foreground">
                                        Cliente{r.firma_cliente_nome ? `: ${r.firma_cliente_nome}` : ""}
                                      </p>
                                      <ImgRiservata loading="lazy"
                                        src={r.firma_cliente_url} alt="Firma cliente"
                                        className="h-16 cursor-pointer rounded-md border bg-white"
                                        onClick={() => setFirmaModal({ url: r.firma_cliente_url, title: "Firma cliente" })}
                                      />
                                    </div>
                                  )}
                                  {r.firma_operaio_url && (
                                    <div>
                                      <p className="mb-1 text-xs text-muted-foreground">Operaio</p>
                                      <ImgRiservata loading="lazy"
                                        src={r.firma_operaio_url} alt="Firma operaio"
                                        className="h-16 cursor-pointer rounded-md border bg-white"
                                        onClick={() => setFirmaModal({ url: r.firma_operaio_url, title: "Firma operaio" })}
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Azioni admin */}
                            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                              {canViewCosts && <div className="w-full"><QuadroEconomicoRapportino rapportinoId={r.id} puoModificare={stato !== "rifiutato" && canEditOrders} /></div>}
                              <StoricoSpazio rapportinoId={r.id} />
                              {puoDecidereSu(r.user_id) && stato === "approvato" && <CorreggiRapportino rapportinoId={r.id} orderId={orderId} />}
                              <PulsantePdfRapportino report={r} orderId={orderId} />
                              {/* Le ore annullate dall'ufficio non si riapprovano: si reinseriscono da «Ore e persone». */}
                              {canApprove && !r.annullato_at && (
                                <Button size="sm" variant="outline" className="text-red-700" onClick={() => setAnnulla({ id: r.id, updatedAt: r.updated_at })}>
                                  Annulla rapportino
                                </Button>
                              )}
                              {puoDecidereSu(r.user_id) && stato === "rifiutato" && !r.annullato_at && !(r as { ufficio_employee_id?: string | null }).ufficio_employee_id && (
                                <Button
                                  size="sm"
                                  onClick={() => setApprovalId(r.id)}
                                  disabled={approvaMutation.isPending}
                                >
                                  <Check className="h-3 w-3 mr-1" /> Approva ora
                                </Button>
                              )}

                              {stato === "approvato" && r.approvato_at && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  Approvato il {fmtSafeDate(r.approvato_at, "d MMM yyyy HH:mm")}
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
            {rapportini.length > 10 && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <p className="text-xs text-muted-foreground" aria-live="polite">Mostrati {Math.min(visibleCount, rapportini.length)} di {rapportini.length} rapportini</p>
                {visibleCount < rapportini.length && <Button variant="outline" size="sm" onClick={() => setVisibleCount(count => count + 10)}>Mostra altri 10</Button>}
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
          {fotoModal && <ImgRiservata loading="lazy" src={fotoModal} alt="Foto" className="w-full rounded-lg" />}
        </DialogContent>
      </Dialog>

      {/* Modal firma */}
      <Dialog open={!!firmaModal} onOpenChange={() => setFirmaModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{firmaModal?.title ?? "Firma"}</DialogTitle>
          </DialogHeader>
          {firmaModal && (
            <ImgRiservata loading="lazy" src={firmaModal.url} alt={firmaModal.title} className="w-full bg-white rounded-lg" />
          )}
        </DialogContent>
      </Dialog>

      {annulla && <AnnullaRapportinoDialog motivo={motivoAnnulla} onMotivo={setMotivoAnnulla} busy={annullaMutation.isPending}
        onClose={() => { setAnnulla(null); setMotivoAnnulla(""); }} onConferma={() => annullaMutation.mutate({ ...annulla, motivo: motivoAnnulla })} />}
      {rifiutaId && <RifiutaRapportinoDialog motivo={motivoRifiuto} onMotivo={setMotivoRifiuto} busy={rifiutaMutation.isPending}
        onClose={() => { setRifiutaId(null); setMotivoRifiuto(""); }} onConferma={handleRifiuta} />}
    </Card>
  );
}
