/**
 * Dettaglio ordine/cantiere assegnato all'operaio o subappaltatore.
 * Verifica accesso tramite order_campo_assignments.
 */
import { readInvokeError } from "@/lib/readInvokeError";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { missingCampoDocument, CAMPO_DOCUMENT_REQUIRED } from "../../../supabase/functions/_shared/campoDocumentGuard";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { NoteCantiereCampo } from "@/components/campo/NoteCantiereCampo";
import { ChiLavoraCampo } from "@/components/campo/ChiLavoraCampo";
import { SottofasiContate } from "@/components/campo/SottofasiContate";
import { SOTTOFASI_NELLA_FASE, sottofasiDalleFasi, sottofasiPerFase, type Sottofase } from "@/lib/orders/sottofasi";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import {
  ArrowLeft, MapPin, Phone, Plus, AlertCircle,
  CheckCircle, Clock, Loader2, FileText, PenLine,
  Send, Download, FileCheck,
	  ClipboardSignature, ShieldCheck, Package, Wrench,
	  Camera, BookOpenCheck, MessageSquare, Navigation, LogIn, LogOut, ClipboardList, Receipt,
	} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ImgRiservata } from "@/components/common/ImgRiservata";
import { riferimentoFile } from "@/lib/storage/fileRiservati";
import { descriviStato, euro } from "@/lib/campo/acquisti";
import { useAcquistiCommessa } from "@/hooks/campo/useCampoAcquisti";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCommessaCampoSync } from "@/hooks/useCommessaCampoSync";
import { cn } from "@/lib/utils";
import { useOrderDiary } from "@/hooks/useOrderDiary";
import { useIsCampo } from "@/hooks/useIsCampo";
import { FirmaPad } from "@/components/campo/FirmaPad";
import { loadCampoAssignments } from "@/lib/campo/assignments";
import { notifyRapportinoPdf, openRapportinoPdf } from "@/lib/campo/rapportinoPdf";
import { prossimoPassoGiornata, type PassoGiornata } from "@/lib/campo/prossimoPassoGiornata";
import { campoDayWindow } from "@/lib/campo/timeSummary";
import { campoWorkDay } from "@/lib/campo/workDay";
import { rapportinoConsegnato, rapportinoDaRifare, statoRapportino } from "@/lib/campo/rapportinoStato";
import { RapportinoCardCampo } from "@/components/campo/RapportinoCardCampo";
import { campoReportUrl, isClientReport } from "@/lib/campo/reportKind";
import { useRegoleCampoOrdine } from "@/hooks/useRegoleCampo";
import { REGOLE_COME_OGGI, flussoPersona } from "@/lib/campo/regoleCampo";
import { useRapportinoProtocollo } from "@/hooks/campo/useRapportinoProtocollo";

// Un tab = una cosa sola. Rapportini = la giornata dell'operaio (interno).
// Collaudo = quello che si fa COL CLIENTE e chiede la sua firma (esterno).
type Tab = "descrizione" | "bolle" | "rapportini" | "collaudo" | "chat";

type CampoCustomer = {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
};

type CampoOrder = {
  id: string;
  order_code: string | null;
  description: string | null;
  status: string | null;
  indirizzo_lavori: string | null;
  percentuale_avanzamento: number | null;
  work_start_date: string | null;
  work_end_date: string | null;
  customer: CampoCustomer | null;
};

type CampoAssignment = {
  id: string;
  order_id?: string | null;
  role_type?: string | null;
  is_capocantiere?: boolean | null;
  order: CampoOrder;
};

type CampoOrderItem = {
  id: string;
  description: string | null;
  name: string | null;
  quantity: number | null;
};

type CampoRapportinoRow = {
  id: string;
  user_id?: string | null;
  data_lavoro: string;
  pdf_url?: string | null;
  firma_operaio_url?: string | null;
  ore_lavorate: number | null;
  descrizione_lavori: string | null;
  stato?: string | null;
  approvato?: boolean | null;
  motivo_rifiuto?: string | null;
  created_at?: string | null;
  foto_urls?: string[] | null;
  materiali_usati?: unknown;
  fasi_lavorate?: unknown;
  percentuale_avanzamento?: number | null;
  lavoro_completato?: boolean | null;
  firma_cliente_url?: string | null;
  firma_cliente_nome?: string | null;
};

type SignatureRequestRow = {
  id: string;
  status: string | null;
  tipo_documento: string | null;
  signer_name: string | null;
  signer_email: string | null;
  created_at: string;
  signed_at: string | null;
  certificato_url: string | null;
};

type FirmaDocumentoConfig = {
  tipo?: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  color: string;
};

type StoredCampoOrderContext = {
  order_code: string | null;
  description: string | null;
  indirizzo_lavori: string | null;
};

