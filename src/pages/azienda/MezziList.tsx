/**
 * /azienda/mezzi — Mezzi e attrezzature (24/09/2026, divisi il 05/10/2026).
 *
 * Due elenchi: i mezzi (furgoni, auto, mezzi d'opera, gru, rimorchi) per tipo,
 * le attrezzature per categoria. In cima quello che è scaduto o sta per
 * scadere, con il pallino dello stato peggiore su ogni riga: le scadenze
 * vengono dalla vista mezzi_scadenze, la stessa che fa partire l'avviso
 * giornaliero. Le attrezzature a quantità (ponteggi, transenne) mostrano quanto
 * è montato e quanto resta in magazzino. Dall'ufficio si scansiona un QR, si
 * stampano le etichette, si fa l'inventario.
 *
 * 06/10/2026, come i subappaltatori: tre viste (per tipo o categoria, dove
 * sono, elenco), riquadri che contano e filtrano, gruppi che si aprono e si
 * chiudono (i piccoli affiancati), e su ogni mezzo i documenti che mancano.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle, ChevronRight, ClipboardCheck, EyeOff, FileWarning, HardHat, Loader2, MapPin, Plus, QrCode, Search, Settings2,
  Truck, UserRound, Warehouse, Wrench, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import {
  useCopertineMezzi, useCostiParco, useDocumentiRegistrati, useMezzi, useMezziCategorie, useMezziDisponibilita, useMezziScadenze,
  useMontaggiInCorso, useSegnalazioniAperte, useUltimeViste,
} from "@/hooks/useMezzi";
import { useIsMobile } from "@/hooks/use-mobile";
import { OperationalKpiCard } from "@/components/orders/OperationalKpiCard";
import { KpiMobili } from "@/components/mobile/FiltriMobile";
import {
  SezioneApribile, TABELLONE_GRUPPI, apriGruppo, gruppoPiccolo, larghezzaGruppo,
} from "@/components/common/SezioneApribile";
import {
  IN_MAGAZZINO, IN_SEDE, documentiRichiesti, doveSiTrova, mancanzeMezzo, raggruppaPerPosto, type DocumentoRichiesto, type TipoPosto,
} from "@/lib/mezzi/gruppiMezzi";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/formatters";
import { MezzoFormDialog } from "@/components/mezzi/MezzoFormDialog";
import { IconaMezzo } from "@/components/mezzi/IconaMezzo";
import { ScansionaMezzoButton } from "@/components/mezzi/ScansionaMezzo";
import { EtichetteQrDialog } from "@/components/mezzi/EtichetteQrDialog";
import { CategorieAttrezziDialog } from "@/components/mezzi/CategorieAttrezziDialog";
import {
  STATO_SCADENZA_BADGE, TIPI_VEICOLO, classeDi, costoAnnuoMezzo, descriviScadenza, formatContatore, formatData,
  formatQuantita, giorniTra, giornoItaliano, oggiIso, statoMezzo, statoPeggiore, tipoMezzoLabel, tipoSegnalazioneLabel,
  type MezzoClasse, type MezzoConAssegnazione, type MezzoDisponibilita, type MezzoScadenza, type MezzoTipo,
} from "@/types/mezzi";
import { cn } from "@/lib/utils";

const TUTTI = "__tutti__";
const SENZA = "__senza__";
const PALLINO: Record<string, string> = {
  scaduto: "bg-red-500",
  in_scadenza: "bg-amber-400",
  valido: "bg-emerald-500",
};
/** Oltre questi giorni senza una lettura del QR, l'attrezzo si segnala come «non visto». */
const GIORNI_NON_VISTO = 60;

const classeMezzo = (m: Pick<MezzoConAssegnazione, "classe" | "tipo">): MezzoClasse => m.classe ?? classeDi(m.tipo);

/** Come raggruppare: per tipo (o categoria), per posto, oppure l'elenco a tabella (solo da computer). */
type Raggruppa = "tipo" | "dove" | "elenco";
type FiltroRiquadro = "cantieri" | "documenti" | "fermi" | "non_visti";
const ICONA_POSTO: Record<TipoPosto, LucideIcon> = { cantiere: HardHat, luogo: MapPin, mezzo: Truck, persona: UserRound, magazzino: Warehouse };
/** Dentro un gruppo le righe: una sotto l'altra se il gruppo è piccolo, a griglia se è grande. */
const RIGHE_COLONNA = "divide-y divide-slate-100";
const RIGHE_GRIGLIA = "grid sm:grid-cols-2 xl:grid-cols-3 [&>li]:border-b [&>li]:border-slate-100 sm:[&>li]:border-r";
/** I titoli dei gruppi per tipo, al plurale (nel modulo il tipo è al singolare). */
const TITOLO_TIPO: Partial<Record<MezzoTipo, string>> = {
  furgone: "Furgoni", autocarro: "Autocarri e camion", autovettura: "Auto",
  macchina_movimento_terra: "Escavatori e movimento terra", sollevamento: "Gru, piattaforme e sollevatori",
  rimorchio: "Rimorchi", altro: "Altri mezzi",
};
const conta = (classe: MezzoClasse, n: number) =>
  classe === "attrezzatura" ? (n === 1 ? "1 attrezzatura" : `${n} attrezzature`) : (n === 1 ? "1 mezzo" : `${n} mezzi`);
const daSistemareTesto = (n: number) => (n > 0 ? `${n} da sistemare` : null);
const suiCantieriTesto = (n: number) => (n > 0 ? `${n} sui cantieri` : null);

/**
 * `incorporata`: dentro Manodopera e Mezzi il titolo lo dà la pagina che la
 * contiene; qui restano la frase e il bottone.
 */
