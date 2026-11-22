import { UniformSelect } from "@/components/ui/uniform-select";
/**
 * Rapportino giornaliero, diverso per chi lo compila:
 *
 * · OPERAIO con un capo sopra: UN passo solo — cosa ha fatto, ore (precompilate dalle
 *   timbrature), foto. Fasi, materiali, mezzi, straordinario e firma stanno in
 *   «Altro da segnalare», chiuso. Avanzamento, fine lavori e firma del cliente sono del capo.
 * · CAPOCANTIERE / CAPOSQUADRA: passo 1 — chi ha lavorato (con le ore, anche «stesse ore per
 *   tutti»), cosa è stato fatto, foto; passo 2 — avanzamento delle fasi, materiali, mezzi,
 *   riepilogo. La firma del cliente sta nel percorso separato «Rapporto cliente».
 * · Chi lavora da solo, senza un capo nominato: i due passi di sempre.
 * · Un rapportino RESPINTO dall'ufficio si riapre già compilato, col motivo, e si rimanda.
 *
 * Le ore vanno confermate: 0 per sole foto/note; nessuna presenza implicita.
 */
import { COLONNE_RAPPORTINO } from "@/lib/campo/colonneRapportino";
import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  ArrowLeft, ChevronRight, ChevronLeft,
  Camera, X, Minus, Plus, Loader2, Send, CalendarDays, ClipboardPenLine, LogIn, Mic, Images, Trash2, WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { MezziFineGiornata, righeDaSalvare, useMezziDellaGiornata, type RigaMezzoGiornata } from "@/components/campo/MezziFineGiornata";
import { ArrivoRapportino } from "@/components/orders/ArrivoRapportino";
import { ARRIVO_VUOTO, campoArrivo, leggiArrivo, mezzoStradale } from "@/lib/campo/arrivoRapportino";
import type { Json } from "@/integrations/supabase/types";
import { createStore, del, get, set, update } from "idb-keyval";
import { notifyRapportinoPdf } from "@/lib/campo/rapportinoPdf";
import { refreshCommessaCampoQueries } from "@/lib/orders/refreshCommessaCampoQueries";
import { refreshCampoTimeQueries } from "@/lib/campo/refreshTimeQueries";
import { rigaTimbratura } from "@/lib/campo/timbra";
import { campoDayWindow } from "@/lib/campo/timeSummary";
import { riferimentoFile } from "@/lib/storage/fileRiservati";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsCampo } from "@/hooks/useIsCampo";
import { useGPS } from "@/hooks/useGPS";
import { FirmaPad } from "@/components/campo/FirmaPad";
import { CampiModulo } from "@/components/campo/CampiModulo";
import { useModuloRapportino } from "@/hooks/useModuliCantiere";
import { campiPerContesto, chiaveValore, componiValori, fasiDelRapportino, leggiValori, mancanti, valoreInTesto, valoriInBozza } from "../../../supabase/functions/_shared/moduliCantiere";
import { useWeatherForecast } from "@/hooks/useWeatherForecast";
import { inviaRapportoInCoda, rapportoGiaRicevuto, riferimentoAllegatoRapportino, type AllegatoRapportino, type RapportoInCoda } from "@/lib/campo/rapportoInCoda";
import { syncOperationId, syncQueue, type SyncItem } from "@/lib/campo/sync-queue";
import { useCodaCampo } from "@/hooks/campo/useCodaCampo";
import { buildRapportinoMaterials, restoreRapportinoMaterials, rapportinoStockSelectionKey, rapportinoArticleKind, rapportinoMaterialUnit, rapportinoUnitOptions, type RapportinoArticle, type RapportinoMaterialDraft } from "@/lib/campo/rapportinoMaterials";
import { loadRapportinoArticles } from "@/lib/campo/loadRapportinoArticles";
import { loadRapportinoDeliveredStock } from "@/lib/campo/loadRapportinoDeliveredStock";
import { costruisciFasiLavorate, faseDiAppartenenza } from "@/lib/campo/rapportinoFasi";
import { RapportinoSiteContext } from "@/components/campo/RapportinoSiteContext";
import { AnteprimaFotoCampo } from "@/components/campo/AnteprimaFotoCampo";
import { cn } from "@/lib/utils";
import { MAX_FOTO_PER_RAPPORTINO, avvisiPreparazione, postiLiberi, preparaFoto } from "@/lib/campo/preparaFoto";
import { useCampoDayTime } from "@/hooks/campo/useCampoDayTime";
import { campoReportHours } from "@/lib/campo/timeSummary";
import { SottofasiRapportino } from "@/components/campo/SottofasiRapportino";
import { avanzateDelRapportino, fasiLavorateDelRapportino, SOTTOFASI_NELLA_FASE, sottofasiDalleFasi, sottofasiPerFase, sottofasiSpuntate, type Sottofase } from "@/lib/orders/sottofasi";
import { correggiPresenzeRapportino, presenzeRapportino, stessaPresenza, validateRapportinoHours, type CampoHoursDraft, type RapportinoPresenza } from "@/lib/campo/rapportinoHours";
import { useRegoleCampoOrdine } from "@/hooks/useRegoleCampo";
import { REGOLE_COME_OGGI, flussoPersona, giaCoperto, oreInTesto, proponiOre, scostamento } from "@/lib/campo/regoleCampo";
import { useCampoWorkDay } from "@/hooks/campo/useCampoWorkDay";
import { assertReportDay, campoWorkDay, giorniIndietroValidi, giorniSceglibili, messaggioScadenzaRapportino, reportDayAllowed, shiftWorkDay, validWorkDay } from "@/lib/campo/workDay";
import { isClientReport } from "@/lib/campo/reportKind";
import { RapportinoVoceInput, type PropostaRapportino } from "@/components/campo/RapportinoVoceInput";
import { DettaTesto } from "@/components/campo/DettaTesto";
import { accodaTesto } from "@/lib/campo/dettaTesto";
import { useFormDraft } from "@/hooks/campo/useFormDraft";
import { useNetworkStatus } from "@/hooks/campo/useNetworkStatus";
import { useRapportinoProtocollo } from "@/hooks/campo/useRapportinoProtocollo";

const TOTAL_STEPS = 2;
const fotoBozze = createStore("campo-rapportino-allegati", "bozze");
type FotoLocali = Record<string, AllegatoRapportino>;

// Fase della commessa su cui l'operaio può dichiarare l'avanzamento
interface FaseCommessa {
  id: string;
  name: string;
  status: "da_iniziare" | "in_corso" | "completata";
  percentuale: number;
}

/** Una scheda del riepilogo: titolo su fondo tenue e righe sotto. Definita fuori dal modulo: dentro ricostruirebbe i campi a ogni tasto. */
function BloccoRiepilogo({ titolo, dettaglio, children }: { titolo: string; dettaglio?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 py-2.5">
        <h4 className="min-w-0 truncate text-sm font-bold text-foreground">{titolo}</h4>
        {dettaglio}
      </header>
      <div className="space-y-1.5 px-4 py-3">{children}</div>
    </section>
  );
}

