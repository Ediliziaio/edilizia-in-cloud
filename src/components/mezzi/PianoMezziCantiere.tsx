import { SpesePianoMezzo } from "./SpesePianoMezzo";
import { ViaggioSelect } from "./ViaggioSelect";
import { SupplierSelect } from "@/components/orders/SupplierSelect";
import { useMezziPianoEconomia, usePersonePianoMezzi } from "@/hooks/useMezziPianoEconomia";
import { economiaPianiMezzi, statoCostoMezzo } from "@/lib/mezzi/economiaPiani";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, Plus, Truck, Wrench, Pencil, Loader2, ArrowDownToLine, ArrowUpFromLine, AlertTriangle, History, Search, Route, ArrowUpRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useAssegnaMezzoACommessa,
  useMezzi,
  useMezziDellaCommessa,
  useMontaggiDellaCommessa,
} from "@/hooks/useMezzi";
import { usePianoMezziCantiere } from "@/hooks/usePianoMezziCantiere";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { supabase } from "@/integrations/supabase/client";
import {
  costoPianoMezzo,
  finestraFasi,
  pianoAttivo,
  pianoDaAllineare,
  pianoPerFase,
  quantitaMezzoValida,
  righeMezziCantiere,
  statoPianoMezzo,
  unitaNoleggio,
  type PresenzaMezzo,
  type RigaMezzoCantiere,
  type PianoMezzo,
  type CostoPianoMezzo,
  type BaseCostoMezzo,
  type NuovoNoleggio,
} from "@/lib/mezzi/pianoCantiere";
import { formatCurrency } from "@/lib/formatters";
import { orderDetailLocation, resolveOrderDetailDestination } from "@/lib/orders/detailNavigation";
import { oggiIso, formatData, giornoItaliano, POSSESSI, TIPI_MEZZO, UNITA_QUANTITA, unitaBreve, numeroLetto, formatQuantita, type MezzoTipo, type UnitaQuantita } from "@/types/mezzi";
import { cn } from "@/lib/utils";
import { MezzoFormDialog } from "./MezzoFormDialog";
import { MezziCommessaCard } from "./MezziCommessaCard";
import { ViaggiCommessa } from "./ViaggiMezzoWorkspace";
import { GiroMaterialiCommessa } from "./GiroMaterialiCommessa";
import { StrumentiComputo } from "@/components/orders/materiali/StrumentiComputo";
import type { PropostaRisorsa } from "@/lib/distinta/proposteRisorseComputo";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

function SchedeLogistica({ mezzi, viaggi }: { mezzi: ReactNode; viaggi: ReactNode }) {
  const t = useT();
  const location = useLocation();
  const navigate = useNavigate();
  const mostraViaggi = resolveOrderDetailDestination(location.search, location.hash).section === "section-viaggi";
  return (
    <Tabs value={mostraViaggi ? "viaggi" : "mezzi"} id={mostraViaggi ? "section-viaggi" : undefined} activationMode="manual"
      className="scroll-mt-36 rounded-2xl border bg-card md:scroll-mt-24"
      onValueChange={value => navigate({
        pathname: location.pathname,
        ...orderDetailLocation(location.search, {
          tab: "cantiere",
          cantiereView: "lavorazioni",
          section: value === "viaggi" ? "section-viaggi" : "section-mezzi",
        }),
      }, { preventScrollReset: true })}>
      <div className="rounded-t-2xl border-b bg-muted/35 px-2.5 py-2 sm:px-3">
        <TabsList className="grid h-auto w-full grid-cols-2 rounded-lg bg-muted/85 sm:inline-grid sm:w-auto" aria-label={t("Logistica di cantiere")}>
          <TabsTrigger className="min-w-0 gap-1.5 rounded-md px-2 max-sm:text-xs" value="mezzi"><Truck className="size-4 shrink-0" aria-hidden="true" />{t("Mezzi e attrezzature")}</TabsTrigger>
          <TabsTrigger className="min-w-0 gap-1.5 rounded-md px-2 max-sm:text-xs" value="viaggi"><Route className="size-4 shrink-0" aria-hidden="true" />{t("Registro viaggi")}</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent className="mt-0" value="mezzi">{mezzi}</TabsContent>
      <TabsContent className="mt-0" value="viaggi">{viaggi}</TabsContent>
    </Tabs>
  );
}

const rientroInRitardo = (r: RigaMezzoCantiere, oggi: string) => r.stato === "sul_cantiere" && !!r.piano?.al && r.piano.al < oggi;
const COLONNE_RISORSE = "lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)_minmax(0,1fr)_9.5rem]";

