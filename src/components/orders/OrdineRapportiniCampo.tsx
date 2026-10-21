/**
 * Componente per la lista dei rapportini campo di un ordine.
 * Gestisce approvazione, rifiuto con motivo, download PDF.
 * Usato nel tab "Campo" di OrderDetail.tsx.
 */
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ImgRiservata } from "@/components/common/ImgRiservata";
import { RapportinoBlocchi } from "@/components/campo/RapportinoBlocchi";
import { linkFileRiservato } from "@/lib/storage/fileRiservati";
import { notifyRapportinoPdf, openRapportinoPdf } from "@/lib/campo/rapportinoPdf";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import {
  ClipboardList, Check, ChevronDown, Image as ImageIcon, PenLine,
  Loader2, X, FileDown, Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { RapportinoStato } from "@/types/rapportino";
import { SourceBadge } from "@/components/whatsapp/SourceBadge";
import { LaborApprovalDialog } from "@/components/orders/LaborApprovalDialog";
import { messaggioApprovazione } from "@/lib/campo/erroreApprovazione";
import { recheckLaborApproval } from "@/lib/campo/loadLaborReview";
import { validateReportPhaseLinks } from "@/lib/campo/validateReportPhaseLinks";

import { useIsMobile } from "@/hooks/use-mobile";
interface Props { orderId: string; /** Bottoni Approva/Rifiuta/PDF direttamente sulla riga (per il popup di Attività). */ azioniInRiga?: boolean; }

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
/** Ore delle persone (gemello di campo_presenze_effettive): le presenze con un dipendente, altrimenti l'autore. */
export function orePersoneRapportino(r: RigaOre): number {
  const presenze = presenzeDi(r);
  if (presenze.length > 0) return presenze.reduce((somma, p) => somma + (p.employee_id ? Number(p.ore) || 0 : 0), 0);
  return (Number(r.ore_lavorate) || 0) + (Number(r.ore_straordinario) || 0);
}

export function OrdineRapportiniCampo({ orderId, azioniInRiga = false }: Props) {
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const { role, effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const { canEditOrders, canViewCosts } = usePermissions();
  const canApprove = canEditOrders && (role === "company_admin" || role === "company_staff" || role === "super_admin");
  // Il proprio rapportino lo decide un altro dell'ufficio (salvo il titolare): come nel database.
  const puoDecidereSu = (autore: string | null | undefined) =>
    canApprove && (role === "company_admin" || role === "super_admin" || !autore || autore !== user?.id);

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

  const { data: rapportini = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["order-campo-rapportini", orderId, companyId],
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campo_rapportini")
        // NB: FK esplicita — campo_rapportini ha DUE relazioni verso profiles
        // (user_id e approvato_da): senza disambiguare PostgREST rifiuta l'embed.
        .select("*, autore:profiles!campo_rapportini_user_id_fkey(first_name, last_name)")
        .eq("order_id", orderId)
        .eq("company_id", companyId!)
        .order("data_lavoro", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orderId && !!companyId,
  });

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

  // ── Approva ────────────────────────────────────────────────────────────────
  const approvaMutation = useMutation({
    mutationFn: async ({rapportinoId, fingerprint, acknowledged}: {rapportinoId: string; fingerprint: string; acknowledged: boolean}) => {
      if (!canApprove || !companyId) throw new Error("Non hai il permesso di approvare rapportini");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessione scaduta, riaccedi");
      const reviewed = await recheckLaborApproval({companyId, orderId, reportId: rapportinoId, showCosts: canViewCosts}, fingerprint, acknowledged);
      // Prima di rendere il rapporto economicamente efficace, verifica tutti i
      // riferimenti. Una fase estranea non va ignorata DOPO l'approvazione.
      const { data: rapp, error: reportError } = await supabase.from("campo_rapportini")
        .select("fasi_lavorate, materiali_usati, percentuale_avanzamento, lavoro_completato, firma_cliente_url")
        .eq("id", rapportinoId).eq("order_id", orderId).eq("company_id", companyId)
        .eq("updated_at", reviewed.updated_at).single();
      if (reportError) throw reportError;
      if (!rapp) throw new Error("Rapportino cambiato: aggiorna il controllo prima di approvare.");
      await validateReportPhaseLinks(companyId, orderId, rapp);
      const approvalQuery = supabase
        .from("campo_rapportini")
        .update({
          stato: "approvato",
          approvato: true,
          approvato_da: user.id,
          approvato_at: new Date().toISOString(),
          motivo_rifiuto: null,
          pdf_url: null,
        })
        .eq("id", rapportinoId)
        .eq("order_id", orderId)
        .eq("company_id", companyId);
      const { data: updated, error } = await (reviewed.stato == null ? approvalQuery.is("stato", null) : approvalQuery.eq("stato", reviewed.stato))
        .eq("updated_at", reviewed.updated_at)
        .select("id").maybeSingle();
      if (error) throw error;
      if (!updated) throw new Error("Rapportino non aggiornato: potrebbe essere già cambiato. Aggiorna il controllo e verifica i permessi.");

      // L'avanzamento delle fasi dichiarate lo applica il database nella stessa operazione
      // dell'approvazione (trigger campo_rapportino_avanzamento_approvato): o tutto o niente.
      return { rapportinoId };
    },
    onSuccess: ({ rapportinoId }) => {
      toast.success("Rapportino approvato: ore e avanzamento aggiornati");
      refreshWorkQueries(qc, orderId, companyId);
      void notifyRapportinoPdf(rapportinoId, orderId, qc);
      setApprovalId(null);
    },
    onError: (error: unknown) => toast.error(messaggioApprovazione(error)),
  });

  // ── Rifiuta ────────────────────────────────────────────────────────────────
  const rifiutaMutation = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      if (!canApprove || !companyId) throw new Error("Non hai il permesso di rifiutare rapportini");
      const original = rapportini.find(r => r.id === id);
      if (!original || (original.stato ?? (original.approvato ? "approvato" : "inviato")) !== "inviato") throw new Error("Rapportino cambiato: ricarica prima di rifiutare");
      const rejectionQuery = supabase
        .from("campo_rapportini")
        .update({
          stato: "rifiutato",
          approvato: false,
          motivo_rifiuto: motivo.trim() || null,
          pdf_url: null,
        })
        .eq("id", id)
        .eq("order_id", orderId)
        .eq("company_id", companyId)
        .eq("updated_at", original.updated_at);
      const { data: updated, error } = await (original.stato == null ? rejectionQuery.is("stato", null) : rejectionQuery.eq("stato", original.stato))
        .select("id").maybeSingle();
      if (error) throw error;
      if (!updated) throw new Error("Rapportino non aggiornato: verifica i permessi e ricarica");
    },
    onSuccess: (_result, { id }) => {
      toast.success("Rapportino rifiutato");
      refreshWorkQueries(qc, orderId, companyId);
      void notifyRapportinoPdf(id, orderId, qc);
      setRifiutaId(null);
      setMotivoRifiuto("");
    },
    onError: () => toast.error("Errore durante il rifiuto"),
  });

  const handleRifiuta = () => {
    if (!rifiutaId) return;
    rifiutaMutation.mutate({ id: rifiutaId, motivo: motivoRifiuto });
  };

  // ── Genera/scarica PDF ─────────────────────────────────────────────────────
  const pdfMutation = useMutation({
    mutationFn: async (rapportino: (typeof rapportini)[number]) => {
      await openRapportinoPdf(rapportino, orderId, qc);
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Errore generazione PDF"),
  });

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
          Rapportini Campo ({rapportini.length})
        </CardTitle>
        {/* Colpo d'occhio: quante ore, cosa aspetta l'ufficio, a che punto sono i lavori.
            Nel popup di Attività (azioniInRiga) si nasconde: lì serve solo approvare. */}
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
          <p className="text-sm text-muted-foreground">Nessun rapportino caricato dagli operai</p>
        ) : (
          <div className="space-y-4">
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
                          onClick={() => setExpandedId(aperto ? null : r.id)}
                        >
                          <TesseraGiorno data={r.data_lavoro} stato={stato} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-sm font-semibold text-slate-900">{autore}</span>
                              {/* sul telefono lo stato sta accanto al nome: la colonna di destra si libera */}
                              <span className="sm:hidden"><StatoBadge stato={stato} /></span>
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
                              {r.pdf_url && <span title="PDF pronto"><FileDown className="h-3 w-3 text-green-600" aria-label="PDF pronto" /></span>}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <span className="max-sm:hidden"><StatoBadge stato={stato} /></span>
                            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", aperto && "rotate-180")} aria-hidden="true" />
                          </div>
                        </button>
                        {/* Azioni rapide sulla riga (popup di Attività): approva/rifiuta senza aprire il dettaglio. */}
                        {azioniInRiga && puoDecidereSu(r.user_id) && stato === "inviato" && (
                          <div className="flex shrink-0 items-center gap-1.5 pl-1 pr-3 max-sm:pr-2.5">
                            {!isMobile && (
                              <Button size="sm" variant="outline" onClick={() => pdfMutation.mutate(r)} disabled={pdfMutation.isPending} title={r.pdf_url ? "Scarica PDF" : "Genera PDF"}>
                                {pdfMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                              </Button>
                            )}
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
                          <div className="space-y-4 border-t border-dashed px-3 pb-4 pt-3 sm:pl-[4.75rem]">
                            {r.descrizione_lavori && (
                              <div>
                                <p className={ETICHETTA_SEZIONE}>Lavori svolti</p>
                                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-800">{r.descrizione_lavori}</p>
                              </div>
                            )}

                            {/* Motivo rifiuto */}
                            {stato === "rifiutato" && r.motivo_rifiuto && (
                              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                                <p className="text-xs font-medium text-red-700">Motivo rifiuto</p>
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

                            {/* Lavorazioni con i loro materiali e le loro foto, poi quello che non è legato a una fase */}
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

                            {/* Costo scritto dal trigger all'approvazione: ore ×
                                costo orario del dipendente. 0 = subappaltatore
                                (costa a contratto/SAL) o dipendente senza tariffa. */}
                            {canViewCosts && stato === "approvato" && (
                              <div className="rounded-md bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                                Costo manodopera registrato:{" "}
                                {r.costo_manodopera == null ? "Non disponibile" : Number(r.costo_manodopera).toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: true })}
                                {Number(r.costo_manodopera) === 0 && r.costo_manodopera != null && <span className="mt-1 block font-normal text-amber-700">Zero registrato: può dipendere da tariffa mancante o presenze esterne. Non indica automaticamente lavoro senza costo.</span>}
                              </div>
                            )}

                            {/* Azioni admin */}
                            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                              {/* PDF download */}
                              {/* Niente export su telefono. */}
                              {!isMobile && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => pdfMutation.mutate(r)}
                                  disabled={pdfMutation.isPending}
                                >
                                  {pdfMutation.isPending ? (
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  ) : (
                                    <FileDown className="h-3 w-3 mr-1" />
                                  )}
                                  {r.pdf_url ? "Scarica PDF" : "Genera PDF"}
                                </Button>
                              )}

                              {puoDecidereSu(r.user_id) && stato === "inviato" && (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={() => setApprovalId(r.id)}
                                    disabled={approvaMutation.isPending}
                                  >
                                    <Check className="h-3 w-3 mr-1" /> Approva
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => { setRifiutaId(r.id); setMotivoRifiuto(""); }}
                                  >
                                    <X className="h-3 w-3 mr-1" /> Rifiuta
                                  </Button>
                                </>
                              )}

                              {/* Le ore annullate dall'ufficio non si riapprovano: si reinseriscono da «Ore e persone». */}
                              {puoDecidereSu(r.user_id) && stato === "rifiutato" && !(r as { ufficio_employee_id?: string | null }).ufficio_employee_id && (
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

      {/* Dialog rifiuto */}
      <Dialog open={!!rifiutaId} onOpenChange={(open) => { if (!open) { setRifiutaId(null); setMotivoRifiuto(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rifiuta rapportino</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Specifica il motivo del rifiuto (opzionale). Il tecnico verrà notificato.
            </p>
            <Textarea
              placeholder="Es: Descrizione insufficiente, mancano le foto del cantiere..."
              value={motivoRifiuto}
              onChange={e => setMotivoRifiuto(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setRifiutaId(null); setMotivoRifiuto(""); }}>
              Annulla
            </Button>
            <Button
              variant="destructive"
              onClick={handleRifiuta}
              disabled={rifiutaMutation.isPending}
            >
              {rifiutaMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <X className="h-3 w-3 mr-1" />}
              Conferma rifiuto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
