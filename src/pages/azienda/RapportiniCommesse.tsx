import { OperationalSummary, OperationalSummaryMetric } from "@/components/shared/OperationalSummary";
/**
 * Commesse → Rapportini: documenti operativi e pagine del giornale nello stesso
 * elenco. Le viste delle ore lavorano soltanto sui rapportini: il giornale
 * riepiloga la giornata e non duplica ore o costi. Periodi e cantieri sono comuni.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight, ChevronLeft, ChevronRight, ClipboardList, Download, FileDown, Image as ImageIcon, Loader2, NotebookPen, RefreshCcw, Search, X } from "lucide-react";
import { RapportiPeriodoDialog } from "@/components/documentiOperativi/RapportiPeriodoDialog";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { useGiornaliPeriodo } from "@/hooks/useGiornaliPeriodo";
import { TabellaDocumentiCantiere } from "@/components/orders/TabellaDocumentiCantiere";
import { COLONNE_DOCUMENTI_CANTIERE, documentiCantiere, filtraGiornali, nomeCantiereGiornale, righeCsvDocumenti, type TipoDocumentoCantiere, type GiornaleRiga } from "@/lib/orders/documentiCantiere";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNomiFasiCommessa, useRapportiniMese, type RapportinoCompleto } from "@/hooks/useRapportiniMese";
import { OfficeSelect } from "@/components/orders/OfficeSelect";
import { RapportinoBlocchi } from "@/components/campo/RapportinoBlocchi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApprovaRapportinoPopup, useDecisioneRapportino } from "@/components/orders/DecisioneRapportino";
import { PulsantePdfRapportino } from "@/components/orders/PulsantePdfRapportino";
import { CorreggiRapportino, StoricoRapportino } from "@/components/orders/CorreggiRapportino";
import { GiornatePersonaPopup, SegnaGiornataPersona } from "@/components/orders/GiornataPersona";
import { QuadroEconomicoRapportino } from "@/components/orders/QuadroEconomicoRapportino";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/formatters";
import { campoWorkDay } from "@/lib/campo/workDay";
import { exportToCSV } from "@/lib/csvExport";
import { openRapportinoPdf } from "@/lib/campo/rapportinoPdf";
import { linkFileRiservato } from "@/lib/storage/fileRiservati";
import { toast } from "sonner";
import { METEO } from "@/lib/campo/rapportiniUfficio";
import { cn } from "@/lib/utils";
import {
  andamentoMese, COLONNE_CSV, feriali, filtraRapportini, giorniDelMese, giornoFeriale, intensita, mappaMese, meseValido, nomeCantiere,
  oreDi, perCantiere, perGiorno, perPersona, personeDi, righeCsv, spostaMese, statoDi, totaliRapportini,
  type RapportinoRiga, type VistaRapportini,
} from "@/lib/orders/rapportiniMese";
import { etichettaPeriodoRapportini, intervalloRapportini, type PeriodoRapportini } from "@/lib/orders/periodoRapportini";
import type { StatoRapportino } from "@/lib/campo/rapportinoStato";

const VISTE: { id: VistaRapportini; label: string; soloScrivania?: boolean }[] = [
  { id: "elenco", label: "Elenco" },
  { id: "giorni", label: "Per giorno" },
  { id: "cantieri", label: "Per cantiere" },
  { id: "persone", label: "Per persona" },
  { id: "mappa", label: "Mappa del mese", soloScrivania: true },
];

const STATI: Record<StatoRapportino, { label: string; classe: string }> = {
  inviato: { label: "Da approvare", classe: "border-amber-300 bg-amber-50 text-amber-700" },
  approvato: { label: "Approvato", classe: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  rifiutato: { label: "Rifiutato", classe: "border-red-200 bg-red-50 text-red-700" },
  bozza: { label: "Bozza", classe: "border-slate-200 bg-slate-50 text-slate-600" },
};

const RAPPORTINI_VUOTI: RapportinoCompleto[] = [];
const GIORNALI_VUOTI: GiornaleRiga[] = [];
const ORE_CELLA = ["", "bg-blue-100 text-blue-900", "bg-blue-200 text-blue-950", "bg-blue-500 text-white", "bg-blue-700 text-white"];

const ore = (n: number) => `${n.toLocaleString("it-IT", { maximumFractionDigits: 1 })} h`;
const conto = (n: number, uno: string, tanti: string) => `${n.toLocaleString("it-IT")} ${n === 1 ? uno : tanti}`;
const inizialeMaiuscola = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const giornoLungo = (d: string) => inizialeMaiuscola(format(parseISO(d), "EEEE d MMMM", { locale: it }));
const giornoBreve = (d: string) => format(parseISO(d), "d MMM", { locale: it });
const alMese = (m: string) => `${/^a/i.test(etichettaMese(m)) ? "ad" : "a"} ${etichettaMese(m).toLowerCase()}`;
const etichettaMese = (m: string) => inizialeMaiuscola(format(parseISO(`${m}-01`), "MMMM yyyy", { locale: it }));

function StatoBadge({ stato }: { stato: StatoRapportino }) {
  return <Badge variant="outline" className={cn("whitespace-nowrap py-0 text-[11px] font-medium", STATI[stato].classe)}>{STATI[stato].label}</Badge>;
}

const meseScelto = (richiesto: string | null, corrente: string): string =>
  meseValido(richiesto) && richiesto <= corrente ? richiesto : corrente;

/** Chi c'era, in poco spazio: due nomi e quanti altri. */
function nomiBrevi(r: RapportinoRiga) {
  const nomi = personeDi(r).map((p) => p.nome);
  return nomi.length <= 2 ? nomi.join(", ") : `${nomi.slice(0, 2).join(", ")} +${nomi.length - 2}`;
}

/** Il PDF del rapportino: quello già pronto, altrimenti si genera (come nella commessa). */
function useScaricaPdf() {
  const qc = useQueryClient();
  const scarica = useMutation({
    mutationFn: (r: RapportinoCompleto) => openRapportinoPdf(r, r.order_id, qc),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["commesse-rapportini"] }); },
    onError: (e) => { toast.error(e instanceof Error ? e.message : "PDF non disponibile, riprova."); },
  });
  return { scarica: scarica.mutate, inCorso: scarica.isPending ? scarica.variables?.id ?? null : null };
}