export default function CampoRapportino({ tipo = "daily" }: { tipo?: "daily" | "client" }) {
  const { orderId } = useParams<{ orderId: string }>();
  const { user, profile, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? profile?.company_id ?? null;
  const [params] = useSearchParams();
  // Freeze the chosen day: leaving the form open overnight must not re-date it.
  const [openedDay] = useState(() => campoWorkDay());
  const workDay = params.get("data") ?? openedDay;
  return <CampoRapportinoEditor key={`${companyId}:${user?.id}:${orderId}:${workDay}:${tipo}`} companyId={companyId} workDay={workDay} tipo={tipo} />;
}

function CampoRapportinoEditor({ companyId, workDay, tipo }: { companyId: string | null; workDay: string; tipo: "daily" | "client" }) {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isSubappaltatore } = useIsCampo();
  const queryClient = useQueryClient();
  const { lat, lng, accuracy, requestPosition } = useGPS(companyId);
  const chiaveBozza = ["rapportino", companyId, user?.id, orderId, workDay, tipo].join(":");
  const codaRapportini = useCodaCampo(companyId, user?.id, "rapportino");
  const inCoda = tipo === "daily" ? codaRapportini.find(voce => voce.payload.order_id === orderId && voce.payload.giorno === workDay) : undefined;
  const [modificaCoda, setModificaCoda] = useState<SyncItem<RapportoInCoda> | null>(null);
  const [verificaCoda, setVerificaCoda] = useState(false);
  const fotoInCoda = useMemo(() => {
    const locali = new Map((inCoda?.payload.allegati ?? []).map(f => [riferimentoAllegatoRapportino(f.percorso), f]));
    return (inCoda?.payload.campi.foto_urls ?? []).map(url => {
      const f = locali.get(url);
      return { url, file: f ? new Blob([f.bytes], { type: f.contentType }) : url };
    });
  }, [inCoda]);
  const [params, setParams] = useSearchParams();
  const today = useCampoWorkDay();
  const yesterday = shiftWorkDay(today, -1);
  const dayLabel = validWorkDay(workDay) ? format(new Date(`${workDay}T12:00:00`), "d MMMM yyyy", { locale: it }) : "Data non valida";

  const [step, setStep] = useState(1);
  const inizioRapportino = useRef<HTMLDivElement>(null);
  const campoDescrizione = useRef<HTMLTextAreaElement>(null);
  const campoOre = useRef<HTMLInputElement>(null);
  const online = useNetworkStatus();
  const [controllaOre, setControllaOre] = useState(false);

  // Step 1
  const [descrizione, setDescrizione] = useState("");
  const [meteo, setMeteo] = useState<string>("");

  // Step 2
  const [oreLavorate, setOreLavorate] = useState<CampoHoursDraft>("");
  const oreModificate = useRef(false);
  const meteoModificato = useRef(false);
  const modificaOre = (value: CampoHoursDraft) => { oreModificate.current = true; setOreLavorate(value); };
  const [oreStraordinario, setOreStraordinario] = useState(0);
  const [percentuale, setPercentuale] = useState(0);
  const avanzamentoModificato = useRef(false);
  // Fasi dichiarate: phase_id → nuovo avanzamento raggiunto (0-100)
  const [fasiDichiarate, setFasiDichiarate] = useState<Record<string, number>>({});
  // Materiali usati oggi: key (order_item id o "libero_<n>") → nome+quantità
  const [materialiSel, setMaterialiSel] = useState<Record<string, RapportinoMaterialDraft>>({});
  // Mezzi e attrezzi di oggi: usati e dove restano stasera (si salvano col rapportino)
  const [mezziSel, setMezziSel] = useState<Record<string, RigaMezzoGiornata>>({});
  const [arrivo, setArrivo] = useState(ARRIVO_VUOTO);
  const [materialeLibero, setMaterialeLibero] = useState("");
  const [fotoLocali, setFotoLocali] = useState<FotoLocali>({});
  const anteprimeLocali = useMemo(() => Object.fromEntries(Object.entries(fotoLocali).map(([url, foto]) => [
    url, new Blob([foto.bytes], { type: foto.contentType }),
  ])), [fotoLocali]);
  const [fotoPronte, setFotoPronte] = useState(false);
  const [fotoUrls, setFotoUrls] = useState<string[]>([]);
  // Foto → fase, solo se l'operaio l'ha scelta (con più fasi). Con una fase sola si collega da sé al salvataggio.
  const [fotoFase, setFotoFase] = useState<Record<string, string>>({});
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const bloccoFoto = useRef(false);
  const [fotoProgresso, setFotoProgresso] = useState<string | null>(null);

  // Step 3

  // Step 4 (solo fine lavori): firme
  const [firmaCliente, setFirmaCliente] = useState<string | null>(null);
  const [firmaClienteNome, setFirmaClienteNome] = useState("");
  const [firmaOperaio, setFirmaOperaio] = useState<string | null>(null);

  // I campi propri dell'azienda (Impostazioni → Rapportini e presenze)
  const [campiValori, setCampiValori] = useState<Record<string, unknown>>({});
  const [erroriCampi, setErroriCampi] = useState(false);
  const cambiaCampo = (chiave: string, valore: unknown) => setCampiValori(prev => ({ ...prev, [chiave]: valore }));
  const [voceAperta, setVoceAperta] = useState(() => params.get("input") === "voce" && tipo === "daily");
  const bozza = useFormDraft(chiaveBozza, {
    descrizione: "", meteo: "", oreLavorate: "" as CampoHoursDraft, oreStraordinario: 0,
    percentuale: 0, fasiDichiarate: {} as Record<string, number>, materialiSel: {} as Record<string, RapportinoMaterialDraft>,
    mezziSel: {} as Record<string, RigaMezzoGiornata>, fotoUrls: [] as string[], fotoFase: {} as Record<string, string>,
    campiValori: {} as Record<string, unknown>, arrivo: ARRIVO_VUOTO,
    sottofasiSpunte: [] as string[], sottofasiLavorate: [] as string[], sottofasiAvanzate: {} as Record<string, { quantita?: number; percentuale?: number }>, presenzeSel: {} as Record<string, CampoHoursDraft>, firmaClienteNome: "",
    presenzeModificate: {} as Record<string, true>,
  });
  const [ripresaDecisa, setRipresaDecisa] = useState(!bozza.hasSavedDraft);
  const bozzaAttivata = useRef(false);
  const bozzaAccodata = useRef(false);
  const idCollaudo = useRef<string | null>(null);
  const aggiornaBozza = bozza.updateDraft;


  // Acquisisci GPS all'inizio — una sola volta al mount (requestPosition è useCallback
  // con dep [companyId]; se companyId cambia da null a valore, l'effect rilancia una
  // volta sola). Evitiamo comunque di ciclare includendo requestPosition nelle deps.

  useEffect(() => {
    if (companyId) requestPosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // ── Fasi della commessa (order_work_phases) ─────────────────────────
  // Select minima: l'operaio dichiara solo su quali fasi ha lavorato e il
  // nuovo avanzamento raggiunto. Se la commessa non ha fasi, il blocco
  // non viene mostrato (zero regressioni sul flusso esistente).
  const { data: fasiCommessa = [] } = useQuery({
    queryKey: ["campo-fasi-commessa", orderId],
    enabled: !!orderId,
    staleTime: 60_000,
    queryFn: async (): Promise<FaseCommessa[]> => {
      // order_work_phases.percentuale non è nei tipi generati → cast
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("order_work_phases")
        .select("id, name, status, percentuale")
        .eq("order_id", orderId)
        .order("position", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((p) => ({
        id: p.id as string,
        name: (p.name as string) ?? "",
        status: (p.status as FaseCommessa["status"]) ?? "da_iniziare",
        percentuale: Number(p.percentuale) || 0,
      }));
    },
  });

  // Le sottofasi della commessa: il capocantiere le spunta al posto dello slider.
  // Non hanno la commessa: si filtra per quella della loro fase. Se la lettura
  // fallisce (tabella non ancora creata) si lavora come sempre.
  const { data: sottofasiCommessa = [] } = useQuery({
    queryKey: ["campo-sottofasi", "commessa", orderId],
    enabled: !!orderId,
    staleTime: 60_000,
    queryFn: async (): Promise<Sottofase[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("order_work_phases")
        .select(`id, ${SOTTOFASI_NELLA_FASE}`)
        .eq("order_id", orderId);
      if (error) return [];
      return sottofasiDalleFasi(data as Record<string, unknown>[] | null);
    },
  });
  const sottofasiDi = useMemo(() => sottofasiPerFase(sottofasiCommessa), [sottofasiCommessa]);
  // Le sottofasi spuntate in QUESTO rapportino (valgono quando viene approvato).
  const [sottofasiSpunte, setSottofasiSpunte] = useState<string[]>([]);
  // Quelle su cui si è lavorato oggi senza finirle: danno l'inizio reale della sottofase.
  const [sottofasiLavorate, setSottofasiLavorate] = useState<string[]>([]);
  const [sottofasiAvanzate, setSottofasiAvanzate] = useState<Record<string, { quantita?: number; percentuale?: number }>>({});
  // Quantità e unità delle sottofasi, senza i costi: chi è in cantiere dichiara quanto ha fatto. Senza, si dice la percentuale.
  const quantitaSottofasi = useQuery({
    queryKey: ["campo-quantita-sottofasi", orderId],
    enabled: !!orderId,
    staleTime: 300_000,
    retry: false,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("campo_quantita_sottofasi", { p_order_id: orderId });
      if (error) return new Map<string, { quantita: number; unita: string | null }>();
      return new Map(((data ?? []) as Array<{ subphase_id: string; quantita: number; unita: string | null }>).map((r) => [r.subphase_id, { quantita: Number(r.quantita), unita: r.unita }]));
    },
  });
  // Cosa direbbe il rapportino per ogni fase dichiarata, sottofasi comprese (anche per il riepilogo).
  const percentualiFinali = useMemo(
    () => new Map(fasiLavorateDelRapportino(fasiDichiarate, sottofasiDi, sottofasiSpunte, sottofasiLavorate, sottofasiAvanzate).map((v) => [v.phase_id, v.percentuale] as const)),
    [fasiDichiarate, sottofasiDi, sottofasiSpunte, sottofasiLavorate, sottofasiAvanzate],
  );

  // Chi dichiara l'avanzamento? L'OPERAIO racconta la giornata (ore, foto,
  // su quali fasi ha lavorato — serve ad attribuire il costo); il
  // CAPOCANTIERE, che segue lo stato avanzamento, dichiara le percentuali.
  const { data: ruoloCampo, isLoading: ruoloLoading, isError: ruoloError, refetch: ricaricaRuolo } = useQuery({
    queryKey: ["campo-ruolo", orderId, user?.id, companyId],
    enabled: !!orderId && !!user?.id && !!companyId,
    staleTime: 300_000,
    queryFn: async (): Promise<{ isCapocantiere: boolean; esisteCapo: boolean; isCaposquadra: boolean }> => {
      // Capocantiere della commessa, caposquadra di una squadra che ci lavora.
      const { data, error } = await supabase.rpc("campo_mio_ruolo", { p_order_id: orderId! });
      if (error) throw error;
      const r = (data ?? {}) as { capocantiere?: boolean; esiste_capo?: boolean; caposquadra?: boolean };
      return {
        isCapocantiere: !!r.capocantiere,
        esisteCapo: !!r.esiste_capo,
        isCaposquadra: !!r.caposquadra,
      };
    },
  });
  const isCapocantiere = ruoloCampo?.isCapocantiere ?? false;
  const isCaposquadra = ruoloCampo?.isCaposquadra ?? false;
  // Il rapportino di squadra lo fa il capocantiere (tutto il cantiere) o il
  // caposquadra (la sua squadra): tanti operai il telefono non lo usano.
  const faSquadra = isCapocantiere || isCaposquadra;
  // Come lavora QUESTA azienda (Impostazioni → Rapportini e presenze). Senza
  // scelte, o se la lettura fallisce, si lavora come sempre.
  const { data: regoleCampo, isLoading: regoleLoading, isError: regoleError, refetch: ricaricaRegole } = useRegoleCampoOrdine(orderId);
  const regole = regoleCampo ?? REGOLE_COME_OGGI;
  const flusso = flussoPersona(regole, ruoloCampo ?? {}, isSubappaltatore);
  const registraSquadra = flusso.registraSquadra;
  // FALLBACK di adozione: finché la commessa non ha un capocantiere nominato
  // vale il comportamento storico (chiunque dichiara le %) — le commesse
  // esistenti non si bloccano; il rigore scatta con la nomina.
  const puoDichiararePercentuali = !!ruoloCampo && (isCapocantiere || !ruoloCampo.esisteCapo);
  // Flusso «ore_proprie»: l'operaio semplice manda SOLO le sue ore; il racconto
  // del cantiere (cosa fatto, foto, materiali, avanzamento) lo fa il capocantiere.
  const soloOreAllOperaio = flusso.soloOre;
  // Le parti che questa azienda usa e i suoi campi. Spegnere nasconde solo l'inserimento: quello che è già scritto resta.
  const { schema: moduloCantiere, isLoading: moduloInCaricamento } = useModuloRapportino(orderId);
  const parti = moduloCantiere.blocchi;
  // Con "lavoro completato" attivo si aggiunge lo step Firma cliente;
  // sul giornaliero normale sono 2 step.

  // ── Squadra del giorno ────────────────────────────────────────────────
  // Il flusso reale: il rapportino lo fa UNO (capocantiere), e dentro c'è
  // chi ha lavorato oggi — operai con le loro ore, subappaltatori presenti.
  // Il costo si calcola per OGNI dipendente elencato, non per l'autore.
  type MembroSquadra = {
    key: string;
    employee_id?: string | null;
    subappaltatore_id?: string | null;
    nome: string;
    /** Squadra del membro; «Ditta» per i subappaltatori, null per chi è da solo. */
    squadra?: string | null;
    sono_io?: boolean;
    /** Ha già mandato il suo rapportino: non si conta due volte. */
    rapportino_inviato?: boolean;
    /** Un altro rapportino inviato o approvato lo include già nelle presenze. */
    gia_registrato_da_altri?: boolean;
    /** Ore timbrate su questo cantiere in questa giornata (null = nessuna timbratura). */
    ore_timbrate?: number | null;
    /** È ancora dentro: l'uscita non c'è, le ore non sono definitive. */
    timbratura_aperta?: boolean;
  };
  const [presenzeSel, setPresenzeSel] = useState<Record<string, CampoHoursDraft>>({});
  const [presenzeModificate, setPresenzeModificate] = useState<Record<string, true>>({});
  const segnaPresenzeModificate = (chiavi: string[]) => setPresenzeModificate(prev => ({
    ...prev, ...Object.fromEntries(chiavi.map(chiave => [chiave, true as const])),
  }));
  const bozzaCorrente = useMemo(() => ({ descrizione, meteo, oreLavorate, oreStraordinario, percentuale, fasiDichiarate, materialiSel, mezziSel, fotoUrls, fotoFase, sottofasiSpunte, sottofasiLavorate, sottofasiAvanzate, presenzeSel, presenzeModificate, firmaClienteNome, campiValori, arrivo }),
    [descrizione, meteo, oreLavorate, oreStraordinario, percentuale, fasiDichiarate, materialiSel, mezziSel, fotoUrls, fotoFase, sottofasiSpunte, sottofasiLavorate, sottofasiAvanzate, presenzeSel, presenzeModificate, firmaClienteNome, campiValori, arrivo]);
  useEffect(() => {
    if (!ripresaDecisa || !companyId || !user?.id || bozzaAccodata.current) return;
    if (bozzaAttivata.current || avanzamentoModificato.current || bozzaCorrente.arrivo.mezzoId || Object.keys(bozzaCorrente.campiValori).length || bozzaCorrente.descrizione.trim() || oreModificate.current || bozzaCorrente.fotoUrls.length || Object.keys(bozzaCorrente.materialiSel).length || Object.keys(bozzaCorrente.presenzeSel).length || Object.keys(bozzaCorrente.presenzeModificate).length || Object.keys(bozzaCorrente.fasiDichiarate).length || Object.keys(bozzaCorrente.mezziSel).length || bozzaCorrente.sottofasiSpunte.length || bozzaCorrente.sottofasiLavorate.length || bozzaCorrente.firmaClienteNome.trim()) {
      bozzaAttivata.current = true;
      aggiornaBozza(bozzaCorrente);
    }
  }, [bozzaCorrente, aggiornaBozza, ripresaDecisa, companyId, user?.id]);
  const applicaBozza = (b: typeof bozza.draft) => {
    setDescrizione(typeof b.descrizione === "string" ? b.descrizione : "");
    if (typeof b.oreLavorate === "number" && Number.isFinite(b.oreLavorate)) modificaOre(b.oreLavorate);
    setOreStraordinario(Number(b.oreStraordinario) || 0); setMeteo(b.meteo || ""); setPercentuale(Number(b.percentuale) || 0);
    setFasiDichiarate(b.fasiDichiarate || {}); setMaterialiSel(b.materialiSel || {}); setMezziSel(b.mezziSel || {});
    setFotoUrls(Array.isArray(b.fotoUrls) ? b.fotoUrls : []);
    setFotoFase(b.fotoFase || {}); setSottofasiSpunte(Array.isArray(b.sottofasiSpunte) ? b.sottofasiSpunte : []); setSottofasiLavorate(Array.isArray(b.sottofasiLavorate) ? b.sottofasiLavorate : []); setSottofasiAvanzate(b.sottofasiAvanzate && typeof b.sottofasiAvanzate === "object" ? b.sottofasiAvanzate : {});
    setPresenzeSel(b.presenzeSel || {}); setFirmaClienteNome(b.firmaClienteNome || ""); setCampiValori(b.campiValori || {});
    setPresenzeModificate(b.presenzeModificate || {});
    setArrivo(b.arrivo ?? ARRIVO_VUOTO);
    // Le firme non vengono conservate né riutilizzate da una bozza.
    setFirmaCliente(null); setFirmaOperaio(null); setRipresaDecisa(true);
  };
  const riprendiBozza = () => applicaBozza(bozza.draft);
  const { data: squadra = [], isLoading: squadraLoading } = useQuery({
    queryKey: ["campo-squadra", orderId, workDay],
    enabled: !!orderId && registraSquadra,
    staleTime: 300_000,
    queryFn: async (): Promise<MembroSquadra[]> => {
      // Capocantiere: tutto il cantiere del giorno. Caposquadra: la sua squadra.
      const { data, error } = await supabase.rpc("campo_squadra_rapportino", { p_order_id: orderId!, p_giorno: workDay });
      if (error) throw error;
      return (data ?? []) as unknown as MembroSquadra[];
    },
  });
  const togglePresenza = (m: MembroSquadra) => {
    segnaPresenzeModificate([m.key]);
    setPresenzeSel(prev => {
      const next = { ...prev };
      if (m.key in next) delete next[m.key];
      // Con «le ore dalle timbrature» partono da quelle timbrate; il capo le
      // controlla e le corregge. Senza timbratura (o ancora dentro) le scrive lui.
      else next[m.key] = regole.oreDalle === "timbrature" ? proponiOre(m.ore_timbrate, m.timbratura_aperta) : "";
      return next;
    });
  };

  // The existing DB unique key is author + site + workday. Never promise a
  // second report or overwrite an approved one; corrections go to the office.
  type RapportinoEsistente = {
    id: string; created_at: string; updated_at?: string | null; stato: string | null; motivo_rifiuto: string | null;
    descrizione_lavori: string | null; ore_lavorate: number | null; ore_straordinario: number | null;
    foto_urls: string[] | null; fasi_lavorate: { phase_id: string; percentuale: number; foto?: string[] }[] | null;
    presenze: RapportinoPresenza[] | null;
    materiali_usati: { nome: string; quantita: number; unita?: string; order_item_id?: string; stock_item_id?: string; fase_id?: string }[] | null;
    meteo: string | null; percentuale_avanzamento: number | null;
    lavoro_completato?: boolean | null; firma_cliente_url?: string | null; campi_extra?: unknown;
  };
  const protocollo = useRapportinoProtocollo(companyId, user?.id);
  const tipiSeparati = protocollo.data === 2;
  const { data: rapportinoGiaOggi, isLoading: esistenteLoading, isError: esistenteError, refetch: ricaricaEsistente } = useQuery({
    queryKey: ["campo-rapportino-gia-oggi", companyId, orderId, user?.id, workDay, tipo, tipiSeparati],
    enabled: !!companyId && !!orderId && !!user?.id && validWorkDay(workDay),
    staleTime: 30_000,
    queryFn: async (): Promise<RapportinoEsistente | null> => {
      const { data, error } = await supabase
        .from("campo_rapportini")
        .select(COLONNE_RAPPORTINO)
        .eq("order_id", orderId!)
        .eq("user_id", user!.id)
        .eq("company_id", companyId!)
        .eq("data_lavoro", workDay)
        .is("annullato_at", null)
        .order("created_at", { ascending: false })
        .limit(tipiSeparati ? 2 : 1);
      if (error) throw error;
      const rows = (data ?? []) as unknown as RapportinoEsistente[];
      return (tipiSeparati ? rows.find(r => isClientReport(r) === (tipo === "client")) : rows[0]) ?? null;
    },
  });
  // Un rapportino RESPINTO (o rimasto in bozza) si corregge e si rimanda; uno inviato o approvato no.
  const daRifare = !!rapportinoGiaOggi && (rapportinoGiaOggi.stato === "rifiutato" || rapportinoGiaOggi.stato === "bozza");
  const bloccatoDaEsistente = !!rapportinoGiaOggi && !daRifare;
  // A correction must keep the original document's kind. A rejected signed
  // report used to silently become a daily report on resubmission.
  const lavoro_completato = daRifare && rapportinoGiaOggi
    ? isClientReport(rapportinoGiaOggi)
    : tipo === "client";
  // New client confirmations are evidence, not another timesheet. Historical
  // rejected reports retain their original hours/crew when corrected.
  const confermaCliente = lavoro_completato && !daRifare;
  // Chi non fa la squadra racconta la SUA giornata e basta, in un passo solo. Col capo sopra, avanzamento,
  // fine lavori e firma del cliente sono suoi; senza capo l'avanzamento sta in «Altro» e il collaudo resta a passi.
  const semplice = !!ruoloCampo && !faSquadra && (ruoloCampo.esisteCapo || !lavoro_completato);
  const totalSteps = lavoro_completato ? 3 : semplice ? 1 : TOTAL_STEPS;
  const verificaInCorso = !!ruoloLoading || !!esistenteLoading || !!regoleLoading || !!protocollo.isLoading || moduloInCaricamento;
  const verificaFallita = !!ruoloError || !!esistenteError || !!regoleError || !!protocollo.isError;
  const clienteNonConsentito = lavoro_completato && !!ruoloCampo && !puoDichiararePercentuali;
  const campiModulo = useMemo(() => campiPerContesto(moduloCantiere, {
    ruolo: ruoloCampo && (faSquadra || !ruoloCampo.esisteCapo) ? "capo" : "operaio",
    momento: lavoro_completato ? "fine_lavori" : "giornaliero",
    subappaltatore: isSubappaltatore,
    soloOre: soloOreAllOperaio,
  }), [moduloCantiere, ruoloCampo, faSquadra, lavoro_completato, isSubappaltatore, soloOreAllOperaio]);
  // Il respinto si rimanda anche oltre la scadenza: è l'ufficio che lo ha chiesto.
  // Quanti giorni indietro lo decide l'azienda (Impostazioni → Rapportini e presenze); lo controlla anche il database.
  const giorniIndietro = giorniIndietroValidi(regole.giorniIndietro);
  const msgScadenza = messaggioScadenzaRapportino(giorniIndietro);
  const giorniSelezionabili = giorniSceglibili(undefined, giorniIndietro);
  const dayAllowedBase = validWorkDay(workDay) && reportDayAllowed(workDay, undefined, giorniIndietro);
  const ultimoGiornoInvio = validWorkDay(workDay) ? shiftWorkDay(workDay, giorniIndietro) : today;
  const dayAllowed = dayAllowedBase || daRifare;
  // Anche un link diretto alla voce attende le regole, la verifica del ruolo e della giornata.
  const puoCompilareAVoce = !!ruoloCampo && !!orderId && !verificaInCorso && !verificaFallita && dayAllowed
    && !lavoro_completato && !soloOreAllOperaio && !flusso.soloTimbratura && !bloccatoDaEsistente
    && (ripresaDecisa || daRifare);
  const vocaleVisibile = voceAperta && puoCompilareAVoce && step === 1;
  const giornoOk = () => daRifare || reportDayAllowed(workDay, undefined, giorniIndietro);
  const controllaGiorno = () => { if (!daRifare) assertReportDay(workDay, undefined, giorniIndietro); };

  const dayTime = useCampoDayTime(confermaCliente ? undefined : user?.id, companyId, workDay);
  const siteTime = dayTime.summary.byOrder.get(orderId ?? "");
  const oreRilevate = siteTime ? campoReportHours(siteTime.workMinutes) : null;
  const anomalieTimbrature = dayTime.summary.issues.some(issue => issue.kind !== "open_session");
  const sessioneDaChiudere = dayTime.isSuccess && dayTime.summary.state !== "out" && dayTime.summary.activeOrderId === orderId && workDay === today;

  // Le MIE ore sono già nel rapportino di squadra di un collega? Qualunque sia
  // il flusso dell'azienda, la stessa persona non si conta due volte nello
  // stesso giorno e cantiere. Se la lettura fallisce si lavora come prima.
  const { data: oreGiaRegistrate } = useQuery({
    queryKey: ["campo-ore-gia-registrate", orderId, workDay, user?.id],
    enabled: !!orderId && !!user?.id && !faSquadra && validWorkDay(workDay),
    staleTime: 60_000,
    queryFn: async (): Promise<{ ore: number; da: string } | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("campo_ore_gia_registrate", { p_order_id: orderId, p_giorno: workDay });
      if (error || !data) return null;
      return data as { ore: number; da: string };
    },
  });
  // Il rapportino respinto si riapre già compilato: nessuno deve riscrivere la giornata da zero.
  const riapertoFatto = useRef(false);
  const presenzeRiapertoFatto = useRef(false);
  useEffect(() => {
    if (!daRifare || !rapportinoGiaOggi || riapertoFatto.current) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled || riapertoFatto.current) return;
      riapertoFatto.current = true;
      const r = rapportinoGiaOggi;
      setDescrizione(r.descrizione_lavori ?? "");
      if (r.meteo) { setMeteo(r.meteo); meteoModificato.current = true; }
      if (r.ore_lavorate != null) { oreModificate.current = true; setOreLavorate(Number(r.ore_lavorate)); }
      setOreStraordinario(Number(r.ore_straordinario) || 0);
      setPercentuale(Number(r.percentuale_avanzamento) || 0);
      const foto = Array.isArray(r.foto_urls) ? r.foto_urls.filter((u): u is string => typeof u === "string") : [];
      setFotoUrls(foto);
      setCampiValori(valoriInBozza(leggiValori(r.campi_extra)));
      setArrivo(leggiArrivo(r.campi_extra));
      if (Array.isArray(r.fasi_lavorate)) {
        setFasiDichiarate(Object.fromEntries(r.fasi_lavorate.filter(f => f?.phase_id).map(f => [f.phase_id, Number(f.percentuale) || 0])));
        setSottofasiSpunte(sottofasiSpuntate(r.fasi_lavorate));
        setSottofasiLavorate(sottofasiSpuntate(r.fasi_lavorate, "sottofasi_lavorate"));
        setSottofasiAvanzate(avanzateDelRapportino(r.fasi_lavorate));
        setFotoFase(Object.fromEntries(r.fasi_lavorate.filter(f => f?.phase_id).flatMap(f => (Array.isArray(f.foto) ? f.foto : []).map((u): [string, string] => [u, f.phase_id]))));
      }
      if (Array.isArray(r.materiali_usati)) {
        setMaterialiSel(restoreRapportinoMaterials(r.materiali_usati));
      }
    });
    return () => { cancelled = true; };
  }, [daRifare, rapportinoGiaOggi]);
  useEffect(() => {
    if (!ripresaDecisa || !daRifare || !rapportinoGiaOggi || presenzeRiapertoFatto.current || squadra.length === 0) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled || presenzeRiapertoFatto.current) return;
      presenzeRiapertoFatto.current = true;
      const salvate = Array.isArray(rapportinoGiaOggi.presenze) ? rapportinoGiaOggi.presenze : [];
      if (salvate.length === 0) return;
      setPresenzeSel(prev => {
        const next = { ...prev };
        for (const p of salvate) {
          const m = squadra.find(x => stessaPresenza(p, x));
          if (m && !(m.key in presenzeModificate)) next[m.key] = Number(p.ore) > 0 ? Number(p.ore) : "";
        }
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [ripresaDecisa, daRifare, rapportinoGiaOggi, squadra, presenzeModificate]);

  // Azienda in cui il rapportino lo fa il capocantiere: l'operaio timbra e scrive
  // descrizione, foto, materiali, ma non le ore. Solo se il cantiere ha davvero
  // un capo (altrimenti nessuno le scriverebbe) e salvo «oggi il capo non c'era».
  const [oreMieForzate, setOreMieForzate] = useState(false);
  // Se il capo l'ha già segnato, le ore di base non si riscrivono: ma la stessa
  // persona può aver fatto ore DIVERSE sullo stesso cantiere (squadra al mattino,
  // da solo il pomeriggio). Per quelle c'è «Ho fatto altre ore»: si scrivono solo le
  // ore in più, e l'ufficio vede l'avviso sulla stessa persona in approvazione.
  const oreRegistrateDalCapo = !!oreGiaRegistrate;
  // La ditta subappaltatrice rendiconta le proprie ore: la regola vale solo per i dipendenti.
  const oreLasciateAlCapo = flusso.soloTimbratura;
  const oreNonMie = !faSquadra && !oreMieForzate && (oreRegistrateDalCapo || oreLasciateAlCapo);
  // Chi manda il rapportino è ancora timbrato qui: l'invio chiude anche la giornata.
  // Rimandare un rapportino respinto non è la fine della giornata.
  const chiudeGiornata = sessioneDaChiudere && !oreNonMie && !confermaCliente && !daRifare;
  useEffect(() => {
    if (oreModificate.current || rapportinoGiaOggi || !dayTime.isSuccess || oreRilevate == null || anomalieTimbrature) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled || oreModificate.current) return;
      setOreLavorate(oreRilevate);
    });
    return () => { cancelled = true; };
  }, [dayTime.isSuccess, oreRilevate, anomalieTimbrature, rapportinoGiaOggi]);
  const { data: coordCantiere } = useQuery({
    queryKey: ["campo-cantiere-coord", orderId],
    enabled: !!orderId,
    staleTime: 3600_000,
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("work_lat, work_lng").eq("id", orderId!).maybeSingle();
      return data?.work_lat != null && data?.work_lng != null ? { lat: Number(data.work_lat), lng: Number(data.work_lng) } : null;
    },
  });
  const { data: meteoMap } = useWeatherForecast(coordCantiere?.lat ?? 45.4654, coordCantiere?.lng ?? 9.1859, 1);
  useEffect(() => {
    if (meteoModificato.current || rapportinoGiaOggi || !meteoMap || !coordCantiere) return;
    const weather = meteoMap.get(workDay);
    if (!weather) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled || meteoModificato.current) return;
      const c = weather.code;
      setMeteo(c <= 1 ? "soleggiato" : c <= 48 ? "nuvoloso" : (c >= 71 && c <= 77) || c === 85 || c === 86 ? "neve" : "pioggia");
      meteoModificato.current = true;
    });
    return () => { cancelled = true; };
  }, [meteoMap, coordCantiere, rapportinoGiaOggi, workDay]);
  // Solo le fasi non completate sono dichiarabili
  const fasiDichiarabili = fasiCommessa.filter(f => f.status !== "completata");
  // Le fasi su cui si è lavorato oggi, nell'ordine in cui compaiono nel cantiere. Con più di una, accanto a ogni
  // materiale e a ogni foto compare «Fase»; con una sola, tutto si collega lì senza chiedere niente.
  const fasiSelezionate = fasiCommessa.filter(f => f.id in fasiDichiarate);
  const sceltaFasePerOgniCosa = fasiSelezionate.length > 1;
  // Un campo per fase si compila una volta per ogni fase lavorata. Senza fasi scelte, o a fasi spente, sta sul rapportino;
  // un respinto a fasi spente conserva i valori che aveva, senza richiederli.
  // Si parte dalle fasi dichiarate, non dall'elenco della commessa: se l'elenco non è arrivato (poco segnale) o la fase è
  // stata tolta dalla commessa, i valori di un respinto non si perdono.
  const fasiPerCampi = useMemo(() => {
    if (confermaCliente || !(parti.fasi || daRifare)) return [];
    const salvate = daRifare ? fasiDelRapportino(rapportinoGiaOggi?.fasi_lavorate, leggiValori(rapportinoGiaOggi?.campi_extra)) : [];
    return Object.keys(fasiDichiarate).map(id => ({
      id, nome: fasiCommessa.find(f => f.id === id)?.name || salvate.find(f => f.id === id)?.nome || "Lavorazione",
    }));
  }, [confermaCliente, parti.fasi, daRifare, fasiCommessa, fasiDichiarate, rapportinoGiaOggi]);
  // Scritto prima di scegliere la fase: passa alla prima fase scelta, invece di restare in un campo che non si vede più.
  // Se poi non resta nessuna fase, torna al campo sul rapportino: lo si era scritto lì, e non va perso.
  const passatiAllaFase = useRef(new Map<string, string>());
  useEffect(() => {
    const pieno = (v: unknown) => v !== undefined && v !== null && v !== "";
    let dopo = campiValori;
    if (fasiPerCampi.length === 0) {
      for (const [slot, chiave] of passatiAllaFase.current) {
        if (!pieno(dopo[slot]) || pieno(dopo[chiave])) continue;
        const { [slot]: valore, ...resto } = dopo;
        dopo = { ...resto, [chiave]: valore };
      }
      passatiAllaFase.current.clear();
    } else if (parti.fasi) {
      for (const c of campiModulo) {
        const slot = chiaveValore(c.chiave, fasiPerCampi[0].id);
        if (c.livello !== "fase" || !pieno(dopo[c.chiave]) || pieno(dopo[slot])) continue;
        const { [c.chiave]: valore, ...resto } = dopo;
        dopo = { ...resto, [slot]: valore };
        passatiAllaFase.current.set(slot, c.chiave);
      }
    }
    if (dopo !== campiValori) setCampiValori(dopo);
    // Si guarda solo quando cambiano le fasi: scrivere in un campo non deve spostare nulla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parti.fasi, fasiPerCampi, campiModulo]);
  const campiSulRapportino = campiModulo.filter(c => c.livello !== "fase" || fasiPerCampi.length === 0);
  const campiDiFase = parti.fasi && fasiPerCampi.length > 0 ? campiModulo.filter(c => c.livello === "fase") : [];
  const mancantiRapportino = mancanti(campiSulRapportino, campiValori);
  const mancantiFase = mancanti(campiDiFase, campiValori, fasiPerCampi);
  const campiMancanti = [...mancantiRapportino, ...mancantiFase];
  const valoriDaRivedere = componiValori(campiModulo, campiValori, [], fasiPerCampi);
  const idsFasiDichiarate = Object.keys(fasiDichiarate);
  // Quello che non appartiene a nessuna fase (con più fasi e nessuna scelta, o senza fasi).
  const materialiGenerali = Object.values(materialiSel).filter(m => faseDiAppartenenza(m.faseId, idsFasiDichiarate) === null);
  const fotoAlCompleto = postiLiberi(fotoUrls.length) === 0;
  const fotoGenerali = fotoUrls.filter(u => faseDiAppartenenza(fotoFase[u], idsFasiDichiarate) === null).length;

  // ── Articoli/materiali della commessa (order_items) ─────────────────
  // L'operaio può confermare quali ha usato oggi (facoltativo). Se la
  // commessa non ha articoli resta solo l'aggiunta libera.
  const { data: articoliCommessa = [], isLoading: articoliLoading, isError: articoliError, refetch: refetchArticoli } = useQuery({
    queryKey: ["campo-articoli-commessa-rapportino", orderId, companyId],
    enabled: !!orderId && !!companyId,
    staleTime: 60_000,
    queryFn: () => loadRapportinoArticles(orderId!, companyId!),
  });
  const materialiCommessa = articoliCommessa.filter(item => rapportinoArticleKind(item) === "material");
  const articoliDaVerificare = articoliCommessa.filter(item => rapportinoArticleKind(item) === "unknown");
  const prestazioniCommessa = articoliCommessa.filter(item => rapportinoArticleKind(item) === "service");
  const delivered = useQuery({
    queryKey: ['campo-materiali-consegnati-rapportino', companyId, orderId, workDay],
    enabled: !!companyId && !!orderId && validWorkDay(workDay), staleTime: 60_000,
    queryFn: () => loadRapportinoDeliveredStock(orderId!, companyId!, workDay),
  });
  const materialiConsegnati = (delivered.data ?? []).filter(item =>
    !materialiCommessa.some(article => article.stock_item_id === item.stock_item_id));

  const toggleMateriale = (item: RapportinoArticle) => {
    setMaterialiSel(prev => {
      const next = { ...prev };
      const key = item.stock_item_id ? rapportinoStockSelectionKey(item.stock_item_id) : item.id;
      if (key in next) delete next[key];
      else next[key] = { nome: item.name, quantita: 1, unita: rapportinoMaterialUnit(item.template?.unit_of_measure),
        orderItemId: item.order_item_id === undefined ? item.id : item.order_item_id,
        ...(item.stock_item_id ? { stockItemId: item.stock_item_id } : {}) };
      return next;
    });
  };

  const renderMateriale = (item: RapportinoArticle) => {
    const key = item.stock_item_id ? rapportinoStockSelectionKey(item.stock_item_id) : item.id;
    return <button key={key} type="button" aria-pressed={key in materialiSel}
      onClick={() => toggleMateriale(item)}
      className={`max-w-full min-h-11 rounded-xl border px-3 py-2 text-left text-sm break-words transition-colors ${
        key in materialiSel ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border bg-muted text-muted-foreground"
      }`}>
      {item.name}
    </button>;
  };

  const aggiungiMaterialeLibero = () => {
    const nome = materialeLibero.trim();
    if (!nome) return;
    setMaterialiSel(prev => ({ ...prev, [`libero_${Date.now()}`]: { nome, quantita: 1 } }));
    setMaterialeLibero("");
  };

  const toggleFase = (fase: FaseCommessa) => {
    setFasiDichiarate(prev => {
      const next = { ...prev };
      if (fase.id in next) delete next[fase.id];
      else next[fase.id] = fase.percentuale; // slider precompilato con l'attuale
      return next;
    });
  };

  // Le foto scattate durante il lavoro: si ritrovano qui, senza ricaricarle. Si possono togliere una a una.
  const { data: fotoDelGiorno } = useQuery({
    queryKey: ["campo-foto-del-giorno", companyId, orderId, user?.id, workDay],
    enabled: !!companyId && !!orderId && !!user?.id && tipo === "daily" && validWorkDay(workDay),
    staleTime: 60_000,
    queryFn: async () => {
      const { start, end } = campoDayWindow(workDay);
      const { data, error } = await supabase.from("foto_cantiere")
        .select("storage_path")
        .eq("company_id", companyId!).eq("order_id", orderId!).eq("uploaded_by", user!.id)
        .gte("taken_at", start.toISOString()).lt("taken_at", end.toISOString())
        .order("taken_at", { ascending: true });
      if (error) return [];
      return (data ?? []).map((f) => riferimentoFile("foto-cantiere", f.storage_path));
    },
  });
  const fotoDelGiornoPrese = useRef(false);
  useEffect(() => {
    if (fotoDelGiornoPrese.current || !fotoDelGiorno || !ripresaDecisa || !fotoPronte || daRifare || !parti.foto || soloOreAllOperaio || rapportinoGiaOggi || uploadingFoto) return;
    fotoDelGiornoPrese.current = true;
    if (fotoDelGiorno.length === 0) return;
    setFotoUrls((prima) => [...prima, ...fotoDelGiorno.filter((u) => !prima.includes(u)).slice(0, postiLiberi(prima.length))]);
  }, [fotoDelGiorno, ripresaDecisa, daRifare, parti.foto, soloOreAllOperaio, rapportinoGiaOggi, uploadingFoto, fotoPronte]);

  useEffect(() => {
    if (!companyId || !user?.id || !orderId) return;
    let attivo = true;
    void Promise.resolve().then(() => get<FotoLocali>(chiaveBozza, fotoBozze))
      .then(foto => { if (attivo && foto) setFotoLocali(foto); })
      .catch(() => { /* Un allegato locale mancante resta verificabile prima dell'invio. */ })
      .finally(() => { if (attivo) setFotoPronte(true); });
    return () => { attivo = false; };
  }, [chiaveBozza, companyId, orderId, user?.id]);

  useEffect(() => {
    if ((!ripresaDecisa && !daRifare) || !Object.keys(fotoLocali).length) return;
    setFotoUrls(prima => [...new Set([...prima, ...Object.keys(fotoLocali)])]);
  }, [fotoLocali, ripresaDecisa, daRifare]);

  // Le foto restano nella bozza del telefono, poi viaggiano nello stesso invio del testo.
  const handleFotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    if (!files.length || fotoAlCompleto || bloccoFoto.current || !fotoPronte || !companyId || !orderId) return;
    if (!giornoOk()) { toast.error(msgScadenza); return; }
    bloccoFoto.current = true;
    setUploadingFoto(true);
    try {
      const esito = await preparaFoto(files, {
        giaPresenti: fotoUrls.length,
        onProgresso: (i, n) => setFotoProgresso("Preparo le foto " + i + " di " + n + "…"),
      });
      avvisiPreparazione(esito).forEach(avviso => toast.error(avviso));
      if (esito.pronte.length === 0) return;
      const nuove: FotoLocali = {};
      let illeggibili = 0;
      for (const foto of esito.pronte) {
        const percorso = companyId + "/" + orderId + "/bozza/" + foto.nomeFile;
        // Safari può rifiutare i Blob di un file locale in IndexedDB. Copia i byte
        // prima di liberare il file del selettore e usa i Blob solo per le anteprime.
        const bytes = await foto.blob.arrayBuffer().catch((): null => null);
        if (!bytes?.byteLength) { illeggibili++; continue; }
        nuove[riferimentoAllegatoRapportino(percorso)] = { percorso, bytes, contentType: foto.contentType };
      }
      if (illeggibili) toast.error(illeggibili === 1 ? "Una foto non si è aperta. Selezionala di nuovo." : `${illeggibili} foto non si sono aperte. Selezionale di nuovo.`);
      if (!Object.keys(nuove).length) return;
      let salvate: FotoLocali = {};
      await update<FotoLocali>(chiaveBozza, prima => {
        salvate = { ...prima, ...nuove };
        return salvate;
      }, fotoBozze);
      setFotoLocali(salvate);
      setFotoUrls(prima => [...new Set([...prima, ...Object.keys(salvate)])]);
    } catch {
      toast.error("Non riesco a salvare le foto sul telefono. Riprova.");
    } finally {
      input.value = "";
      bloccoFoto.current = false;
      setUploadingFoto(false);
      setFotoProgresso(null);
    }
  };

  const togliFoto = async (url: string) => {
    if (bloccoFoto.current) return;
    bloccoFoto.current = true;
    setUploadingFoto(true);
    try {
      if (fotoLocali[url]) {
        let salvate: FotoLocali = {};
        await update<FotoLocali>(chiaveBozza, prima => {
          salvate = { ...prima };
          delete salvate[url];
          return salvate;
        }, fotoBozze);
        setFotoLocali(salvate);
      }
      setFotoUrls(prima => prima.filter(foto => foto !== url));
      setFotoFase(({ [url]: _, ...resto }) => resto);
    } catch {
      toast.error("Non riesco a rimuovere la foto. Riprova.");
    } finally {
      bloccoFoto.current = false;
      setUploadingFoto(false);
    }
  };

  const correggiInvio = async (voce: SyncItem<RapportoInCoda>) => {
    if (!online || !fotoPronte || bloccoFoto.current || voce.status !== "failed" || !voce.payload.bozzaCompilata) return;
    bloccoFoto.current = true;
    setVerificaCoda(true);
    try {
      if (await rapportoGiaRicevuto(voce.payload, await syncOperationId(voce))) {
        await syncQueue.retryFailed(i => i.id === voce.id);
        await syncQueue.processQueue();
        toast.info("L’ufficio aveva già ricevuto questo rapportino.");
        return;
      }
      const b = bozza.hasSavedDraft ? bozza.draft : { ...bozza.draft, ...voce.payload.bozzaCompilata };
      const indirizzi = new Set(b.fotoUrls);
      const salvate = bozza.hasSavedDraft ? await get<FotoLocali>(chiaveBozza, fotoBozze) ?? {} : {};
      const foto = Object.fromEntries(Object.entries(salvate).filter(([url]) => indirizzi.has(url)));
      for (const allegato of voce.payload.allegati) {
        const url = riferimentoAllegatoRapportino(allegato.percorso);
        if (indirizzi.has(url) && !foto[url]) foto[url] = allegato;
      }
      await set(chiaveBozza, foto, fotoBozze);
      setFotoLocali(foto);
      bozzaAttivata.current = true;
      setModificaCoda(voce);
      applicaBozza(b);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Non riesco a riaprire i dati dell’invio.");
    } finally {
      bloccoFoto.current = false;
      setVerificaCoda(false);
    }
  };

  // ── Salvataggio ──────────────────────────────────────────────────────
  const straordinarioDaInviare = parti.straordinario || daRifare ? oreStraordinario : 0;
  const oreDaInviare = () => confermaCliente || oreNonMie ? 0 : validateRapportinoHours(
    oreLavorate, straordinarioDaInviare, registraSquadra ? presenzeSel : {},
  );
  let erroreOre: string | null = null;
  if (controllaOre) {
    try {
      oreDaInviare();
    } catch (err) {
      erroreOre = err instanceof Error ? err.message : "Verifica le ore lavorate.";
    }
  }

  const { mutate: salva, isPending: saving } = useMutation({
    // Anche senza rete questa mutazione deve scrivere subito su IndexedDB.
    networkMode: "always",
    mutationFn: async () => {
      if (lavoro_completato && !online) throw new Error("Torna online per inviare il collaudo firmato.");
      if (inCoda && !modificaCoda) throw new Error("Il rapportino è già in coda.");
      if (bloccoFoto.current) throw new Error("Attendi che le foto siano pronte.");
      if (verificaInCorso || verificaFallita || !ruoloCampo) throw new Error("Attendi la verifica del cantiere e dei rapporti già inviati, oppure riprova.");
      if (clienteNonConsentito) throw new Error("Il collaudo col cliente lo fa il capocantiere. Puoi inviare il tuo rapportino.");
      if (!lavoro_completato && flusso.soloTimbratura && !daRifare) throw new Error("Il giornaliero lo invia il responsabile: tu registra entrata e uscita. Puoi aggiungere foto dal cantiere.");
      if (lavoro_completato && !descrizione.trim()) throw new Error("Descrivi i lavori che il cliente deve confermare prima di raccogliere la firma.");
      if (lavoro_completato && (!firmaCliente || !firmaClienteNome.trim())) throw new Error("Per il collaudo servono nome e cognome del cliente e la sua firma.");
      if (campiMancanti.length > 0) throw new Error("Compila: " + campiMancanti.join(", "));
      controllaGiorno();
      if (bloccatoDaEsistente) throw new Error("Esiste già un rapportino per questo cantiere e questa giornata. Per correggerlo contatta l’ufficio.");
      if (!companyId || !orderId || !user?.id) throw new Error("Sessione non pronta, ricarica la pagina");

      const operationId = modificaCoda ? await syncOperationId(modificaCoda)
        : lavoro_completato ? (idCollaudo.current ??= crypto.randomUUID()) : crypto.randomUUID();
      const idFirma = modificaCoda ? crypto.randomUUID() : operationId;
      const quando = new Date().toISOString();
      const arrivoDaSalvare = !lavoro_completato && (parti.mezzi || daRifare) ? campoArrivo(arrivo) : [];
      const materialiPayload = confermaCliente || !parti.materiali ? [] : buildRapportinoMaterials(materialiSel, Object.keys(fasiDichiarate));
      const orePayload = oreDaInviare();
      const locali = fotoPronte ? fotoLocali
        : await Promise.resolve().then(() => get<FotoLocali>(chiaveBozza, fotoBozze)).catch((): undefined => undefined) ?? {};
      const fotoAllegate = parti.foto || daRifare ? [...new Set([...fotoUrls, ...Object.keys(locali)])] : [];
      const allegati: AllegatoRapportino[] = [];
      const fotoPrecedenti = new Set(rapportinoGiaOggi?.foto_urls ?? []);
      for (const url of fotoAllegate) {
        const locale = locali[url];
        if (locale) allegati.push(locale);
        else if (url.startsWith(riferimentoAllegatoRapportino(companyId + "/" + orderId + "/bozza/")) && !fotoPrecedenti.has(url)) {
          throw new Error("Una foto della bozza manca sul telefono. Rimuovila o aggiungila di nuovo.");
        }
      }
      const aggiungiFirma = (dataUrl: string | null, autore: "operaio" | "cliente") => {
        if (!dataUrl) return;
        const bytes = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(",") + 1)), carattere => carattere.charCodeAt(0)).buffer;
        const percorso = companyId + "/" + orderId + "/firme/" + idFirma + "_" + autore + ".png";
        allegati.push({ percorso, bytes, contentType: "image/png" });
        return riferimentoAllegatoRapportino(percorso);
      };
      const firmaOperaioUrl = aggiungiFirma(firmaOperaio, "operaio");
      const firmaClienteUrl = lavoro_completato ? aggiungiFirma(firmaCliente, "cliente") : undefined;

      const fasiLavorate = confermaCliente || !parti.fasi ? [] : costruisciFasiLavorate({
        dichiarate: fasiDichiarate,
        nomi: {
          ...Object.fromEntries(fasiPerCampi.map(f => [f.id, f.nome])),
          ...Object.fromEntries(fasiCommessa.map(f => [f.id, f.name])),
        },
        fotoUrls: fotoAllegate,
        fotoFase,
        base: fasiLavorateDelRapportino(fasiDichiarate, sottofasiDi, sottofasiSpunte, sottofasiLavorate, sottofasiAvanzate),
      });
      const puoScriverePresenze = !confermaCliente && registraSquadra;
      const presenzeDaInviare = puoScriverePresenze ? presenzeRapportino(squadra, presenzeSel) : [];
      const campiPrecedenti = daRifare ? leggiValori(rapportinoGiaOggi?.campi_extra) : [];
      const campiExtra = [...componiValori(campiModulo, campiValori, campiPrecedenti, fasiPerCampi), ...arrivoDaSalvare];
      const correzione = daRifare && rapportinoGiaOggi
        ? { id: rapportinoGiaOggi.id, versione: rapportinoGiaOggi.updated_at ?? null } : undefined;
      const presenzeCorrette = daRifare && puoScriverePresenze
        ? correggiPresenzeRapportino(rapportinoGiaOggi?.presenze, squadra, presenzeSel, presenzeModificate) : undefined;
      const righeMezzi = !parti.mezzi || confermaCliente || workDay < shiftWorkDay(campoWorkDay(), -1) ? [] : righeDaSalvare(mezziSel);
      const payload: RapportoInCoda = {
        company_id: companyId,
        user_id: user.id,
        order_id: orderId,
        giorno: workDay,
        roleType: isSubappaltatore ? "subcontractor" : "employee",
        correzione,
        campi: {
          ...(campiExtra.length > 0 || campiPrecedenti.length > 0 || leggiArrivo(rapportinoGiaOggi?.campi_extra).mezzoId ? { campi_extra: campiExtra as unknown as Json } : {}),
          ore_lavorate: orePayload,
          ore_straordinario: !confermaCliente && !oreNonMie && straordinarioDaInviare > 0 ? straordinarioDaInviare : 0,
          descrizione_lavori: descrizione || null,
          foto_urls: fotoAllegate,
          lavoro_completato,
          percentuale_avanzamento: confermaCliente || !(parti.avanzamento || daRifare) ? 0 : percentuale,
          gps_lat: lat || null,
          gps_lng: lng || null,
          gps_accuracy: accuracy || null,
          meteo: meteo || null,
          ...(parti.fasi && (daRifare || fasiLavorate.length > 0) ? { fasi_lavorate: fasiLavorate } : {}),
          ...(presenzeCorrette ? { presenze: presenzeCorrette } : !daRifare && presenzeDaInviare.length ? { presenze: presenzeDaInviare } : {}),
          ...(parti.materiali && (daRifare || materialiPayload.length > 0) ? { materiali_usati: materialiPayload } : {}),
          ...(firmaOperaioUrl ? { firma_operaio_url: firmaOperaioUrl } : {}),
          ...(firmaClienteUrl ? { firma_cliente_url: firmaClienteUrl, firma_cliente_nome: firmaClienteNome.trim(), firma_cliente_at: quando } : {}),
        },
        allegati,
        bozzaCompilata: lavoro_completato ? undefined : { ...bozzaCorrente, fotoUrls: fotoAllegate },
        uscita: modificaCoda?.payload.uscita ?? (chiudeGiornata ? rigaTimbratura({
          companyId, userId: user.id, tipo: "uscita", orderId, quando,
          lat: lat || null, lng: lng || null, accuracy: accuracy ? Math.round(accuracy) : null,
        }) : undefined),
        mezzi: righeMezzi as unknown as Json[],
      };
      if (lavoro_completato) return { esito: await inviaRapportoInCoda(payload, operationId) };
      if (modificaCoda) {
        if (!await syncQueue.riaccodaFallito(modificaCoda, payload)) {
          throw new Error("L’invio è cambiato su un’altra scheda. Le tue modifiche restano nella bozza.");
        }
        void syncQueue.processQueue().catch(() => {});
      } else {
        await syncQueue.enqueue<RapportoInCoda>({ type: "rapportino", dedupKey: chiaveBozza, operationId, payload });
      }
      return { esito: undefined };
    },
    onSuccess: ({ esito }) => {
      bozzaAccodata.current = true;
      bozzaAttivata.current = false;
      bozza.clearDraft();
      void Promise.resolve().then(() => del(chiaveBozza, fotoBozze)).catch(() => {});
      navigator.vibrate?.([10, 50, 10]);
      if (!esito) {
        if (!online) toast.success("Rapportino in coda. Parte quando torna la rete.");
      } else {
        toast.success("Collaudo inviato");
        if (esito.id && esito.pdf && orderId) void notifyRapportinoPdf(esito.id, orderId, queryClient);
        void refreshCommessaCampoQueries(queryClient, orderId, companyId);
        if (esito.chiudeGiornata) void refreshCampoTimeQueries(queryClient);
        void queryClient.invalidateQueries({ queryKey: ["campo-rapportini-da-compilare"] });
        void queryClient.invalidateQueries({ queryKey: ["campo-rapportini-sospesi"] });
        void queryClient.invalidateQueries({ queryKey: ["mezzi"] });
      }
      navigate("/campo/lavoro/" + orderId + "?tab=" + (lavoro_completato ? "collaudo" : "rapportini"));
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error && error.message ? error.message : "Errore nel salvataggio. Riprova.");
    },
  });

  // Fine lavori: firma cliente + nome obbligatori per inviare
  const firmeMancanti = lavoro_completato && (!firmaCliente || !firmaClienteNome.trim());
  const isUltimoStep = step >= totalSteps;

  const cambiaPassaggio = (passaggio: number) => {
    setStep(passaggio);
    requestAnimationFrame(() => inizioRapportino.current?.scrollIntoView?.({ block: "start" }));
  };

  const tornaAScrivere = () => {
    setVoceAperta(false);
    requestAnimationFrame(() => campoDescrizione.current?.scrollIntoView?.({ block: "nearest" }));
  };

  const goNext = () => {
    if (vocaleVisibile || verificaInCorso || verificaFallita || clienteNonConsentito) return;
    if (!giornoOk()) { toast.error(msgScadenza); return; }
    // Quelli per fase stanno più avanti, per chi ha due passi: si chiedono all'invio.
    const mancaOra = isUltimoStep ? campiMancanti : step === 1 ? mancantiRapportino : [];
    if (mancaOra.length > 0) { setErroriCampi(true); toast.error(`Compila: ${mancaOra.join(", ")}`); return; }
    if (step < totalSteps) {
      cambiaPassaggio(step + 1);
      return;
    }
    if ((lavoro_completato && !online) || bloccoFoto.current || (inCoda && !modificaCoda)) return;
    try {
      oreDaInviare();
    } catch {
      setControllaOre(true);
      campoOre.current?.scrollIntoView?.({ block: "center" });
      return;
    }
    salva();
  };

  // Dati "sudati" nel form: uscire per sbaglio (freccia indietro col pollice)
  // non deve buttare via la giornata scritta senza nemmeno chiedere.
  const datiInseriti =
    avanzamentoModificato.current || descrizione.trim().length > 0 || (!confermaCliente && (oreLavorate !== "" || oreStraordinario > 0)) ||
    fotoUrls.length > 0 || !!arrivo.mezzoId || Object.keys(campiValori).length > 0 ||
    Object.keys(fasiDichiarate).length > 0 ||
    Object.keys(presenzeSel).length > 0 || Object.keys(presenzeModificate).length > 0 ||
    Object.keys(materialiSel).length > 0 || Object.keys(mezziSel).length > 0 ||
    !!firmaOperaio || !!firmaCliente || firmaClienteNome.trim().length > 0;

  const goBack = () => {
    if (saving || uploadingFoto) return;
    if (vocaleVisibile) { tornaAScrivere(); return; }
    if (step === 1) {
      const confermaUscita = bozza.saveError
        ? "La bozza non è stata salvata sul telefono. Uscendo potresti perdere i dati: continuare?"
        : "Vuoi uscire dal rapportino? La bozza e le foto restano sul telefono. Le firme vanno raccolte di nuovo.";
      if (datiInseriti && !window.confirm(confermaUscita)) {
        return;
      }
      navigate(`/campo/lavoro/${orderId}`);
      return;
    }
    if (step === 3) {
      // Tornando indietro il canvas si smonta: azzera la firma cliente per
      // evitare uno stato "firmato" con pad visivamente vuoto al rientro.
      setFirmaCliente(null);
    }
    if (step === 2) setFirmaOperaio(null);
    cambiaPassaggio(step - 1);
  };

  // Blocchi riusati: nel passo 2 per chi gestisce il cantiere, dentro «Altro da segnalare» per
  // l'operaio con un capo (che racconta solo la sua giornata).
  const bloccoAvanzamento = (
    <>
            {/* Avanzamento generale SOLO senza fasi: con le fasi la % commessa
                è derivata dal DB, chiederla di nuovo qui confonde. */}
            {fasiCommessa.length === 0 && puoDichiararePercentuali && (
              <div className="rounded-2xl border bg-background p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground">Avanzamento lavori</p>
                  <span className="text-primary font-bold">{percentuale}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={percentuale}
                  onChange={e => {
                    avanzamentoModificato.current = true;
                    setPercentuale(Number(e.target.value));
                  }}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>
            )}

    </>
  );
  const bloccoSquadra = (
    <>
            {/* ── Squadra del giorno: il capocantiere per tutto il cantiere,
                il caposquadra per la sua squadra ── */}
            {faSquadra && squadra.length > 0 && (() => {
              // Come lavora l'azienda: con «le ore dalle timbrature» le ore partono da
              // quelle timbrate; con l'avviso acceso si vede il confronto anche se le
              // ore le scrive il capo.
              const dalleTimbrature = regole.oreDalle === "timbrature";
              const mostraTimbrate = dalleTimbrature || regole.avvisoScostamentoMinuti != null;
              const timbratiDaSelezionare = squadra.filter(m =>
                !giaCoperto(m) && !(m.key in presenzeSel) && (m.ore_timbrate ?? 0) > 0 && !m.timbratura_aperta);
              return (
              <div className="rounded-2xl border bg-background p-4 shadow-sm">
                <p className="text-sm font-semibold text-foreground">{workDay === today ? "Chi ha lavorato oggi?" : "Chi ha lavorato in questa giornata?"}</p>
                <p className="mb-3 text-xs text-muted-foreground">
                  {dalleTimbrature
                    ? "Le ore sono quelle timbrate in cantiere: controllale e correggile se serve. Chi non ha timbrato lo aggiungi tu, con le sue ore."
                    : isCapocantiere
                      ? "Tocca chi era in cantiere e scrivi le sue ore. Chi ha già mandato il suo rapportino non va segnato di nuovo."
                      : "Tocca chi della tua squadra era in cantiere e scrivi le sue ore. Chi ha già mandato il suo rapportino non va segnato di nuovo."}
                </p>
                {dalleTimbrature && timbratiDaSelezionare.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      segnaPresenzeModificate(timbratiDaSelezionare.map(m => m.key));
                      setPresenzeSel(prev => {
                        const next = { ...prev };
                        for (const m of timbratiDaSelezionare) next[m.key] = proponiOre(m.ore_timbrate, m.timbratura_aperta);
                        return next;
                      });
                    }}
                    className="mb-3 min-h-11 rounded-full border border-primary px-4 text-sm font-semibold text-primary"
                  >
                    Seleziona chi ha timbrato ({timbratiDaSelezionare.length})
                  </button>
                )}
                <div className="space-y-3">
                  {[...new Set(squadra.map(m => m.squadra ?? ""))].map(gruppo => (
                    <div key={gruppo || "da-soli"}>
                      {gruppo && <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{gruppo}</p>}
                      <div className="flex flex-wrap gap-2">
                        {squadra.filter(m => (m.squadra ?? "") === gruppo).map(m => {
                          const selected = m.key in presenzeSel;
                          const coperto = giaCoperto(m);
                          if (coperto) {
                            return (
                              <span key={m.key} className="min-h-11 rounded-full border border-dashed px-3 py-2 text-sm text-muted-foreground">
                                {m.nome} · {coperto === "suo" ? "ha mandato il suo" : "già registrato da un collega"}
                              </span>
                            );
                          }
                          // cosa dicono le timbrature di questa persona (le ditte non timbrano)
                          const nota = !mostraTimbrate || m.subappaltatore_id ? null
                            : m.timbratura_aperta ? "ancora dentro"
                            : (m.ore_timbrate ?? 0) > 0 ? `timbrate ${oreInTesto(m.ore_timbrate!)}`
                            : "non ha timbrato";
                          return (
                            <button
                              key={m.key}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => togglePresenza(m)}
                              className={`min-h-11 rounded-full border px-3 py-2 text-sm transition-colors ${
                                selected
                                  ? "border-primary bg-primary/10 font-semibold text-primary"
                                  : "border-border bg-muted text-muted-foreground"
                              }`}
                            >
                              {m.nome}{m.sono_io ? " (tu)" : ""}
                              {nota && <span className="ml-1.5 text-xs font-normal opacity-80">· {nota}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {Object.keys(presenzeSel).length > 0 && (
                  <p role="status" className="mt-3 rounded-lg bg-primary/5 p-3 text-xs text-muted-foreground">
                    Il costo della squadra usa queste presenze.
                    Se hai lavorato anche tu, seleziona anche il tuo nome.
                  </p>
                )}
                {Object.keys(presenzeSel).length > 1 && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">Stesse ore per tutti:</span>
                    {[4, 6, 8].map(h => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => {
                          const chiavi = squadra.filter(m => m.key in presenzeSel).map(m => m.key);
                          segnaPresenzeModificate(chiavi);
                          setPresenzeSel(prev => ({ ...prev, ...Object.fromEntries(chiavi.map(k => [k, h])) }));
                        }}
                        className="min-h-11 rounded-full border border-border bg-muted px-4 text-sm font-semibold"
                      >
                        {h} h
                      </button>
                    ))}
                  </div>
                )}
                {squadra.filter(m => m.key in presenzeSel).map(m => {
                  const diff = scostamento(presenzeSel[m.key], m.ore_timbrate, regole.avvisoScostamentoMinuti);
                  return (
                  <div key={m.key} className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-medium text-foreground">
                        {m.nome}
                        {m.subappaltatore_id && (
                          <span className="ml-1 text-xs text-muted-foreground">(subappaltatore)</span>
                        )}
                      </p>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <input
                          type="number"
                          min={0.1}
                          max={24}
                          step={0.1}
                          inputMode="decimal"
                          value={presenzeSel[m.key]}
                          onChange={e => {
                            segnaPresenzeModificate([m.key]);
                            const ore = e.target.value === "" ? "" : Number(e.target.value);
                            setPresenzeSel(prev => ({ ...prev, [m.key]: ore }));
                          }}
                          className="h-11 w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-base"
                          aria-label={`Ore di ${m.nome}`}
                        />
                        <span className="text-xs text-muted-foreground">ore</span>
                      </div>
                    </div>
                    {mostraTimbrate && !m.subappaltatore_id && (
                      <p className={`mt-1.5 text-xs ${diff?.fuori ? "font-medium text-amber-700" : "text-muted-foreground"}`}>
                        {m.timbratura_aperta
                          ? "Non ha ancora timbrato l’uscita: scrivi tu le ore."
                          : (m.ore_timbrate ?? 0) > 0
                            ? diff?.fuori
                              ? `Ha timbrato ${oreInTesto(m.ore_timbrate!)}: hai scritto ${diff.minuti > 0 ? "più" : "meno"} di ${oreInTesto(Math.abs(diff.minuti) / 60)}.`
                              : `Ha timbrato ${oreInTesto(m.ore_timbrate!)}.`
                            : "Non ha timbrato: scrivi tu le ore."}
                      </p>
                    )}
                  </div>
                  );
                })}
              </div>
              );
            })()}

    </>
  );
  const bloccoFasi = (
    <>
            {/* ── Fasi lavorate (solo se la commessa ha fasi non completate) ── */}
            {fasiDichiarabili.length > 0 && (
              <div className="rounded-2xl border bg-background p-4 shadow-sm">
                <p className="text-sm font-semibold text-foreground">{workDay === today ? "Su cosa hai lavorato oggi?" : "Su cosa hai lavorato in questa giornata?"}</p>
                <p className="mb-3 text-xs text-muted-foreground">
                  {!ruoloCampo
                    ? "Ruolo Campo non ancora verificato. Puoi indicare le fasi lavorate; la modifica delle percentuali resta disabilitata."
                    : puoDichiararePercentuali
                    ? "Tocca le fasi e indica l'avanzamento raggiunto (facoltativo)"
                    : "Tocca le fasi su cui hai lavorato: servono ad attribuire le tue ore. L'avanzamento lo dichiara il capocantiere."}
                </p>
                <div className="flex flex-wrap gap-2">
                  {fasiDichiarabili.map(fase => {
                    const selected = fase.id in fasiDichiarate;
                    return (
                      <button
                        key={fase.id}
                        type="button"
                        onClick={() => toggleFase(fase)}
                        className={`rounded-full border px-3 py-2 text-sm transition-colors ${
                          selected
                            ? "border-primary bg-primary/10 font-semibold text-primary"
                            : "border-border bg-muted text-muted-foreground"
                        }`}
                      >
                        {fase.name}
                      </button>
                    );
                  })}
                </div>

                {puoDichiararePercentuali && fasiDichiarabili.filter(f => f.id in fasiDichiarate).map(fase => {
                  const sotto = sottofasiDi.get(fase.id) ?? [];
                  if (sotto.length > 0) {
                    return (
                      <SottofasiRapportino
                        key={fase.id}
                        nomeFase={fase.name}
                        sottofasi={sotto}
                        spunte={sottofasiSpunte}
                        onSpunta={(id, spuntata) =>
                          setSottofasiSpunte(prev => (spuntata ? [...new Set([...prev, id])] : prev.filter(x => x !== id)))
                        }
                        lavorate={sottofasiLavorate}
                        onLavorata={(id, si) =>
                          setSottofasiLavorate(prev => (si ? [...new Set([...prev, id])] : prev.filter(x => x !== id)))
                        }
                        quantitaDi={quantitaSottofasi.data}
                        avanzate={sottofasiAvanzate}
                        onAvanzata={(id, dato) => setSottofasiAvanzate(prev => {
                          const { [id]: _via, ...resto } = prev;
                          return dato ? { ...resto, [id]: dato } : resto;
                        })}
                      />
                    );
                  }
                  return (
                    <div key={fase.id} className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
                      <div className="mb-1 flex items-center justify-between">
                        <p className="min-w-0 truncate text-sm font-medium text-foreground">{fase.name}</p>
                        <span className="shrink-0 text-primary font-bold">{fasiDichiarate[fase.id]}%</span>
                      </div>
                      <input
                        type="range"
                        // L'avanzamento non scende da qui: chi deve correggerlo lo fa dalle fasi della commessa.
                        min={fase.percentuale}
                        max={100}
                        step={5}
                        value={fasiDichiarate[fase.id]}
                        onChange={e =>
                          setFasiDichiarate(prev => ({ ...prev, [fase.id]: Number(e.target.value) }))
                        }
                        className="w-full accent-primary"
                      />
                      <div className="mt-2 flex items-center justify-between gap-2">
                        {fase.percentuale > 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Avanzamento attuale: {fase.percentuale}%
                          </p>
                        ) : <span />}
                        <button
                          type="button"
                          onClick={() =>
                            setFasiDichiarate(prev => ({
                              ...prev,
                              [fase.id]: prev[fase.id] === 100 ? fase.percentuale : 100,
                            }))
                          }
                          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                            fasiDichiarate[fase.id] === 100
                              ? "border-green-500 bg-green-500/10 text-green-600"
                              : "border-border bg-muted text-muted-foreground"
                          }`}
                        >
                          {fasiDichiarate[fase.id] === 100 ? "✓ Fase completata" : "Segna completata"}
                        </button>
                      </div>
                    </div>
                  );
                })}

                {sceltaFasePerOgniCosa && fotoUrls.length > 0 && (
                  <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
                    <p className="text-sm font-medium text-foreground">Di quale fase sono le foto?</p>
                    <p className="mb-2 text-xs text-muted-foreground">Facoltativo: le foto senza scelta restano tra quelle generali del cantiere.</p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {fotoUrls.map((url, i) => (
                        <div key={url}>
                          <AnteprimaFotoCampo foto={anteprimeLocali[url] ?? url} etichetta={`foto ${i + 1}`} className="aspect-square h-auto" />
                          <UniformSelect aria-label={`Fase della foto ${i + 1}`}
                            value={fasiSelezionate.some(f => f.id === fotoFase[url]) ? fotoFase[url] : ""}
                            onChange={e => { const fase = e.target.value; setFotoFase(prev => { const next = { ...prev }; if (fase) next[url] = fase; else delete next[url]; return next; }); }}
                            className="mt-1 h-11 w-full min-w-0 rounded-lg border bg-background px-2 text-base">
                            <option value="">Nessuna fase</option>
                            {fasiSelezionate.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                          </UniformSelect>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

    </>
  );
  const bloccoMateriali = (
    <>
            {/* ── Materiali usati oggi (facoltativo) ── */}
            <div className="rounded-2xl border bg-background p-4 shadow-sm">
              <p className="text-sm font-semibold text-foreground">{workDay === today ? "Materiali usati oggi" : "Materiali usati nella giornata"}</p>
              <p className="mb-3 text-xs text-muted-foreground">
                Tocca i materiali usati e verifica quantità e unità (facoltativo). La dichiarazione non scarica automaticamente il magazzino.
              </p>
              {articoliLoading && <p role="status" className="text-sm text-muted-foreground">Caricamento materiali…</p>}
              {articoliError && <div role="alert" className="mb-3 rounded-xl border border-amber-200 p-3 text-sm">
                Non riesco a caricare gli articoli. I materiali già scelti restano nel rapportino.
                <button type="button" className="block min-h-11 text-primary underline" onClick={() => refetchArticoli()}>Riprova materiali</button>
              </div>}
              {materialiCommessa.length > 0 && <div className="flex flex-wrap gap-2">{materialiCommessa.map(renderMateriale)}</div>}
              {materialiConsegnati.length > 0 && <details className="mt-3 rounded-xl border p-3">
                <summary className="min-h-11 cursor-pointer text-sm font-semibold">Dal magazzino al cantiere ({materialiConsegnati.length})</summary>
                <p className="mb-3 text-xs text-muted-foreground">Materiali consegnati entro questa giornata. Scegli quelli usati e indica quantità e unità: il rapportino non crea un altro prelievo.</p>
                <div className="flex flex-wrap gap-2">{materialiConsegnati.map(renderMateriale)}</div>
              </details>}
              {delivered.isError && <div role="alert" className="mt-3 rounded-xl border border-amber-200 p-3 text-sm">
                Materiali consegnati non disponibili. Puoi usare gli articoli o aggiungere una voce libera; le scelte già fatte restano salvate nel modulo.
                <button type="button" className="block min-h-11 text-primary underline" onClick={() => delivered.refetch()}>Riprova consegne</button>
              </div>}
              {articoliDaVerificare.length > 0 && <details className="mt-3 rounded-xl border p-3">
                <summary className="min-h-11 cursor-pointer text-sm font-semibold">Articoli da verificare ({articoliDaVerificare.length})</summary>
                <p className="mb-3 text-xs text-muted-foreground">Queste voci non sono classificate. Seleziona solo materiali effettivamente usati; descrivi manodopera e servizi nelle lavorazioni.</p>
                <div className="flex flex-wrap gap-2">{articoliDaVerificare.map(renderMateriale)}</div>
              </details>}
              {prestazioniCommessa.length > 0 && <p className="mt-3 text-xs text-muted-foreground">
                {prestazioniCommessa.length} voci di manodopera o servizi escluse dai materiali: descrivile nelle lavorazioni.
              </p>}

              {Object.entries(materialiSel).map(([key, m]) => (
                <div key={key} className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 p-3">
                  <p className="w-full text-sm font-medium leading-tight text-foreground">{m.nome}</p>
                  {sceltaFasePerOgniCosa && (
                    <label className="flex w-full items-center gap-2 text-xs text-muted-foreground">
                      <span className="shrink-0">Fase</span>
                      <UniformSelect aria-label={`Fase di ${m.nome}`}
                        value={m.faseId && fasiSelezionate.some(f => f.id === m.faseId) ? m.faseId : ""}
                        onChange={e => setMaterialiSel(prev => ({ ...prev, [key]: { ...m, faseId: e.target.value || undefined } }))}
                        className="h-11 min-w-0 flex-1 rounded-lg border bg-background px-2 text-base text-foreground">
                        <option value="">Nessuna fase</option>
                        {fasiSelezionate.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </UniformSelect>
                    </label>
                  )}
                  <button
                    type="button"
                    aria-label={`Riduci quantità ${m.nome}`}
                    onClick={() =>
                      setMaterialiSel(prev => ({
                        ...prev,
                        [key]: { ...m, quantita: Math.max(0.01, m.quantita - 1) },
                      }))
                    }
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted"
                  >
                    <Minus className="w-4 h-4 text-foreground" />
                  </button>
                  <input type="number" min="0.01" step="any" inputMode="decimal"
                    aria-label={`Quantità ${m.nome}`} value={m.quantita}
                    onChange={e => setMaterialiSel(prev => ({ ...prev, [key]: { ...m, quantita: Number(e.target.value) } }))}
                    className="h-11 min-w-0 w-20 rounded-lg border bg-background px-2 text-center text-base" />
                  <UniformSelect aria-label={`Unità ${m.nome}`} value={m.unita || ""}
                    onChange={e => setMaterialiSel(prev => ({ ...prev, [key]: { ...m, unita: e.target.value } }))}
                    className="h-11 min-w-0 max-w-full rounded-lg border bg-background px-2 text-base">
                    <option value="" disabled>Scegli unità</option>
                    {rapportinoUnitOptions(m.unita).map(unit => <option key={unit} value={unit}>{unit}</option>)}
                  </UniformSelect>
                  {!m.unita && <p className="w-full text-xs text-amber-700">Unità non disponibile: scegli come hai misurato il materiale.</p>}
                  <button
                    type="button"
                    aria-label={`Aumenta quantità ${m.nome}`}
                    onClick={() =>
                      setMaterialiSel(prev => ({
                        ...prev,
                        [key]: { ...m, quantita: m.quantita + 1 },
                      }))
                    }
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary"
                  >
                    <Plus className="w-4 h-4 text-primary-foreground" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Rimuovi materiale ${m.nome}`}
                    onClick={() =>
                      setMaterialiSel(prev => {
                        const next = { ...prev };
                        delete next[key];
                        return next;
                      })
                    }
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-500/10"
                  >
                    <X className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              ))}

              <div className="mt-3 flex items-center gap-2">
                <input
                  type="text"
                  className="min-w-0 flex-1 rounded-xl border border-border bg-muted/60 px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="Altro materiale…"
                  value={materialeLibero}
                  onChange={e => setMaterialeLibero(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") aggiungiMaterialeLibero(); }}
                />
                <button
                  type="button"
                  onClick={aggiungiMaterialeLibero}
                  disabled={!materialeLibero.trim()}
                  className="flex h-11 shrink-0 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40"
                >
                  Aggiungi
                </button>
              </div>
            </div>

    </>
  );
  // Mezzi e attrezzi si spostano solo per oggi e ieri: per un giorno più vecchio non si chiede dove restano.
  const mezziAmmessi = workDay >= shiftWorkDay(campoWorkDay(), -1);
  const compilaArrivo = !lavoro_completato && (parti.mezzi || (daRifare && !!arrivo.mezzoId));
  const mezziPerArrivo = useMezziDellaGiornata(compilaArrivo && !!companyId && !!user?.id ? orderId : undefined);
  const bloccoMezzi = orderId && mezziAmmessi ? <MezziFineGiornata orderId={orderId} companyId={companyId ?? undefined} valori={mezziSel} onChange={setMezziSel} /> : null;
  const bloccoCampiFase = campiDiFase.length > 0 ? fasiPerCampi.map(f => (
    <div key={f.id} className="space-y-2 rounded-2xl border bg-background p-4 shadow-sm">
      <p className="text-sm font-semibold">{f.nome}</p>
      <CampiModulo campi={campiDiFase} phaseId={f.id} valori={campiValori} onChange={cambiaCampo} mostraErrori={erroriCampi} />
    </div>
  )) : null;
  const bloccoStraordinario = (
              <details open={oreStraordinario > 0 ? true : undefined} className={semplice ? "rounded-xl border bg-muted/30 p-3" : "border-t border-border pt-3"}>
                <summary className="min-h-11 cursor-pointer text-sm font-semibold">Straordinario · facoltativo{oreStraordinario > 0 ? ` · ${oreStraordinario}h` : ""}</summary>
                <p className="mb-2 text-xs text-muted-foreground">Sono ore aggiuntive: se incluse nelle ore rilevate, sottraile dalle ordinarie qui sopra.</p>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground">Ore straordinario</p>
                  <span className="text-primary font-bold">{oreStraordinario}h</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button" aria-label="Riduci ore straordinario"
                    onClick={() => setOreStraordinario(o => Math.max(0, o - 0.5))}
                    className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center"
                  >
                    <Minus className="w-4 h-4 text-foreground" />
                  </button>
                  <input
                    type="range"
                    aria-label="Ore straordinario"
                    min={0}
                    max={6}
                    step={0.5}
                    value={oreStraordinario}
                    onChange={e => setOreStraordinario(Number(e.target.value))}
                    className="flex-1 accent-primary"
                  />
                  <button
                    type="button" aria-label="Aumenta ore straordinario"
                    onClick={() => setOreStraordinario(o => Math.min(6, o + 0.5))}
                    className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center"
                  >
                    <Plus className="w-4 h-4 text-primary-foreground" />
                  </button>
                </div>
              </details>
  );
  // Chi fa la squadra dichiara le ore con le presenze: le sue ore personali compaiono solo se in cantiere non c'è nessuno da segnare.
  const mostraOrePersonali = !registraSquadra || (!squadraLoading && (squadra.length === 0 || Object.keys(presenzeSel).length === 0));
  // La proposta completa i campi disponibili senza sostituire ore, materiali o testo già inseriti.
  const puoSuggerireOre = !oreNonMie && mostraOrePersonali && oreRilevate == null && oreLavorate === "";
  const puoSuggerireMateriali = parti.materiali && Object.keys(materialiSel).length === 0;
  const applicaVocale = (proposta: PropostaRapportino) => {
    if (!puoCompilareAVoce) return;
    setDescrizione(testo => accodaTesto(testo, proposta.descrizione));
    if (puoSuggerireMateriali && proposta.materiali.length) setMaterialiSel(restoreRapportinoMaterials(proposta.materiali));
    if (puoSuggerireOre && proposta.ore !== null) modificaOre(proposta.ore);
    tornaAScrivere();
    toast.success("Proposta inserita. Controlla il rapportino prima di inviarlo.");
  };

  if (!verificaInCorso && !verificaFallita && !lavoro_completato && flusso.soloTimbratura && !daRifare) return (
    <section className="mx-auto max-w-lg space-y-4 rounded-2xl border bg-background p-4 shadow-sm">
      <h1 className="text-lg font-bold leading-snug">Il giornaliero lo compila il responsabile</h1>
      <RapportinoSiteContext orderId={orderId} companyId={companyId} />
      <p className="text-sm text-muted-foreground">Registra entrata e uscita. Puoi aggiungere foto e segnalazioni dalla scheda del cantiere.</p>
      <div className="space-y-2">
        <button type="button" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground" onClick={() => navigate(`/campo/timbratura?order_id=${orderId}`)}>
          <LogIn className="size-5" aria-hidden="true" /> Entrata e uscita
        </button>
        <button type="button" className="min-h-12 w-full rounded-xl border px-4 font-semibold" onClick={() => navigate(`/campo/lavoro/${orderId}`)}>Apri il cantiere</button>
      </div>
    </section>
  );

  const titoloRapportino = lavoro_completato ? "Collaudo col cliente" : registraSquadra ? "Rapportino di squadra" : soloOreAllOperaio ? "Rapportino ore" : "Rapportino giornaliero";
  const titoloPasso = step === 1 ? (parti.foto ? "Lavoro e foto" : "Dati della giornata") : step === 2 ? "Controlla i dati" : "Firma del cliente";
  const bloccaFoto = !fotoPronte || uploadingFoto || fotoAlCompleto || !dayAllowed || bloccatoDaEsistente;
  const presenzeIndicate = registraSquadra ? Object.keys(presenzeSel).length : 0;
  const riepilogoRapido = [
    presenzeIndicate ? `${presenzeIndicate} ${presenzeIndicate === 1 ? "presenza" : "presenze"}`
      : !confermaCliente && !oreNonMie && oreLavorate !== "" ? `${oreInTesto(oreLavorate)} ordinarie` : "",
    parti.foto && !soloOreAllOperaio && fotoUrls.length ? `${fotoUrls.length} ${fotoUrls.length === 1 ? "foto allegata" : "foto allegate"}` : "",
  ].filter(Boolean).join(" · ");
  const dettagliDaAggiungere = new Intl.ListFormat("it", { type: "conjunction" })
    .format(["la descrizione", ...(parti.foto ? ["le foto"] : []), ...(parti.materiali ? ["i materiali"] : [])]);

  if (inCoda && !modificaCoda) {
    const foto = inCoda.payload.campi.foto_urls?.length ?? 0;
    return (
      <section className="mx-auto max-w-2xl space-y-2 rounded-xl border bg-background p-4">
        <h1 className="text-lg font-bold">{inCoda.status === "failed" ? "Rapportino da verificare" : "Rapportino in coda"}</h1>
        <RapportinoSiteContext orderId={orderId} companyId={companyId} />
        <p role="status" className="text-sm text-muted-foreground">
          {dayLabel}{foto > 0 && " · " + foto + " foto"}
        </p>
        <p className="text-sm">{inCoda.status === "failed" ? inCoda.lastError
          : online ? "Il telefono sta inviando il rapportino e le foto." : "Il rapportino e le foto partono quando torna la rete."}</p>
        {inCoda.payload.campi.descrizione_lavori && <p className="whitespace-pre-wrap break-words rounded-xl bg-muted p-2.5 text-sm">{inCoda.payload.campi.descrizione_lavori}</p>}
        {!!fotoInCoda.length && <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-5" aria-label="Foto del rapportino in coda">
          {fotoInCoda.map(({ url, file }, i) => <li key={url}><AnteprimaFotoCampo foto={file} etichetta={`foto in coda ${i + 1}`} className="aspect-square h-auto" /></li>)}
        </ul>}
        <div className="flex flex-wrap gap-3">
          {inCoda.status === "failed" && inCoda.payload.bozzaCompilata && (
            <button type="button" disabled={!online || !fotoPronte || verificaCoda} className="min-h-11 font-semibold text-primary underline disabled:opacity-50"
              onClick={() => void correggiInvio(inCoda)}>{verificaCoda ? "Verifico l’invio…" : online ? "Correggi il rapportino" : "Correggi quando torna la rete"}</button>
          )}
          {inCoda.status === "failed" && (
            <button type="button" disabled={!online || verificaCoda} className="min-h-11 font-semibold text-primary underline disabled:opacity-50"
              onClick={() => void syncQueue.retryFailed(voce => voce.id === inCoda.id)
                .then(syncQueue.processQueue).catch(() => toast.error("Non riesco a riprovare l’invio."))}>Riprova invio</button>
          )}
          <button type="button" className="min-h-11 font-semibold text-primary underline"
            onClick={() => navigate("/campo/lavoro/" + orderId + "?tab=rapportini")}>Torna al cantiere</button>
        </div>
      </section>
    );
  }

  return (
    <div ref={inizioRapportino} className="mx-auto flex w-full max-w-3xl flex-col rounded-t-2xl bg-background pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-0">
      {/* Header */}
      <div className="flex items-start gap-3 rounded-t-2xl border-b border-border bg-background px-3 py-3 shadow-sm md:sticky md:top-0 md:z-10 md:px-4">
        <button type="button"
          onClick={goBack}
          aria-label="Indietro nel rapportino"
          disabled={saving || uploadingFoto}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-muted/60 disabled:opacity-50"
        >
          <ArrowLeft className="size-5 text-foreground" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold leading-tight text-foreground">{titoloRapportino}</h1>
          <RapportinoSiteContext orderId={orderId} companyId={companyId} />
          {totalSteps > 1 && <>
            <p className="mt-2 text-xs font-semibold text-muted-foreground">{step} di {totalSteps} · {titoloPasso}</p>
            <div role="progressbar" aria-label="Avanzamento del modulo" aria-valuemin={0} aria-valuemax={totalSteps} aria-valuenow={step}
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full origin-left rounded-full bg-primary motion-safe:transition-transform motion-safe:duration-200"
                style={{ transform: `scaleX(${step / totalSteps})` }} />
            </div>
          </>}
        </div>
      </div>

      {/* Contenuto — spacing denso su mobile (regola no-spazio-vuoto) */}
      <div className="space-y-3 px-3 py-3 md:space-y-4 md:px-4 md:py-5">
        {lavoro_completato && <p className="rounded-xl bg-primary/5 px-3 py-2 text-sm text-muted-foreground">Documento da mostrare al cliente prima della firma. Non è il normale riepilogo di fine giornata.</p>}
        {verificaInCorso && <p role="status" className="text-sm text-muted-foreground">Verifico cantiere e rapporti già inviati…</p>}
        {!ripresaDecisa && !daRifare && !bloccatoDaEsistente && <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
          <p role="status"><strong>Bozza sul telefono.</strong> Puoi riprendere il rapportino di questa giornata.</p>
          <div className="flex flex-wrap gap-x-3">
            <button type="button" className="min-h-11 rounded-xl bg-primary px-3 font-semibold text-primary-foreground" onClick={riprendiBozza}>Riprendi la bozza</button>
            <button type="button" className="min-h-11 font-semibold text-primary" onClick={() => {
              void Promise.resolve().then(() => del(chiaveBozza, fotoBozze)).then(() => {
                setFotoLocali({});
                setFotoUrls([]);
                bozza.clearDraft();
                setRipresaDecisa(true);
              }).catch(() => toast.error("Non riesco a svuotare la bozza sul telefono."));
            }}>Parti da un modulo vuoto</button>
          </div>
        </div>}
        {bozza.saveError && <p role="alert" className="text-sm text-destructive">{bozza.saveError}</p>}
        {ripresaDecisa && bozza.lastSaved && <p role="status" className="text-xs text-muted-foreground">Bozza salvata sul telefono · non ancora inviata all’ufficio{tipo === "client" ? ". La firma del cliente va raccolta di nuovo." : ""}</p>}
        {verificaFallita && <div role="alert" className="rounded-xl border border-destructive/30 p-3 text-sm">
          <p>Non riesco a verificare i rapporti o il tuo ruolo. I dati inseriti restano qui; l’invio è sospeso per evitare doppioni.</p>
          <button type="button" className="min-h-11 font-semibold text-primary underline" onClick={() => { void ricaricaRuolo(); void ricaricaEsistente(); void ricaricaRegole?.(); void protocollo.refetch?.(); }}>Riprova la verifica</button>
        </div>}
        {clienteNonConsentito && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">La conferma del cliente è gestita dal capocantiere. Per raccontare la tua giornata torna al rapportino giornaliero.</p>}
        {!lavoro_completato && flusso.soloTimbratura && !daRifare && <div role="status" className="space-y-2 rounded-xl border bg-muted/40 p-3 text-sm">
          <p>In questa azienda il giornaliero lo invia il responsabile. Tu registra entrata e uscita; puoi aggiungere foto e segnalare problemi dal cantiere.</p>
          <button type="button" className="min-h-11 text-primary underline" onClick={() => navigate(`/campo/lavoro/${orderId}`)}>Torna al cantiere</button>
        </div>}
        {!dayAllowed && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">{msgScadenza} I dati compilati restano visibili, ma non vengono spostati a oggi.</p>}
        {daRifare && <div role="status" className="space-y-1 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <p className="font-semibold">{rapportinoGiaOggi?.stato === "bozza" ? "Questo rapportino è rimasto in bozza" : "L’ufficio ha respinto questo rapportino"}</p>
          {rapportinoGiaOggi?.motivo_rifiuto?.trim() && <p>Motivo: {rapportinoGiaOggi.motivo_rifiuto.trim()}</p>}
          <p>È già compilato: correggi quello che serve e {rapportinoGiaOggi?.stato === "bozza" ? "invialo" : "rimandalo"}.</p>
        </div>}
        {bloccatoDaEsistente && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Esiste già un rapportino per questa giornata. Non ne viene creato un altro: per integrazioni o correzioni contatta l’ufficio.
          {lavoro_completato && !tipiSeparati && " Per separare i due documenti nello stesso giorno occorre aggiornare il database: non sostituiamo quello già inviato."}
        </p>}

        {/* ── Step 1: Descrizione ── */}
        <fieldset disabled={saving || (!ripresaDecisa && !daRifare)} className="min-w-0 space-y-3 border-0 p-0 md:space-y-4">
        {step === 1 && (
          <>
            <div className="flex items-center gap-2 rounded-xl border bg-muted/25 px-2.5 py-1.5">
              <label htmlFor="rapportino-giornata" className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-semibold">
                <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden="true" /> Giornata di lavoro
              </label>
              <UniformSelect id="rapportino-giornata" value={workDay} disabled={saving || uploadingFoto || vocaleVisibile}
                onChange={e => {
                  const avviso = "Cambiare giornata apre un altro modulo. La bozza e le foto restano sul telefono. Le firme vanno raccolte di nuovo. Continuare?";
                  if (datiInseriti && !window.confirm(avviso)) return;
                  const next = new URLSearchParams(params); next.set("data", e.target.value); setParams(next, { replace: true });
                }} className="h-11 w-[47%] min-w-0 rounded-lg border bg-background px-2 text-base md:text-sm">
                {!dayAllowed && <option value={workDay}>{dayLabel} — non inviabile</option>}
                {giorniSelezionabili.map((g) => (
                  <option key={g} value={g}>
                    {g === today ? "Oggi" : g === yesterday ? "Ieri" : format(new Date(`${g}T12:00:00`), "EEEE", { locale: it })} · {format(new Date(`${g}T12:00:00`), "dd/MM")}
                  </option>
                ))}
              </UniformSelect>
            </div>
            {/* La scadenza si dice solo quando conta: oggi per oggi non serve leggerla. */}
            {(daRifare || workDay !== today) && <p className="text-xs text-muted-foreground">{daRifare ? "Correzione richiesta dall’ufficio: puoi rimandarla anche dopo la scadenza originale." : dayAllowed ? ultimoGiornoInvio === today ? "Da inviare entro oggi alle 23:59." : ultimoGiornoInvio === shiftWorkDay(today, 1) ? "Da inviare entro domani alle 23:59." : `Da inviare entro il ${format(new Date(`${ultimoGiornoInvio}T12:00:00`), "dd/MM")} alle 23:59.` : "Giornata fuori termine."}</p>}
            <div className="space-y-2">
              <h2 className="text-base font-bold text-foreground md:text-xl">
                {lavoro_completato ? "Quali lavori conferma il cliente?" : soloOreAllOperaio
                  ? (workDay === today ? "Le tue ore di oggi" : "Le tue ore di questa giornata")
                  : (workDay === today ? "Cosa hai fatto oggi?" : "Cosa hai fatto in questa giornata?")}
              </h2>
              {puoCompilareAVoce && !vocaleVisibile && (
                <button type="button" disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 text-sm font-semibold text-primary motion-safe:transition-transform motion-safe:active:scale-[0.98]"
                  onClick={() => setVoceAperta(true)}>
                  <Mic className="size-4" aria-hidden="true" /> Compila parlando
                </button>
              )}
            </div>
            {vocaleVisibile && orderId && <RapportinoVoceInput
              orderId={orderId} workDay={workDay}
              proponiOre={puoSuggerireOre} proponiMateriali={puoSuggerireMateriali}
              onApply={applicaVocale} onClose={tornaAScrivere}
            />}
            {/* Con «ore_proprie» l'operaio manda solo le ore: il racconto, le foto
                e i materiali li scrive il capocantiere per tutto il cantiere. */}
            {soloOreAllOperaio ? (
              <p className="text-sm text-muted-foreground">Qui segni solo le tue ore. Il racconto del cantiere, le foto e i materiali li scrive il capocantiere.</p>
            ) : !vocaleVisibile && (
              <div className="space-y-2 rounded-2xl border border-primary/15 bg-background p-3 shadow-sm">
                <label htmlFor="rapportino-lavori" className="flex items-center gap-2 text-sm font-semibold">
                  <ClipboardPenLine className="size-4 text-primary" aria-hidden="true" /> Descrizione dei lavori
                </label>
                <textarea
                  ref={campoDescrizione}
                  id="rapportino-lavori"
                  aria-label={lavoro_completato ? "Lavori da confermare con il cliente" : "Lavori svolti nella giornata"}
                  className="block w-full resize-y rounded-xl border border-border bg-muted/35 px-3 py-2.5 text-base leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 md:text-sm"
                  rows={4}
                  placeholder={lavoro_completato ? "Descrivi i lavori conclusi e le note concordate." : "Es. Installati i telai delle finestre al primo piano."}
                  value={descrizione}
                  onChange={e => setDescrizione(e.target.value)}
                />
                {!bloccatoDaEsistente && <DettaTesto value={descrizione} onChange={setDescrizione} companyId={companyId} contesto="rapportino" campo="descrizione" etichetta="Descrizione dei lavori" disabled={saving || verificaInCorso || verificaFallita || !dayAllowed} />}
              </div>
            )}
            {!confermaCliente && registraSquadra && squadraLoading && <p role="status" className="text-sm text-muted-foreground">Carico chi c’era in cantiere…</p>}
            {!confermaCliente && registraSquadra && bloccoSquadra}
            {/* Il meteo non si sceglie: si compila da solo dalle previsioni del cantiere (vedi sopra). Se uno lo scrive nella descrizione va bene. */}
            {/* Ore del solo cantiere: proposta verificabile, mai 8 ore implicite. */}
            {confermaCliente ? <p className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">Ore e presenze si registrano nel giornaliero. Questa conferma non aggiunge altre ore e non le conta una seconda volta.</p> : oreNonMie ? (
              <div role="status" className="space-y-2 rounded-2xl border bg-background p-4 shadow-sm">
                <p className="text-sm font-semibold">Le tue ore le registra il capocantiere</p>
                <p className="text-xs text-muted-foreground">
                  {oreRegistrateDalCapo
                    ? `${oreGiaRegistrate?.da || "Il tuo capo"} ha già segnato le tue ore di questa giornata (${oreInTesto(Number(oreGiaRegistrate?.ore) || 0)}).`
                    : "Il capocantiere registra le ore della squadra."}{" "}
                  {soloOreAllOperaio ? "Puoi indicare eventuali ore aggiuntive." : `Qui puoi aggiungere ${dettagliDaAggiungere}.`}
                </p>
                <button type="button" className="min-h-11 text-sm text-primary underline" onClick={() => setOreMieForzate(true)}>
                  {oreRegistrateDalCapo
                    ? "Ho fatto altre ore, non comprese in queste"
                    : "Oggi il capocantiere non c’era? Scrivo io le mie ore"}
                </button>
              </div>
            ) : mostraOrePersonali ? (
            <div className="space-y-3 rounded-2xl border bg-background p-3 shadow-sm sm:p-4">
              <div>
                {oreRegistrateDalCapo && (
                  <p role="status" className="mb-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">
                    {oreGiaRegistrate?.da || "Il tuo capo"} ha già segnato {oreInTesto(Number(oreGiaRegistrate?.ore) || 0)} per te in questa giornata:
                    scrivi qui solo le ore in più, non quelle già segnate.
                  </p>
                )}
                <label htmlFor="ore-cantiere" className="text-sm font-semibold">Ore ordinarie su questo cantiere</label>
                <p id="rapportino-ore-aiuto" className="mt-1 text-xs text-muted-foreground">
                  {dayTime.isError ? "Timbrature non disponibili. Inserisci le ore effettive." :
                    anomalieTimbrature ? "Verifica le timbrature e indica le ore effettive." :
                    oreRilevate != null ? `Da timbrature, pause escluse: ${oreInTesto(oreRilevate)}.` :
                    soloOreAllOperaio ? "Indica le ore effettive." :
                    `Per registrare ${parti.foto ? "solo foto o note" : "solo una nota"}, indica 0 ore.`}
                </p>
                {dayTime.isError && <button type="button" className="mt-2 min-h-11 text-sm text-primary underline" onClick={() => dayTime.refetch()}>Riprova timbrature</button>}
                <div className="mt-3 flex items-center gap-3">
                  <button type="button" aria-label="Riduci ore ordinarie"
                    onClick={() => modificaOre(Math.max(0, Math.round(((oreLavorate === "" ? 0 : oreLavorate) - 0.5) * 10) / 10))}
                    className="h-11 w-11 shrink-0 rounded-xl bg-muted flex items-center justify-center">
                    <Minus className="w-4 h-4" />
                  </button>
                  <input ref={campoOre} id="ore-cantiere" type="number" min={0} max={24} step={0.1} inputMode="decimal"
                    aria-invalid={!!erroreOre && !registraSquadra}
                    aria-describedby={erroreOre ? "rapportino-ore-aiuto rapportino-ore-errore" : "rapportino-ore-aiuto"}
                    value={oreLavorate} placeholder="Da indicare"
                    onChange={e => modificaOre(e.target.value === "" ? "" : Number(e.target.value))}
                    className="h-12 w-full min-w-0 rounded-xl border bg-background px-2 text-center text-base font-semibold tabular-nums" />
                  <span className="text-sm text-muted-foreground">h</span>
                  <button type="button" aria-label="Aumenta ore ordinarie"
                    onClick={() => modificaOre(Math.min(24, Math.round(((oreLavorate === "" ? 0 : oreLavorate) + 0.5) * 10) / 10))}
                    className="h-11 w-11 shrink-0 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {!semplice && parti.straordinario && bloccoStraordinario}
            </div>
            ) : null}
            {erroreOre && <p id="rapportino-ore-errore" role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-2.5 text-sm text-destructive">{erroreOre}</p>}

            {!soloOreAllOperaio && parti.foto && (
            <section className="space-y-2 rounded-2xl border bg-background p-3 shadow-sm sm:p-4" aria-label="Foto del rapportino">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Foto cantiere</h3>
                <p className="text-xs tabular-nums text-muted-foreground">{fotoUrls.length}/{MAX_FOTO_PER_RAPPORTINO}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className={cn(
                  "flex min-h-12 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-primary/25 bg-primary/10 px-2 text-sm font-semibold text-primary focus-within:ring-2 focus-within:ring-primary",
                  bloccaFoto && "cursor-not-allowed opacity-60",
                )}>
                  <input type="file" aria-label="Scatta una foto" accept="image/*" capture="environment" className="sr-only"
                    onChange={handleFotoChange} disabled={bloccaFoto} />
                  <Camera className="size-5 shrink-0" aria-hidden="true" />{fotoUrls.length ? "Altra foto" : "Scatta foto"}
                </label>
                <label className={cn("flex min-h-12 cursor-pointer items-center justify-center gap-1.5 rounded-xl border px-2 text-sm font-semibold focus-within:ring-2 focus-within:ring-primary", bloccaFoto && "cursor-not-allowed opacity-60")}>
                  <input type="file" aria-label="Scegli foto dalla galleria" accept="image/*" multiple className="sr-only"
                    onChange={handleFotoChange} disabled={bloccaFoto} />
                  <Images className="size-4 shrink-0" aria-hidden="true" /> Galleria
                </label>
              </div>
              {uploadingFoto ? (
                <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />{fotoProgresso ?? "Caricamento in corso…"}
                </p>
              ) : fotoAlCompleto ? (
                <p className="text-xs text-muted-foreground">Limite raggiunto. Rimuovi una foto per aggiungerne un’altra.</p>
              ) : null}
              {fotoUrls.length > 0 && (
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {fotoUrls.map((url, i) => (
                    <li key={url} className="min-w-0">
                      <AnteprimaFotoCampo foto={anteprimeLocali[url] ?? url} etichetta={`foto ${i + 1}`} className="aspect-[4/3] h-auto" />
                      <button
                        type="button"
                        aria-label={`Togli la foto ${i + 1}`}
                        disabled={uploadingFoto}
                        onClick={() => void togliFoto(url)}
                        className="flex min-h-11 w-full items-center justify-center gap-1 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
                      >
                        <Trash2 className="size-3.5 shrink-0" aria-hidden="true" /> Rimuovi
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            )}

            {campiSulRapportino.length > 0 && (
              <div className="rounded-2xl border bg-background p-4 shadow-sm">
                <CampiModulo campi={campiSulRapportino} valori={campiValori} onChange={cambiaCampo} mostraErrori={erroriCampi} />
              </div>
            )}

            {compilaArrivo && <ArrivoRapportino valore={arrivo} onChange={setArrivo}
              mezzi={(mezziPerArrivo.data ?? []).filter(mezzoStradale)} caricamento={mezziPerArrivo.isLoading}
              errore={mezziPerArrivo.isError} riprova={() => void mezziPerArrivo.refetch()} />}

            {semplice && !soloOreAllOperaio && (parti.fasi || parti.materiali || parti.mezzi || (parti.straordinario && !oreNonMie) || (parti.avanzamento && puoDichiararePercentuali)) && (
              <details className="rounded-2xl border bg-background px-3 shadow-sm sm:px-4">
                <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Altro da segnalare (facoltativo)</summary>
                <div className="space-y-3 pb-3">
                  {!oreNonMie && parti.straordinario && bloccoStraordinario}
                  {parti.avanzamento && puoDichiararePercentuali && bloccoAvanzamento}
                  {parti.fasi && bloccoFasi}
                  {parti.materiali && bloccoMateriali}
                  {parti.mezzi && bloccoMezzi}
                </div>
              </details>
            )}
            {semplice && bloccoCampiFase}
            {/* «Ognuno le sue ore»: anche lo straordinario è un'ora propria. */}
            {semplice && soloOreAllOperaio && !oreNonMie && parti.straordinario && (
              <div className="rounded-2xl border bg-background p-4 shadow-sm">{bloccoStraordinario}</div>
            )}
          </>
        )}

        {/* ── Step 2 (a): fasi, squadra e materiali del cantiere ── */}
        {step === 2 && !semplice && (
          <>
            <h2 className="text-lg font-black text-foreground md:text-xl">Controlla prima di inviare</h2>
            {erroreOre && (
              <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-2.5 text-sm text-destructive">
                <p>{erroreOre}</p>
                <button type="button" onClick={goBack} className="min-h-11 font-semibold underline">Modifica ore e presenze</button>
              </div>
            )}
            {compilaArrivo && arrivo.mezzoId && <p className="text-sm text-muted-foreground">Arrivo dichiarato con {(mezziPerArrivo.data ?? []).find(m => m.id === arrivo.mezzoId)?.nome ?? "il mezzo selezionato"}{arrivo.km.trim() ? ` · ${arrivo.km} km all’andata` : ""}.</p>}
            {!confermaCliente && <>{(parti.avanzamento || parti.fasi) && <details className="rounded-2xl border p-3">
              <summary className="min-h-11 cursor-pointer text-sm font-semibold">{parti.fasi && parti.avanzamento ? "Lavorazioni e avanzamento" : parti.fasi ? "Lavorazioni" : "Avanzamento"}{Object.keys(fasiDichiarate).length > 0 ? ` · ${Object.keys(fasiDichiarate).length} selezionate` : ""}</summary>
              <div className="space-y-3">{parti.avanzamento && bloccoAvanzamento}{parti.fasi && bloccoFasi}</div>
            </details>}
            {bloccoCampiFase}
            {parti.materiali && <details className="rounded-2xl border p-3">
              <summary className="min-h-11 cursor-pointer text-sm font-semibold">Materiali usati · facoltativo{Object.keys(materialiSel).length > 0 ? ` · ${Object.keys(materialiSel).length}` : ""}</summary>
              {bloccoMateriali}
            </details>}
            {parti.mezzi && bloccoMezzi && <details className="rounded-2xl border p-3">
              <summary className="min-h-11 cursor-pointer text-sm font-semibold">Mezzi e attrezzi · facoltativo</summary>
              {bloccoMezzi}
            </details>}
            </>}
          </>
        )}

        {/* ── Step 2 (b): riepilogo, fine lavori e firma dell'autore ── */}
        {step === 2 && !semplice && (
          <>
            <h3 className="text-base font-black text-foreground">Riepilogo</h3>

            {/* Riepilogo a blocchi: la giornata, poi una scheda per ogni fase con i suoi materiali e le sue foto
                (le stesse schede del PDF), poi quello che non è legato a nessuna fase. */}
            <BloccoRiepilogo titolo="Giornata">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Data</span>
                <span className="text-foreground">{dayLabel}</span>
              </div>
              {!confermaCliente && <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Ore personali ordinarie</span>
                <span className="text-primary font-bold">{oreNonMie ? "Le registra il capocantiere" : oreLavorate === "" ? (Object.keys(presenzeSel).length ? "Vedi presenze squadra" : "Da indicare") : `${oreLavorate}h`}</span>
              </div>}
              {confermaCliente && <p className="text-xs text-muted-foreground">Conferma del cliente, senza nuove ore o presenze.</p>}
              {Object.keys(presenzeSel).length > 0 && (
                <div className="space-y-1 border-t border-border pt-2">
                  <p className="text-xs font-medium text-muted-foreground">Presenze squadra</p>
                  {squadra.filter(m => m.key in presenzeSel).map(m => (
                    <div key={m.key} className="flex items-start justify-between gap-3 text-sm">
                      <span className="min-w-0 break-words">{m.nome}{m.subappaltatore_id ? " · sub" : ""}</span>
                      <span className="shrink-0 font-semibold">{presenzeSel[m.key] === "" ? "Da indicare" : `${presenzeSel[m.key]} h`}</span>
                    </div>
                  ))}
                </div>
              )}
              {!confermaCliente && !oreNonMie && straordinarioDaInviare > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Ore straordinario</span>
                  <span className="text-primary font-bold">{oreInTesto(straordinarioDaInviare)}</span>
                </div>
              )}
              {!confermaCliente && parti.avanzamento && puoDichiararePercentuali && !fasiCommessa.length && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Avanzamento</span>
                  <span className="text-primary font-bold">{percentuale}%</span>
                </div>
              )}
            </BloccoRiepilogo>

            {fasiSelezionate.map(f => {
              const materialiFase = Object.values(materialiSel).filter(m => faseDiAppartenenza(m.faseId, idsFasiDichiarate) === f.id);
              const fotoFaseConto = fotoUrls.filter(u => faseDiAppartenenza(fotoFase[u], idsFasiDichiarate) === f.id).length;
              const finale = percentualiFinali.get(f.id) ?? fasiDichiarate[f.id];
              const esito = !puoDichiararePercentuali ? (workDay === today ? "lavorata oggi" : "lavorata nella giornata") : finale === 100 ? "✓ completata" : `→ ${finale}%`;
              return (
                <BloccoRiepilogo key={f.id} titolo={f.name} dettaglio={<span className="shrink-0 text-xs font-semibold text-primary">{esito}</span>}>
                  {materialiFase.length === 0 && fotoFaseConto === 0 && <p className="text-xs text-muted-foreground">Nessun materiale né foto legati a questa fase.</p>}
                  {materialiFase.map((m, i) => (
                    <p key={i} className="text-sm text-foreground">
                      {m.nome} <span className="font-semibold text-primary">× {m.quantita} {m.unita || "· unità da scegliere"}</span>
                    </p>
                  ))}
                  {fotoFaseConto > 0 && <p className="text-sm text-foreground">{fotoFaseConto} foto di questa fase</p>}
                </BloccoRiepilogo>
              );
            })}

            {(materialiGenerali.length > 0 || fotoGenerali > 0 || fasiSelezionate.length === 0) && (
              <BloccoRiepilogo titolo={fasiSelezionate.length ? "Altro" : "Foto e materiali"}>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Foto</span>
                  <span className="text-foreground">{fasiSelezionate.length ? fotoGenerali : fotoUrls.length} foto</span>
                </div>
                {materialiGenerali.length > 0 && (
                  <div className="border-t border-border pt-2">
                    <p className="mb-1 text-xs text-muted-foreground">Materiali usati</p>
                    {materialiGenerali.map((m, i) => (
                      <p key={i} className="text-sm text-foreground">
                        {m.nome} <span className="font-semibold text-primary">× {m.quantita} {m.unita || "· unità da scegliere"}</span>
                      </p>
                    ))}
                  </div>
                )}
              </BloccoRiepilogo>
            )}

            {valoriDaRivedere.length > 0 && (
              <BloccoRiepilogo titolo="Altre informazioni">
                {valoriDaRivedere.map(v => (
                  <div key={`${v.chiave}@${v.phase_id ?? ""}`} className="flex justify-between gap-3 text-sm">
                    <span className="min-w-0 text-muted-foreground">{v.etichetta}{v.fase_nome ? ` · ${v.fase_nome}` : ""}</span>
                    <span className="min-w-0 break-words text-right text-foreground">{valoreInTesto(v)}</span>
                  </div>
                ))}
              </BloccoRiepilogo>
            )}

            {descrizione && (
              <BloccoRiepilogo titolo="Descrizione">
                <p className="whitespace-pre-line text-sm text-foreground">{descrizione}</p>
              </BloccoRiepilogo>
            )}

            {/* Firma dell'autore su OGNI rapportino: finisce nel PDF generato
                all'invio. Facoltativa, ma il pad qui la rende un gesto solo. */}
            <details className="rounded-2xl border p-3">
              <summary className="min-h-11 cursor-pointer text-sm font-semibold">La tua firma · facoltativa{firmaOperaio ? " · aggiunta" : ""}</summary>
              <p className="mb-2 text-xs text-muted-foreground">Questa è la firma di chi compila, non del cliente.</p>
              <FirmaPad
                label={isCapocantiere ? "Firma del capocantiere (facoltativa)" : isCaposquadra ? "Firma del caposquadra (facoltativa)" : "Firma dell'operaio (facoltativa)"}
                onChange={setFirmaOperaio}
              />
            </details>
          </>
        )}

        {/* ── Step 3: Firma del cliente (solo fine lavori) ── */}
        {step === 3 && lavoro_completato && (
          <>
            <h2 className="text-lg font-black text-foreground md:text-xl">Firma del cliente</h2>
            <p className="text-sm text-muted-foreground">
              La firma conferma i lavori indicati. Non approva costi extra: il verbale formale con eventuali riserve si manda da firmare via email, dal tab Collaudo.
            </p>

            <BloccoRiepilogo titolo="Da mostrare al cliente">
              <p className="text-sm font-semibold">{dayLabel}</p>
              <p className="whitespace-pre-line text-sm">{descrizione}</p>
              <p className="text-xs text-muted-foreground">{fotoUrls.length} foto allegate · I dati completi sono nel PDF del rapporto.</p>
            </BloccoRiepilogo>

            <div className="rounded-2xl border border-border bg-background p-4 shadow-sm">
              <label htmlFor="firma-cliente-nome" className="mb-2 block text-sm font-semibold text-foreground">Nome e cognome del cliente</label>
              <input
                id="firma-cliente-nome"
                autoComplete="name"
                type="text"
                className="w-full rounded-xl border border-border bg-muted/60 px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Es: Mario Rossi"
                value={firmaClienteNome}
                onChange={e => setFirmaClienteNome(e.target.value)}
              />
            </div>

            <FirmaPad label="Firma del cliente" onChange={setFirmaCliente} />

            {firmeMancanti && (
              <p className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                Per inviare il collaudo servono la firma del cliente e il suo nome e cognome.
              </p>
            )}
          </>
        )}
        </fieldset>
      </div>

      {/* On mobile the actions stay at the viewport bottom, even when the
          outer page and main have different scroll heights. The pb-24 above
          keeps the last field visible; CampoLayout hides the app bottom nav. */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] md:sticky md:inset-x-auto md:z-20 md:px-4 md:pb-3">
        <div className="mb-1.5 flex min-w-0 items-center gap-2">
          <RapportinoSiteContext orderId={orderId} companyId={companyId} compatto />
          {riepilogoRapido && isUltimoStep && <p className="max-w-[40%] truncate text-xs text-muted-foreground" title={riepilogoRapido}>{riepilogoRapido}</p>}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={goBack}
            aria-label={step === 1 ? "Esci dal modulo" : "Passo precedente"}
            disabled={saving || uploadingFoto}
            className="bg-muted border border-border text-foreground font-semibold py-3.5 px-6 rounded-xl active:bg-muted transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={saving || uploadingFoto || vocaleVisibile || verificaInCorso || verificaFallita || clienteNonConsentito || (!lavoro_completato && flusso.soloTimbratura && !daRifare) || !dayAllowed || bloccatoDaEsistente || (!ripresaDecisa && !daRifare) || (lavoro_completato && !descrizione.trim()) || (isUltimoStep && (firmeMancanti || (lavoro_completato && !online)))}
            className="flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-2 py-2.5 text-center text-sm font-bold text-primary-foreground disabled:opacity-60 motion-safe:transition-transform motion-safe:active:scale-[0.98] sm:text-base"
          >
            {saving ? (
              <><Loader2 className="size-5 motion-safe:animate-spin" aria-hidden="true" /> Invio in corso…</>
            ) : isUltimoStep && !online ? (
              <><WifiOff className="size-4 shrink-0" aria-hidden="true" /> {lavoro_completato ? "Torna online per il collaudo" : "Metti il rapportino in coda"}</>
            ) : !isUltimoStep ? (
              <>
                Avanti
                <ChevronRight className="w-5 h-5" />
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                {lavoro_completato ? "Invia il collaudo" : daRifare ? "Rimanda il rapportino" : chiudeGiornata ? "Invia e chiudi la giornata" : "Invia rapportino"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