const campoOrderContextKey = (orderId: string) => `campo-order-context:${orderId}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readStoredCampoOrderContext(orderId: string | undefined): StoredCampoOrderContext | null {
  if (!orderId || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(campoOrderContextKey(orderId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    return {
      order_code: typeof parsed.order_code === "string" ? parsed.order_code : null,
      description: typeof parsed.description === "string" ? parsed.description : null,
      indirizzo_lavori: typeof parsed.indirizzo_lavori === "string" ? parsed.indirizzo_lavori : null,
    };
  } catch {
    return null;
  }
}

function writeStoredCampoOrderContext(orderId: string | undefined, context: StoredCampoOrderContext) {
  if (!orderId || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(campoOrderContextKey(orderId), JSON.stringify(context));
  } catch {
    // Non blocca il flusso campo: il contesto URL resta comunque sufficiente.
  }
}

function countCollection(value: unknown) {
  if (Array.isArray(value)) return value.length;
  if (isRecord(value)) return Object.keys(value).length;
  return 0;
}

// Tipi di documento disponibili per firma
const TIPI_DOCUMENTO: FirmaDocumentoConfig[] = [
  {
    tipo: "verbale_consegna",
    label: "Verbale di consegna",
    description: "Documento di consegna lavori al cliente",
    icon: Package,
    color: "text-blue-600 bg-blue-50",
  },
  {
    tipo: "collaudo_finale",
    label: "Collaudo fine lavori",
    description: "Verbale di collaudo e accettazione finale",
    icon: ShieldCheck,
    color: "text-green-600 bg-green-50",
  },
  {
    tipo: "accettazione_lavori",
    label: "Accettazione lavori",
    description: "Conferma accettazione dei lavori eseguiti",
    icon: FileCheck,
    color: "text-emerald-600 bg-emerald-50",
  },
  {
    tipo: "verbale_sopralluogo",
    label: "Verbale sopralluogo",
    description: "Documento con esito del sopralluogo tecnico",
    icon: ClipboardSignature,
    color: "text-violet-600 bg-violet-50",
  },
  {
    tipo: "presa_misure",
    label: "Presa misure",
    description: "Conferma misurazioni effettuate in cantiere",
    icon: Wrench,
    color: "text-amber-600 bg-amber-50",
  },
  {
    tipo: "altro",
    label: "Altro documento",
    description: "Documento generico da far firmare",
    icon: FileText,
    color: "text-slate-600 bg-slate-50",
  },
];

const STATO_FIRMA: Record<string, { label: string; cls: string; icon: LucideIcon }> = {
  pending:      { label: "In attesa di firma", cls: "bg-amber-100 text-amber-700", icon: Clock },
  otp_verified: { label: "OTP verificato",     cls: "bg-blue-100 text-blue-700",   icon: CheckCircle },
  signed:       { label: "Firmato",             cls: "bg-green-100 text-green-700", icon: CheckCircle },
  expired:      { label: "Scaduto",             cls: "bg-red-100 text-red-700",     icon: AlertCircle },
  cancelled:    { label: "Annullato",           cls: "bg-slate-100 text-slate-600", icon: AlertCircle },
};

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, fallback: T, onTimeout?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => { onTimeout?.(); resolve(fallback); }, timeoutMs);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

interface FaseMia {
  id: string;
  nome: string;
  dal: string | null;
  al: string | null;
  /** Ci sono io (persona o ditta sulla fase). */
  tu: boolean;
  /** La mia squadra, se la fa la mia squadra. */
  squadra: string | null;
}

/** «15 ott – 21 ott», «dal 15 ott», «fino al 21 ott». */
function periodoFase(f: Pick<FaseMia, "dal" | "al">): string {
  const g = (d: string) => format(parseISO(d), "d MMM", { locale: it });
  if (f.dal && f.al) return f.dal === f.al ? g(f.dal) : `${g(f.dal)} – ${g(f.al)}`;
  if (f.dal) return `dal ${g(f.dal)}`;
  return f.al ? `fino al ${g(f.al)}` : "";
}

export default function CampoLavoroDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, profile } = useAuth();
  const { isOperaio, isSubappaltatore } = useIsCampo();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const t = searchParams.get("tab");
    // I vecchi link (?tab=documenti, ?tab=rapportini&tipo=client) portano al Collaudo.
    if (t === "collaudo" || t === "documenti" || (t === "rapportini" && searchParams.get("tipo") === "client")) return "collaudo";
    if (t === "rapportini" || t === "bolle" || t === "chat") return t;
    return "descrizione";
  });
  // Il diario del cantiere si apre a richiesta: niente lettura finché non serve.
  const [diarioAperto, setDiarioAperto] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    // The previous tab's scroll offset must not hide the next tab's first actions
    // behind the sticky site header. Works with the mobile main and desktop page.
    const main = pageRef.current?.closest("main");
    if (main) main.scrollTop = 0;
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
  }, [activeTab, orderId]);
  const [assignmentTimedOut, setAssignmentTimedOut] = useState(false);
  const companyId = profile?.company_id ?? null;
  useCommessaCampoSync(orderId, companyId, !!user);
  const currentUserIds = Array.from(new Set([user?.id, profile?.id].filter((id): id is string => Boolean(id))));
  const currentUserId = currentUserIds[0] ?? null;
  const currentUserKey = currentUserIds.join("|");
  const fallbackOrderCode = searchParams.get("order_code");
  const fallbackOrderTitle = searchParams.get("order_title");
  const fallbackOrderAddress = searchParams.get("order_address");
  // Il giorno di lavoro segue l'ora italiana, non quella del telefono (come il rapportino e la timbratura).
  const today = campoWorkDay();

  // Verifica assegnazione — controlla order_campo_assignments e order_employees
  const { data: assignment, isLoading, isError, error } = useQuery<CampoAssignment | null>({
    queryKey: ["campo-lavoro", orderId, companyId, currentUserKey, fallbackOrderCode, fallbackOrderTitle, fallbackOrderAddress],
    queryFn: async () => {
      const orderSelect = `
        id, order_code, description, status,
        indirizzo_lavori,
        percentuale_avanzamento,
        work_start_date,
        work_end_date,
        customer:profiles!orders_customer_id_fkey(
          first_name, last_name, phone, email
        )
      `;

      const storedOrderContext = readStoredCampoOrderContext(orderId);
      const contextOrderCode = fallbackOrderCode ?? storedOrderContext?.order_code ?? null;
      const contextOrderTitle = fallbackOrderTitle ?? storedOrderContext?.description ?? null;
      const contextOrderAddress = fallbackOrderAddress ?? storedOrderContext?.indirizzo_lavori ?? null;

      if (fallbackOrderCode || fallbackOrderTitle || fallbackOrderAddress) {
        writeStoredCampoOrderContext(orderId, {
          order_code: fallbackOrderCode,
          description: fallbackOrderTitle,
          indirizzo_lavori: fallbackOrderAddress,
        });
      }

      // Su rete lenta (cantiere) i probe possono scadere: distinguiamo il
      // timeout dal "non assegnato" per non mostrare un falso negativo.
      let probeTimedOut = false;
      const flagTimeout = () => { probeTimedOut = true; };

      const directOrderPromise = withTimeout<{ data: CampoOrder | null; error: unknown }>(
        supabase
          .from("orders")
          .select(orderSelect)
          .eq("id", orderId!)
          .eq("company_id", companyId!)
          .maybeSingle(),
        6000,
        { data: null, error: null },
        flagTimeout,
      );

      if (currentUserIds.length === 0) {
        const { data: directOrder, error: directOrderErr } = await directOrderPromise;
        if (directOrderErr) throw directOrderErr;
        if (directOrder) {
          return {
            id: `direct-${orderId}`,
            order_id: orderId,
            role_type: "field",
            order: directOrder,
            is_capocantiere: false,
          };
        }
        return null;
      }

      const assignments = await withTimeout(
        loadCampoAssignments(currentUserId!, companyId!, { orderId, includeClosed: true }),
        6000,
        null,
        flagTimeout,
      );
      const resolved = assignments?.find(a => a.order_id === orderId);
      if (resolved) {
        const { data: orderData, error: orderError } = await directOrderPromise;
        if (orderError) throw orderError;
        return {
          id: resolved.id,
          order_id: resolved.order_id,
          role_type: resolved.sources.some(s => s.kind === "contract" || s.kind === "subcontractor_team") ? "subcontractor" : "field",
          is_capocantiere: resolved.is_capocantiere,
          order: orderData ?? { ...resolved.order, customer: null },
        } as CampoAssignment;
      }
      // 4. Ultima rete di sicurezza: se le RLS consentono la lettura diretta
      // dell'ordine, mostra il dettaglio invece di lasciare la pagina vuota.
      const { data: directOrder, error: directOrderErr } = await directOrderPromise;
      if (directOrderErr) throw directOrderErr;
      if (directOrder) {
        return {
          id: `direct-${orderId}`,
          order_id: orderId,
          role_type: "field",
          order: directOrder as CampoOrder,
          is_capocantiere: false,
        };
      }

      // Se qualche probe è scaduto non possiamo concludere "non assegnato":
      // errore → react-query riprova da solo invece del falso negativo.
      //
      // ⚠️ Rete di sicurezza SOLO qui, dopo i probe. Prima questo blocco stava
      // in cima alla queryFn: bastava un query param (e "Lavori" li passa
      // SEMPRE via campoLavoroUrl) per saltare del tutto il DB e renderizzare
      // un ordine sintetico — 0% avanzamento, stato "assegnato", date "non
      // impostato", cliente assente — anche quando i dati veri erano
      // perfettamente leggibili. Peggio: il contesto veniva riscritto in
      // sessionStorage e avvelenava anche l'apertura dalla Home.
      if (probeTimedOut) {
        if (contextOrderCode || contextOrderTitle || contextOrderAddress) {
          return {
            id: `context-${orderId}`,
            order_id: orderId,
            role_type: "field",
            is_capocantiere: false,
            order: {
              id: orderId,
              order_code: contextOrderCode ?? "Cantiere selezionato",
              description: contextOrderTitle ?? "Lavoro aperto dal calendario",
              status: "assegnato",
              indirizzo_lavori: contextOrderAddress,
              percentuale_avanzamento: 0,
              work_start_date: null,
              work_end_date: null,
              customer: null,
            },
          } satisfies CampoAssignment;
        }
        throw new Error("Connessione lenta: verifica assegnazione non completata");
      }

      // Tutti i probe vuoti SENZA timeout: prima di concludere "non assegnato"
      // verifica che le query siano davvero partite con una sessione autenticata.
      // Se il token non era ancora agganciato (boot auth), le RLS rispondono
      // vuoto per TUTTO → falso "Lavoro non disponibile" a operai assegnati.
      // Errore → react-query riprova, invece di cementare il falso negativo.
      const { data: sessionCheck } = await supabase.auth.getSession();
      if (!sessionCheck?.session) {
        throw new Error("Sessione non ancora pronta: verifica assegnazione da riprovare");
      }

      // Non assegnato — la UI mostra un fallback recuperabile.
      return null;
    },
    enabled: !!orderId && !!currentUserId && !!companyId,
    retry: 1,
    // Query-cancello: un "non assegnato" (null) in cache/persister non deve
    // essere riservito com'è — verifica sempre fresca al mount, altrimenti
    // un null stantio mostra "Lavoro non disponibile" a operai assegnati.
    staleTime: 0,
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (!isLoading) {
      let active = true;
      void Promise.resolve().then(() => { if (active) setAssignmentTimedOut(false); });
      return () => { active = false; };
    }
    const timer = setTimeout(() => setAssignmentTimedOut(true), 5000);
    return () => clearTimeout(timer);
  }, [isLoading, orderId]);

  // Articoli ordine
  const { data: orderItems = [] } = useQuery<CampoOrderItem[]>({
    queryKey: ["campo-order-items", orderId],
    queryFn: async () => {
      // S2-03: select chirurgico — UI usa id/description/name/quantity
      const { data, error } = await supabase
        .from("order_items")
        .select("id, description, name, quantity")
        .eq("order_id", orderId!);
      if (error) throw error;
      return (data ?? []) as CampoOrderItem[];
    },
    enabled: !!orderId && activeTab === "descrizione",
  });

  // Fasi di lavoro della commessa — stessa queryKey del wizard rapportino,
  // così l'invalidazione post-invio riallinea anche questa vista.
  const { data: fasiCommessa = [] } = useQuery({
    queryKey: ["campo-fasi-commessa", orderId],
    enabled: !!orderId && (activeTab === "descrizione" || activeTab === "rapportini"),
    staleTime: 60_000,
    queryFn: async (): Promise<{ id: string; name: string; status: string; percentuale: number }[]> => {
      // order_work_phases non è nei tipi generati → cast
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
        status: (p.status as string) ?? "da_iniziare",
        percentuale: Number(p.percentuale) || 0,
      }));
    },
  });

  // phase_id → nome, per i rapportini scritti prima che il nome entrasse nella voce della fase.
  const nomiFasi = useMemo(() => new Map(fasiCommessa.map((f) => [f.id, f.name] as const)), [fasiCommessa]);

  // Le sottofasi delle fasi di questo cantiere (sola lettura qui: si spuntano da «Avanzamento lavori» o dal rapportino).
  // Non hanno la commessa: si filtra per quella della loro fase. Se la lettura fallisce si va come sempre.
  const { data: sottofasiLavoro = [] } = useQuery({
    queryKey: ["campo-sottofasi", "lavoro", orderId],
    enabled: !!orderId && activeTab === "descrizione",
    staleTime: 60_000,
    retry: false,
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
  const sottofasiDi = useMemo(() => sottofasiPerFase(sottofasiLavoro), [sottofasiLavoro]);

  // Le date delle fasi e quali toccano a me (io o la mia squadra).
  const { data: mieFasi = [] } = useQuery({
    queryKey: ["campo-mie-fasi", orderId],
    enabled: !!orderId && activeTab === "descrizione",
    staleTime: 60_000,
    queryFn: async (): Promise<FaseMia[]> => {
      const { data, error } = await supabase.rpc("campo_mie_fasi", { p_order_id: orderId! });
      if (error) throw error;
      return (data ?? []) as unknown as FaseMia[];
    },
  });
  const faseMia = useMemo(() => new Map(mieFasi.map((f) => [f.id, f])), [mieFasi]);
  const quanteMie = mieFasi.filter((f) => f.tu || f.squadra).length;
  // La fase su cui si lavora ADESSO: la prima in corso, se no la prima non finita.
  const faseAttuale = fasiCommessa.find((f) => f.status === "in_corso") ?? fasiCommessa.find((f) => f.status !== "completata");
  const faseAttualePct = faseAttuale ? (faseAttuale.status === "completata" ? 100 : faseAttuale.percentuale) : 0;

  // Rapportini dell'utente su questo ordine
  const { data: rapportini = [], isLoading: rapportiniLoading, isError: rapportiniError, refetch: ricaricaRapportini } = useQuery<CampoRapportinoRow[]>({
    queryKey: ["campo-rapportini-ordine", orderId, currentUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campo_rapportini")
        .select("*")
        .eq("order_id", orderId!)
        .eq("user_id", currentUserId!)
        .order("data_lavoro", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CampoRapportinoRow[];
    },
    enabled: !!orderId && !!currentUserId && (activeTab === "rapportini" || activeTab === "collaudo"),
  });
  // Due elenchi che non si mescolano: i giornalieri nel tab Rapportini,
  // i rapporti firmati dal cliente nel tab Collaudo.
  const giornalieri = rapportini.filter(r => !isClientReport(r));
  // I collaudi sono della commessa, non della persona: chi li può leggere (ufficio, capocantiere)
  // li vede tutti; firma e correzione restano sui propri.
  const { data: collaudiCommessa = [], isLoading: collaudiLoading, isError: collaudiError, refetch: ricaricaCollaudi } = useQuery<CampoRapportinoRow[]>({
    queryKey: ["campo-rapportini-ordine", orderId, "collaudi"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campo_rapportini")
        .select("*")
        .eq("order_id", orderId!)
        .or("lavoro_completato.eq.true,firma_cliente_url.not.is.null")
        .order("data_lavoro", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as CampoRapportinoRow[];
    },
    enabled: !!orderId && !!currentUserId && activeTab === "collaudo",
  });
  const rapportiCliente = collaudiCommessa.filter(isClientReport);
  const { data: ruoloRapporti, isLoading: ruoloRapportiLoading, isError: ruoloRapportiError, refetch: ricaricaRuoloRapporti } = useQuery({
    queryKey: ["campo-ruolo", orderId, user?.id],
    enabled: !!orderId && !!user?.id && !!companyId,
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("campo_mio_ruolo", { p_order_id: orderId! });
      if (error) throw error;
      const r = (data ?? {}) as { capocantiere?: boolean; esiste_capo?: boolean; caposquadra?: boolean };
      return { isCapocantiere: !!r.capocantiere, esisteCapo: !!r.esiste_capo, isCaposquadra: !!r.caposquadra };
    },
  });
  const puoCompilareCliente = !!ruoloRapporti && (ruoloRapporti.isCapocantiere || !ruoloRapporti.esisteCapo);
  const regoleRapporti = useRegoleCampoOrdine(orderId);
  const protocolloRapporti = useRapportinoProtocollo(companyId ?? null, user?.id);

  // ── Firma del rapportino a posteriori + PDF ────────────────────────────
  // All'invio il PDF viene generato da solo; da qui l'operaio/capocantiere
  // può firmare un rapportino non ancora firmato (il PDF viene rigenerato
  // con la firma dentro) e aprire il PDF.
  const [firmaRapportinoId, setFirmaRapportinoId] = useState<string | null>(null);
  const [firmaDataUrl, setFirmaDataUrl] = useState<string | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);

  const firmaRapportinoMutation = useMutation({
    mutationFn: async ({ rapportinoId, dataUrl }: { rapportinoId: string; dataUrl: string }) => {
      if (!companyId || !orderId || !currentUserId) throw new Error("Sessione non pronta: riprova.");
      const report = rapportini.find(r => r.id === rapportinoId);
      if (!report || rapportinoDaRifare(statoRapportino(report))) throw new Error("Il rapporto va prima completato o corretto.");
      const blob = await (await fetch(dataUrl)).blob();
      const path = `${companyId}/${orderId}/firme/${crypto.randomUUID()}_operaio.png`;
      const { data: up, error: upErr } = await supabase.storage
        .from("campo-rapportini")
        .upload(path, blob, { contentType: "image/png", upsert: false });
      if (upErr || !up?.path) throw upErr ?? new Error("Upload firma non riuscito");
      const { data: urlData } = supabase.storage.from("campo-rapportini").getPublicUrl(up.path);
      const { data: firmato, error: updErr } = await supabase
        .from("campo_rapportini")
        .update({ firma_operaio_url: urlData.publicUrl, pdf_url: null })
        .eq("id", rapportinoId)
        .eq("company_id", companyId)
        .eq("order_id", orderId)
        .eq("user_id", currentUserId)
        .select("id")
        .maybeSingle();
      if (updErr) throw updErr;
      if (!firmato) throw new Error("Firma non salvata: il rapporto non è più disponibile. Ricarica e riprova.");
      // Invalidate the old export immediately; regenerate with visible feedback.
      if (orderId) void notifyRapportinoPdf(rapportinoId, orderId, queryClient);
    },
    onSuccess: () => {
      toast.success("Rapportino firmato");
      setFirmaRapportinoId(null);
      setFirmaDataUrl(null);
      queryClient.invalidateQueries({ queryKey: ["campo-rapportini-ordine", orderId] });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Non riesco a salvare la firma"),
  });

  const apriPdfRapportino = async (r: CampoRapportinoRow) => {
    setPdfBusyId(r.id);
    try {
      await openRapportinoPdf(r, orderId!, queryClient);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Non riesco a generare il PDF");
    } finally {
      setPdfBusyId(null);
    }
  };

  const { data: timbratureLavoroOggi = [] } = useQuery({
    queryKey: ["campo-lavoro-timbrature-oggi", companyId, orderId, currentUserId, today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campo_timbrature")
        .select("id, tipo, timestamp_evento, order_id")
        .eq("company_id", companyId!)
        .eq("order_id", orderId!)
        .eq("user_id", currentUserId!)
        // Mezzanotte di Roma, non del database (UTC): le timbrature fra le 00 e le 02 stavano nel giorno sbagliato.
        .gte("timestamp_evento", campoDayWindow(today).start.toISOString())
        .lt("timestamp_evento", campoDayWindow(today).end.toISOString())
        .order("timestamp_evento", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId && !!orderId && !!currentUserId,
    staleTime: 30_000,
  });

  const { data: rapportinoOggi } = useQuery({
    queryKey: ["campo-lavoro-rapportino-oggi", orderId, currentUserId, today],
    queryFn: async () => {
      // Più rapportini nello stesso giorno sono legittimi (correzioni, due
      // turni): maybeSingle() esplodeva con PGRST116 e la card giornata
      // tornava a dire "Rapportino: Manca". Prendiamo l'ultimo.
      const { data, error } = await supabase
        .from("campo_rapportini")
        .select("id, stato, created_at, ore_lavorate, descrizione_lavori, foto_urls, materiali_usati, percentuale_avanzamento, lavoro_completato")
        .eq("order_id", orderId!)
        .eq("user_id", currentUserId!)
        .eq("data_lavoro", today)
        // Il giornaliero, non il collaudo col cliente: sono due righe diverse dello stesso giorno.
        .not("lavoro_completato", "is", true)
        .is("firma_cliente_url", null)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    enabled: !!orderId && !!currentUserId,
    staleTime: 30_000,
  });

  if (isLoading && !assignmentTimedOut) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isLoading && assignmentTimedOut) {
    return (
      <div className="flex h-full min-h-[420px] flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="mb-3 h-10 w-10 text-amber-600" />
        <p className="font-semibold text-foreground">Caricamento cantiere lento</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          La verifica dell'assegnazione sta impiegando troppo. Puoi riprovare o aprire l'elenco lavori senza restare bloccato.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              setAssignmentTimedOut(false);
              queryClient.invalidateQueries({ queryKey: ["campo-lavoro", orderId] });
            }}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Riprova
          </button>
          <button
            onClick={() => navigate("/campo/calendario")}
            className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground"
          >
            Apri lavori
          </button>
        </div>
      </div>
    );
  }

  // Errore di rete/RLS → mostra fallback visibile invece di pagina bianca
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] p-6 text-center">
        <AlertCircle className="w-10 h-10 text-destructive mb-3" />
        <p className="font-semibold text-foreground">Impossibile caricare il lavoro</p>
        <p className="text-sm text-muted-foreground mt-1 mb-4 max-w-xs">
          {error instanceof Error ? error.message : "Errore di connessione"}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ["campo-lavoro", orderId] })}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
          >
            Riprova
          </button>
          <button
            onClick={() => navigate("/campo")}
            className="px-4 py-2 rounded-xl border border-border text-sm font-medium"
          >
            Torna indietro
          </button>
        </div>
      </div>
    );
  }

  if (!assignment || !assignment.order) {
    return (
      <div className="flex h-full min-h-[420px] flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="mb-3 h-10 w-10 text-muted-foreground" />
        <p className="font-semibold text-foreground">Lavoro non disponibile</p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          Non ho trovato un'assegnazione attiva per questo cantiere. Torna ai lavori e riapri quello assegnato.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ["campo-lavoro", orderId] })}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Riprova
          </button>
          <button
            onClick={() => navigate("/campo/calendario")}
            className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground"
          >
            Apri lavori
          </button>
        </div>
      </div>
    );
  }

  const order = assignment.order;
  const customer = order?.customer;
	  const lastTimbro = timbratureLavoroOggi[timbratureLavoroOggi.length - 1];
	  const hasTimbratoQui = timbratureLavoroOggi.length > 0;
	  const isInCantiere = lastTimbro?.tipo === "entrata" || lastTimbro?.tipo === "pausa_fine";
	  const isInPausa = lastTimbro?.tipo === "pausa_inizio";
	  const uscitaRegistrataOggi = lastTimbro?.tipo === "uscita";
	  // Lo stato vero del rapportino di oggi: uno respinto o rimasto in bozza NON è consegnato.
	  const statoRapportinoOggi = statoRapportino(rapportinoOggi);
	  const rapportinoInviatoOggi = rapportinoConsegnato(statoRapportinoOggi);
	  const fotoCountOggi = countCollection(rapportinoOggi?.foto_urls);
	  const materialiCountOggi = countCollection(rapportinoOggi?.materiali_usati);
  const orderContextParams = new URLSearchParams();
  if (orderId) orderContextParams.set("order_id", orderId);
  if (order?.order_code) orderContextParams.set("order_code", order.order_code);
  if (order?.description) orderContextParams.set("order_title", order.description);
  if (order?.indirizzo_lavori) orderContextParams.set("order_address", order.indirizzo_lavori);
  const orderContextQuery = orderContextParams.toString();
  const withOrderContext = (path: string) => `${path}${orderContextQuery ? `?${orderContextQuery}` : ""}`;
  const timbraturaUrl = withOrderContext("/campo/timbratura");
  const rapportinoManualeUrl = withOrderContext(`/campo/lavoro/${orderId}/rapportino`);
  const rapportinoVocaleUrl = withOrderContext(`/campo/lavoro/${orderId}/rapportino-vocale`);
  const soloTimbratura = flussoPersona(regoleRapporti.data ?? REGOLE_COME_OGGI, ruoloRapporti ?? {}, isSubappaltatore).soloTimbratura && !rapportinoDaRifare(statoRapportinoOggi);
  // `data` apre il rapportino di quel giorno: se era respinto o in bozza si riapre già compilato.
  const rapportinoDelGiornoUrl = (giorno: string) => {
    const params = new URLSearchParams(orderContextQuery);
    params.set("data", giorno);
    return `/campo/lavoro/${orderId}/rapportino?${params.toString()}`;
  };
  // La timbratura è un flusso da OPERAIO: il subappaltatore non ce l'ha né in
  // sidebar né nelle azioni rapide (CampoLayout subItems / AccesaoRapido), così
  // `hasTimbratoQui` restava false per sempre e il CTA principale del lavoro
  // era bloccato su "Timbra entrata" → una pagina fuori dalla sua navigazione.
  // Per il sub basta il rapportino; non c'è check-in sicurezza.
  // La TIMBRATURA NON è un prerequisito del rapportino: capita spesso di
  // scordarsela e il lavoro va comunque documentato. Prima il CTA restava
  // inchiodato su "Timbra entrata" e senza quella non si arrivava mai al
  // resto. Ora l'ordine segue il lavoro (rapportino) e la
  // timbratura resta un passo consigliato, raggiungibile dalla card.
  // Il rapportino di oggi, aperto per correggerlo se era stato respinto o lasciato in bozza.
  const rapportinoDiOggiUrl = rapportinoDelGiornoUrl(today);
  const passiGiornata: Record<PassoGiornata, { label: string; icon: LucideIcon; onClick: () => void; tone: "primary" | "success" }> = {
    "rapportino-vocale": { label: "Scrivi il rapportino", icon: ClipboardList, onClick: () => navigate(rapportinoManualeUrl), tone: "primary" },
    "correggi-rapportino": { label: "Correggi il rapportino", icon: ClipboardList, onClick: () => navigate(rapportinoDiOggiUrl), tone: "primary" },
    "completa-rapportino": { label: "Completa il rapportino", icon: ClipboardList, onClick: () => navigate(rapportinoDiOggiUrl), tone: "primary" },
    "timbra-entrata": { label: "Timbra entrata", icon: LogIn, onClick: () => navigate(timbraturaUrl), tone: "success" },
    "timbra-uscita": { label: "Timbra uscita", icon: LogOut, onClick: () => navigate(timbraturaUrl), tone: "success" },
    "torna-ai-lavori": { label: "Torna ai lavori", icon: CheckCircle, onClick: () => navigate("/campo/calendario"), tone: "primary" },
  };
  const nextStickyAction = passiGiornata[prossimoPassoGiornata({
    statoRapportino: statoRapportinoOggi,
    isOperaio,
    hasTimbrato: hasTimbratoQui,
    uscitaRegistrata: uscitaRegistrataOggi,
    compilaGiornaliero: !soloTimbratura,
  })];
  const NextStickyIcon = nextStickyAction.icon;
  const tabs: { key: Tab; label: string }[] = [
    { key: "descrizione", label: "Info" },
    { key: "bolle",       label: "Bolle" },
    { key: "rapportini",  label: "Rapportini" },
    { key: "collaudo",    label: "Collaudo" },
    { key: "chat",        label: "Chat" },
  ];

  // Niente h-full + scroll interno: il <main> della shell è l'unico scroller.
  // Con il doppio scroller il main scorreva del suo padding (pb-28) mostrando
  // una striscia bianca sotto la pagina e il gesto non raggiungeva mai il
  // blocco interno.
  return (
    <div ref={pageRef} className="mx-auto flex max-w-6xl flex-col">
      {/* Header sticky */}
      {/* -top-3 compensa il padding-top del <main>: lo sticky si aggancia
          sotto il padding del contenitore scrollante, lasciando una striscia
          in cui traspare il contenuto. Su md scrolla il documento: top-14. */}
      <div className="sticky -top-3 z-10 rounded-b-2xl border-b border-border bg-background px-3 py-3 shadow-sm md:top-14 md:px-4 md:py-4">
        <div className="mb-2 flex items-center gap-3 md:mb-3">
          <button
            onClick={() => navigate("/campo")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted active:bg-muted max-md:hidden"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lavoro assegnato</p>
            <p className="truncate text-lg font-black text-foreground md:text-xl">{order?.order_code}</p>
            <p className="truncate text-xs text-muted-foreground md:text-sm">{order?.description}</p>
          </div>
        </div>

        {/* Avanzamento compatto: una riga sottile invece della card grande */}
        {activeTab === "descrizione" && <>
        <div className="rounded-xl bg-primary/10 px-3 py-2 text-primary md:rounded-2xl md:p-3">
          <div className="flex items-center gap-2.5">
            <span className="text-lg font-black leading-none md:text-2xl">{order?.percentuale_avanzamento ?? 0}%</span>
            <div className="h-2 min-w-0 flex-1 rounded-full bg-primary/15">
              <div
                className="h-2 rounded-full bg-primary transition-all"
                style={{ width: `${order?.percentuale_avanzamento ?? 0}%` }}
              />
            </div>
            <span className="shrink-0 text-xs font-semibold">{statoLeggibile(order?.status)}</span>
          </div>
        </div>

        {/* Indirizzo: una riga tappabile che apre Maps (niente card doppia) */}
        {order?.indirizzo_lavori && (
          <button
            onClick={() => window.open(
              `https://maps.google.com/?q=${encodeURIComponent(order.indirizzo_lavori)}`,
              "_blank"
            )}
            className="mt-2 flex w-full items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-left active:bg-muted md:rounded-2xl"
          >
            <MapPin className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-primary md:text-sm">{order.indirizzo_lavori}</span>
            <Navigation className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        )}

        <div className="mt-2 grid grid-cols-3 gap-1.5 md:mt-3 md:gap-2">
          {/* Le foto hanno casa loro: si scattano durante il lavoro, non la
              sera dentro al rapportino (dove la galleria è irraggiungibile). */}
          {/* Bolla: parte da QUI (cantiere già impostato), non più dal menu "App".
              Giornaliero resta nella card "Chiudi giornata" e nella barra sticky. */}
          <QuickAction icon={Receipt} label="Bolla" onClick={() => navigate(`/campo/merce?order=${orderId}`)} />
          <QuickAction icon={Camera} label="Foto" onClick={() => navigate(`/campo/lavoro/${orderId}/foto`)} />
          <QuickAction icon={AlertCircle} label="Ticket" onClick={() => navigate(`/campo/ticket/nuovo/${orderId}`)} />
        </div>
        </>}

        {/* Tab selector */}
        <div className="mt-2 flex gap-1 overflow-x-auto scrollbar-hide md:mt-3">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              aria-pressed={activeTab === key}
              onClick={() => setActiveTab(key)}
              className={cn(
                "whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
                activeTab === key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground active:bg-muted"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenuto tab */}
      <div className="space-y-3 px-3 py-3 md:space-y-4 md:px-4 md:py-4">
        {/* Le istruzioni dell'ufficio vengono prima di tutto: si leggono entrando. */}
        {orderId && <NoteCantiereCampo orderId={orderId} />}
        {/* La giornata (timbra → rapportino → uscita) ha UN solo bottone: la barra in
            basso, che dice sempre il passo successivo. Niente scheda che la ripete. */}

        {/* ── Tab: Descrizione ── */}
        {activeTab === "descrizione" && (
          <>
            {/* Le date in una riga: lo stato è già nell'intestazione, non serve ripeterlo. */}
            {(order?.work_start_date || order?.work_end_date) && (
              <p className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
                <Clock className="h-4 w-4 shrink-0" />
                <span>
                  {order?.work_start_date ? `Dal ${format(new Date(order.work_start_date), "d MMM", { locale: it })}` : "Inizio da fissare"}
                  {" · "}
                  {order?.work_end_date ? `fine prevista ${format(new Date(order.work_end_date), "d MMM yyyy", { locale: it })}` : "fine da fissare"}
                </span>
              </p>
            )}

            {/* Con chi lavori: squadra, caposquadra, capocantiere */}
            {orderId && <ChiLavoraCampo orderId={orderId} />}

            {/* Fasi di lavoro della commessa */}
            {fasiCommessa.length > 0 && (
              <div className="bg-background border border-border rounded-2xl p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Fasi di lavoro</p>
                    {quanteMie > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {quanteMie === 1 ? "Quella colorata è la tua" : `Le ${quanteMie} colorate sono le tue`}
                      </p>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-primary">
                    {fasiCommessa.filter(f => f.status === "completata").length}/{fasiCommessa.length} completate
                  </span>
                </div>
                {/* Fase attuale: la cosa che conta messa in cima, non annegata tra 8 blocchi uguali. */}
                {faseAttuale && (
                  <div className="mb-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-primary">Fase attuale</p>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-base font-bold text-foreground">{faseAttuale.name}</p>
                      <span className="shrink-0 text-sm font-black text-primary">{faseAttualePct}%</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${faseAttualePct}%` }} />
                    </div>
                    <div className="mt-1.5"><SottofasiContate sottofasi={sottofasiDi.get(faseAttuale.id) ?? []} /></div>
                  </div>
                )}
                <details className="group">
                  <summary className="min-h-9 cursor-pointer text-xs font-semibold text-primary">Vedi tutte le fasi</summary>
                <div className="mt-3 space-y-3">
                  {fasiCommessa.map((fase) => {
                    const done = fase.status === "completata";
                    const pct = done ? 100 : fase.percentuale;
                    const mia = faseMia.get(fase.id);
                    const miaDavvero = !!mia && (mia.tu || !!mia.squadra);
                    return (
                      <div
                        key={fase.id}
                        className={miaDavvero ? "-mx-2 rounded-xl border border-violet-200 bg-violet-50/70 px-2 py-2 dark:border-violet-900 dark:bg-violet-950/30" : undefined}
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            {done ? (
                              <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
                            ) : (
                              <span
                                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                                  fase.status === "in_corso" ? "bg-primary" : "bg-border"
                                }`}
                              />
                            )}
                            <div className="min-w-0">
                              <p className={`min-w-0 truncate text-sm ${done ? "text-muted-foreground line-through" : "font-medium text-foreground"}`}>
                                {fase.name}
                              </p>
                              {(mia?.dal || mia?.al || miaDavvero) && (
                                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                                  {(mia?.dal || mia?.al) && <span className="tabular-nums">{periodoFase(mia!)}</span>}
                                  {mia?.tu && <span className="font-semibold text-violet-700 dark:text-violet-300">Tu</span>}
                                  {mia?.squadra && <span className="font-semibold text-orange-700 dark:text-orange-300">{mia.squadra}</span>}
                                </p>
                              )}
                            </div>
                          </div>
                          <span className={`shrink-0 text-xs font-bold ${done ? "text-green-600" : "text-primary"}`}>
                            {pct}%
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted">
                          <div
                            className={`h-1.5 rounded-full transition-all ${done ? "bg-green-500" : "bg-primary"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <SottofasiContate sottofasi={sottofasiDi.get(fase.id) ?? []} />
                      </div>
                    );
                  })}
                </div>
                </details>
                <p className="mt-3 text-xs text-muted-foreground">
                  Aggiorna le fasi dal rapportino di fine giornata.
                </p>
              </div>
            )}

            {/* Card cliente */}
            {customer && (
              <div className="bg-background border border-border rounded-2xl p-4 shadow-sm">
                <p className="text-xs text-muted-foreground mb-1">Cliente</p>
                <p className="font-semibold text-foreground">
                  {customer.first_name} {customer.last_name}
                </p>
                {/* Il cliente parla con una persona sola: il telefono lo vede
                    il capocantiere, gli altri passano da lui. */}
                {assignment?.is_capocantiere ? (
                  customer.phone && (
                    <a
                      href={`tel:${customer.phone}`}
                      className="flex items-center gap-2 mt-2 text-primary text-sm"
                    >
                      <Phone className="w-4 h-4" />
                      <span>{customer.phone}</span>
                    </a>
                  )
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">Per parlare col cliente passa dal capocantiere.</p>
                )}
              </div>
            )}

            {/* Materiali da installare: il conteggio, la lista solo se la apri. */}
            {orderItems.length > 0 && (
              <details className="rounded-2xl border border-border bg-background p-4 shadow-sm">
                <summary className="cursor-pointer text-sm font-semibold text-foreground">
                  Materiali da posare <span className="font-normal text-muted-foreground">({orderItems.length})</span>
                </summary>
                <div className="mt-3 space-y-2">
                  {orderItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-2">
                      <p className="min-w-0 text-sm text-foreground">{item.description || item.name}</p>
                      {item.quantity && (
                        <span className="shrink-0 text-xs text-primary">x{item.quantity}</span>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Diario del cantiere: si legge solo quando lo apri. */}
            {orderId && (diarioAperto ? (
              <DiarioCantiere orderId={orderId} />
            ) : (
              <button
                type="button"
                onClick={() => setDiarioAperto(true)}
                className="flex min-h-12 w-full items-center justify-between rounded-2xl border border-border bg-background px-4 text-sm font-semibold text-foreground shadow-sm"
              >
                Diario del cantiere
                <span className="text-xs font-normal text-muted-foreground">Apri</span>
              </button>
            ))}
          </>
        )}

        {/* ── Tab: Rapportini ── */}
        {activeTab === "rapportini" && (
          <div className="space-y-3">
            <div className="rounded-2xl border bg-background p-4">
              <h2 className="font-bold">La giornata per l’ufficio</h2>
              <p className="mt-1 text-sm text-muted-foreground">Ore, lavori, foto e materiali. Il cliente non firma qui: quello è il Collaudo.</p>
            </div>
            {soloTimbratura ? (
              <p className="rounded-xl border bg-muted/40 p-3 text-sm">Il rapportino lo compila il responsabile. Tu registra entrata e uscita; lo storico resta consultabile.</p>
            ) : (
              /* Un solo bottone: dentro il modulo c'è già «Compila parlando» per dettarlo a voce. */
              <button
                type="button"
                onClick={() => navigate(rapportinoManualeUrl)}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-3.5 text-base font-bold text-primary-foreground transition-transform active:scale-[0.98]"
              >
                <Plus className="h-5 w-5" />
                Scrivi il rapportino
              </button>
            )}

            {rapportiniLoading ? <p role="status" className="py-6 text-center text-sm text-muted-foreground">Carico i rapporti…</p> : rapportiniError ? (
              <div role="alert" className="rounded-xl border border-destructive/30 p-3 text-sm">
                <p>Non riesco a caricare lo storico. Non significa che i rapporti siano assenti.</p>
                <button type="button" className="min-h-11 font-semibold text-primary underline" onClick={() => void ricaricaRapportini()}>Riprova lo storico</button>
              </div>
            ) : giornalieri.length === 0 ? (
              <div className="flex flex-col items-center py-12 gap-3 text-center">
                <FileText className="w-10 h-10 text-muted-foreground" />
                <div>
                  <p className="font-semibold text-foreground">Nessun rapportino per questo cantiere</p>
                  <p className="mt-1 text-sm text-muted-foreground">Scrivilo a fine giornata: puoi anche dettarlo a voce.</p>
                </div>
              </div>
            ) : (
              giornalieri.map((r) => (
                <RapportinoCardCampo
                  key={r.id}
                  r={r}
                  pdfOccupato={pdfBusyId === r.id}
                  onPdf={() => void apriPdfRapportino(r)}
                  onFirma={() => { setFirmaRapportinoId(r.id); setFirmaDataUrl(null); }}
                  onCorreggi={() => navigate(campoReportUrl(orderId!, isClientReport(r) ? "client" : "daily", r.data_lavoro))}
                  nomiFasi={nomiFasi}
                />
              ))
            )}
          </div>
        )}

        {/* ── Tab: Bolle ── la bolla fotografata dall'operaio compare QUI, dentro il cantiere ── */}
        {activeTab === "bolle" && orderId && <BolleCantiere orderId={orderId} />}

        {/* ── Tab: Collaudo ── tutto quello che si fa COL CLIENTE e chiede la sua firma.
            Due modi soli: firma in cantiere (qui, sul telefono) o firma a distanza (email). */}
        {activeTab === "collaudo" && orderId && (
          <div className="space-y-3">
            <div className="rounded-2xl border bg-background p-4">
              <h2 className="font-bold">Il collaudo col cliente</h2>
              <p className="mt-1 text-sm text-muted-foreground">Consegna e fine lavori: il cliente controlla e firma. Non è il rapportino, che resta interno.</p>
            </div>

            {puoCompilareCliente ? (
              <button
                type="button"
                onClick={() => navigate(campoReportUrl(orderId, "client"))}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-3.5 text-base font-bold text-primary-foreground transition-transform active:scale-[0.98]"
              >
                <ClipboardSignature className="h-5 w-5" />Firma col cliente in cantiere
              </button>
            ) : ruoloRapportiLoading ? (
              <p role="status" className="text-sm text-muted-foreground">Verifico chi può fare il collaudo…</p>
            ) : ruoloRapportiError ? (
              <div role="alert" className="text-sm">
                <p>Non riesco a verificare il tuo ruolo sul cantiere.</p>
                <button type="button" className="min-h-11 text-primary underline" onClick={() => void ricaricaRuoloRapporti()}>Riprova</button>
              </div>
            ) : (
              <p className="rounded-xl border bg-muted/40 p-3 text-sm">Il collaudo col cliente lo fa il capocantiere.</p>
            )}

            <DocumentiFirmaTab orderId={orderId} customer={customer} />

            {/* Collaudi già firmati in cantiere */}
            {collaudiLoading ? (
              <p role="status" className="py-4 text-center text-sm text-muted-foreground">Carico i collaudi…</p>
            ) : collaudiError ? (
              <div role="alert" className="rounded-xl border border-destructive/30 p-3 text-sm">
                <p>Non riesco a caricare i collaudi. Non significa che manchino.</p>
                <button type="button" className="min-h-11 font-semibold text-primary underline" onClick={() => void ricaricaCollaudi()}>Riprova</button>
              </div>
            ) : rapportiCliente.length > 0 && (
              <div className="space-y-2">
                <p className="px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Firmati in cantiere</p>
                {rapportiCliente.map((r) => {
                  const mio = r.user_id === currentUserId;
                  return (
                    <RapportinoCardCampo
                      key={r.id}
                      r={r}
                      pdfOccupato={pdfBusyId === r.id}
                      onPdf={mio || r.pdf_url ? () => void apriPdfRapportino(r) : undefined}
                      onFirma={mio ? () => { setFirmaRapportinoId(r.id); setFirmaDataUrl(null); } : undefined}
                      onCorreggi={mio ? () => navigate(campoReportUrl(orderId, "client", r.data_lavoro)) : undefined}
                      nomiFasi={nomiFasi}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Chat ── */}
        {activeTab === "chat" && (
          <ChatCantiere orderId={orderId!} orderCode={order?.order_code ?? ""} />
        )}

        {/* Dialog «Aggiungi la tua firma» (comune a rapportini e collaudi).
            z-[60]: la barra in basso è z-50 e viene dopo nel DOM: copriva «Salva firma». */}
        {firmaRapportinoId && (
          <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-3 sm:items-center">
            <div className="w-full max-w-md space-y-3 rounded-2xl bg-background p-4 shadow-xl">
              <p className="text-base font-black text-foreground">Aggiungi la tua firma</p>
              <p className="text-sm text-muted-foreground">Firma di chi ha compilato il rapporto. Non è la firma del cliente.</p>
              <FirmaPad label="La tua firma" onChange={setFirmaDataUrl} />
              <div className="flex gap-2">
                <button
                  onClick={() => { setFirmaRapportinoId(null); setFirmaDataUrl(null); }}
                  className="flex-1 rounded-xl border border-border bg-muted py-3 text-sm font-semibold text-foreground"
                >
                  Annulla
                </button>
                <button
                  onClick={() => {
                    if (!firmaDataUrl) { toast.error("Firma prima nel riquadro"); return; }
                    firmaRapportinoMutation.mutate({ rapportinoId: firmaRapportinoId, dataUrl: firmaDataUrl });
                  }}
                  disabled={firmaRapportinoMutation.isPending}
                  className="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
                >
                  {firmaRapportinoMutation.isPending ? "Salvo…" : "Salva firma"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CTA sticky in basso */}
      {/* -bottom-28 compensa il padding-bottom (pb-28) del <main>: senza,
          la barra si aggancia 112px sopra il fondo e il bottone copre il
          contenuto. Il padding tiene il bottone sopra la bottom nav fissa, safe-area dell'iPhone compresa. */}
      {activeTab === "descrizione" && <div className="sticky -bottom-28 bg-background border-t border-border px-4 py-3 z-20 pb-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-0 md:pb-3">
        <button
          onClick={nextStickyAction.onClick}
          disabled={!!regoleRapporti.isLoading || !!regoleRapporti.isError || !!ruoloRapportiLoading || !!ruoloRapportiError}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-black text-white transition-transform active:scale-[0.98]",
            nextStickyAction.tone === "success" ? "bg-emerald-600" : "bg-primary",
          )}
        >
          <NextStickyIcon className="h-4 w-4" />
          {nextStickyAction.label}
        </button>
      </div>}
    </div>
  );
}

/**
 * Tab «Diario» del cantiere. Il hook del diario (eventi, messaggi, 5 query di audit, profili, canale in tempo
 * reale) vive QUI e non nella pagina: prima partiva a ogni apertura del cantiere, anche se il tab non si apriva.
 */
/** «in_corso» → «In corso»: l'operaio legge parole, non codici. */
function statoLeggibile(stato: string | null | undefined): string {
  const s = (stato ?? "").trim();
  if (!s) return "In lavorazione";
  const t = s.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Le bolle di QUESTO cantiere. La foto scattata con «Bolla» compare qui dentro:
 * fornitore, numero, totale e stato (in verifica / registrata / rimborso). L'operaio
 * vede le sue; l'ufficio le vede tutte.
 */
function BolleCantiere({ orderId }: { orderId: string }) {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useAcquistiCommessa(orderId);
  const bolle = data ?? [];
  return (
    <div className="space-y-3">
      <button
        onClick={() => navigate(`/campo/merce?order=${orderId}`)}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-black text-white transition-transform active:scale-[0.98]"
      >
        <Camera className="h-4 w-4" />Fotografa una bolla
      </button>
      {isLoading && <p className="text-sm text-muted-foreground">Carico le bolle…</p>}
      {isError && <p className="text-sm text-destructive">Non riesco a leggere le bolle. <button type="button" className="underline" onClick={() => refetch()}>Riprova</button></p>}
      {!isLoading && !isError && bolle.length === 0 && (
        <div className="rounded-xl border bg-muted/40 p-4 text-center text-sm text-muted-foreground">
          <Receipt className="mx-auto mb-2 h-7 w-7 opacity-60" />
          Nessuna bolla per questo cantiere. Fotografa una bolla, uno scontrino o una fattura: la legge e la registra l’ufficio.
        </div>
      )}
      {bolle.map((b) => {
        const s = descriviStato(b);
        const tipo = b.tipo_documento === "scontrino" ? "Scontrino" : b.tipo_documento === "fattura" ? "Fattura" : "Bolla";
        return (
          <div key={b.id} className="flex gap-3 rounded-xl border bg-background p-3">
            {b.foto_path
              ? <ImgRiservata src={riferimentoFile("campo-rapportini", b.foto_path)} alt={`${tipo} ${b.fornitore ?? ""}`} className="h-16 w-14 shrink-0 rounded-lg border object-cover" />
              : <div className="flex h-16 w-14 shrink-0 items-center justify-center rounded-lg border bg-muted"><Receipt className="h-5 w-5 text-muted-foreground" /></div>}
            <div className="min-w-0 flex-1 space-y-0.5 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate font-semibold">{b.fornitore || "Documento"}</p>
                <span className="shrink-0 font-semibold">{euro(b.totale)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {tipo}{b.numero_documento ? ` n. ${b.numero_documento}` : ""}
                {b.data_documento ? ` · ${format(parseISO(b.data_documento), "dd/MM/yyyy")}` : ""}
              </p>
              <p className={cn("text-xs", s.tono === "no" ? "font-medium text-red-700" : s.tono === "ok" ? "text-green-700" : s.tono === "attesa" ? "text-amber-700" : "text-muted-foreground")}>{s.testo}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DiarioCantiere({ orderId }: { orderId: string }) {
  const { timeline } = useOrderDiary(orderId);
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border bg-blue-50 p-4 text-blue-900">
        <div className="flex items-start gap-3">
          <BookOpenCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div>
            <p className="font-bold">Diario lavori sincronizzato</p>
            <p className="mt-1 text-sm text-blue-800/80">
              Rapportini, foto, note e aggiornamenti dal campo finiscono nello storico principale dell'ordine.
            </p>
          </div>
        </div>
      </div>
      {timeline.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <BookOpenCheck className="h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 font-semibold text-foreground">Diario ancora vuoto</p>
          <p className="mt-1 text-sm text-muted-foreground">Invia il primo rapportino per alimentare il diario del lavoro.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {timeline.slice(0, 20).map((entry) => {
            const isEvent = entry.kind === "event";
            const data = entry.data;
            const payload = entry.kind === "event" ? entry.data.payload ?? {} : {};
            const title = entry.kind === "event"
              ? diaryEventLabel(entry.data.event_type, payload)
              : entry.kind === "audit"
                ? entry.data.title
                : entry.data.subject || (entry.data.channel === "nota_interna" ? "Nota interna" : "Messaggio");
            const body = entry.kind === "event"
              ? payload.descrizione_lavori || payload.note || payload.message
              : entry.kind === "audit"
                ? entry.data.description
                : entry.data.body;
            const actorName = entry.kind === "message" ? entry.data.sent_by_name : entry.data.actor_name;
            return (
              <div key={`${entry.kind}-${data.id}`} className="rounded-2xl border bg-background p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                    isEvent ? "bg-primary/10 text-primary" : "bg-emerald-50 text-emerald-600"
                  )}>
                    {isEvent ? <BookOpenCheck className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-foreground">{title}</p>
                      <span className="text-[11px] text-muted-foreground">
                        {format(new Date(data.created_at), "d MMM HH:mm", { locale: it })}
                      </span>
                    </div>
                    {actorName && <p className="text-xs text-muted-foreground">Da {actorName}</p>}
                    {body && <p className="mt-2 text-sm leading-relaxed text-foreground">{String(body)}</p>}
                    {typeof payload.foto_count === "number" && Number.isInteger(payload.foto_count) && payload.foto_count > 0 ? (
                      <p className="mt-2 text-xs font-semibold text-primary">{payload.foto_count} foto allegate al rapportino</p>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CampoCloseDayCard({
  isOperaio,
  hasTimbrato,
  isInCantiere,
  isInPausa,
  uscitaRegistrata,
  rapportinoDone,
  rapportinoDetail,
  fotoCount,
  materialiCount,
  oreRapportino,
  avanzamentoRapportino,
  onTimbratura,
  onRapportino,
}: {
  isOperaio: boolean;
  hasTimbrato: boolean;
  isInCantiere: boolean;
  isInPausa: boolean;
  uscitaRegistrata: boolean;
  rapportinoDone: boolean;
  /** Cosa scrivere sotto «Rapportino» quando non è consegnato (di default «Manca»). */
  rapportinoDetail?: string;
  fotoCount: number;
  materialiCount: number;
  oreRapportino: number | null;
  avanzamentoRapportino: number | null;
  onTimbratura: () => void;
  onRapportino: () => void;
}) {
  // Il subappaltatore non timbra: la timbratura non è nella sua navigazione
  // (né sidebar né azioni rapide), quindi entrata/uscita resterebbero per
  // sempre "Manca" e la giornata non si chiuderebbe mai. Per lui la giornata
  // è il rapportino.
  // La timbratura NON è un prerequisito: capita di dimenticarla e il lavoro
  // va documentato lo stesso. Entrata e uscita restano passi CONSIGLIATI —
  // quello che l'ufficio deve avere è il rapportino.
  const timbraturaAttesa = isOperaio && !hasTimbrato;
  const uscitaOk = isOperaio ? uscitaRegistrata : true;

  const evidenceOk = fotoCount > 0 || materialiCount > 0 || avanzamentoRapportino != null;
  const requiredMissing = rapportinoDone ? 0 : 1;
  const readyToExit = rapportinoDone && hasTimbrato && !uscitaOk;
  const giornataCompleta = rapportinoDone && uscitaOk;

  const status = !rapportinoDone
      ? {
          label: "Rapportino",
          cls: "bg-amber-100 text-amber-800",
          text: "Manda il rapportino per aggiornare commessa e diario.",
        }
      : readyToExit && (isInCantiere || isInPausa)
        ? {
            label: "Pronto uscita",
            cls: "bg-emerald-100 text-emerald-800",
            text: "Dati minimi raccolti. Puoi andare alla timbratura di uscita.",
          }
        : timbraturaAttesa
          ? {
              label: "Manca la timbratura",
              cls: "bg-blue-100 text-blue-800",
              text: "Il rapportino è presente. Se hai lavorato qui, registra anche la timbratura.",
            }
          : giornataCompleta
            ? {
                label: "Chiusa",
                cls: "bg-emerald-100 text-emerald-800",
                text: "Giornata allineata: ore e rapportino sono presenti.",
              }
            : {
                label: "Allineata",
                cls: "bg-emerald-100 text-emerald-800",
                text: "I dati essenziali sono pronti per l'ufficio.",
              };

  return (
    <div className="rounded-2xl border border-emerald-100 bg-background p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black text-foreground">Chiudi giornata</p>
          <p className="mt-1 text-sm leading-snug text-muted-foreground">{status.text}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${status.cls}`}>
          {status.label}
        </span>
      </div>

      {/* Ogni passo è un collegamento: prima erano riquadri morti e l'unico
          modo di muoversi era il bottone grande in fondo. */}
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        {isOperaio && (
          <CloseDayStep
            ok={hasTimbrato}
            icon={LogIn}
            label="Entrata"
            detail={hasTimbrato ? "Registrata" : "Consigliata"}
            optional
            onClick={onTimbratura}
          />
        )}
        <CloseDayStep ok={evidenceOk} icon={Camera} label="Evidenze" detail={evidenceOk ? `${fotoCount} foto · ${materialiCount} mat.` : "Consigliate"} optional onClick={onRapportino} />
        <CloseDayStep ok={rapportinoDone} icon={FileText} label="Rapportino" detail={rapportinoDone ? `${oreRapportino ?? 0} h` : rapportinoDetail ?? "Manca"} onClick={onRapportino} />
        {isOperaio && (
        <CloseDayStep
          ok={giornataCompleta}
          icon={LogOut}
          label="Uscita"
          detail={giornataCompleta ? "Registrata" : readyToExit ? "Pronta" : requiredMissing === 1 ? "1 passo prima" : `${requiredMissing} passi prima`}
          optional={!isOperaio}
          onClick={isOperaio ? onTimbratura : undefined}
        />
        )}
      </div>

      {/* Solo se dichiarato davvero (>0): con le fasi la % la calcola il sistema
          e uno "0%" qui sembrerebbe un lavoro fermo. */}
      {avanzamentoRapportino != null && avanzamentoRapportino > 0 && (
        <div className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">
          Avanzamento dichiarato oggi: <span className="text-foreground">{avanzamentoRapportino}%</span>
        </div>
      )}

    </div>
  );
}

function CloseDayStep({
  ok,
  icon: Icon,
  label,
  detail,
  optional,
  onClick,
}: {
  ok: boolean;
  icon: LucideIcon;
  label: string;
  detail: string;
  optional?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={cn(
        "rounded-xl border p-2.5 text-left",
        onClick && "transition-transform active:scale-[0.98]",
        ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : optional
            ? "border-blue-100 bg-blue-50 text-blue-800"
            : "border-amber-200 bg-amber-50 text-amber-800",
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" />
        <p className="min-w-0 truncate text-xs font-black">{label}</p>
      </div>
      <p className="mt-1 truncate text-xs font-semibold opacity-80">{detail}</p>
    </Tag>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex h-10 flex-col items-center justify-center gap-0.5 rounded-xl border bg-background px-1 text-xs font-bold leading-tight text-foreground shadow-sm transition-transform active:scale-[0.98] disabled:opacity-50 md:h-12 md:flex-row md:gap-2 md:px-3 md:text-xs"
    >
      <Icon className="h-4 w-4 shrink-0 text-primary" />
      {label}
    </button>
  );
}

function InfoTile({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-background p-2.5 shadow-sm md:rounded-2xl md:p-4">
      <div className="mb-1.5 flex items-center gap-1.5 text-muted-foreground md:mb-2 md:gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 md:h-4 md:w-4" />
        <p className="truncate text-[11px] font-bold uppercase tracking-wide">{label}</p>
      </div>
      <p className="truncate text-xs font-bold text-foreground md:text-sm">{value}</p>
    </div>
  );
}

function diaryEventLabel(eventType: string, payload: Record<string, unknown>) {
  if (eventType === "reportino_cantiere") return "Rapportino dal campo";
  if (eventType === "giornale_lavori_inserito") return "Giornale lavori aggiornato";
  if (eventType === "foto_rilievo_caricata") return "Foto caricata";
  if (eventType === "stato_cambiato") return "Stato lavoro aggiornato";
  if (payload?.title) return String(payload.title);
  return eventType.replaceAll("_", " ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Documenti e Firma — tab con richieste firma e invio nuove
// ─────────────────────────────────────────────────────────────────────────────
function DocumentiFirmaTab({ orderId, customer }: { orderId: string; customer: CampoCustomer | null }) {
  const queryClient = useQueryClient();
  const [showNewDoc, setShowNewDoc] = useState(false);
  const [selectedTipo, setSelectedTipo] = useState<string | null>(null);
  const [noteDoc, setNoteDoc] = useState("");
  const documentMissing = missingCampoDocument("order", selectedTipo);

  // Richieste firma esistenti per questo ordine
  const { data: firmeRichieste = [], isLoading } = useQuery<SignatureRequestRow[]>({
    queryKey: ["campo-firme-ordine", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signature_requests")
        // Solo le colonne che servono: impronta del codice e simili non sono leggibili dall'app.
        .select("id, status, tipo_documento, signer_name, signer_email, created_at, signed_at, certificato_url")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SignatureRequestRow[];
    },
    enabled: !!orderId,
  });

  // Crea richiesta firma tramite edge function FEA (invia email + OTP automaticamente)
  const { mutate: creaRichiestaFirma, isPending } = useMutation({
    mutationFn: async () => {
      if (!selectedTipo) throw new Error("Seleziona il tipo di documento");
      if (documentMissing) throw new Error(CAMPO_DOCUMENT_REQUIRED);
      if (!customer?.email) throw new Error("Email del cliente non disponibile");

      const customerName = `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim();

      const { data, error } = await supabase.functions.invoke("fea-richiedi-firma", {
        body: {
          tipo_documento: "order",
          documento_id: orderId,
          tipo_firmatario: "b2b",
          signer_email: customer.email,
          signer_name: customerName || "Cliente",
          expires_giorni: 7,
          // La scelta della griglia (verbale consegna, collaudo, ...) e le
          // note prima si perdevano: l'edge le salva su signature_requests.
          categoria: selectedTipo,
          note: noteDoc.trim() || null,
        },
      });

      // Il motivo vero (credito finito, email non valida…) sta nel corpo della risposta.
      if (error) throw new Error(await readInvokeError(error));
      if (data?.error) throw new Error(data.error);

      return data as { otp_inviato?: boolean } | null;
    },
    onSuccess: (data) => {
      if (data?.otp_inviato === false) {
        toast.warning("Richiesta creata, ma l'email al cliente non è partita. Avvisa l'ufficio.");
      } else {
        toast.success("Richiesta di firma inviata: il cliente riceve un'email con il link per firmare.");
      }
      queryClient.invalidateQueries({ queryKey: ["campo-firme-ordine"] });
      setShowNewDoc(false);
      setSelectedTipo(null);
      setNoteDoc("");
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "Errore nell'invio della richiesta";
      toast.error(message);
    },
  });

  const firmePending = firmeRichieste.filter((f) => f.status === "pending").length;
  const firmeSigned = firmeRichieste.filter((f) => f.status === "signed").length;

  return (
    <div className="space-y-4">
      {/* Firma a distanza: il cliente riceve un'email e firma dal suo telefono.
          Lo stato è scritto su ogni documento: niente riquadri contatore. */}
      <button
        onClick={() => setShowNewDoc(!showNewDoc)}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background py-3 text-sm font-semibold text-foreground transition-transform active:scale-[0.98]"
      >
        <PenLine className="w-4 h-4" />
        Mandalo da firmare via email
      </button>
      {firmeRichieste.length > 0 && (
        <p className="px-1 text-xs text-muted-foreground">
          {firmePending} in attesa · {firmeSigned} firmati
        </p>
      )}

      {/* Form nuova richiesta */}
      {showNewDoc && (
        <div className="bg-background border border-border rounded-2xl p-4 space-y-4">
          <p className="text-sm font-semibold text-foreground">Seleziona tipo documento</p>

          <div className="grid grid-cols-2 gap-2">
            {TIPI_DOCUMENTO.map((doc) => {
              const [textColor, bgColor] = doc.color.split(" ");
              const isSelected = selectedTipo === doc.tipo;
              return (
                <button
                  key={doc.tipo}
                  onClick={() => setSelectedTipo(doc.tipo)}
                  className={cn(
                    "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all active:scale-95",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border bg-muted/30"
                  )}
                >
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", bgColor)}>
                    <doc.icon className={cn("w-5 h-5", textColor)} />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-semibold text-foreground leading-tight">{doc.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{doc.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {documentMissing && (
            <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">Verbale da preparare prima della firma</p>
              <p className="mt-1">{CAMPO_DOCUMENT_REQUIRED}</p>
              <p className="mt-2">Prepara il verbale dalla commessa → Cantiere → Collaudo e consegna: verifiche, esito, riserve, responsabili e documenti consegnati. Il collegamento alla firma elettronica è ancora da completare: non inviare una richiesta basata sul solo titolo.</p>
            </div>
          )}
          {/* Destinatario */}
          {customer && (
            <div className="bg-muted/50 border border-border rounded-xl p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Firma richiesta a</p>
              <p className="text-sm font-semibold text-foreground">
                {customer.first_name} {customer.last_name}
              </p>
              <p className="text-xs text-muted-foreground">{customer.email}</p>
            </div>
          )}

          {!customer?.email && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">
                Email del cliente non disponibile. Contatta l'ufficio per aggiungere l'email del cliente.
              </p>
            </div>
          )}

          {/* Note opzionali */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Note (opzionale)</label>
            <textarea
              className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground resize-none placeholder:text-muted-foreground"
              rows={2}
              placeholder="Note aggiuntive per il documento..."
              value={noteDoc}
              onChange={(e) => setNoteDoc(e.target.value)}
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => { setShowNewDoc(false); setSelectedTipo(null); }}
              className="flex-1 bg-muted text-foreground border border-border font-semibold py-3 rounded-xl text-sm active:scale-[0.98] transition-transform"
            >
              Annulla
            </button>
            <button
              onClick={() => creaRichiestaFirma()}
              disabled={!selectedTipo || !customer?.email || isPending || documentMissing}
              className="flex-1 bg-primary text-primary-foreground font-bold py-3 rounded-xl text-sm active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Invia richiesta
            </button>
          </div>
        </div>
      )}

      {/* Lista documenti/firme */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : firmeRichieste.length === 0 ? null : (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Storico documenti ({firmeRichieste.length})
          </p>
          {firmeRichieste.map((f) => {
            const tipoDoc = TIPI_DOCUMENTO.find(t => t.tipo === ((f as { categoria?: string | null }).categoria ?? f.tipo_documento))
              || (f.tipo_documento === "order" ? { label: "Documento ordine", icon: FileCheck, color: "text-blue-600 bg-blue-50" } : null);
            const stato = STATO_FIRMA[f.status] || STATO_FIRMA.pending;
            const StatoIcon = stato.icon;
            const DocIcon = tipoDoc?.icon || FileText;
            const [textColor, bgColor] = (tipoDoc?.color || "text-slate-600 bg-slate-50").split(" ");

            return (
              <div
                key={f.id}
                className="bg-background border border-border rounded-2xl p-4"
              >
                <div className="flex items-start gap-3">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", bgColor)}>
                    <DocIcon className={cn("w-5 h-5", textColor)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">
                        {tipoDoc?.label || f.tipo_documento || "Documento"}
                      </p>
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1", stato.cls)}>
                        <StatoIcon className="w-3 h-3" />
                        {stato.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Inviato a {f.signer_name || f.signer_email}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {format(new Date(f.created_at), "d MMM yyyy 'alle' HH:mm", { locale: it })}
                    </p>
                    {f.signed_at && (
                      <p className="text-[11px] text-green-600 font-medium mt-0.5">
                        Firmato il {format(new Date(f.signed_at), "d MMM yyyy 'alle' HH:mm", { locale: it })}
                      </p>
                    )}
                  </div>
                </div>

                {/* Azioni */}
                {f.status === "signed" && f.certificato_url && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <a
                      href={f.certificato_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary font-medium"
                    >
                      <Download className="w-4 h-4" />
                      Scarica certificato firmato
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Componente inline: link al canale chat del cantiere ──────────────────────
function ChatCantiere({ orderId, orderCode }: { orderId: string; orderCode: string }) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const channelName = "cantiere-" + orderCode.toLowerCase().replace(/\s+/g, "-");

  const { data: canale, isLoading, isFetching } = useQuery({
    queryKey: ["campo-canale-cantiere", orderId, orderCode, companyId],
    queryFn: async () => {
      if (!orderCode) return null;
      // Filtro azienda: due tenant con lo stesso order_code hanno lo stesso
      // nome canale — senza company_id si poteva aprire quello sbagliato
      // (o esplodere con maybeSingle su 2 righe).
      // Un canale per commessa (indice unico su order_id): si cerca per commessa, così si trova
      // anche quando l'ha aperto prima l'ufficio con un altro nome. Per nome solo i canali vecchi.
      const perCommessa = await supabase
        .from("internal_chat_channels")
        .select("id, name")
        .eq("order_id", orderId)
        .eq("company_id", companyId!)
        .limit(1)
        .maybeSingle();
      if (perCommessa.error) throw perCommessa.error;
      if (perCommessa.data) return perCommessa.data;
      const { data, error } = await supabase
        .from("internal_chat_channels")
        .select("id, name")
        .eq("name", channelName)
        .eq("company_id", companyId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!orderCode && !!companyId,
  });

  // Spinner anche durante il refetch di un null cache-stantio: senza,
  // per un attimo comparirebbe il falso "canale non disponibile".
  if (isLoading || (!canale && isFetching)) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center py-12 gap-3 text-center">
      {canale ? (
        <>
          <button
            onClick={() => navigate(`/campo/chat/${canale.id}`)}
            className="bg-primary text-primary-foreground font-bold py-3.5 px-8 rounded-xl active:scale-[0.98] transition-transform"
          >
            Apri chat cantiere
          </button>
          <p className="text-xs text-muted-foreground">Canale: {canale.name}</p>
        </>
      ) : (
        <>
          <button
            onClick={() => navigate("/campo/chat")}
            className="bg-muted text-foreground font-semibold py-3.5 px-8 rounded-xl active:scale-[0.98] transition-transform border border-border"
          >
            Vai alla chat
          </button>
          <p className="text-xs text-muted-foreground">
            Il canale {channelName} verra creato automaticamente
            quando l&apos;ufficio ti assegna a questo cantiere.
          </p>
        </>
      )}
    </div>
  );
}