export function PianoMezziCantiere({
  orderId,
  faseId,
  conViaggi = false,
}: {
  orderId: string;
  faseId?: string;
  conViaggi?: boolean;
}) {
  const tr = useT();
  const perms = usePermissions();
  const vede = perms.canViewMezzi || perms.isAdmin;
  const modifica =
    vede && (perms.canEditMezzi || perms.isAdmin) && !perms.solaLettura;
  const costi = perms.canViewCosts === true;
  const {
    data: mezzi = [],
    isLoading: loadingMezzi,
    isError: erroreMezzi,
    refetch: refetchMezzi,
  } = useMezzi();
  const { piani, prezzi, salva, chiudiRientro } = usePianoMezziCantiere(orderId, vede, costi);
  const { fonti } = useMezziPianoEconomia(orderId, vede && costi);
  const companyId = useEffectiveCompanyId();
  const fasi = useQuery({
    queryKey: ["mezzi-piani-fasi", companyId, orderId],
    enabled: vede && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_work_phases")
        .select("id,name,start_date,end_date")
        .eq("order_id", orderId)
        .eq("company_id", companyId!)
        .order("position");
      if (error) throw error;
      return data;
    },
  });
  const dateCantiere = useQuery({
    queryKey: ["mezzi-piani-date", companyId, orderId],
    enabled: vede && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("work_start_date,work_end_date")
        .eq("company_id", companyId!)
        .eq("id", orderId)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const [aperto, setAperto] = useState(false);
  const [nuovo, setNuovo] = useState<"mezzo" | "attrezzatura" | null>(null);
  const [modalita, setModalita] = useState<"parco" | "noleggio">("parco");
  const [nuovoNoleggio, setNuovoNoleggio] = useState<NuovoNoleggio | null>(null);
  const [unitaDaConfermare, setUnitaDaConfermare] = useState(false);
  const [fonte, setFonte] = useState<PropostaRisorsa | null>(null);
  const [idPrenotazione, setIdPrenotazione] = useState("");
  const [giaQui, setGiaQui] = useState(false);
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [possessoFiltro, setPossessoFiltro] = useState("");
  const [statoFiltro, setStatoFiltro] = useState<"tutti" | "presenti" | "arrivi" | "rientri">("tutti");
  const [ricerca, setRicerca] = useState("");
  const [storicoAperto, setStoricoAperto] = useState(false);
  const [draft, setDraft] = useState<Partial<PianoMezzo>>({});
  const [ambito, setAmbito] = useState("cantiere");
  const [tariffa, setTariffa] = useState("");
  const [base, setBase] = useState<BaseCostoMezzo>("totale");
  const [extra, setExtra] = useState("");
  const [accessori, setAccessori] = useState({ trasporto: "", montaggio: "", smontaggio: "" });
  const [perUnita, setPerUnita] = useState(false);
  const [fornitore, setFornitore] = useState("");
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [rientroParziale, setRientroParziale] = useState<RigaMezzoCantiere | null>(null);
  const [quantoRientra, setQuantoRientra] = useState("");
  const persone = usePersonePianoMezzi(orderId, vede);
  const oggi = oggiIso();
  const asset = mezzi.find((m) => m.id === draft.mezzo_id);
  const noleggio = modalita === "noleggio" || asset?.possesso.startsWith("noleggio");
  const unita = nuovoNoleggio ? nuovoNoleggio.unita : asset?.gestione === "quantita" ? asset.unita_misura ?? "pz" : null;
  const presenti = useMezziDellaCommessa(vede ? orderId : undefined);
  const montati = useMontaggiDellaCommessa(vede ? orderId : undefined);
  const assegna = useAssegnaMezzoACommessa();
  const piniFase = useMemo(() => (piani.data ?? []).filter((p) => pianoPerFase(p, faseId)), [piani.data, faseId]);
  // Previsto e registrato: gli stessi di Margini e costi. Prima che i dati ci siano, nessuno stato.
  const economiaCosti = useMemo(
    () => (costi && piani.data && prezzi.data && fonti.data ? economiaPianiMezzi(piani.data.filter((p) => !p.annullato), prezzi.data, fonti.data) : null),
    [costi, piani.data, prezzi.data, fonti.data],
  );
  // Un solo elenco: prenotazioni ancora valide e mezzi che sono sul cantiere adesso.
  const tutte = useMemo(() => {
    const qui: PresenzaMezzo[] = [
      ...(presenti.data ?? []).filter((m) => m.adesso).map((m) => ({
        mezzo_id: m.mezzo_id,
        dal: giornoItaliano(m.periodi.find((x) => !x.al)?.dal ?? oggi),
      })),
      ...(montati.data ?? []).filter((g) => g.adesso).map((g) => ({
        mezzo_id: g.mezzo_id, dal: g.dal, allocazione_id: g.id, piano_id: g.piano_id, quantita: g.quantita,
      })),
    ];
    const righe = righeMezziCantiere(piniFase, qui, oggi);
    // Nella finestra di una fase, i mezzi senza prenotazione valgono per tutto il cantiere: si vedono nella commessa.
    return faseId ? righe.filter((r) => r.piano) : righe;
  }, [piniFase, presenti.data, montati.data, oggi, faseId]);
  const mezziPerId = useMemo(() => new Map(mezzi.map(m => [m.id, m])), [mezzi]);
  const inCantiere = tutte.filter(r => r.stato === "sul_cantiere").length;
  const rientriInRitardo = tutte.filter(r => rientroInRitardo(r, oggi)).length;
  const stati = [
    { id: "tutti", label: tr("Tutti"), totale: tutte.length },
    { id: "presenti", label: tr("In cantiere"), totale: inCantiere },
    { id: "arrivi", label: tr("In arrivo"), totale: tutte.length - inCantiere },
    { id: "rientri", label: tr("Rientri in ritardo"), totale: rientriInRitardo },
  ] as const;
  const termine = ricerca.trim().toLocaleLowerCase("it");
  const filtriAttivi = !!(termine || tipoFiltro || possessoFiltro || statoFiltro !== "tutti");
  const azzeraFiltri = () => { setRicerca(""); setTipoFiltro(""); setPossessoFiltro(""); setStatoFiltro("tutti"); };
  const fornitorePiano = (p: PianoMezzo | null) => p?.fornitore_noleggio || (p && costi ? prezzi.data?.[p.id]?.fornitore : null);
  const rows = tutte.filter((r) => {
    const m = mezziPerId.get(r.mezzo_id);
    const risorsa = [m?.nome, m?.targa, fornitorePiano(r.piano), r.piano?.riferimento_noleggio].filter(Boolean).join(" ").toLocaleLowerCase("it");
    return (!termine || risorsa.includes(termine)) &&
      (statoFiltro === "tutti" || (statoFiltro === "presenti" && r.stato === "sul_cantiere") ||
        (statoFiltro === "arrivi" && r.stato !== "sul_cantiere") || (statoFiltro === "rientri" && rientroInRitardo(r, oggi))) &&
      (!tipoFiltro || (m && (m.tipo === "attrezzatura" ? "attrezzatura" : "mezzo") === tipoFiltro)) &&
      (!possessoFiltro || (possessoFiltro === "noleggio" ? m?.possesso.startsWith("noleggio") : m?.possesso === possessoFiltro));
  }).sort((a, b) => Number(rientroInRitardo(b, oggi)) - Number(rientroInRitardo(a, oggi)));
  const pianiVisibili = new Set(tutte.map(r => r.piano?.id));
  const pianiPassati = piniFase.filter((p) => !pianoAttivo(p, oggi) && !pianiVisibili.has(p.id));
  const occupato = assegna.isPending || salva.isPending || chiudiRientro.isPending;
  const arriva = async (piano: PianoMezzo) => {
    await salva.mutateAsync({ ...piano, dal: piano.dal > oggi ? oggi : piano.dal, arrivato_oggi: true });
  };
  const rientra = async (r: RigaMezzoCantiere, quantita?: number) => {
    const allocazioneId = r.presenza?.allocazione_id;
    if (r.piano || (allocazioneId && quantita != null)) {
      await chiudiRientro.mutateAsync({ pianoId: r.piano?.id, allocazioneId, quantita, quantitaPresente: r.presenza?.quantita });
    } else {
      await assegna.mutateAsync({ mezzoId: r.mezzo_id, orderId: null });
    }
  };
  const azione = (fn: () => Promise<void>) => {
    void fn().catch(() => {
      /* le mutation mostrano l'errore */
    });
  };
  const apri = (p?: PianoMezzo, modo: "parco" | "noleggio" = "parco", origine?: { computoId: string; proposta: PropostaRisorsa }) => {
    const proposta = origine?.proposta;
    const periodi = proposta?.scelta.periodi ?? proposta?.periodi ?? [];
    const unitaProposta = proposta ? unitaNoleggio(proposta.scelta.unita || periodi[0]?.unita || proposta.unita) : null;
    const q = proposta?.scelta.quantita ?? (periodi.length === 1 ? periodi[0].quantita : periodi.length ? null : proposta?.quantita);
    const fasiDisponibili = new Set(fasi.data?.map(f => f.id));
    const faseIds = p?.fase_ids ?? (faseId ? [faseId] : proposta?.fase_ids.filter(id => fasiDisponibili.has(id)) ?? []);
    setModalita(modo);
    setFonte(proposta ?? null);
    setUnitaDaConfermare(!!proposta && !p && !unitaProposta);
    setNuovoNoleggio(!p && modo === "noleggio" ? { nome: proposta?.descrizione.slice(0, 160) ?? "", tipo: "attrezzatura", unita: unitaProposta } : null);
    setIdPrenotazione(p?.id ?? crypto.randomUUID());
    setDraft(
      p ?? {
        mezzo_id: "",
        dal: proposta?.scelta.dal || (modo === "parco" ? oggi : ""),
        al: proposta?.scelta.al || null,
        quantita: proposta ? q ?? undefined : 1,
        fase_ids: faseIds,
        origine_computo_id: origine?.computoId,
        origine_noleggio_id: proposta?.id,
        note: proposta?.scelta.note || null,
        annullato: false,
      },
    );
    setGiaQui(false);
    setAmbito(faseIds.length ? "fasi" : "cantiere");
    const c = p ? prezzi.data?.[p.id] : undefined;
    setTariffa(c ? String(c.tariffa) : "");
    setBase(c?.base ?? "totale");
    setExtra(c ? String(c.extra) : "");
    setAccessori({ trasporto: c?.trasporto ? String(c.trasporto) : "", montaggio: c?.montaggio ? String(c.montaggio) : "", smontaggio: c?.smontaggio ? String(c.smontaggio) : "" });
    setPerUnita(!!c?.per_unita);
    setFornitore(p?.fornitore_noleggio ?? c?.fornitore ?? proposta?.scelta.fornitore ?? "");
    setSupplierId(p?.fornitore_id ?? c?.supplier_id ?? null);
    setAperto(true);
  };
  const prezzo: CostoPianoMezzo = {
    tariffa: Number(tariffa),
    base,
    extra: Number(extra || 0),
    fornitore: fornitore.trim() || null,
    supplier_id: supplierId,
    per_unita: perUnita && !!unita,
    trasporto: Number(accessori.trasporto || 0),
    montaggio: Number(accessori.montaggio || 0),
    smontaggio: Number(accessori.smontaggio || 0),
  };
  const quantita = unita ? Number(draft.quantita) : 1;
  const totale =
    tariffa.trim() && draft.dal
      ? costoPianoMezzo({ dal: draft.dal, al: draft.al ?? null, quantita }, prezzo)
      : null;
  const valido =
    (!!draft.mezzo_id || !!nuovoNoleggio?.nome.trim()) &&
    !!draft.dal &&
    (!draft.al || draft.al >= draft.dal) &&
    quantitaMezzoValida(quantita, unita) &&
    (!giaQui || !draft.al || draft.al >= oggi) &&
    !unitaDaConfermare &&
    (ambito === "cantiere" || !!draft.fase_ids?.length) &&
    (!costi || [prezzo.tariffa, prezzo.extra, prezzo.trasporto, prezzo.montaggio, prezzo.smontaggio]
      .every(x => x != null && Number.isFinite(x) && x >= 0 && x <= 1000000000)
      && (tariffa.trim() !== "" || !(prezzo.extra || prezzo.trasporto || prezzo.montaggio || prezzo.smontaggio)));
  const periodiSuggeriti =
    ambito === "cantiere"
      ? [
          {
            start_date: dateCantiere.data?.work_start_date,
            end_date: dateCantiere.data?.work_end_date,
          },
        ]
      : (fasi.data ?? []).filter((f) => draft.fase_ids?.includes(f.id));
  const inizioSuggerito = periodiSuggeriti
    .map((p) => p.start_date)
    .filter((x): x is string => !!x)
    .sort()[0];
  const fineSuggerita = periodiSuggeriti
    .map((p) => p.end_date)
    .filter((x): x is string => !!x)
    .sort()
    .at(-1);
  const salvaDraft = async () => {
    if (!valido) return;
    const arrivo = !draft.id && giaQui;
    const dal = arrivo && draft.dal! > oggi ? oggi : draft.dal;
    try {
      await salva.mutateAsync({
        ...draft,
        id: idPrenotazione,
        dal,
        quantita,
        fase_ids: ambito === "cantiere" ? [] : draft.fase_ids,
        ...(nuovoNoleggio ? { mezzo_id: undefined, nuovo_noleggio: nuovoNoleggio } : {}),
        ...(noleggio ? { fornitore_id: supplierId, fornitore_noleggio: fornitore.trim() || null } : {}),
        ...(arrivo ? { arrivato_oggi: true } : {}),
        ...(costi ? { costo: tariffa.trim() ? prezzo : null } : {}),
      });
      setAperto(false);
    } catch {
      /* mutation mostra l'errore */
    }
  };
  if (!vede) return null;
  const nomeFase = (id: string) => fasi.data?.find((f) => f.id === id)?.name ?? "Fase rimossa";
  const prenotazioneDa = (computoId: string, p: PropostaRisorsa) => piani.data?.find(x => x.origine_computo_id === computoId && x.origine_noleggio_id === p.id);
  const rientrante = numeroLetto(quantoRientra);
  const presente = rientroParziale?.presenza?.quantita ?? 0;
  const unitaRientro = mezzi.find(m => m.id === rientroParziale?.mezzo_id)?.unita_misura ?? "pz";
  const caricamento = loadingMezzi || piani.isLoading || presenti.isLoading || montati.isLoading || fasi.isLoading;
  const erroreCaricamento = piani.isError || erroreMezzi || fasi.isError || presenti.isError || montati.isError;
  const statoRiga = (r: RigaMezzoCantiere) => {
    const avviso = "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/45 dark:text-amber-200";
    if (rientroInRitardo(r, oggi)) return { testo: "Rientro in ritardo", classe: avviso };
    if (r.stato === "sul_cantiere") {
      return r.piano?.al === oggi
        ? { testo: "Rientro oggi", classe: avviso }
        : { testo: "In cantiere", classe: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/45 dark:text-emerald-200" };
    }
    if (r.stato === "atteso") return { testo: r.piano!.dal < oggi ? tr("Arrivo in ritardo") : tr("Atteso oggi"), classe: avviso };
    return { testo: "Prenotato", classe: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/45 dark:text-blue-200" };
  };
  const elencoMezzi = (
      <section
        className={cn("space-y-3 p-3 sm:p-4", !conViaggi && "rounded-xl border bg-background")}
        aria-label={tr("Mezzi e attrezzature del cantiere")}
      >
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div>
            <h3 className={cn("flex items-center gap-2 font-semibold", conViaggi && "sr-only")}>
              <Truck className="size-4" aria-hidden="true" />
              {tr("Mezzi e attrezzature")}
            </h3>
            {faseId && <p className="mt-1 text-xs text-muted-foreground">{tr("Per questa fase e per tutto il cantiere")}</p>}
            <Link to="/azienda/manodopera?tab=mezzi" className="inline-flex items-center gap-1 rounded text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {tr("Parco mezzi e noleggi")}<ArrowUpRight className="size-3" aria-hidden="true" />
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {companyId && conViaggi && <StrumentiComputo companyId={companyId} orderId={orderId}
              nomeFase={id => id ? nomeFase(id) : tr("Senza fase")} iniziale="servizi" etichetta={tr("Noleggi e servizi dal computo")} soloSeDocumento
              noleggi={!modifica || piani.isLoading || piani.isError || fasi.isLoading || fasi.isError ? undefined : {
                collegato: (id, p) => !!prenotazioneDa(id, p),
                apri: (id, p) => apri(prenotazioneDa(id, p), "noleggio", { computoId: id, proposta: p }),
              }} />}
            {modifica && <>
              <Button size="sm" variant="outline" onClick={() => apri()} disabled={loadingMezzi || erroreMezzi || fasi.isError}>
                <Plus className="size-4" aria-hidden="true" />{tr("Aggiungi mezzo")}
              </Button>
              <Button size="sm" onClick={() => apri(undefined, "noleggio")} disabled={erroreMezzi || fasi.isError}>
                <CalendarPlus className="size-4" aria-hidden="true" />{tr("Aggiungi noleggio")}
              </Button>
            </>}
          </div>
        </div>
        {!caricamento && !erroreCaricamento && (tutte.length > 0 || filtriAttivi) && (
          <div className="space-y-2.5">
            <div role="group" aria-label={tr("Stato delle risorse")} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {stati.map(stato => <button key={stato.id} type="button" aria-label={`${stato.label} ${stato.totale}`} aria-pressed={statoFiltro === stato.id}
                className={cn("flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3",
                  statoFiltro === stato.id ? "border-primary/30 bg-primary/10 text-primary" : "bg-background hover:bg-muted/60",
                  stato.id === "rientri" && stato.totale > 0 && statoFiltro !== stato.id && "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-200 dark:hover:bg-amber-950/60")}
                onClick={() => setStatoFiltro(stato.id)}>
                <span>{stato.label}</span><span className="shrink-0 text-base font-semibold tabular-nums">{stato.totale}</span>
              </button>)}
            </div>
            {(tutte.length > 1 || termine || tipoFiltro || possessoFiltro) && <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <div className="relative col-span-2 min-w-0 flex-1 sm:min-w-48">
                <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
                <Input value={ricerca} onChange={e => setRicerca(e.target.value)} aria-label={tr("Cerca mezzi e attrezzature")} placeholder={tr("Cerca mezzo, targa o fornitore…")} className="h-9 bg-background pl-9" />
              </div>
              <select aria-label={tr("Tipo di risorsa")} className="h-9 min-w-0 rounded-md border bg-background px-2 text-xs" value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)}>
                <option value="">{tr("Tutti i tipi")}</option><option value="mezzo">{tr("Mezzi")}</option><option value="attrezzatura">{tr("Attrezzature")}</option>
              </select>
              <select aria-label={tr("Possesso della risorsa")} className="h-9 min-w-0 rounded-md border bg-background px-2 text-xs" value={possessoFiltro} onChange={e => setPossessoFiltro(e.target.value)}>
                <option value="">{tr("Tutti i possessi")}</option><option value="proprieta">{tr("Di proprietà")}</option><option value="noleggio">{tr("A noleggio")}</option><option value="leasing">{tr("In leasing")}</option>
              </select>
            </div>}
          </div>
        )}
        {caricamento ? (
          <p role="status" className="flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden="true" />{tr("Carico i mezzi del cantiere…")}</p>
        ) : erroreCaricamento ? (
          <p role="alert" className="py-4 text-sm text-destructive">
            {tr("Impossibile caricare i mezzi del cantiere.")}{" "}
            <button
              className="underline"
              onClick={() => {
                void piani.refetch();
                void fasi.refetch();
                void refetchMezzi();
                void presenti.refetch();
                void montati.refetch();
              }}
            >
              {tr("Riprova")}
            </button>
          </p>
        ) : rows.length === 0 ? (
          <div className="grid justify-items-center gap-2 rounded-xl border border-dashed bg-muted/20 p-6 text-center">
            <span className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground"><Truck className="size-4" aria-hidden="true" /></span>
            <p role="status" className="text-sm font-medium">
              {filtriAttivi ? tr("Nessuna risorsa corrisponde ai filtri.") : faseId ? tr("Nessun mezzo per questa fase.") : tr("Nessun mezzo su questo cantiere.")}
            </p>
            {filtriAttivi && <Button type="button" variant="outline" size="sm" onClick={azzeraFiltri}>{tr("Azzera filtri")}</Button>}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-background">
          <div className={cn("hidden gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground lg:grid", COLONNE_RISORSE)} aria-hidden="true">
            <span>{tr("Risorsa")}</span><span>{tr("Stato")}</span><span>{tr("Periodo e fase")}</span><span className="sr-only">{tr("Azioni")}</span>
          </div>
          <ul className="divide-y" aria-label={tr("Mezzi del cantiere")}>
            {rows.map((r) => {
              const p = r.piano;
              const m = mezziPerId.get(r.mezzo_id);
              const c = p ? prezzi.data?.[p.id] : undefined;
              const t = p && c ? costoPianoMezzo(p, c) : null;
              const fuori = p ? pianoDaAllineare(p, fasi.data ?? []) : null;
              const st = statoRiga(r);
              const nome = m?.nome ?? "Risorsa archiviata";
              const qta = m?.gestione === "quantita" ? formatQuantita(r.presenza?.quantita ?? p?.quantita, m.unita_misura) : null;
              const fasiRiga = p?.fase_ids.length ? p.fase_ids.map(nomeFase).join(", ") : "Tutto il cantiere";
              const riferimento = [fornitorePiano(p), p?.riferimento_noleggio].filter(Boolean).join(" · ");
              const riga = p ? economiaCosti?.righe.find((x) => x.piano.id === p.id) : undefined;
              const statoCosto = riga ? statoCostoMezzo(riga, oggi) : null;
              return (
                <li key={r.chiave} className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2.5 p-3 lg:gap-3", COLONNE_RISORSE, rientroInRitardo(r, oggi) && "bg-amber-50/30 dark:bg-amber-950/15")}>
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground", m?.tipo === "attrezzatura" ? "bg-muted" : "bg-primary/10 text-primary")}>
                      {m?.tipo === "attrezzatura" ? <Wrench className="size-4" aria-hidden="true" /> : <Truck className="size-4" aria-hidden="true" />}
                    </span>
                    <div className="min-w-0">
                      {p ? (
                        <button
                          type="button"
                          className="break-words rounded text-left text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => apri(p)}
                          disabled={costi && (prezzi.isFetching || prezzi.isError)}
                        >
                          {nome}
                        </button>
                      ) : (
                        <Link to={`/azienda/mezzi/${r.mezzo_id}`} className="break-words rounded text-sm font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          {nome}
                        </Link>
                      )}
                      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-xs text-muted-foreground">
                        {qta && <span className="font-semibold tabular-nums text-foreground">{qta}</span>}
                        <span>{[m?.targa, POSSESSI.find(x => x.value === m?.possesso)?.label].filter(Boolean).join(" · ")}</span>
                      </p>
                      {riferimento && <p className="mt-0.5 break-words text-xs text-muted-foreground">{riferimento}</p>}
                    </div>
                  </div>
                  <div className="min-w-0 justify-self-end lg:justify-self-start">
                    <Badge variant="outline" className={cn("max-w-[8.5rem] rounded-md px-2 py-0.5 text-right text-[11px] leading-snug lg:max-w-full lg:text-left", st.classe)}>{st.testo}</Badge>
                    {r.presenza && <p className="mt-0.5 text-right text-xs tabular-nums text-muted-foreground lg:text-left">{tr("Dal {dal}", { dal: formatData(r.presenza.dal) })}</p>}
                  </div>
                  <div className="col-span-2 min-w-0 pl-[2.875rem] text-xs lg:col-span-1 lg:pl-0">
                    {p ? <>
                      <p className="line-clamp-2 font-medium" title={fasiRiga}>{fasiRiga}</p>
                      <p className="mt-0.5 tabular-nums text-muted-foreground">{formatData(p.dal)} → {p.al ? formatData(p.al) : tr("Fine da definire")}</p>
                      {p.responsabile_hr_id && <p className="mt-0.5 break-words text-muted-foreground">
                        {tr("Referente {nome}", { nome: persone.data?.find(x => x.id === p.responsabile_hr_id)?.nome ?? tr("assegnato") })}
                      </p>}
                    </> : <p className="text-muted-foreground">{tr("Presenza registrata direttamente")}</p>}
                  </div>
                  {modifica && (
                    <div className="col-span-2 flex justify-end lg:col-span-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-9"
                        disabled={occupato || loadingMezzi}
                        onClick={() => {
                          if (p && r.stato !== "sul_cantiere") azione(() => arriva(p));
                          else if (r.presenza?.allocazione_id) {
                            setRientroParziale(r);
                            setQuantoRientra(String(r.presenza.quantita ?? ""));
                          } else azione(() => rientra(r));
                        }}
                      >
                        {r.stato === "sul_cantiere" ? (
                          <><ArrowUpFromLine className="size-4" aria-hidden="true" />{r.presenza?.allocazione_id ? tr("Registra rientro") : tr("È rientrato")}</>
                        ) : (
                          <><ArrowDownToLine className="size-4" aria-hidden="true" />{tr("È arrivato")}</>
                        )}
                      </Button>
                    </div>
                  )}
                  {(fuori || (costi && p)) && <div className="col-span-full space-y-1 pl-[2.875rem]">
                    {fuori && (
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-amber-900 dark:text-amber-200">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                        {tr("Le fasi ora vanno dal {dal} al {al}.", { dal: formatData(fuori.dal), al: formatData(fuori.al) })}
                        {modifica && !r.presenza && (
                          <button
                            type="button"
                            className="font-medium underline"
                            disabled={occupato}
                            onClick={() => azione(() => salva.mutateAsync({ ...p!, dal: fuori.dal, al: fuori.al }))}
                          >
                            {tr("Allinea alle fasi")}
                          </button>
                        )}
                      </p>
                    )}
                    {costi && p && (
                      <p className="text-xs text-muted-foreground">
                        {prezzi.isError
                          ? tr("Costo non disponibile")
                          : prezzi.isFetching
                            ? tr("Caricamento…")
                            : t !== null
                              ? tr("Costo previsto {t}", { t: formatCurrency(t) })
                              : c
                                ? tr("Costo: definisci la fine")
                                : tr("Costo da valorizzare")}
                        {riga && riga.registrato !== 0 && tr(" · registrato {registrato}", { registrato: formatCurrency(riga.registrato) })}
                        {statoCosto && ["daRegistrare", "oltre", "verifica"].includes(statoCosto.chiave) && (
                          <span className="ml-1 font-medium text-amber-800">· {statoCosto.testo}</span>
                        )}
                      </p>
                    )}
                  </div>}
                </li>
              );
            })}
          </ul>
          </div>
        )}
        {prezzi.isError && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {tr("Costi non disponibili.")}{" "}
            <button className="underline" onClick={() => void prezzi.refetch()}>
              {tr("Riprova")}
            </button>
          </p>
        )}
        {!faseId && (
          <details className="group/storico rounded-lg border" onToggle={e => setStoricoAperto(e.currentTarget.open)}>
            <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <History className="size-4 text-muted-foreground" aria-hidden="true" />
              {conViaggi ? (costi ? tr("Storico dei mezzi e costi") : tr("Storico dei mezzi")) : (costi ? tr("Storico, viaggi e costi") : tr("Storico, viaggi"))}
              <ChevronDown className="ml-auto size-4 text-muted-foreground group-open/storico:rotate-180" aria-hidden="true" />
            </summary>
            {storicoAperto && <div className="space-y-3 border-t p-3">
              {pianiPassati.length > 0 && (
                <ul className="divide-y rounded-lg border text-xs" aria-label={tr("Prenotazioni passate")}>
                  {pianiPassati.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <button type="button" className="font-medium text-blue-700 hover:underline" onClick={() => apri(p)}>
                        {mezzi.find((m) => m.id === p.mezzo_id)?.nome ?? tr("Risorsa archiviata")}
                      </button>
                      <span className="text-muted-foreground">
                        {formatData(p.dal)} → {p.al ? formatData(p.al) : "—"} · {statoPianoMezzo(p, oggi)}
                        {p.al_concordato && p.al_concordato !== p.al && tr(" · previsto il {al_concordato}", { al_concordato: formatData(p.al_concordato) })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <MezziCommessaCard orderId={orderId} storico mostraViaggi={!conViaggi} />
            </div>}
          </details>
        )}
        {costi && (
          <p className="mt-2 text-[11px] text-muted-foreground">{tr("Costi previsti al netto IVA, separati dalle fatture.")}</p>
        )}
      </section>
  );
  return (
    <div>
      {conViaggi ? <SchedeLogistica mezzi={elencoMezzi} viaggi={<>
        {companyId && <div className="px-3 pt-3 sm:px-4"><GiroMaterialiCommessa company={companyId} ordine={orderId}
          mezzi={mezzi} modifica={modifica} acquistiVisibili={perms.canViewWarehouse || perms.canManagePurchasing || perms.isAdmin} /></div>}
        <ViaggiCommessa orderId={orderId} mezzi={mezzi} readOnly={!modifica} vedeCosti={costi} integrato />
      </>} /> : elencoMezzi}
      <Dialog
        open={aperto}
        onOpenChange={(v) => {
          if (!salva.isPending) setAperto(v);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {draft.id ? tr("Dettaglio prenotazione") : noleggio ? tr("Aggiungi noleggio") : tr("Aggiungi un mezzo")}
            </DialogTitle>
            <DialogDescription>
              {noleggio ? tr("Indica la risorsa, il periodo e le fasi in cui serve.") : tr("Scegli una risorsa del parco e indica dove e quando serve.")}
            </DialogDescription>
          </DialogHeader>
          <fieldset
            disabled={!modifica || salva.isPending}
            className="space-y-4"
          >
            <div className="space-y-2">
              {fonte && <div className="space-y-1 rounded-lg border bg-sky-50/60 p-3 text-xs dark:bg-sky-950/30">
                <p className="font-semibold">{tr("Voce del computo ·")} {fonte.fonti.map(f => f.numero ?? tr("senza numero")).join(", ")}</p>
                <p>{fonte.descrizione}</p>
                {(fonte.scelta.periodi ?? fonte.periodi).map((p, i) => <p key={i}>{tr("{quantita} {unita} × {mesi} mesi", { quantita: p.quantita.toLocaleString(intlCampo()), unita: String(p.unita ?? ""), mesi: p.mesi.toLocaleString(intlCampo()) })}</p>)}
                {(fonte.scelta.periodi ?? fonte.periodi).length > 1 && <p className="text-amber-900 dark:text-amber-200">{tr("Il computo indica più periodi. Conferma la quantità e le date da prenotare.")}</p>}
              </div>}
              <Label htmlFor="piano-risorsa">{noleggio && !draft.id ? tr("Risorsa da noleggiare") : tr("Mezzo o attrezzatura")}</Label>
              <ViaggioSelect
                label={noleggio && !draft.id ? tr("Risorsa da noleggiare") : tr("Mezzo o attrezzatura")}
                id="piano-risorsa"
                value={nuovoNoleggio ? "nuovo-noleggio" : draft.mezzo_id ?? ""}
                disabled={!!draft.id || !modifica}
                onValueChange={(id) => {
                  if (id === "nuovo-noleggio") {
                    setNuovoNoleggio({ nome: fonte?.descrizione.slice(0, 160) ?? "", tipo: "attrezzatura", unita: unita ?? null });
                    setDraft({ ...draft, mezzo_id: "" });
                  } else {
                    const m = mezzi.find(x => x.id === id);
                    setNuovoNoleggio(null);
                    if (m) setUnitaDaConfermare(false);
                    setDraft({ ...draft, mezzo_id: id, quantita: m?.gestione === "quantita" && fonte ? (m.unita_misura === unita ? draft.quantita : undefined) : 1 });
                  }
                }}
                emptyMessage={tr("Risorsa non trovata. Puoi registrarla con i pulsanti qui sotto.")}
                options={[
                  ...(modalita === "noleggio" && !draft.id ? [{ value: "nuovo-noleggio", label: tr("Nuovo noleggio") }] : [{ value: "", label: tr("Cerca nel parco aziendale…") }]),
                  ...mezzi
                    .filter(
                      (m) =>
                        m.id === draft.mezzo_id || !m.noleggio_dedicato && m.stato !== "fuori_servizio" && (modalita !== "noleggio" || m.possesso.startsWith("noleggio")),
                    )
                    .map((m) => ({
                      value: m.id,
                      label: `${m.nome} · ${m.tipo === "attrezzatura" ? "Attrezzatura" : "Mezzo"} · ${POSSESSI.find((x) => x.value === m.possesso)?.label ?? ""}`,
                    })),
                ]}
              />
              {nuovoNoleggio && <div className="grid gap-3 pt-1 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="noleggio-nome">{tr("Nome del mezzo o dell’attrezzatura")}</Label>
                  <Input id="noleggio-nome" maxLength={160} placeholder={tr("Es. Ponteggio a telai prefabbricati")} value={nuovoNoleggio.nome}
                    onChange={e => setNuovoNoleggio({ ...nuovoNoleggio, nome: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="noleggio-tipo">{tr("Tipo")}</Label>
                  <ViaggioSelect label={tr("Tipo del noleggio")} id="noleggio-tipo" value={nuovoNoleggio.tipo} options={TIPI_MEZZO.map(o => ({ ...o, label: tr(o.label) }))} onValueChange={tipo => {
                    setNuovoNoleggio({ ...nuovoNoleggio, tipo: tipo as MezzoTipo, unita: tipo === "attrezzatura" ? nuovoNoleggio.unita : null });
                    if (tipo !== "attrezzatura") {
                      setDraft({ ...draft, quantita: 1 });
                      setUnitaDaConfermare(false);
                    }
                    setPerUnita(false);
                  }} />
                </div>
                {nuovoNoleggio.tipo === "attrezzatura" && <div className="space-y-1">
                  <Label htmlFor="noleggio-unita">{tr("Gestione e unità")}</Label>
                  <ViaggioSelect label={tr("Unità di noleggio")} id="noleggio-unita" value={unitaDaConfermare ? "da-scegliere" : nuovoNoleggio.unita ?? ""} options={[
                    ...(unitaDaConfermare ? [{ value: "da-scegliere", label: tr("Scegli l’unità") }] : []),
                    { value: "", label: tr("Un solo esemplare") }, ...UNITA_QUANTITA.map(u => ({ value: u.value, label: tr(u.label) })),
                  ]} onValueChange={udm => {
                    if (udm === "da-scegliere") return;
                    setUnitaDaConfermare(false);
                    setNuovoNoleggio({ ...nuovoNoleggio, unita: udm as UnitaQuantita || null });
                    setDraft({ ...draft, quantita: udm ? (udm === unita ? draft.quantita : undefined) : 1 });
                    if (!udm) setPerUnita(false);
                  }} />
                </div>}
              </div>}
              {!draft.id && modalita === "parco" && (
                <div className="flex gap-2">
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => setNuovo("mezzo")}
                  >
                    {tr("+ Registra mezzo")}
                  </Button>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => setNuovo("attrezzatura")}
                  >
                    {tr("+ Registra attrezzatura")}
                  </Button>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="piano-ambito">{tr("Dove serve")}</Label>
              <ViaggioSelect
                label={tr("Dove serve")}
                id="piano-ambito"
                value={ambito}
                onValueChange={setAmbito}
                disabled={!modifica}
                options={[
                  { value: "cantiere", label: tr("Tutto il cantiere") },
                  { value: "fasi", label: tr("Solo alcune fasi") },
                ]}
              />
              {ambito === "fasi" && (
                <div className="max-h-36 space-y-2 overflow-y-auto rounded-lg border p-3">
                  {fasi.data?.length ? (
                    fasi.data.map((f) => (
                      <label
                        key={f.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={draft.fase_ids?.includes(f.id) ?? false}
                          onChange={(e) => {
                            const ids = e.target.checked
                              ? [...(draft.fase_ids ?? []), f.id]
                              : (draft.fase_ids ?? []).filter((id) => id !== f.id);
                            // Nuovo mezzo: le date seguono le fasi scelte, poi si possono cambiare.
                            const w = !draft.id ? finestraFasi(ids, fasi.data ?? []) : null;
                            setDraft({ ...draft, fase_ids: ids, ...(w ? { dal: w.dal, al: w.al } : {}) });
                          }}
                        />
                        {f.name}
                      </label>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {tr("Crea prima le lavorazioni nella commessa.")}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>{tr("Responsabile della risorsa")}</Label>
              <ViaggioSelect
                label={tr("Responsabile della risorsa")}
                value={draft.responsabile_hr_id ?? ""}
                disabled={!modifica || persone.isLoading || persone.isError}
                emptyMessage={tr("Nessuna persona corrispondente.")}
                onValueChange={(v) =>
                  setDraft({ ...draft, responsabile_hr_id: v || null })
                }
                options={[
                  { value: "", label: tr("Nessun responsabile assegnato") },
                  ...(persone.data ?? [])
                    .slice()
                    .sort(
                      (a, b) => Number(b.in_cantiere) - Number(a.in_cantiere),
                    )
                    .map((p) => ({
                      value: p.id,
                      label: `${p.nome} · ${p.capocantiere ? tr("Capocantiere") : p.in_cantiere ? tr("Nel cantiere") : tr("Azienda")}`,
                    })),
                ]}
              />
              {persone.isError && (
                <p role="alert" className="text-xs text-destructive">
                  {tr("Persone non disponibili.")}{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => void persone.refetch()}
                  >
                    {tr("Riprova")}
                  </button>
                </p>
              )}
              {modifica && persone.data?.some((p) => p.capocantiere) && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      responsabile_hr_id: persone.data!.find(
                        (p) => p.capocantiere,
                      )!.id,
                    })
                  }
                >
                  {tr("Usa il capocantiere")}
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                {tr("Referente operativo di questa assegnazione. Non cambia nomine di sicurezza, accessi o abilitazioni all’uso.")}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="piano-dal">{tr("Dal")}</Label>
                <Input
                  id="piano-dal"
                  type="date"
                  value={draft.dal ?? ""}
                  onChange={(e) => setDraft({ ...draft, dal: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="piano-al">{tr("Al (compreso)")}</Label>
                <Input
                  id="piano-al"
                  type="date"
                  min={draft.dal}
                  value={draft.al ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, al: e.target.value || null })
                  }
                />
              </div>
            </div>
            {inizioSuggerito && fineSuggerita && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setDraft({
                    ...draft,
                    dal: inizioSuggerito,
                    al: fineSuggerita,
                  })
                }
              >
                {ambito === "cantiere"
                  ? tr("Usa le date del cantiere")
                  : tr("Usa le date delle fasi selezionate")}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              {tr("Lascia la fine vuota se ancora da definire. Se le fasi si spostano, le date restano queste: l’elenco te lo segnala e le allinei con un clic.")}
            </p>
            {!draft.id && (
              <label className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
                <input type="checkbox" checked={giaQui} onChange={(e) => setGiaQui(e.target.checked)} />
                {tr("È già in cantiere (arrivato oggi)")}
              </label>
            )}
            {unita && (
              <div className="space-y-2">
                <Label htmlFor="piano-quantita">{tr("Quantità ({unita})", { unita: String(unitaBreve(unita) ?? "") })}</Label>
                <Input
                  id="piano-quantita"
                  type="number"
                  min={unita === "pz" ? 1 : 0.01}
                  step={unita === "pz" ? 1 : 0.01}
                  value={draft.quantita ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, quantita: e.target.value === "" ? undefined : Number(e.target.value) })
                  }
                />
                {draft.quantita != null && !quantitaMezzoValida(draft.quantita, unita) && <p className="text-xs text-amber-800">{unita === "pz" ? tr("Indica un numero intero di pezzi.") : tr("Usa fino a due decimali per la quantità da prenotare.")}</p>}
              </div>
            )}
            {(noleggio || costi) && <div className="space-y-2">
              <Label>{tr("Fornitore")}</Label>
              <SupplierSelect searchable value={supplierId ?? undefined} fallbackCompanyId={companyId ?? undefined}
                allowCreate={modifica && (perms.canManageSuppliers || perms.canEditSettingsSuppliers || perms.isAdmin)}
                onSupplierNameChange={setFornitore} onValueChange={id => setSupplierId(id ?? null)} />
              {!supplierId && noleggio && <Input aria-label={tr("Nome del noleggiatore")} placeholder={tr("Nome, se il fornitore non è in anagrafica")} value={fornitore}
                maxLength={200} onChange={e => setFornitore(e.target.value)} />}
            </div>}
            {noleggio && <div className="space-y-1">
              <Label htmlFor="noleggio-riferimento">{tr("Riferimento del noleggio")}</Label>
              <Input id="noleggio-riferimento" placeholder={tr("Es. numero preventivo o contratto")} maxLength={200}
                value={draft.riferimento_noleggio ?? ""} onChange={e => setDraft({ ...draft, riferimento_noleggio: e.target.value || null })} />
            </div>}
            {costi && (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                <h4 className="text-sm font-semibold">
                  {noleggio
                    ? tr("Costo del noleggio (facoltativo)")
                    : tr("Costo previsto dell’assegnazione (facoltativo)")}
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="piano-tariffa">{tr("Importo €")}</Label>
                    <Input
                      id="piano-tariffa"
                      type="number"
                      min="0"
                      step="0.01"
                      value={tariffa}
                      onChange={(e) => setTariffa(e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="piano-base">{tr("Tariffa")}</Label>
                    <ViaggioSelect
                      label={tr("Tariffa")}
                      id="piano-base"
                      value={base}
                      onValueChange={(v) => setBase(v as BaseCostoMezzo)}
                      disabled={!modifica}
                      options={[
                        { value: "totale", label: tr("Totale concordato") },
                        { value: "giorno", label: tr("Al giorno") },
                        { value: "settimana", label: tr("A settimana (7 giorni)") },
                        { value: "mese", label: tr("Al mese (30 giorni)") },
                      ]}
                    />
                  </div>
                </div>
                {unita && <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={perUnita} onChange={e => setPerUnita(e.target.checked)} />
                  {tr("Applica l’importo a ogni {unita}", { unita: unitaBreve(unita) })}
                </label>}
                <details className="rounded-md border bg-background p-2">
                  <summary className="cursor-pointer text-sm">{tr("Trasporto, montaggio e altre spese")}</summary>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(["trasporto", "montaggio", "smontaggio"] as const).map(k => (
                      <label key={k} className="space-y-1 text-sm capitalize">{k} €
                        <Input type="number" min="0" step="0.01" value={accessori[k]} onChange={e => setAccessori({ ...accessori, [k]: e.target.value })} />
                      </label>
                    ))}
                    <label className="space-y-1 text-sm">{tr("Altre spese €")}
                      <Input id="piano-extra" type="number" min="0" step="0.01" value={extra} onChange={e => setExtra(e.target.value)} />
                    </label>
                  </div>
                </details>
                {base !== "totale" && <p className="text-xs text-muted-foreground">{tr("Giorni di calendario compresi. Settimane e mesi sono riproporzionati.")}</p>}
                {!tariffa.trim() && !!(prezzo.extra || prezzo.trasporto || prezzo.montaggio || prezzo.smontaggio) &&
                  <p className="text-xs text-amber-800">{tr("Indica l’importo del noleggio. Usa 0 se sono previste solo le spese accessorie.")}</p>}
                <p className="text-sm font-semibold">
                  {tr("Totale previsto:")}{" "}
                  {totale !== null
                    ? formatCurrency(totale)
                    : tariffa.trim() ? tr("serve la data di fine") : tr("da definire")}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="piano-note">{tr("Note operative")}</Label>
              <Input
                id="piano-note"
                value={draft.note ?? ""}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              />
            </div>
            {draft.id && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.annullato ?? false}
                  onChange={(e) =>
                    setDraft({ ...draft, annullato: e.target.checked })
                  }
                />
                {tr("Assegnazione annullata (rimane nello storico)")}
              </label>
            )}
          </fieldset>
          {draft.id && (
            <SpesePianoMezzo
              orderId={orderId}
              pianoId={draft.id}
              supplierId={supplierId}
              nomeMezzo={mezzi.find((m) => m.id === draft.mezzo_id)?.nome}
            />
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAperto(false)}
              disabled={salva.isPending}
            >
              {modifica ? tr("Annulla") : tr("Chiudi")}
            </Button>
            {modifica && (
              <Button
                disabled={!valido || salva.isPending || fasi.isLoading}
                onClick={() => void salvaDraft()}
              >
                {salva.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Pencil className="mr-1 h-4 w-4" />
                )}
                {draft.id ? tr("Salva") : noleggio ? tr("Salva noleggio") : tr("Aggiungi")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {rientroParziale && <Dialog open onOpenChange={open => { if (!open && !occupato) setRientroParziale(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("Registra rientro")}</DialogTitle>
            <DialogDescription>{tr("{presente} {unitaRientro} sul cantiere", { presente: presente.toLocaleString(intlCampo()), unitaRientro: String(unitaBreve(unitaRientro) ?? "") })}</DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={e => {
            e.preventDefault();
            if (rientrante == null || !quantitaMezzoValida(rientrante, unitaRientro) || rientrante > presente || occupato) return;
            azione(async () => { await rientra(rientroParziale, rientrante); setRientroParziale(null); });
          }}>
            <div className="space-y-1">
              <Label htmlFor="piano-quanto-rientra">{tr("Quantità che rientra ({unitaRientro})", { unitaRientro: String(unitaBreve(unitaRientro) ?? "") })}</Label>
              <Input id="piano-quanto-rientra" inputMode="decimal" value={quantoRientra} onChange={e => setQuantoRientra(e.target.value)} />
            </div>
            {rientrante != null && rientrante > 0 && rientrante < presente && <p className="text-sm text-muted-foreground">{tr("Restano in cantiere {valore} {unitaRientro}.", { valore: (presente - rientrante).toLocaleString(intlCampo()), unitaRientro: String(unitaBreve(unitaRientro) ?? "") })}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={occupato} onClick={() => setRientroParziale(null)}>{tr("Annulla")}</Button>
              <Button type="submit" disabled={occupato || rientrante == null || !quantitaMezzoValida(rientrante, unitaRientro) || rientrante > presente}>{tr("Conferma rientro")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>}
      {nuovo && (
        <MezzoFormDialog
          open
          onOpenChange={(v) => {
            if (!v) setNuovo(null);
          }}
          classe={nuovo}
          onSalvato={(id) => {
            setDraft((d) => ({ ...d, mezzo_id: id }));
            setNuovo(null);
          }}
        />
      )}
    </div>
  );
}

export function MezziFaseCantiere({
  orderId,
  faseId,
}: {
  orderId: string;
  faseId: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const p = usePermissions();
  const vede = p.canViewMezzi || p.isAdmin;
  const { piani } = usePianoMezziCantiere(orderId, vede, false);
  if (!vede) return null;
  const n =
    piani.data?.filter(
      (x) =>
        !x.annullato && (!x.al || x.al >= oggiIso()) && pianoPerFase(x, faseId),
    ).length ?? 0;
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="min-h-9 rounded-full text-xs"
        onClick={() => setOpen(true)}
      >
        <Truck className="mr-1 h-3.5 w-3.5" />
        {t("Mezzi e attrezzature")}{n ? ` · ${n}` : ""}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{t("Risorse della lavorazione")}</DialogTitle>
            <DialogDescription>
              {t("Gestisci le assegnazioni senza uscire dalla commessa.")}
            </DialogDescription>
          </DialogHeader>
          {open && <PianoMezziCantiere orderId={orderId} faseId={faseId} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