export default function RapportiniCommesse() {
  const { effectiveCompany } = useAuth();
  // Cambiando azienda non resta niente della precedente.
  return <Pagina key={effectiveCompany?.id ?? "nessuna-azienda"} companyId={effectiveCompany?.id} />;
}

function Pagina({ companyId }: { companyId?: string }) {
  const { canViewCosts, canEditOrders, canViewGiornaleLavori } = usePermissions();
  const accessoGiornale = useFeatureAccess("cantieri_avanzati");
  const { isScopriPlan } = useSubscriptionLimits();
  const puoLeggereGiornali = !!canViewGiornaleLavori && !isScopriPlan && (accessoGiornale.isEnabled || accessoGiornale.isPreview);
  const [personaAperta, setPersonaAperta] = useState<string | null>(null);
  const [segna, setSegna] = useState<{ employeeId?: string } | null>(null);
  const isMobile = useIsMobile();
  const pdf = useScaricaPdf();
  const [params, setParams] = useSearchParams();
  const oggi = campoWorkDay();
  const meseCorrente = oggi.slice(0, 7);
  const mese = meseScelto(params.get("rap_mese"), meseCorrente);
  const vistaRichiesta = params.get("rap_vista") as VistaRapportini | null;
  const periodoRichiesto = params.get("rap_periodo");
  const periodo: PeriodoRapportini = ["tutti", "mese", "ultimi30", "anno", "personalizzato"].includes(periodoRichiesto ?? "")
    ? periodoRichiesto as PeriodoRapportini
    : params.has("rap_mese") || vistaRichiesta === "mappa" ? "mese" : "tutti";
  const intervallo = intervalloRapportini(periodo, oggi, mese, params.get("rap_da") ?? "", params.get("rap_a") ?? "");
  const periodoLabel = intervallo ? etichettaPeriodoRapportini(intervallo) : "Periodo da completare";
  const tipoRichiesto = params.get("rap_tipo");
  const tipo: TipoDocumentoCantiere = !puoLeggereGiornali ? "rapportino" : ["tutti", "rapportino", "giornale"].includes(tipoRichiesto ?? "")
    ? tipoRichiesto as TipoDocumentoCantiere : (vistaRichiesta && vistaRichiesta !== "elenco") || params.get("rap_persona") ? "rapportino" : "tutti";
  const visteDisponibili = VISTE.filter((v) => (tipo === "rapportino" || v.id === "elenco") && !(v.soloScrivania && (isMobile || periodo !== "mese")));
  const vista = visteDisponibili.some((v) => v.id === vistaRichiesta) ? vistaRichiesta! : "elenco";
  const giorno = params.get("rap_giorno") || "";
  const cantiere = params.get("rap_cantiere") || "";
  const persona = params.get("rap_persona") || "";
  const stato = params.get("rap_stato") || "";
  const testo = params.get("rap_q") || "";
  const aperto = params.get("rap_id");

  const imposta = (patch: Record<string, string | null>, replace = true) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      return next;
    }, { replace });

  const letturaRapportini = useRapportiniMese(companyId, tipo === "giornale" ? null : periodo === "mese" ? mese : intervallo, canViewCosts);
  const letturaGiornali = useGiornaliPeriodo(companyId, intervallo, puoLeggereGiornali && tipo !== "rapportino");
  const righe = tipo === "giornale" ? RAPPORTINI_VUOTI : letturaRapportini.data ?? RAPPORTINI_VUOTI;
  const giornali = puoLeggereGiornali && tipo !== "rapportino" ? letturaGiornali.data ?? GIORNALI_VUOTI : GIORNALI_VUOTI;
  const isLoading = (tipo !== "giornale" && letturaRapportini.isLoading) || (puoLeggereGiornali && tipo !== "rapportino" && letturaGiornali.isLoading);
  const isError = (tipo !== "giornale" && letturaRapportini.isError) || (puoLeggereGiornali && tipo !== "rapportino" && letturaGiornali.isError);
  const isFetching = letturaRapportini.isFetching || letturaGiornali.isFetching;
  const refetch = () => Promise.all([
    tipo !== "giornale" ? letturaRapportini.refetch() : undefined,
    puoLeggereGiornali && tipo !== "rapportino" ? letturaGiornali.refetch() : undefined,
  ]);

  const senzaGiorno = useMemo(() => filtraRapportini(righe, { cantiere, persona, stato, testo }), [righe, cantiere, persona, stato, testo]);
  const filtrate = useMemo(() => filtraRapportini(senzaGiorno, { giorno }), [senzaGiorno, giorno]);
  const giornaliFiltrati = useMemo(() => filtraGiornali(giornali, { cantiere, persona, stato, testo, giorno }), [giornali, cantiere, persona, stato, testo, giorno]);
  const documenti = useMemo(() => documentiCantiere(filtrate, giornaliFiltrati, tipo), [filtrate, giornaliFiltrati, tipo]);
  const totali = useMemo(() => totaliRapportini(filtrate), [filtrate]);
  const andamento = andamentoMese(senzaGiorno, mese);
  const cantieri = useMemo(() => perCantiere(filtrate), [filtrate]);
  const persone = useMemo(() => perPersona(filtrate), [filtrate]);
  const giorni = useMemo(() => perGiorno(filtrate), [filtrate]);

  // Le tendine propongono tutto il mese, non solo quello che i filtri lasciano.
  const opzioniCantieri = useMemo(() => {
    const uniche = new Map(perCantiere(righe).map((c) => [c.orderId, { value: c.orderId, label: c.codice ? `${c.nome} · ${c.codice}` : c.nome }]));
    for (const g of giornali) if (!uniche.has(g.order_id)) uniche.set(g.order_id, { value: g.order_id, label: [nomeCantiereGiornale(g), g.order?.order_code].filter(Boolean).join(" · ") });
    const voci = [...uniche.values()]
      .sort((a, b) => a.label.localeCompare(b.label, "it"));
    const scelto = cantiere && !voci.some((v) => v.value === cantiere) ? [{ value: cantiere, label: "Cantiere scelto" }] : [];
    return [{ value: "", label: "Cantieri" }, ...scelto, ...voci];
  }, [righe, giornali, cantiere]);
  const opzioniPersone = useMemo(() => {
    const voci = perPersona(righe).map((p) => ({ value: p.chiave, label: p.ditta ? `${p.nome} (ditta)` : p.nome }))
      .sort((a, b) => a.label.localeCompare(b.label, "it"));
    const scelta = persona && !voci.some((v) => v.value === persona) ? [{ value: persona, label: "Persona scelta" }] : [];
    return [{ value: "", label: "Persone" }, ...scelta, ...voci];
  }, [righe, persona]);

  const schedaPersona = persone.find((p) => p.chiave === personaAperta) ?? null;
  const elencoNavigabile = giorni.flatMap((g) => g.righe);
  const indiceAperto = elencoNavigabile.findIndex((r) => r.id === aperto);
  const selezionato = righe.find((r) => r.id === aperto) ?? null;
  const filtriAttivi = !!(giorno || cantiere || persona || stato || testo || (puoLeggereGiornali && tipo !== "tutti"));
  const pulisci = () => imposta({ rap_giorno: null, rap_cantiere: null, rap_persona: null, rap_stato: null, rap_q: null, rap_tipo: null, rap_vista: null });
  const vaiA = (patch: Record<string, string | null>) => imposta({ rap_vista: null, ...patch });

  const numeri: { label: string; valore: string; nota?: string; onClick?: () => void; evidenza?: boolean; soloScrivania?: boolean }[] = tipo === "giornale" ? [
    { label: "Giornali lavori", valore: giornaliFiltrati.length.toLocaleString("it-IT") },
    { label: "Firmati", valore: giornaliFiltrati.filter((g) => g.stato === "firmata").length.toLocaleString("it-IT") },
    { label: "Cantieri", valore: new Set(giornaliFiltrati.map((g) => g.order_id)).size.toLocaleString("it-IT") },
    { label: "Da firmare", valore: giornaliFiltrati.filter((g) => g.stato !== "firmata").length.toLocaleString("it-IT"), onClick: () => imposta({ rap_stato: stato === "bozza" ? null : "bozza" }) },
  ] : [
    { label: tipo === "rapportino" ? "Rapportini" : "Documenti", valore: (tipo === "rapportino" ? totali.rapportini : documenti.length).toLocaleString("it-IT"), nota: tipo === "tutti" ? `${filtrate.length} rapportini · ${giornaliFiltrati.length} giornali` : undefined },
    { label: "Ore lavorate", valore: ore(totali.ore), nota: tipo === "tutti" ? "Dai rapportini, senza duplicati" : undefined },
    { label: "Cantieri", valore: (tipo === "rapportino" ? totali.cantieri : new Set(documenti.map((d) => d.riga.order_id)).size).toLocaleString("it-IT") },
    { label: "Persone", valore: totali.persone.toLocaleString("it-IT"), soloScrivania: true },
    {
      label: "Giorni lavorati",
      soloScrivania: true,
      valore: totali.giorni.toLocaleString("it-IT"),
      nota: giorno || periodo !== "mese" ? undefined : `${feriali(mese, oggi)} feriali`,
    },
    { label: "Media al giorno", soloScrivania: true, valore: totali.giorni ? ore(Math.round((totali.ore / totali.giorni) * 10) / 10) : "—" },
    {
      label: "Da approvare",
      valore: totali.daApprovare.toLocaleString("it-IT"),
      evidenza: totali.daApprovare > 0,
      onClick: () => imposta({ rap_stato: stato === "inviato" ? null : "inviato" }),
    },
    ...(canViewCosts ? [{
      label: "Manodopera",
      soloScrivania: true,
      valore: totali.costo.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }),
      nota: totali.conCosto < totali.rapportini ? `su ${totali.conCosto} approvati` : undefined,
    }] : []),
  ];

  return (
    <div className="space-y-3">
      {/* Testata: titolo e mese */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Rapportini</h1>
        <div className="flex max-w-full flex-wrap items-center gap-1.5">
          {isFetching && !isLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-label="Aggiornamento" />}
          {!isMobile && !isLoading && !isError && documenti.length > 0 && (
            <Button variant="outline" size="sm" className="h-9" onClick={() => tipo !== "rapportino" ? exportToCSV(righeCsvDocumenti(documenti), COLONNE_DOCUMENTI_CANTIERE, `documenti-cantiere-${giorno || (periodo === "mese" ? mese : intervallo?.da ? `${intervallo.da}_${intervallo.a}` : "tutti")}.csv`) : exportToCSV(righeCsv(filtrate, canViewCosts), COLONNE_CSV.filter((c) => canViewCosts || c.key !== "costo"), `rapportini-${giorno || (periodo === "mese" ? mese : intervallo?.da ? `${intervallo.da}_${intervallo.a}` : "tutti")}.csv`)}>
              <FileDown className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Esporta
            </Button>
          )}
          {puoLeggereGiornali && <OfficeSelect label="Tipo documento" value={tipo} onValueChange={(v) => imposta({ rap_tipo: v, rap_vista: null, rap_persona: null, rap_stato: null })}
            options={[{ value: "tutti", label: "Tutti i documenti" }, { value: "rapportino", label: "Rapportini" }, { value: "giornale", label: "Giornali lavori" }]} className="h-9 w-48" />}
          <OfficeSelect label="Periodo" value={periodo} onValueChange={(v) => imposta({ rap_periodo: v, rap_giorno: null, rap_da: null, rap_a: null })}
            options={[{ value: "tutti", label: "Tutti i periodi" }, { value: "ultimi30", label: "Ultimi 30 giorni" }, { value: "mese", label: "Mese" }, { value: "anno", label: "Quest’anno" }, { value: "personalizzato", label: "Periodo personalizzato" }]} className="h-9 w-48" />
          {periodo === "personalizzato" && <div className="flex flex-wrap items-center gap-2">
            <Input type="date" aria-label="Dal giorno" className="h-9 w-36" value={params.get("rap_da") ?? ""} onChange={(e) => imposta({ rap_da: e.target.value, rap_giorno: null })} />
            <span className="text-xs text-slate-500">al</span>
            <Input type="date" aria-label="Al giorno" className="h-9 w-36" value={params.get("rap_a") ?? ""} onChange={(e) => imposta({ rap_a: e.target.value, rap_giorno: null })} />
          </div>}
          {periodo === "mese" && mese !== meseCorrente && (
            <Button variant="ghost" size="sm" onClick={() => imposta({ rap_periodo: "mese", rap_mese: null, rap_giorno: null })}>Questo mese</Button>
          )}
          {periodo === "mese" && <div className="flex items-center rounded-lg border border-slate-200 bg-white">
            <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Mese precedente"
              onClick={() => imposta({ rap_mese: spostaMese(mese, -1), rap_giorno: null })}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[8.5rem] text-center text-sm font-semibold text-slate-900" aria-live="polite">{etichettaMese(mese)}</span>
            <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Mese successivo" disabled={mese >= meseCorrente}
              onClick={() => imposta({ rap_mese: spostaMese(mese, 1), rap_giorno: null })}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>}
        </div>
      </div>

      {tipo !== "giornale" && intervallo && !isError && !isLoading && <RapportiPeriodoDialog key={companyId} companyId={companyId} mese={periodo === "mese" ? mese : periodoLabel} righe={filtrate as RapportinoCompleto[]} conDatiEconomici={canViewCosts} />}
      {!intervallo ? <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Scegli una data iniziale e una finale valide. La data finale deve essere uguale o successiva a quella iniziale.</p> : isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Non riesco a leggere tutti i documenti: i numeri non sarebbero affidabili.
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCcw className="mr-1.5 h-3.5 w-3.5" />Riprova</Button>
        </div>
      ) : isLoading ? (
        <div className="space-y-3" aria-label="Caricamento rapportini">
          <Skeleton className="h-16 w-full rounded-xl" />
          {!isMobile && <Skeleton className="h-40 w-full rounded-xl" />}
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : righe.length === 0 && giornali.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <ClipboardList className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-slate-700">Nessun {tipo === "rapportino" ? "rapportino" : "documento"} {periodo === "mese" ? alMese(mese) : periodo === "tutti" ? "registrato" : `dal ${periodoLabel}`}</p>
          {periodo === "mese" && <Button variant="outline" size="sm" className="mt-3" onClick={() => imposta({ rap_mese: spostaMese(mese, -1), rap_giorno: null })}>
            Vai {alMese(spostaMese(mese, -1))}
          </Button>}
        </div>
      ) : (
        <>
          {/* Il riepilogo del mese: stessa fascia blu della scheda Commesse */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="grid gap-0">
              <OperationalSummary embedded label="Riepilogo rapportini" title={giorno ? giornoLungo(giorno) : periodo === "mese" ? "Il lavoro del mese" : periodo === "tutti" ? tipo === "rapportino" ? "Tutti i rapportini" : "Tutti i documenti del cantiere" : periodoLabel} icon={NotebookPen}>
                {numeri.filter(n => !n.soloScrivania).map(n => <OperationalSummaryMetric key={n.label} label={n.label} value={n.valore} hint={n.nota} tone={n.evidenza ? "amber" : undefined} onClick={n.onClick} active={!!n.onClick && stato === (tipo === "giornale" ? "bozza" : "inviato")} />)}
              </OperationalSummary>

              {tipo !== "giornale" && <details className="group border-t border-slate-200">
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">{tipo === "tutti" ? "Statistiche dei rapportini" : periodo === "mese" ? "Statistiche del mese" : "Statistiche del periodo"}</summary>
                <div className="grid grid-cols-2 gap-3 px-4 pb-3 sm:grid-cols-4">
                  {numeri.filter((n) => n.soloScrivania).map((n) => <div key={n.label}>
                    <span className="block text-xs font-semibold uppercase text-slate-500">{n.label}</span>
                    <span className="block text-lg font-bold tabular-nums text-slate-900">{n.valore}</span>
                    {n.nota && <span className="text-xs text-slate-500">{n.nota}</span>}
                  </div>)}
                </div>
              {/* Le statistiche: l'andamento del mese e dove sono andate le ore */}
              {!isMobile && periodo === "mese" && (
                <aside className="grid min-w-0 gap-3 border-t border-slate-200 p-3 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:border-l xl:border-t-0">
                  <div aria-label="Ore per giorno" className="min-w-0">
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <h2 className="text-sm font-semibold text-slate-900">Ore per giorno</h2>
                      <span className="truncate text-xs text-slate-400">Clicca un giorno</span>
                    </div>
                    <div className="h-36">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={andamento} margin={{ top: 4, right: 0, bottom: 0, left: -22 }}>
                          <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" />
                          <XAxis dataKey="giorno" tickLine={false} axisLine={false} interval={1} tick={{ fontSize: 10, fill: "#64748b" }} />
                          <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={44} tick={{ fontSize: 10, fill: "#64748b" }} />
                          <Tooltip cursor={{ fill: "#f1f5f9", fillOpacity: 0.6 }} content={<SuggerimentoGiorno />} />
                          <Bar dataKey="ore" radius={[3, 3, 0, 0]} maxBarSize={22} cursor="pointer" isAnimationActive={false}
                            onClick={(d: { payload?: { data?: string } }) => {
                              const g = d?.payload?.data;
                              if (g) imposta({ rap_giorno: giorno === g ? null : g });
                            }}>
                            {andamento.map((p) => (
                              <Cell key={p.data} fill={p.data === giorno ? "#f97316" : giorno ? "#bfdbfe" : p.feriale ? "#2563eb" : "#94a3b8"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div aria-label="Cantieri con più ore" className="min-w-0">
                    <h2 className="mb-2 text-sm font-semibold text-slate-900">Dove sono andate le ore</h2>
                    {cantieri.length === 0 ? <p className="text-xs text-slate-500">Nessun cantiere con questi filtri.</p> : (
                      <ul className="space-y-1.5">
                        {cantieri.slice(0, 5).map((c) => (
                          <li key={c.orderId}>
                            <button type="button" className="group block w-full text-left" onClick={() => imposta({ rap_cantiere: cantiere === c.orderId ? null : c.orderId })}>
                              <span className="flex items-baseline justify-between gap-2 text-xs">
                                <span className="truncate text-slate-700 group-hover:text-slate-950">{c.nome}</span>
                                <span className="shrink-0 font-semibold tabular-nums text-slate-900">{ore(c.ore)}</span>
                              </span>
                              <span className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-slate-100">
                                <span className="block h-full rounded-full bg-blue-600" style={{ width: `${cantieri[0].ore > 0 ? Math.max(3, (c.ore / cantieri[0].ore) * 100) : 0}%` }} />
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </aside>
              )}
              </details>}
            </div>
          </section>

          {/* Divisioni e filtri nella stessa scheda dell'elenco */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-2">
              <div role="tablist" aria-label="Dividi i rapportini" className="flex max-w-full gap-1 overflow-x-auto rounded-lg p-0.5 [scrollbar-width:none]">
                {visteDisponibili.map((v) => (
                  <button key={v.id} type="button" role="tab" aria-selected={vista === v.id}
                    onClick={() => imposta({ rap_vista: v.id === "elenco" ? null : v.id })}
                    className={cn("shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors",
                      vista === v.id ? "bg-orange-50 font-semibold text-slate-950 shadow-sm ring-1 ring-orange-100" : "text-slate-500 hover:text-slate-900")}>
                    {v.label}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2 max-sm:ml-0 max-sm:w-full">
                <div className="relative max-sm:w-full">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <Input value={testo} onChange={(e) => imposta({ rap_q: e.target.value || null })} placeholder="Cerca nei rapportini"
                    aria-label="Cerca nei rapportini" className="h-9 w-56 pl-8 text-sm max-sm:w-full" />
                </div>
                <OfficeSelect label="Cantiere" value={cantiere} onValueChange={(v) => imposta({ rap_cantiere: v || null })} options={opzioniCantieri} className="h-9 w-44 text-sm max-sm:flex-1" />
                {tipo === "rapportino" && <OfficeSelect label="Persona" value={persona} onValueChange={(v) => imposta({ rap_persona: v || null })} options={opzioniPersone} className="h-9 w-40 text-sm max-sm:flex-1" />}
                <OfficeSelect label="Stato" value={stato} onValueChange={(v) => imposta({ rap_stato: v || null })} className="h-9 w-36 text-sm max-sm:flex-1"
                  options={[{ value: "", label: "Stati" }, ...(tipo === "giornale" ? [] : (["inviato", "approvato", "rifiutato"] as const).map((s) => ({ value: s, label: STATI[s].label }))), { value: "bozza", label: "Bozza" }, ...(tipo === "rapportino" ? [] : [{ value: "firmata", label: "Firmata" }])]} />
              </div>
            </div>
            {filtriAttivi && (
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-1.5 text-xs text-slate-600">
                {giorno && (
                  <button type="button" className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-800" onClick={() => imposta({ rap_giorno: null })}>
                    {giornoLungo(giorno)} <X className="h-3 w-3" aria-label="Togli il giorno" />
                  </button>
                )}
                {[
                  { key: "rap_cantiere", value: cantiere, label: opzioniCantieri.find((v) => v.value === cantiere)?.label },
                  { key: "rap_persona", value: persona, label: opzioniPersone.find((v) => v.value === persona)?.label },
                  { key: "rap_stato", value: stato, label: stato === "firmata" ? "Firmata" : STATI[stato as StatoRapportino]?.label },
                  { key: "rap_q", value: testo, label: `Ricerca: ${testo}` },
                ].filter((f) => f.value).map((f) => <button key={f.key} type="button" aria-label={`Togli filtro: ${f.label}`} onClick={() => imposta({ [f.key]: null })}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:bg-slate-100">
                  {f.label}<X className="h-3 w-3" aria-hidden="true" />
                </button>)}
                {puoLeggereGiornali && tipo !== "tutti" && <span className="rounded-full border border-slate-200 bg-white px-2 py-1">{tipo === "giornale" ? "Giornali lavori" : "Rapportini"}</span>}
                <span>{conto(documenti.length, "documento", "documenti")} su {(righe.length + giornali.length).toLocaleString("it-IT")}</span>
                <button type="button" className="ml-auto font-medium text-slate-700 underline-offset-2 hover:underline" onClick={pulisci}>Togli i filtri</button>
              </div>
            )}

            {documenti.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">Nessun {tipo === "rapportino" ? "rapportino" : "documento"} con questi filtri.</p>
            ) : vista === "elenco" ? (
              <TabellaDocumentiCantiere key={[tipo, periodo, periodoLabel, giorno, cantiere, persona, stato, testo].join("|")} righe={documenti} onApri={(id) => imposta({ rap_id: id }, false)} onPdf={(r) => pdf.scarica(r as RapportinoCompleto)} pdfInCorso={pdf.inCorso} giornoLungo={giornoLungo} />
            ) : vista === "giorni" ? (
              <div>
                <div aria-hidden="true" className="hidden border-b border-slate-200 bg-slate-50 py-2 pl-3 pr-[3.25rem] text-xs font-semibold text-slate-500 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)_13rem_3.5rem_2.5rem_6.5rem] lg:gap-x-3">
                  <span>Cantiere</span><span>Lavori eseguiti</span><span>Persone</span><span className="text-right">Ore</span><span className="text-right">Foto</span><span className="text-right">Stato</span>
                </div>
                {giorni.map((g) => (
                  <div key={g.data}>
                    <div className="sticky top-0 z-[1] flex flex-wrap items-baseline justify-between gap-x-3 border-b border-slate-100 bg-slate-50 px-3 py-1.5">
                      <h3 className="text-sm font-semibold text-slate-900">{giornoLungo(g.data)}</h3>
                      <span className="text-xs tabular-nums text-slate-500">{conto(g.contati, "rapportino", "rapportini")} · {ore(g.ore)} · {conto(g.cantieri, "cantiere", "cantieri")}</span>
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {g.righe.map((r) => (
                        <li key={r.id} className="flex items-stretch">
                          <div className="min-w-0 flex-1"><RigaRapportino r={r} onApri={() => imposta({ rap_id: r.id }, false)} /></div>
                          <button type="button" onClick={() => pdf.scarica(r as RapportinoCompleto)} disabled={pdf.inCorso === r.id}
                            aria-label={`Scarica il PDF: ${nomeCantiere(r)}, ${giornoLungo(r.data_lavoro)}`} title="Scarica PDF"
                            className="flex w-10 shrink-0 items-center justify-center text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:opacity-60 max-md:hidden">
                            {pdf.inCorso === r.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : vista === "cantieri" ? (
              <TabellaCantieri righe={cantieri} conCosti={canViewCosts} onScegli={(id) => vaiA({ rap_cantiere: id })} />
            ) : vista === "persone" ? (
              <>
                {canEditOrders && (
                  <div className="flex justify-end border-b border-slate-100 px-3 py-2">
                    <Button size="sm" variant="outline" onClick={() => setSegna({})}>Segna la giornata di una persona</Button>
                  </div>
                )}
                <TabellaPersone righe={persone} onScegli={setPersonaAperta} />
              </>
            ) : (
              <MappaDelMese righe={filtrate} mese={mese} oggi={oggi} onCella={(id, g) => vaiA({ rap_cantiere: id, rap_giorno: g })} />
            )}
          </section>
        </>
      )}

      <DettaglioRapportino r={selezionato as RapportinoCompleto | null} conCosti={canViewCosts} navigazione={indiceAperto >= 0 ? <div className="mb-1 flex items-center justify-between gap-2 border-b border-slate-100 pb-3 pr-8">
        <Button variant="outline" size="sm" disabled={indiceAperto === 0} onClick={() => imposta({ rap_id: elencoNavigabile[indiceAperto - 1].id })}><ChevronLeft className="mr-1 h-4 w-4" />Precedente</Button>
        <span className="text-xs tabular-nums text-slate-500">{indiceAperto + 1} di {elencoNavigabile.length}</span>
        <Button variant="outline" size="sm" disabled={indiceAperto === elencoNavigabile.length - 1} onClick={() => imposta({ rap_id: elencoNavigabile[indiceAperto + 1].id })}>Successivo<ChevronRight className="ml-1 h-4 w-4" /></Button>
      </div> : null} onChiudi={() => imposta({ rap_id: null }, false)} onDeciso={() => {
        // Approvato o rifiutato: si passa al prossimo da approvare, senza riaprire l'elenco.
        const prossimo = [...elencoNavigabile.slice(indiceAperto + 1), ...elencoNavigabile.slice(0, Math.max(0, indiceAperto))].find((x) => statoDi(x) === "inviato");
        imposta({ rap_id: prossimo?.id ?? null }, false);
      }} />
      {schedaPersona && (
        <GiornatePersonaPopup persona={schedaPersona} righe={righe} puoScrivere={canEditOrders} onChiudi={() => setPersonaAperta(null)}
          onApriRapportino={(id) => { setPersonaAperta(null); imposta({ rap_id: id }, false); }}
          onVediRapportini={() => { const chiave = schedaPersona.chiave; setPersonaAperta(null); vaiA({ rap_persona: chiave }); }}
          onSegna={(employeeId) => { setPersonaAperta(null); setSegna({ employeeId }); }} />
      )}
      {segna && <SegnaGiornataPersona employeeId={segna.employeeId} onChiudi={() => setSegna(null)} />}
    </div>
  );
}

function SuggerimentoGiorno({ active, payload }: { active?: boolean; payload?: Array<{ payload: { data: string; ore: number; rapportini: number } }> }) {
  const p = active ? payload?.[0]?.payload : undefined;
  if (!p) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-md">
      <p className="font-semibold text-slate-900">{giornoLungo(p.data)}</p>
      <p className="tabular-nums text-slate-600">{ore(p.ore)} · {conto(p.rapportini, "rapportino", "rapportini")}</p>
    </div>
  );
}

function RigaRapportino({ r, onApri }: { r: RapportinoRiga; onApri: () => void }) {
  const stato = statoDi(r);
  const foto = r.foto_urls?.length ?? 0;
  return (
    <button type="button" onClick={onApri}
      className={cn("grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 px-3 py-2 text-left transition-colors hover:bg-slate-50 lg:grid-cols-[15rem_minmax(0,1fr)_13rem_3.5rem_2.5rem_6.5rem] lg:items-center",
        stato === "rifiutato" && "opacity-70")}>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-slate-900">{nomeCantiere(r)}</span>
        {r.order?.order_code && <span className="block truncate text-xs text-slate-400">{r.order.order_code}</span>}
      </span>
      <span className="col-start-1 row-start-2 min-w-0 truncate text-sm text-slate-700 lg:col-start-auto lg:row-start-auto">{r.descrizione_lavori?.trim() || <span className="text-slate-400">Nessuna descrizione</span>}</span>
      <span className="col-start-1 row-start-3 truncate text-xs text-slate-500 lg:col-start-auto lg:row-start-auto">{nomiBrevi(r)}</span>
      <span className="col-start-2 row-start-2 text-right text-sm font-semibold tabular-nums text-slate-900 lg:col-start-auto lg:row-start-auto">{ore(oreDi(r))}</span>
      <span className="col-start-2 row-start-3 inline-flex items-center justify-end gap-1 text-xs tabular-nums text-slate-400 lg:col-start-auto lg:row-start-auto" title={foto ? conto(foto, "foto", "foto") : undefined}>
        {foto > 0 && <><ImageIcon className="h-3 w-3" aria-label="Foto" />{foto}</>}
      </span>
      <span className="col-start-2 row-start-1 text-right lg:col-start-auto lg:row-start-auto"><StatoBadge stato={stato} /></span>
    </button>
  );
}

const TH = "px-3 py-2 text-left text-xs font-medium text-slate-500";
const TD = "px-3 py-2 tabular-nums text-sm text-slate-700";

function TabellaCantieri({ righe, conCosti, onScegli }: { righe: ReturnType<typeof perCantiere>; conCosti: boolean; onScegli: (orderId: string) => void }) {
  const massimo = righe[0]?.ore ?? 0;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[46rem]">
        <thead className="border-b border-slate-100 bg-slate-50/70">
          <tr>
            <th scope="col" className={TH}>Cantiere</th>
            <th scope="col" className={cn(TH, "w-56")}>Ore</th>
            <th scope="col" className={cn(TH, "text-right")}>Rapportini</th>
            <th scope="col" className={cn(TH, "text-right")}>Giorni</th>
            <th scope="col" className={cn(TH, "text-right")}>Persone</th>
            {conCosti && <th scope="col" className={cn(TH, "text-right")}>Costo</th>}
            <th scope="col" className={cn(TH, "text-right")}>Da approvare</th>
            <th scope="col" className={cn(TH, "text-right")}>Ultimo</th>
            <th scope="col" className="w-9"><span className="sr-only">Apri commessa</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {righe.map((c) => (
            <tr key={c.orderId} className="transition-colors hover:bg-slate-50">
              <td className="max-w-[18rem] px-3 py-2">
                <button type="button" className="block w-full text-left" onClick={() => onScegli(c.orderId)}>
                  <span className="block truncate text-sm font-semibold text-slate-900 hover:underline">{c.nome}</span>
                  {c.codice && <span className="block truncate text-xs text-slate-400">{c.codice}</span>}
                </button>
              </td>
              <td className={TD}>
                <span className="flex items-center gap-2">
                  <span className="w-14 shrink-0 font-semibold text-slate-900">{ore(c.ore)}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <span className="block h-full rounded-full bg-blue-600" style={{ width: `${massimo > 0 ? (c.ore / massimo) * 100 : 0}%` }} />
                  </span>
                </span>
              </td>
              <td className={cn(TD, "text-right")}>{c.rapportini}</td>
              <td className={cn(TD, "text-right")}>{c.giorni}</td>
              <td className={cn(TD, "text-right")}>{c.persone}</td>
              {conCosti && <td className={cn(TD, "whitespace-nowrap text-right")}>{c.costo ? formatCurrency(c.costo) : "—"}</td>}
              <td className={cn(TD, "text-right", c.daApprovare > 0 && "font-semibold text-amber-600")}>{c.daApprovare || "—"}</td>
              <td className={cn(TD, "whitespace-nowrap text-right")}>{c.ultimo ? giornoBreve(c.ultimo) : "—"}</td>
              <td className="pr-2 text-right">
                <Link to={`/azienda/ordini/${c.orderId}`} aria-label={`Apri la commessa ${c.nome}`} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabellaPersone({ righe, onScegli }: { righe: ReturnType<typeof perPersona>; onScegli: (chiave: string) => void }) {
  const massimo = righe[0]?.ore ?? 0;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem]">
        <thead className="border-b border-slate-100 bg-slate-50/70">
          <tr>
            <th scope="col" className={TH}>Persona</th>
            <th scope="col" className={cn(TH, "w-56")}>Ore</th>
            <th scope="col" className={cn(TH, "text-right")}>Giorni</th>
            <th scope="col" className={cn(TH, "text-right")}>Cantieri</th>
            <th scope="col" className={cn(TH, "text-right")}>Ore per giorno</th>
            <th scope="col" className={cn(TH, "text-right")}>Ultimo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {righe.map((p) => (
            <tr key={p.chiave} className="transition-colors hover:bg-slate-50">
              <td className="max-w-[18rem] px-3 py-2">
                <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => onScegli(p.chiave)}>
                  <span className="truncate text-sm font-semibold text-slate-900 hover:underline">{p.nome}</span>
                  {p.ditta && <Badge variant="outline" className="py-0 text-[10px] text-slate-500">Ditta</Badge>}
                </button>
              </td>
              <td className={TD}>
                {p.ditta ? <span className="text-xs text-slate-400">Solo presenza</span> : (
                  <span className="flex items-center gap-2">
                    <span className="w-14 shrink-0 font-semibold text-slate-900">{ore(p.ore)}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full rounded-full bg-blue-600" style={{ width: `${massimo > 0 ? (p.ore / massimo) * 100 : 0}%` }} />
                    </span>
                  </span>
                )}
              </td>
              <td className={cn(TD, "text-right")}>{p.giorni}</td>
              <td className={cn(TD, "text-right")}>{p.cantieri}</td>
              <td className={cn(TD, "text-right")}>{p.ditta || !p.giorni ? "—" : (p.ore / p.giorni).toLocaleString("it-IT", { maximumFractionDigits: 1 })}</td>
              <td className={cn(TD, "whitespace-nowrap text-right")}>{p.ultimo ? giornoBreve(p.ultimo) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const LETTERA_GIORNO = ["D", "L", "M", "M", "G", "V", "S"];

function MappaDelMese({ righe, mese, oggi, onCella }: { righe: RapportinoRiga[]; mese: string; oggi: string; onCella: (orderId: string, giorno: string) => void }) {
  const { righe: cantieri, massimo } = useMemo(() => mappaMese(righe), [righe]);
  const giorni = giorniDelMese(mese);
  const perGiornoTotale = (g: string) => cantieri.reduce((s, c) => s + (c.celle[g]?.ore ?? 0), 0);
  const fondoGiorno = (g: string) => (giornoFeriale(g) ? "" : "bg-slate-50");
  if (cantieri.length === 0) return <p className="px-4 py-10 text-center text-sm text-slate-500">Nessun rapportino da contare con questi filtri.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-[2] min-w-[14rem] max-w-[14rem] border-b border-r border-slate-100 bg-white px-3 py-1.5 text-left font-medium text-slate-500">Cantiere</th>
            {giorni.map((g) => (
              <th key={g} scope="col" className={cn("min-w-[1.9rem] border-b border-slate-100 px-0 py-1 text-center font-medium", g === oggi ? "text-orange-600" : "text-slate-500", fondoGiorno(g))}>
                <span className="block text-[9px] font-normal leading-none opacity-70">{LETTERA_GIORNO[new Date(`${g}T12:00:00Z`).getUTCDay()]}</span>
                {Number(g.slice(8))}
              </th>
            ))}
            <th scope="col" className="min-w-[3.5rem] border-b border-l border-slate-100 px-2 py-1.5 text-right font-medium text-slate-500">Ore</th>
          </tr>
        </thead>
        <tbody>
          {cantieri.map((c) => (
            <tr key={c.orderId}>
              <th scope="row" className="sticky left-0 z-[1] max-w-[14rem] truncate border-b border-r border-slate-100 bg-white px-3 py-1 text-left text-sm font-medium text-slate-800" title={c.codice ? `${c.nome} · ${c.codice}` : c.nome}>{c.nome}</th>
              {giorni.map((g) => {
                const cella = c.celle[g];
                return (
                  <td key={g} className={cn("border-b border-slate-100 p-0.5 text-center", fondoGiorno(g))}>
                    {cella && (
                      <button type="button" onClick={() => onCella(c.orderId, g)} title={`${c.nome} · ${giornoLungo(g)} · ${ore(cella.ore)} · ${conto(cella.rapportini, "rapportino", "rapportini")}`}
                        aria-label={`${c.nome}, ${giornoLungo(g)}: ${ore(cella.ore)}`}
                        className={cn("flex h-6 w-full min-w-[1.6rem] items-center justify-center rounded text-[10px] font-semibold tabular-nums transition-transform hover:scale-110", cella.ore > 0 ? ORE_CELLA[intensita(cella.ore, massimo)] : "bg-slate-200 text-slate-600")}>
                        {Math.round(cella.ore)}
                      </button>
                    )}
                  </td>
                );
              })}
              <td className="border-b border-l border-slate-100 px-2 text-right text-sm font-semibold tabular-nums text-slate-900">{ore(c.ore)}</td>
            </tr>
          ))}
          <tr>
            <th scope="row" className="sticky left-0 z-[1] border-r border-slate-100 bg-white px-3 py-1.5 text-left text-xs font-semibold text-slate-600">Totale giorno</th>
            {giorni.map((g) => {
              const t = perGiornoTotale(g);
              return <td key={g} className={cn("py-1.5 text-center text-[10px] font-semibold tabular-nums text-slate-600", fondoGiorno(g))}>{t > 0 ? Math.round(t) : ""}</td>;
            })}
            <td className="border-l border-slate-100 px-2 text-right text-sm font-bold tabular-nums text-slate-900">{ore(Math.round(cantieri.reduce((s, c) => s + c.ore, 0) * 10) / 10)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function DettaglioRapportino({ r, conCosti, navigazione, onChiudi, onDeciso }: { navigazione?: ReactNode; r: RapportinoCompleto | null; conCosti: boolean; onChiudi: () => void; onDeciso: () => void }) {
  const { data: nomiFasi } = useNomiFasiCommessa(r?.order_id);
  const [foto, setFoto] = useState<string | null>(null);
  const stato = r ? statoDi(r) : null;
  const mezzi = r && Array.isArray(r.mezzi_usati) ? (r.mezzi_usati as Array<{ nome?: string; ore?: number }>).filter((m) => m?.nome) : [];
  const meteo = r?.meteo ? METEO.find((m) => m.value === r.meteo)?.label ?? r.meteo : null;
  const { puoDecidereSu, canApprove: puoModificare } = useDecisioneRapportino(r?.order_id ?? "");
  // Da approvare: un popup solo, con i dettagli e la decisione.
  if (r && stato === "inviato" && puoDecidereSu(r.user_id)) {
    return <ApprovaRapportinoPopup key={r.id} orderId={r.order_id} reportId={r.id} originale={r} testata={navigazione} onClose={onChiudi} onDeciso={onDeciso} />;
  }
  return (
    <>
      <Dialog open={!!r} onOpenChange={(o) => { if (!o) onChiudi(); }}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
          {r && stato && (
            <>
              {navigazione}
              <DialogHeader className="space-y-1 pr-6 text-left">
                <DialogTitle className="text-lg leading-tight">{nomeCantiere(r)}</DialogTitle>
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                  <span>{giornoLungo(r.data_lavoro)}</span>
                  <StatoBadge stato={stato} />
                </div>
                {(r.order?.order_code || r.order?.work_address) && (
                  <p className="text-xs text-slate-500">{[r.order?.order_code, r.order?.work_address].filter(Boolean).join(" · ")}</p>
                )}
              </DialogHeader>

              <div className="mt-4 space-y-4 text-sm">
                {stato === "rifiutato" && (
                  <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
                    {r.motivo_rifiuto?.trim() || "Respinto senza un motivo scritto."}
                  </p>
                )}
                <section>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Cosa si è fatto</h3>
                  <p className="whitespace-pre-wrap text-slate-900">{r.descrizione_lavori?.trim() || "Nessuna descrizione."}</p>
                </section>
                {/* Con i costi le stesse persone stanno nel riquadro qui sotto. */}
                <section className={conCosti ? "hidden" : undefined}>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Chi ha lavorato · {ore(oreDi(r))}</h3>
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {personeDi(r).map((p, i) => (
                      <li key={`${p.chiave}-${i}`} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
                        <span className="min-w-0 truncate text-slate-900">{p.nome}</span>
                        <span className="shrink-0 tabular-nums text-slate-600">{p.ditta ? "Ditta, presente" : ore(p.ore)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
                {mezzi.length > 0 && (
                  <section>
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Mezzi</h3>
                    <p className="text-slate-800">{mezzi.map((m) => (m.ore ? `${m.nome} (${ore(m.ore)})` : m.nome)).join(", ")}</p>
                  </section>
                )}
                <RapportinoBlocchi report={r} nomiFasi={nomiFasi} onFoto={(url) => { void linkFileRiservato(url).then((u) => setFoto(u)); }} />
                {(meteo || r.note?.trim() || (conCosti && r.costo_manodopera != null)) && (
                  <dl className="space-y-1 text-slate-700">
                    {meteo && <div className="flex gap-2"><dt className="text-slate-500">Meteo</dt><dd>{meteo}</dd></div>}
                    {r.note?.trim() && <div className="flex gap-2"><dt className="text-slate-500">Note</dt><dd className="whitespace-pre-wrap">{r.note}</dd></div>}
                    {conCosti && r.costo_manodopera != null && <div className="flex gap-2"><dt className="text-slate-500">Costo manodopera</dt><dd className="tabular-nums">{formatCurrency(Number(r.costo_manodopera))}</dd></div>}
                  </dl>
                )}
                {conCosti && <QuadroEconomicoRapportino rapportinoId={r.id} puoModificare={puoModificare} />}
                <StoricoRapportino rapportinoId={r.id} />
                {puoDecidereSu(r.user_id) && stato !== "rifiutato" && <CorreggiRapportino rapportinoId={r.id} orderId={r.order_id} />}
                <PulsantePdfRapportino report={r} orderId={r.order_id} className="w-full" />
                <Button asChild variant="outline" className="w-full">
                  <Link to={`/azienda/ordini/${r.order_id}?tab=cantiere&vista_cantiere=diario`}>
                    Apri la commessa
                    <ArrowUpRight className="ml-1.5 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!foto} onOpenChange={(o) => { if (!o) setFoto(null); }}>
        <DialogContent className="max-w-3xl p-2">
          <DialogTitle className="sr-only">Foto del rapportino</DialogTitle>
          {foto && <img src={foto} alt="Foto del rapportino" className="max-h-[80vh] w-full rounded object-contain" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