export default function MezziList({ incorporata = false }: { incorporata?: boolean } = {}) {
  const navigate = useNavigate();
  const perms = usePermissions();
  const puoModificare = (perms.canEditMezzi || perms.isAdmin) && !perms.solaLettura;
  const companyId = useEffectiveCompanyId();
  const { effectiveCompany, company } = useAuth();
  const nomeAzienda = (effectiveCompany ?? company)?.name ?? "";

  const [searchParams, setSearchParams] = useSearchParams();
  const vista: MezzoClasse = searchParams.get("vista") === "attrezzature" ? "attrezzatura" : "mezzo";
  const isMobile = useIsMobile();
  // Da telefono due viste sole (le raggruppate): l'elenco a tabella è da computer.
  const visteRaggruppa: Raggruppa[] = isMobile ? ["tipo", "dove"] : ["tipo", "dove", "elenco"];
  const perRichiesto = searchParams.get("per") as Raggruppa | null;
  const per: Raggruppa = perRichiesto && visteRaggruppa.includes(perRichiesto) ? perRichiesto : "tipo";
  const [filtroRiquadro, setFiltroRiquadro] = useState<FiltroRiquadro | null>(null);
  const alterna = (f: FiltroRiquadro) => setFiltroRiquadro((x) => (x === f ? null : f));
  const codiceNuovo = searchParams.get("nuovo");

  const { data: mezzi = [], isLoading, error, refetch } = useMezzi();
  const { data: scadenze = [] } = useMezziScadenze();
  const { data: segnalazioni = [] } = useSegnalazioniAperte();
  const { data: costiParco } = useCostiParco();
  const { data: categorie = [] } = useMezziCategorie();
  const { data: disponibilita } = useMezziDisponibilita();
  const { data: ultimeViste } = useUltimeViste();
  const { data: copertine } = useCopertineMezzi(mezzi.map((m) => m.foto_path ?? "").filter(Boolean));
  const { data: documentiRegistrati } = useDocumentiRegistrati();
  const { data: montaggi } = useMontaggiInCorso();

  const [cerca, setCerca] = useState("");
  const [filtri, setFiltri] = useState<Record<MezzoClasse, string>>({ mezzo: TUTTI, attrezzatura: TUTTI });
  const [nuovo, setNuovo] = useState<{ codice: string | null } | null>(() => (codiceNuovo ? { codice: codiceNuovo } : null));
  const [tutteLeScadenze, setTutteLeScadenze] = useState(false);
  const [etichette, setEtichette] = useState(false);
  const [gestisciCategorie, setGestisciCategorie] = useState(false);

  const filtro = filtri[vista];
  const setFiltro = (v: string) => setFiltri((f) => ({ ...f, [vista]: v }));

  const cambiaVista = (v: MezzoClasse) => {
    const next = new URLSearchParams(searchParams);
    if (v === "attrezzatura") next.set("vista", "attrezzature");
    else next.delete("vista");
    next.delete("nuovo");
    setSearchParams(next, { replace: true });
    setFiltroRiquadro(null);
  };
  const cambiaPer = (v: Raggruppa) => {
    const next = new URLSearchParams(searchParams);
    if (v === "tipo") next.delete("per");
    else next.set("per", v);
    setSearchParams(next, { replace: true });
  };

  const classePerId = useMemo(() => new Map(mezzi.map((m) => [m.id, classeMezzo(m)])), [mezzi]);
  const diQuesti = useMemo(() => mezzi.filter((m) => classeMezzo(m) === vista), [mezzi, vista]);
  const quanti = useMemo(() => {
    const c = { mezzo: 0, attrezzatura: 0 };
    for (const m of mezzi) c[classeMezzo(m)] += 1;
    return c;
  }, [mezzi]);

  const daControllareTutti = useMemo(
    () =>
      scadenze
        .filter((s) => s.stato === "scaduto" || s.stato === "in_scadenza")
        .sort((a, b) =>
          a.stato !== b.stato
            ? a.stato === "scaduto" ? -1 : 1
            : (a.data_scadenza ?? "9999").localeCompare(b.data_scadenza ?? "9999"),
        ),
    [scadenze],
  );
  const daControllare = daControllareTutti.filter((s) => classePerId.get(s.mezzo_id) === vista);

  const perMezzo = useMemo(() => {
    const m = new Map<string, MezzoScadenza[]>();
    for (const s of scadenze) (m.get(s.mezzo_id) ?? m.set(s.mezzo_id, []).get(s.mezzo_id)!).push(s);
    return m;
  }, [scadenze]);

  const nomeMezzo = useMemo(() => new Map(mezzi.map((m) => [m.id, m.targa ? `${m.nome} · ${m.targa}` : m.nome])), [mezzi]);
  const guastiTutti = useMemo(
    () => segnalazioni.filter((s) => s.tipo !== "km" && nomeMezzo.has(s.mezzo_id)),
    [segnalazioni, nomeMezzo],
  );
  const guasti = guastiTutti.filter((g) => classePerId.get(g.mezzo_id) === vista);
  const guastiPerMezzo = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of segnalazioni) if (g.tipo !== "km") m.set(g.mezzo_id, (m.get(g.mezzo_id) ?? 0) + 1);
    return m;
  }, [segnalazioni]);

  // Cosa manca nei documenti di ogni mezzo (finché non si sa, niente: meglio di un falso allarme).
  const mancanzePer = useMemo(() => new Map<string, DocumentoRichiesto[]>(
    documentiRegistrati ? mezzi.map((m) => [m.id, mancanzeMezzo(m, documentiRegistrati.get(m.id))]) : [],
  ), [mezzi, documentiRegistrati]);
  const scadenzaDaGuardare = (id: string) => (perMezzo.get(id) ?? []).some((x) => x.stato === "scaduto" || x.stato === "in_scadenza");
  const daSistemare = (m: MezzoConAssegnazione) => scadenzaDaGuardare(m.id) || (mancanzePer.get(m.id)?.length ?? 0) > 0;
  const fermo = (m: MezzoConAssegnazione) => m.stato !== "in_servizio" || (guastiPerMezzo.get(m.id) ?? 0) > 0;
  // Sul cantiere = su una commessa (i ponteggi in un posto scritto a mano no, come nel conteggio delle commesse).
  const sulCantiere = (m: MezzoConAssegnazione) =>
    !!m.assegnato_order_id || (m.gestione === "quantita" && (disponibilita?.get(m.id)?.cantieri ?? 0) > 0);
  // Da telefono il filtro per tipo non c'è e il riquadro «Sui cantieri» nemmeno: un filtro scelto a
  // schermo largo (telefono girato) non resta attivo e invisibile.
  const filtroTipo = isMobile ? TUTTI : filtro;
  const riquadro = isMobile && filtroRiquadro === "cantieri" ? null : filtroRiquadro;
  const oggi = oggiIso();
  const nonVisto = (m: MezzoConAssegnazione) => {
    const vista = ultimeViste?.get(m.id);
    return classeMezzo(m) === "attrezzatura" && !!vista && giorniTra(giornoItaliano(vista), oggi) > GIORNI_NON_VISTO;
  };

  // Il pallino rosso sulla scheda dell'altro elenco: qualcosa da vedere anche lì.
  const problemi = useMemo(() => {
    const c = { mezzo: 0, attrezzatura: 0 };
    for (const s of daControllareTutti) { const k = classePerId.get(s.mezzo_id); if (k) c[k] += 1; }
    for (const g of guastiTutti) { const k = classePerId.get(g.mezzo_id); if (k) c[k] += 1; }
    return c;
  }, [daControllareTutti, guastiTutti, classePerId]);

  const categorieAttrezzi = useMemo(() => categorie.filter((c) => c.classe === "attrezzatura"), [categorie]);
  const nomeCategoria = useMemo(() => new Map(categorieAttrezzi.map((c) => [c.id, c.nome])), [categorieAttrezzi]);
  const conteggiCategorie = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of mezzi) if (a.categoria_id) m.set(a.categoria_id, (m.get(a.categoria_id) ?? 0) + 1);
    return m;
  }, [mezzi]);

  const q = cerca.trim().toLowerCase();
  const filtrati = diQuesti.filter((m) => {
    if (riquadro === "cantieri" && !sulCantiere(m)) return false;
    if (riquadro === "documenti" && !daSistemare(m)) return false;
    if (riquadro === "fermi" && !fermo(m)) return false;
    if (riquadro === "non_visti" && !nonVisto(m)) return false;
    if (filtroTipo !== TUTTI) {
      if (vista === "mezzo" && m.tipo !== filtroTipo) return false;
      if (vista === "attrezzatura" && (filtroTipo === SENZA ? !!m.categoria_id && nomeCategoria.has(m.categoria_id) : m.categoria_id !== filtroTipo)) return false;
    }
    if (!q) return true;
    return [m.nome, m.targa, m.marca, m.modello, m.matricola, m.codice, m.assegnato_persona, m.assegnato_commessa,
      m.categoria_id ? nomeCategoria.get(m.categoria_id) : null]
      .some((v) => v?.toLowerCase().includes(q));
  });

  // Gruppi: i mezzi per tipo, le attrezzature per categoria (nell'ordine scelto dall'azienda).
  const gruppi: Array<{ chiave: string; titolo: string; righe: MezzoConAssegnazione[] }> = vista === "mezzo"
    ? TIPI_VEICOLO
      .map((t) => ({ chiave: t.value as string, titolo: TITOLO_TIPO[t.value] ?? t.label, righe: filtrati.filter((m) => m.tipo === t.value) }))
      .filter((g) => g.righe.length > 0)
    : [
      ...categorieAttrezzi
        .map((c) => ({ chiave: c.id, titolo: c.nome, righe: filtrati.filter((m) => m.categoria_id === c.id) }))
        .filter((g) => g.righe.length > 0),
      ...[{ chiave: SENZA, titolo: "Senza categoria", righe: filtrati.filter((m) => !m.categoria_id || !nomeCategoria.has(m.categoria_id)) }]
        .filter((g) => g.righe.length > 0),
    ];
  const libero = vista === "mezzo" ? IN_SEDE : IN_MAGAZZINO;
  const posti = per === "dove" ? raggruppaPerPosto(filtrati, { montaggi, libero }) : [];

  // I numeri dei riquadri, su tutto l'elenco (non su quello filtrato).
  const numeri = {
    cantieri: diQuesti.filter(sulCantiere).length,
    commesse: new Set([
      ...diQuesti.map((m) => m.assegnato_order_id).filter((x): x is string => !!x),
      ...(montaggi ?? []).filter((x) => x.orderId && classePerId.get(x.mezzoId) === vista).map((x) => x.orderId as string),
    ]).size,
    documenti: diQuesti.filter(daSistemare).length,
    fermi: diQuesti.filter(fermo).length,
    nonVisti: diQuesti.filter(nonVisto).length,
    letti: diQuesti.some((m) => ultimeViste?.has(m.id)),
  };

  const visibili = tutteLeScadenze ? daControllare : daControllare.slice(0, 5);

  // Il parco in due numeri: quanto vale (acquisti segnati) e quanto costa in un anno (stima).
  const parco = useMemo(() => {
    if (!diQuesti.length) return null;
    const oggi = oggiIso();
    let valore = 0;
    let costoAnno = 0;
    for (const m of diQuesti) {
      valore += Number(m.valore_acquisto ?? 0);
      costoAnno += costoAnnuoMezzo(
        m,
        (costiParco?.documenti ?? []).filter((d) => d.mezzo_id === m.id),
        (costiParco?.manutenzioni ?? []).filter((x) => x.mezzo_id === m.id),
        oggi,
      ).totale;
    }
    return { valore, costoAnno };
  }, [diQuesti, costiParco]);

  const nomeNuovo = vista === "attrezzatura" ? "Nuova attrezzatura" : "Nuovo mezzo";
  const apriNuovo = () => setNuovo({ codice: null });
  const chiudiNuovo = (aperto: boolean) => {
    if (aperto) return;
    setNuovo(null);
    if (codiceNuovo) {
      const next = new URLSearchParams(searchParams);
      next.delete("nuovo");
      setSearchParams(next, { replace: true });
    }
  };

  const azioni = (
    <div className={cn("flex items-center gap-2", incorporata ? "ml-auto max-sm:w-full" : "max-sm:w-full")}>
      <ScansionaMezzoButton onLibero={(codice) => setNuovo({ codice })} />
      {vista === "attrezzatura" && (
        <Button
          size="sm"
          variant="outline"
          className="gap-2 max-sm:h-9 max-sm:w-9 max-sm:p-0"
          onClick={() => navigate("/azienda/mezzi/inventario")}
          aria-label="Inventario"
          title="Inventario con lo scanner"
        >
          <ClipboardCheck className="h-4 w-4 text-orange-600" /><span className="max-sm:hidden">Inventario</span>
        </Button>
      )}
      {puoModificare && diQuesti.length > 0 && (
        <Button size="sm" variant="outline" className="gap-2 max-sm:hidden" onClick={() => setEtichette(true)}>
          <QrCode className="h-4 w-4 text-orange-600" />Etichette QR
        </Button>
      )}
      {puoModificare && (
        <Button
          size="sm"
          onClick={apriNuovo}
          className="gap-2 bg-gradient-to-r from-orange-500 to-eic-amber-strong text-white shadow-sm hover:from-orange-600 hover:to-amber-600 max-sm:h-9 max-sm:flex-1"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />{nomeNuovo}
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-3 sm:space-y-4">
      {incorporata ? (
        <div className="flex flex-wrap items-center justify-between gap-3 max-sm:gap-2">
          <p className="text-sm text-slate-500 max-sm:hidden">
            {vista === "attrezzatura"
              ? "Attrezzi e ponteggi: dove sono, chi li ha, manutenzioni e verifiche. Con l'etichetta QR si trovano dal telefono."
              : "Assicurazioni, revisioni e tagliandi di furgoni e mezzi d'opera, con l'avviso prima che scadano."}
          </p>
          {azioni}
        </div>
      ) : (
        <div className="flex flex-col gap-3 testata-pagina rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-3 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
          <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-eic-amber text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)] sm:h-10 sm:w-10">
              <Truck className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">Mezzi e attrezzature</h1>
              <p className="mt-0.5 hidden text-sm text-slate-500 sm:block">
                Furgoni, mezzi e attrezzi: assicurazioni, revisioni e tagliandi, con l'avviso prima che scadano.
              </p>
            </div>
          </div>
          {azioni}
        </div>
      )}

      {/* Due elenchi, mezzi e attrezzature; accanto come raggrupparli (06/10/2026). */}
      <div className="flex items-center gap-2">
      <div className="grid flex-1 grid-cols-2 gap-1 rounded-xl border bg-muted/60 p-1 sm:inline-grid sm:flex-none" role="tablist" aria-label="Mezzi o attrezzature">
        {(["mezzo", "attrezzatura"] as const).map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={vista === c}
            onClick={() => cambiaVista(c)}
            className={cn(
              "relative flex h-9 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors max-sm:h-8 max-sm:px-2",
              vista === c ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {c === "mezzo" ? <Truck className="h-4 w-4 max-sm:hidden" aria-hidden="true" /> : <Wrench className="h-4 w-4 max-sm:hidden" aria-hidden="true" />}
            {c === "mezzo" ? "Mezzi" : "Attrezzature"}
            <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground max-sm:hidden">{quanti[c]}</span>
            {vista !== c && problemi[c] > 0 && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" aria-label={`${problemi[c]} da controllare`} />
            )}
          </button>
        ))}
      </div>
      {diQuesti.length > 0 && (
        <div role="group" aria-label="Vista" className="ml-auto inline-flex shrink-0 rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
          {visteRaggruppa.map((v) => {
            const nome = v === "tipo" ? (vista === "attrezzatura" ? "Per categoria" : "Per tipo") : v === "dove" ? "Dove sono" : "Elenco";
            return (
              <button
                key={v}
                type="button"
                aria-pressed={per === v}
                aria-label={nome}
                onClick={() => cambiaPer(v)}
                className={cn(
                  "tap-compact rounded-md px-3 py-1.5 text-sm font-medium transition-colors max-sm:px-2.5",
                  per === v ? "bg-orange-50 text-orange-700" : "text-slate-600 hover:text-slate-900",
                )}
              >
                {/* Da telefono una parola sola: sta nella riga degli elenchi. */}
                <span className="sm:hidden">{v === "tipo" ? "Tipo" : "Dove"}</span>
                <span className="max-sm:hidden">{nome}</span>
              </button>
            );
          })}
        </div>
      )}
      </div>

      {/* I riquadri contano e filtrano, come nei subappaltatori; da telefono i due che chiedono di fare qualcosa. */}
      {diQuesti.length > 0 && (isMobile ? (
          <KpiMobili
            voci={vista === "mezzo"
              ? [
                  { label: "Documenti da sistemare", valore: String(numeri.documenti), tono: numeri.documenti > 0 ? "text-red-600" : undefined,
                    onClick: () => alterna("documenti"), attivo: filtroRiquadro === "documenti" },
                  { label: "Fermi", valore: String(numeri.fermi), tono: numeri.fermi > 0 ? "text-amber-600" : undefined,
                    onClick: () => alterna("fermi"), attivo: filtroRiquadro === "fermi" },
                ]
              : [
                  { label: "Ferme", valore: String(numeri.fermi), tono: numeri.fermi > 0 ? "text-amber-600" : undefined,
                    onClick: () => alterna("fermi"), attivo: filtroRiquadro === "fermi" },
                  { label: "Non viste", valore: String(numeri.nonVisti), tono: numeri.nonVisti > 0 ? "text-amber-600" : undefined,
                    onClick: () => alterna("non_visti"), attivo: filtroRiquadro === "non_visti" },
                ]}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <OperationalKpiCard
              icon={vista === "mezzo" ? Truck : Wrench}
              label={vista === "mezzo" ? "Mezzi" : "Attrezzature"}
              value={diQuesti.length}
              hint={[
                parco && parco.costoAnno > 0 ? `circa ${formatCurrency(parco.costoAnno)} l'anno` : null,
                parco && parco.valore > 0 ? `valore ${formatCurrency(parco.valore)}` : null,
              ].filter(Boolean).join(" · ") || undefined}
              tone="blue"
              isLoading={isLoading}
              active={filtroRiquadro === null}
              onClick={() => setFiltroRiquadro(null)}
            />
            <OperationalKpiCard
              icon={HardHat}
              label="Sui cantieri"
              value={numeri.cantieri}
              hint={numeri.commesse > 0 ? (numeri.commesse === 1 ? "su 1 commessa" : `su ${numeri.commesse} commesse`) : "nessuno al lavoro"}
              tone="green"
              isLoading={isLoading}
              active={filtroRiquadro === "cantieri"}
              onClick={() => alterna("cantieri")}
            />
            {vista === "mezzo" ? (
              <OperationalKpiCard
                icon={FileWarning}
                label="Documenti da sistemare"
                value={numeri.documenti}
                hint={numeri.documenti > 0 ? "scaduti, in scadenza o mancanti" : "tutti in regola"}
                tone={numeri.documenti > 0 ? "red" : "green"}
                isLoading={isLoading}
                active={filtroRiquadro === "documenti"}
                onClick={() => alterna("documenti")}
              />
            ) : (
              <OperationalKpiCard
                icon={EyeOff}
                label="Non viste"
                value={numeri.nonVisti}
                hint={numeri.letti ? `da più di ${GIORNI_NON_VISTO} giorni` : "si contano con le etichette QR"}
                tone={numeri.nonVisti > 0 ? "amber" : "slate"}
                isLoading={isLoading}
                active={filtroRiquadro === "non_visti"}
                onClick={() => alterna("non_visti")}
              />
            )}
            <OperationalKpiCard
              icon={Wrench}
              label={vista === "mezzo" ? "Fermi" : "Ferme"}
              value={numeri.fermi}
              hint={numeri.fermi > 0 ? "in officina, fuori servizio o con un guasto" : (vista === "mezzo" ? "tutti in servizio" : "tutte in servizio")}
              tone={numeri.fermi > 0 ? "amber" : "green"}
              isLoading={isLoading}
              active={filtroRiquadro === "fermi"}
              onClick={() => alterna("fermi")}
            />
          </div>
        ))}

      {(daControllare.length > 0 || guasti.length > 0) && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 sm:p-4" aria-labelledby="da-controllare">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
            <h2 id="da-controllare" className="text-sm font-semibold text-amber-900">
              Da controllare: {daControllare.length + guasti.length}
            </h2>
          </div>
          <ul className="divide-y divide-amber-200/70">
            {guasti.map((g) => (
              <li key={`guasto-${g.id}`}>
                <Link
                  to={`/azienda/mezzi/${g.mezzo_id}`}
                  className="flex items-center gap-3 rounded-lg px-1 py-2 hover:bg-amber-100/60"
                >
                  <Wrench className="h-3.5 w-3.5 shrink-0 text-red-600" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{nomeMezzo.get(g.mezzo_id)}</span>
                    <span className="block truncate text-xs text-slate-600">
                      {tipoSegnalazioneLabel(g.tipo)}, {formatData(giornoItaliano(g.created_at))}{g.descrizione ? `: ${g.descrizione}` : ""}
                    </span>
                  </span>
                  <Badge variant="outline" className="shrink-0 border-red-200 bg-red-50 text-[11px] text-red-700">
                    {g.stato === "in_lavorazione" ? "In lavorazione" : "Da vedere"}
                  </Badge>
                </Link>
              </li>
            ))}
            {visibili.map((s) => (
              <li key={`${s.origine}-${s.riferimento_id}`}>
                <Link
                  to={`/azienda/mezzi/${s.mezzo_id}`}
                  className="flex items-center gap-3 rounded-lg px-1 py-2 hover:bg-amber-100/60"
                >
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${PALLINO[s.stato]}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">
                      {s.mezzo_nome}{s.targa ? ` · ${s.targa}` : ""}
                    </span>
                    <span className="block truncate text-xs text-slate-600">{descriviScadenza(s)}</span>
                  </span>
                  <Badge variant="outline" className={`shrink-0 text-[11px] ${STATO_SCADENZA_BADGE[s.stato].cls}`}>
                    {STATO_SCADENZA_BADGE[s.stato].label}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
          {daControllare.length > 5 && (
            <button
              type="button"
              className="mt-1 text-sm font-medium text-amber-900 underline underline-offset-2"
              onClick={() => setTutteLeScadenze((v) => !v)}
            >
              {tutteLeScadenze ? "Mostra meno" : `Mostra tutte (${daControllare.length})`}
            </button>
          )}
        </section>
      )}

      {/* Con pochi elementi si vedono tutti: ricerca e filtro servono da sei in su. */}
      {diQuesti.length > 5 && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
              placeholder={vista === "attrezzatura" ? "Cerca nome, codice, persona" : "Cerca nome, targa, persona"}
              className="pl-9"
              aria-label={vista === "attrezzatura" ? "Cerca attrezzature" : "Cerca mezzi"}
            />
          </div>
          {/* Da telefono il filtro per tipo lo fanno già i gruppi: una riga in meno. Il bottone delle
              categorie resta da tablet in su (sotto i 768px il filtro non c'è, il bottone sì). */}
          <div className="flex gap-2 empty:hidden max-sm:hidden">
            {!isMobile && (
              <Select value={filtro} onValueChange={setFiltro}>
                <SelectTrigger className="sm:w-56" aria-label={vista === "attrezzatura" ? "Filtra per categoria" : "Filtra per tipo"}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {vista === "attrezzatura" ? (
                    <>
                      <SelectItem value={TUTTI}>Tutte le categorie</SelectItem>
                      {categorieAttrezzi.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                      <SelectItem value={SENZA}>Senza categoria</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value={TUTTI}>Tutti i tipi</SelectItem>
                      {TIPI_VEICOLO.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </>
                  )}
                </SelectContent>
              </Select>
            )}
            {vista === "attrezzatura" && puoModificare && (
              <Button variant="outline" size="icon" className="shrink-0 max-sm:hidden" onClick={() => setGestisciCategorie(true)} aria-label="Gestisci le categorie" title="Gestisci le categorie">
                <Settings2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          Non riesco a caricare i mezzi.{" "}
          <button type="button" className="font-semibold underline" onClick={() => refetch()}>Riprova</button>
        </div>
      ) : diQuesti.length === 0 ? (
        // Telefono: una riga e basta. Anche da tablet niente secondo bottone:
        // il «Nuovo» c'è già in alto.
        <div className="rounded-2xl border border-dashed bg-card px-6 py-14 text-center max-sm:px-3 max-sm:py-5">
          {vista === "attrezzatura"
            ? <Wrench className="mx-auto h-10 w-10 text-muted-foreground/50 max-sm:hidden" aria-hidden="true" />
            : <Truck className="mx-auto h-10 w-10 text-muted-foreground/50 max-sm:hidden" aria-hidden="true" />}
          <h2 className="mt-3 text-base font-semibold max-sm:mt-0 max-sm:text-sm max-sm:font-normal max-sm:text-muted-foreground">
            {vista === "attrezzatura" ? "Nessuna attrezzatura ancora" : "Nessun mezzo ancora"}
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground max-sm:hidden">
            {vista === "attrezzatura"
              ? "Aggiungi trapani, demolitori, betoniere e i ponteggi a metri quadri: poi stampi le etichette QR e dal cantiere si segna dove li lasciate."
              : "Aggiungi furgoni e mezzi d'opera: poi carichi assicurazione, revisione e tagliandi, e ti avvisiamo prima delle scadenze."}
          </p>
        </div>
      ) : filtrati.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {riquadro ? "Nessuno in questo riquadro." : "Niente corrisponde alla ricerca."}
          {riquadro && (
            <button type="button" className="ml-1 font-medium text-orange-700 underline underline-offset-2" onClick={() => setFiltroRiquadro(null)}>
              Mostra tutti
            </button>
          )}
        </p>
      ) : per === "elenco" ? (
        <ElencoMezzi
          righe={filtrati}
          classe={vista}
          libero={libero}
          perMezzo={perMezzo}
          guastiPerMezzo={guastiPerMezzo}
          mancanzePer={mancanzePer}
          disponibilita={disponibilita}
          nomeCategoria={nomeCategoria}
          ultimeViste={ultimeViste}
        />
      ) : per === "dove" ? (
        // Dove sono: i cantieri (i più pieni prima), i posti scritti a mano, a bordo dei mezzi, con le persone, in sede.
        <div className={TABELLONE_GRUPPI}>
          {posti.map((g, i) => {
            const mezziQui = g.righe.map((r) => r.mezzo);
            return (
              <SezioneApribile
                key={g.chiave}
                className={larghezzaGruppo(g.righe.length)}
                titolo={g.etichetta}
                icona={ICONA_POSTO[g.tipo]}
                conteggio={conta(vista, mezziQui.length)}
                avviso={daSistemareTesto(mezziQui.filter((m) => daSistemare(m) || fermo(m)).length)}
                dettaglio={g.orderId ? (
                  <Link to={`/azienda/ordini/${g.orderId}`} className="font-medium text-orange-700 hover:underline">Apri la commessa</Link>
                ) : undefined}
                aperta={apriGruppo(i, filtrati.length)}
              >
                <ul className={gruppoPiccolo(g.righe.length) ? RIGHE_COLONNA : RIGHE_GRIGLIA}>
                  {g.righe.map(({ mezzo: m, quantita }) => (
                    <RigaMezzo
                      key={m.id}
                      mezzo={m}
                      copertina={m.foto_path ? copertine?.get(m.foto_path) : undefined}
                      scadenze={perMezzo.get(m.id) ?? []}
                      nGuasti={guastiPerMezzo.get(m.id) ?? 0}
                      disponibilita={disponibilita?.get(m.id)}
                      ultimaVista={ultimeViste?.get(m.id)}
                      mancanze={mancanzePer.get(m.id)}
                      mostra="tipo"
                      nomeCategoria={m.categoria_id ? nomeCategoria.get(m.categoria_id) : undefined}
                      quantitaQui={quantita != null ? { quantita, montata: g.tipo !== "magazzino" } : undefined}
                      libero={libero}
                    />
                  ))}
                </ul>
              </SezioneApribile>
            );
          })}
        </div>
      ) : (
        // Per tipo (o categoria): i gruppi piccoli affiancati, i grandi a tutta riga.
        <div className={TABELLONE_GRUPPI}>
          {gruppi.map((g, i) => (
            <SezioneApribile
              key={g.chiave}
              className={larghezzaGruppo(g.righe.length)}
              titolo={g.titolo}
              iconaNodo={<IconaMezzo tipo={vista === "mezzo" ? g.chiave : "attrezzatura"} className="h-4 w-4 shrink-0 text-slate-500" />}
              conteggio={conta(vista, g.righe.length)}
              buono={suiCantieriTesto(g.righe.filter(sulCantiere).length)}
              avviso={daSistemareTesto(g.righe.filter((m) => daSistemare(m) || fermo(m)).length)}
              aperta={apriGruppo(i, filtrati.length)}
            >
              <ul className={gruppoPiccolo(g.righe.length) ? RIGHE_COLONNA : RIGHE_GRIGLIA}>
                {g.righe.map((m) => (
                  <RigaMezzo
                    key={m.id}
                    mezzo={m}
                    copertina={m.foto_path ? copertine?.get(m.foto_path) : undefined}
                    scadenze={perMezzo.get(m.id) ?? []}
                    nGuasti={guastiPerMezzo.get(m.id) ?? 0}
                    disponibilita={disponibilita?.get(m.id)}
                    ultimaVista={ultimeViste?.get(m.id)}
                    mancanze={mancanzePer.get(m.id)}
                    mostra="posto"
                    libero={libero}
                  />
                ))}
              </ul>
            </SezioneApribile>
          ))}
        </div>
      )}

      <MezzoFormDialog
        open={!!nuovo}
        onOpenChange={chiudiNuovo}
        classe={vista}
        codiceIniziale={nuovo?.codice ?? null}
        onSalvato={(id) => navigate(`/azienda/mezzi/${id}`)}
      />
      {companyId && (
        <EtichetteQrDialog
          open={etichette}
          onOpenChange={setEtichette}
          voci={filtrati.map((m) => ({
            id: m.id,
            codice: m.codice ?? null,
            nome: m.nome,
            sotto: m.targa ?? (m.categoria_id ? nomeCategoria.get(m.categoria_id) : null) ?? null,
          }))}
          classe={vista}
          companyId={companyId}
          azienda={nomeAzienda}
        />
      )}
      <CategorieAttrezziDialog open={gestisciCategorie} onOpenChange={setGestisciCategorie} conteggi={conteggiCategorie} />
    </div>
  );
}

/** Cosa manca, in parole: «Manca: bollo», «Mancano: assicurazione, revisione». */
const testoMancanze = (m: DocumentoRichiesto[]) =>
  `${m.length === 1 ? "Manca" : "Mancano"}: ${m.map((d) => d.etichetta).join(", ")}`;

/** La scadenza da guardare per prima: la peggiore, e tra queste la più vicina; se è tutto valido, la prossima. */
function scadenzaDaMostrare(scadenze: MezzoScadenza[]): MezzoScadenza | undefined {
  const peggiore = statoPeggiore(scadenze.map((s) => s.stato));
  return scadenze
    .filter((s) => s.stato === peggiore)
    .sort((a, b) => (a.data_scadenza ?? "9999").localeCompare(b.data_scadenza ?? "9999"))[0];
}

/** Dove si trova, in parole, anche per le attrezzature a quantità (i ponteggi). */
function dovePerElenco(m: MezzoConAssegnazione, d: MezzoDisponibilita | undefined, libero: string): string {
  if (m.gestione === "quantita") {
    if (!d || d.in_uso <= 0) return libero;
    return `${formatQuantita(d.in_uso, m.unita_misura)} montati${d.cantieri > 0 ? ` su ${d.cantieri} ${d.cantieri === 1 ? "cantiere" : "cantieri"}` : ""}`;
  }
  const posto = doveSiTrova(m, libero);
  // sul cantiere con qualcuno: si dice anche chi lo ha
  return posto.tipo === "cantiere" && m.assegnato_persona ? `${posto.etichetta} · ${m.assegnato_persona}` : posto.etichetta;
}

function RigaMezzo({
  mezzo: m, copertina, scadenze, nGuasti, disponibilita, ultimaVista, mancanze, mostra, nomeCategoria, quantitaQui, libero,
}: {
  mezzo: MezzoConAssegnazione;
  copertina: string | undefined;
  scadenze: MezzoScadenza[];
  nGuasti: number;
  disponibilita: MezzoDisponibilita | undefined;
  ultimaVista: string | undefined;
  /** I documenti che mancano (undefined finché non si sa). */
  mancanze: DocumentoRichiesto[] | undefined;
  /** Nella seconda riga: dove si trova (nella vista per tipo) o di che tipo è (nella vista «Dove sono»). */
  mostra: "posto" | "tipo";
  nomeCategoria?: string;
  /** Nella vista «Dove sono», per le attrezzature a quantità: quanto ce n'è in questo posto. */
  quantitaQui?: { quantita: number; montata: boolean };
  libero: string;
}) {
  const peggiore = statoPeggiore(scadenze.map((s) => s.stato));
  const urgente = peggiore && peggiore !== "valido" ? scadenzaDaMostrare(scadenze) : undefined;
  const stato = statoMezzo(m.stato);
  const aQuantita = m.gestione === "quantita";
  const attrezzo = (m.classe ?? classeDi(m.tipo)) === "attrezzatura";
  const contatore = m.contatore != null ? formatContatore(m.contatore, m.contatore_unita) : null;

  let dettaglio: string;
  if (aQuantita && quantitaQui) {
    dettaglio = quantitaQui.montata
      ? `${formatQuantita(quantitaQui.quantita, m.unita_misura)} montati`
      : `${formatQuantita(quantitaQui.quantita, m.unita_misura)} in magazzino su ${formatQuantita(m.quantita_totale, m.unita_misura)}`;
  } else if (aQuantita) {
    const d = disponibilita;
    dettaglio = d
      ? [
          formatQuantita(d.quantita_totale, m.unita_misura),
          d.in_uso > 0 ? `${formatQuantita(d.in_uso, m.unita_misura)} montati${d.cantieri > 0 ? ` su ${d.cantieri} ${d.cantieri === 1 ? "cantiere" : "cantieri"}` : ""}` : null,
          `${formatQuantita(d.disponibile, m.unita_misura)} in magazzino`,
        ].filter(Boolean).join(" · ")
      : formatQuantita(m.quantita_totale, m.unita_misura);
  } else if (mostra === "tipo") {
    // Il posto è il titolo del gruppo: qui il tipo, e chi lo ha se è sul cantiere con qualcuno.
    dettaglio = [
      attrezzo ? nomeCategoria ?? null : tipoMezzoLabel(m.tipo),
      m.assegnato_order_id && m.assegnato_persona ? `con ${m.assegnato_persona}` : null,
      contatore,
    ].filter(Boolean).join(" · ");
  } else {
    // Il tipo è il titolo del gruppo: qui dove si trova.
    dettaglio = [dovePerElenco(m, disponibilita, libero), contatore].filter(Boolean).join(" · ");
  }

  // «Non visto da…» solo per gli attrezzi che sono già stati letti almeno una volta:
  // chi non usa le etichette non si ritrova l'elenco pieno di avvisi.
  const giorniNonVisto = attrezzo && ultimaVista ? giorniTra(giornoItaliano(ultimaVista), oggiIso()) : 0;
  const percentuale = aQuantita && !quantitaQui && disponibilita && disponibilita.quantita_totale > 0
    ? Math.min(100, Math.round((disponibilita.in_uso / disponibilita.quantita_totale) * 100))
    : null;
  const mancano = mancanze ?? [];
  // Il pallino dice lo stato peggiore: guasto o scaduto in rosso, in scadenza o documenti mancanti in giallo.
  const pallino = nGuasti > 0 || peggiore === "scaduto" ? "scaduto"
    : peggiore === "in_scadenza" || mancano.length > 0 ? "in_scadenza"
    : peggiore;
  const pallinoTesto = nGuasti > 0 ? "Segnalazioni da vedere"
    : peggiore && peggiore !== "valido" ? STATO_SCADENZA_BADGE[peggiore].label
    : mancano.length > 0 ? "Documenti mancanti"
    : peggiore ? STATO_SCADENZA_BADGE[peggiore].label : "";

  return (
    <li className="min-w-0 bg-white">
      <Link
        to={`/azienda/mezzi/${m.id}`}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-orange-50/40 max-sm:px-3 max-sm:py-2.5"
      >
        {copertina ? (
          <img src={copertina} alt="" loading="lazy" className="h-10 w-12 shrink-0 rounded-lg border object-cover" />
        ) : (
          <span className="flex h-10 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <IconaMezzo tipo={m.tipo} className="h-5 w-5" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{m.nome}</span>
            {m.targa && <span className="shrink-0 rounded border px-1 font-mono text-[11px] text-slate-600">{m.targa}</span>}
            {attrezzo && m.codice && <span className="shrink-0 rounded border px-1 font-mono text-[11px] text-slate-500 max-sm:hidden">{m.codice}</span>}
            {m.stato !== "in_servizio" && (
              <Badge variant="outline" className={`shrink-0 px-1.5 py-0 text-[10px] ${stato.cls}`}>{stato.label}</Badge>
            )}
          </span>
          {dettaglio && <span className="block truncate text-xs text-muted-foreground">{dettaglio}</span>}
          {percentuale != null && (
            <span className="mt-1 block h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-emerald-100" aria-hidden="true">
              <span className="block h-full rounded-full bg-orange-400" style={{ width: `${percentuale}%` }} />
            </span>
          )}
          {nGuasti > 0 && (
            <span className="mt-0.5 block truncate text-xs font-medium text-red-700">
              {nGuasti === 1 ? "1 segnalazione dal campo da vedere" : `${nGuasti} segnalazioni dal campo da vedere`}
            </span>
          )}
          {urgente && (
            <span className={`mt-0.5 block truncate text-xs font-medium ${peggiore === "scaduto" ? "text-red-700" : "text-amber-700"}`}>
              {descriviScadenza(urgente)}
            </span>
          )}
          {mancano.length > 0 && (
            <span className="mt-0.5 block truncate text-xs font-medium text-amber-700" title={testoMancanze(mancano)}>{testoMancanze(mancano)}</span>
          )}
          {giorniNonVisto > GIORNI_NON_VISTO && (
            <span className="mt-0.5 block truncate text-xs font-medium text-amber-700">Non visto da {giorniNonVisto} giorni</span>
          )}
        </span>
        {pallino && (
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${PALLINO[pallino]}`}
            title={pallinoTesto}
            aria-label={pallinoTesto}
          />
        )}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}

/**
 * L'elenco a tabella, da tablet e computer: una riga per mezzo con dove si
 * trova, lo stato, la scadenza da guardare e i documenti che mancano.
 */
function ElencoMezzi({
  righe, classe, libero, perMezzo, guastiPerMezzo, mancanzePer, disponibilita, nomeCategoria, ultimeViste,
}: {
  righe: MezzoConAssegnazione[];
  classe: MezzoClasse;
  libero: string;
  perMezzo: Map<string, MezzoScadenza[]>;
  guastiPerMezzo: Map<string, number>;
  mancanzePer: Map<string, DocumentoRichiesto[]>;
  disponibilita: Map<string, MezzoDisponibilita> | undefined;
  nomeCategoria: Map<string, string>;
  ultimeViste: Map<string, string> | undefined;
}) {
  const navigate = useNavigate();
  const attrezzi = classe === "attrezzatura";
  const oggi = oggiIso();
  return (
    <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
      <Table className="[&_td]:px-3 [&_th]:px-3">
        <TableHeader>
          <TableRow>
            <TableHead>{classe === "attrezzatura" ? "Attrezzatura" : "Mezzo"}</TableHead>
            <TableHead>{classe === "attrezzatura" ? "Categoria" : "Tipo"}</TableHead>
            <TableHead>Dove</TableHead>
            <TableHead>Stato</TableHead>
            <TableHead>Scadenza da guardare</TableHead>
            {/* Gli attrezzi quasi mai hanno documenti obbligatori: per loro conta quando si sono visti l'ultima volta. */}
            <TableHead>{attrezzi ? "Ultima lettura QR" : "Documenti"}</TableHead>
            <TableHead className="text-right">{attrezzi ? "Quantità / ore" : "Km / ore"}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {righe.map((m) => {
            const scadenza = scadenzaDaMostrare(perMezzo.get(m.id) ?? []);
            const guasti = guastiPerMezzo.get(m.id) ?? 0;
            const mancano = mancanzePer.get(m.id);
            const stato = statoMezzo(m.stato);
            const richiesti = documentiRichiesti(m).length > 0;
            const lettura = ultimeViste?.get(m.id);
            const giorniLettura = lettura ? giorniTra(giornoItaliano(lettura), oggi) : null;
            return (
              <TableRow key={m.id} className="cursor-pointer" onClick={() => navigate(`/azienda/mezzi/${m.id}`)}>
                <TableCell className="max-w-[240px]">
                  <Link to={`/azienda/mezzi/${m.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-medium text-slate-900 hover:text-orange-700">
                    {m.nome}
                  </Link>
                  {(m.targa || m.codice) && <span className="font-mono text-[11px] text-slate-500">{m.targa ?? m.codice}</span>}
                </TableCell>
                <TableCell className="text-sm text-slate-600">
                  {classe === "attrezzatura" ? (m.categoria_id ? nomeCategoria.get(m.categoria_id) : null) ?? "—" : tipoMezzoLabel(m.tipo)}
                </TableCell>
                <TableCell className="max-w-[220px] truncate text-sm text-slate-600">{dovePerElenco(m, disponibilita?.get(m.id), libero)}</TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {m.stato !== "in_servizio"
                    ? <Badge variant="outline" className={`px-1.5 py-0 text-[11px] ${stato.cls}`}>{stato.label}</Badge>
                    : <span className="text-emerald-700">In servizio</span>}
                  {guasti > 0 && <span className="ml-1.5 text-xs font-medium text-red-700">{guasti === 1 ? "1 guasto" : `${guasti} guasti`}</span>}
                </TableCell>
                <TableCell className="max-w-[260px] text-sm">
                  {scadenza ? (
                    <span className={cn("flex min-w-0 items-center gap-1.5", scadenza.stato === "scaduto" ? "text-red-700" : scadenza.stato === "in_scadenza" ? "text-amber-700" : "text-slate-600")}>
                      <span className={`h-2 w-2 shrink-0 rounded-full ${PALLINO[scadenza.stato]}`} aria-hidden="true" />
                      <span className="truncate">{descriviScadenza(scadenza)}</span>
                    </span>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="max-w-[220px] text-sm">
                  {attrezzi ? (
                    lettura
                      ? <span className={giorniLettura != null && giorniLettura > GIORNI_NON_VISTO ? "font-medium text-amber-700" : "text-slate-600"}>{formatData(giornoItaliano(lettura))}</span>
                      : <span className="text-muted-foreground">—</span>
                  ) : mancano && mancano.length > 0
                    ? <span className="block truncate font-medium text-amber-700" title={testoMancanze(mancano)}>{testoMancanze(mancano)}</span>
                    : richiesti && mancano ? <span className="text-emerald-700" title="Ci sono tutti i documenti richiesti">Completi</span>
                    : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right text-sm tabular-nums text-slate-600">
                  {m.gestione === "quantita"
                    ? formatQuantita(m.quantita_totale, m.unita_misura)
                    : m.contatore != null ? formatContatore(m.contatore, m.contatore_unita) : "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
