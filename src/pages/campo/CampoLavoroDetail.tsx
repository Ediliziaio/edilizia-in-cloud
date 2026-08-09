/**
 * Dettaglio ordine/cantiere assegnato all'operaio o subappaltatore.
 * Verifica accesso tramite order_campo_assignments — sicurezza obbligatoria.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  ArrowLeft, MapPin, Phone, Plus, AlertCircle,
  CheckCircle, Clock, Loader2, FileText, PenLine,
  Send, Download, FileCheck,
	  ClipboardSignature, ShieldCheck, Package, Wrench,
	  Camera, BookOpenCheck, MessageSquare, Navigation,
	  Mic, LogIn, LogOut,
	} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { useOrderDiary } from "@/hooks/useOrderDiary";
import { useIsCampo } from "@/hooks/useIsCampo";

type Tab = "descrizione" | "rapportini" | "diario" | "documenti" | "chat";

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
  data_lavoro: string;
  ore_lavorate: number | null;
  descrizione_lavori: string | null;
  stato?: string | null;
  approvato?: boolean | null;
  created_at?: string | null;
  foto_urls?: string[] | null;
  materiali_usati?: unknown;
  percentuale_avanzamento?: number | null;
  lavoro_completato?: boolean | null;
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

export default function CampoLavoroDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, profile } = useAuth();
  const { isOperaio } = useIsCampo();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("descrizione");
  const [assignmentTimedOut, setAssignmentTimedOut] = useState(false);
  const { timeline } = useOrderDiary(orderId);
  const companyId = profile?.company_id ?? null;
  const currentUserIds = Array.from(new Set([user?.id, profile?.id].filter((id): id is string => Boolean(id))));
  const currentUserId = currentUserIds[0] ?? null;
  const currentUserKey = currentUserIds.join("|");
  const fallbackOrderCode = searchParams.get("order_code");
  const fallbackOrderTitle = searchParams.get("order_title");
  const fallbackOrderAddress = searchParams.get("order_address");
  const today = format(new Date(), "yyyy-MM-dd");

  // Verifica assegnazione — controlla order_campo_assignments e order_employees
  const { data: assignment, isLoading, isFetching, isError, error } = useQuery<CampoAssignment | null>({
    queryKey: ["campo-lavoro", orderId, currentUserKey, fallbackOrderCode, fallbackOrderTitle, fallbackOrderAddress],
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

      const directOrderPromise = withTimeout(
        supabase
          .from("orders")
          .select(orderSelect)
          .eq("id", orderId!)
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

      const campoAssignmentPromise = withTimeout(
        supabase
          .from("order_campo_assignments")
          .select(`*, order:orders(${orderSelect})`)
          .eq("order_id", orderId!)
          .in("user_id", currentUserIds)
          .limit(1)
          .maybeSingle(),
        5000,
        { data: null, error: null },
        flagTimeout,
      );

      const employeePromise = withTimeout(
        supabase
          .from("employees")
          .select("id")
          .in("user_id", currentUserIds)
          .limit(1)
          .maybeSingle(),
        5000,
        { data: null, error: null },
        flagTimeout,
      );

      const subcontractorPromise = withTimeout(
        supabase
          .from("subappaltatori")
          .select("id")
          .in("user_id", currentUserIds)
          .limit(1)
          .maybeSingle(),
        5000,
        { data: null, error: null },
        flagTimeout,
      );

      const [
        { data: campoData, error: campoErr },
        { data: emp, error: empErr },
        { data: subData, error: subErr },
      ] = await Promise.all([campoAssignmentPromise, employeePromise, subcontractorPromise]);
      if (campoErr) throw campoErr;
      if (empErr) throw empErr;
      if (subErr) throw subErr;

      // 1. Prova order_campo_assignments
      if (campoData?.order) return campoData as unknown as CampoAssignment;

      // 2. Fallback: controlla order_employees
      if (emp?.id) {
        const { data: empRows, error: rowsErr } = await withTimeout(
          supabase
            .from("order_employees")
            .select("id, order_id")
            .eq("order_id", orderId!)
            .eq("employee_id", emp.id)
            .limit(1),
          5000,
          { data: null, error: null },
          flagTimeout,
        );
        if (rowsErr) throw rowsErr;
        const empAssign = empRows?.[0] ?? null;

        if (empAssign) {
          const { data: orderData, error: ordErr } = await directOrderPromise;
          if (ordErr) throw ordErr;
          if (!orderData) return null;

          return { ...empAssign, order: orderData as CampoOrder, is_capocantiere: false };
        }
      }

      // 3. Fallback subappaltatore: lavori assegnati tramite contratto subappalto
      if (subData?.id) {
        const { data: contract, error: contractErr } = await withTimeout(
          supabase
            .from("contratti_subappalto")
            .select("id, order_id, stato")
            .eq("order_id", orderId!)
            .eq("subappaltatore_id", subData.id)
            .eq("stato", "attivo")
            .maybeSingle(),
          5000,
          { data: null, error: null },
          flagTimeout,
        );
        if (contractErr) throw contractErr;

        if (contract) {
          const { data: orderData, error: ordErr } = await directOrderPromise;
          if (ordErr) throw ordErr;
          if (!orderData) return null;

          return { ...contract, role_type: "subcontractor", order: orderData as CampoOrder, is_capocantiere: false };
        }
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
    enabled: !!orderId,
    retry: 1,
    // Query-cancello: un "non assegnato" (null) in cache/persister non deve
    // essere riservito com'è — verifica sempre fresca al mount, altrimenti
    // un null stantio mostra "Lavoro non disponibile" a operai assegnati.
    staleTime: 0,
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (!isLoading) {
      setAssignmentTimedOut(false);
      return undefined;
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
    enabled: !!orderId && activeTab === "descrizione",
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

  // Rapportini dell'utente su questo ordine
  const { data: rapportini = [] } = useQuery<CampoRapportinoRow[]>({
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
    enabled: !!orderId && !!currentUserId && activeTab === "rapportini",
  });

  const { data: timbratureLavoroOggi = [] } = useQuery({
    queryKey: ["campo-lavoro-timbrature-oggi", companyId, orderId, currentUserId, today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campo_timbrature")
        .select("id, tipo, timestamp_evento, order_id")
        .eq("company_id", companyId!)
        .eq("order_id", orderId!)
        .eq("user_id", currentUserId!)
        .gte("timestamp_evento", `${today}T00:00:00`)
        .lte("timestamp_evento", `${today}T23:59:59`)
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
      const { data, error } = await supabase
	        .from("campo_rapportini")
	        .select("id, stato, created_at, ore_lavorate, descrizione_lavori, foto_urls, materiali_usati, percentuale_avanzamento, lavoro_completato")
	        .eq("order_id", orderId!)
        .eq("user_id", currentUserId!)
        .eq("data_lavoro", today)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!orderId && !!currentUserId,
    staleTime: 30_000,
  });

  const { data: checklistOggi } = useQuery({
    queryKey: ["campo-lavoro-checklist-oggi", companyId, currentUserId, today],
    queryFn: async () => {
      // La checklist è UNA AL GIORNO per persona: l'upsert in
      // useChecklistSicurezza va in conflitto su (company_id, operaio_id,
      // data, turno) e la pagina Sicurezza la conferma SEMPRE con
      // order_id = null. Filtrare qui per order_id non matchava quindi mai
      // → "Sicurezza: Da fare" restava rosso anche dopo averla firmata e il
      // CTA della giornata non avanzava mai. Usiamo la chiave naturale.
      const { data, error } = await supabase
        .from("checklist_sicurezza")
        .select("id, completata, firmata")
        .eq("company_id", companyId!)
        .eq("operaio_id", currentUserId!)
        .eq("data", today)
        // Più turni nello stesso giorno → tieni quello completato.
        .order("completata", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId && !!currentUserId,
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
	  const rapportinoInviatoOggi = !!rapportinoOggi;
	  const checklistCompletataOggi = !!checklistOggi?.completata;
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
  const checklistUrl = withOrderContext("/campo/sicurezza");
  const rapportinoManualeUrl = withOrderContext(`/campo/lavoro/${orderId}/rapportino`);
  const rapportinoVocaleUrl = withOrderContext(`/campo/lavoro/${orderId}/rapportino-vocale`);
  // La timbratura è un flusso da OPERAIO: il subappaltatore non ce l'ha né in
  // sidebar né nelle azioni rapide (CampoLayout subItems / AccesaoRapido), così
  // `hasTimbratoQui` restava false per sempre e il CTA principale del lavoro
  // era bloccato su "Timbra entrata" → una pagina fuori dalla sua navigazione.
  // Per il sub la sequenza sensata è: checklist → rapportino → fine.
  const nextStickyAction: { label: string; icon: LucideIcon; onClick: () => void; tone: "primary" | "success" } =
    isOperaio && !hasTimbratoQui
      ? { label: "Timbra entrata", icon: LogIn, onClick: () => navigate(timbraturaUrl), tone: "success" }
      : !checklistCompletataOggi
        ? { label: "Checklist sicurezza", icon: ShieldCheck, onClick: () => navigate(checklistUrl), tone: "primary" }
        : !rapportinoInviatoOggi
          ? { label: "Rapportino AI", icon: Mic, onClick: () => navigate(rapportinoVocaleUrl), tone: "primary" }
          : isOperaio && !uscitaRegistrataOggi
            ? { label: "Timbra uscita", icon: LogOut, onClick: () => navigate(timbraturaUrl), tone: "success" }
            : { label: "Torna ai lavori", icon: CheckCircle, onClick: () => navigate("/campo/calendario"), tone: "primary" };
  const NextStickyIcon = nextStickyAction.icon;
  const tabs: { key: Tab; label: string }[] = [
    { key: "descrizione", label: "Info" },
    { key: "rapportini",  label: "Rapportini" },
    { key: "diario",      label: "Diario" },
    { key: "documenti",   label: "Documenti" },
    { key: "chat",        label: "Chat" },
  ];

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      {/* Header sticky */}
      <div className="sticky top-0 z-10 rounded-b-2xl border-b border-border bg-background px-3 py-3 shadow-sm md:px-4 md:py-4">
        <div className="mb-2 flex items-center gap-3 md:mb-3">
          <button
            onClick={() => navigate("/campo")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted active:bg-muted"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground md:text-xs">Lavoro assegnato</p>
            <p className="truncate text-lg font-black text-foreground md:text-xl">{order?.order_code}</p>
            <p className="truncate text-xs text-muted-foreground md:text-sm">{order?.description}</p>
          </div>
        </div>

        {/* Avanzamento compatto: una riga sottile invece della card grande */}
        <div className="rounded-xl bg-primary/10 px-3 py-2 text-primary md:rounded-2xl md:p-3">
          <div className="flex items-center gap-2.5">
            <span className="text-lg font-black leading-none md:text-2xl">{order?.percentuale_avanzamento ?? 0}%</span>
            <div className="h-2 min-w-0 flex-1 rounded-full bg-primary/15">
              <div
                className="h-2 rounded-full bg-primary transition-all"
                style={{ width: `${order?.percentuale_avanzamento ?? 0}%` }}
              />
            </div>
            <span className="shrink-0 text-xs font-semibold">{order?.status || "In lavorazione"}</span>
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

        <div className="mt-2 grid grid-cols-2 gap-1.5 md:mt-3 md:gap-2">
          <QuickAction icon={Camera} label="Foto" onClick={() => navigate(rapportinoManualeUrl)} />
          <QuickAction icon={AlertCircle} label="Ticket" onClick={() => navigate(`/campo/ticket/nuovo/${orderId}`)} />
        </div>

        {/* Tab selector */}
        <div className="mt-2 flex gap-1 overflow-x-auto scrollbar-hide md:mt-3">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
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
      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3 pb-28 md:space-y-4 md:px-4 md:py-4 md:pb-4">
	        <CampoCloseDayCard
	          isOperaio={isOperaio}
	          hasTimbrato={hasTimbratoQui}
	          isInCantiere={isInCantiere}
	          isInPausa={isInPausa}
	          uscitaRegistrata={uscitaRegistrataOggi}
	          checklistDone={checklistCompletataOggi}
	          rapportinoDone={rapportinoInviatoOggi}
	          fotoCount={fotoCountOggi}
	          materialiCount={materialiCountOggi}
	          oreRapportino={rapportinoOggi?.ore_lavorate ?? null}
	          avanzamentoRapportino={rapportinoOggi?.percentuale_avanzamento ?? null}
	        />

        {/* ── Tab: Descrizione ── */}
        {activeTab === "descrizione" && (
          <>
            <div className="grid grid-cols-3 gap-2 md:gap-3">
              <InfoTile label="Stato" value={order?.status || "In lavorazione"} icon={CheckCircle} />
              <InfoTile
                label="Inizio"
                value={order?.work_start_date ? format(new Date(order.work_start_date), "d MMM yyyy", { locale: it }) : "Non impostato"}
                icon={Clock}
              />
              <InfoTile
                label="Fine prevista"
                value={order?.work_end_date ? format(new Date(order.work_end_date), "d MMM yyyy", { locale: it }) : "Non impostata"}
                icon={CheckCircle}
              />
            </div>

            {/* Fasi di lavoro della commessa */}
            {fasiCommessa.length > 0 && (
              <div className="bg-background border border-border rounded-2xl p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Fasi di lavoro</p>
                  <span className="text-xs font-semibold text-primary">
                    {fasiCommessa.filter(f => f.status === "completata").length}/{fasiCommessa.length} completate
                  </span>
                </div>
                <div className="space-y-3">
                  {fasiCommessa.map((fase) => {
                    const done = fase.status === "completata";
                    const pct = done ? 100 : fase.percentuale;
                    return (
                      <div key={fase.id}>
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
                            <p className={`min-w-0 truncate text-sm ${done ? "text-muted-foreground line-through" : "font-medium text-foreground"}`}>
                              {fase.name}
                            </p>
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
                      </div>
                    );
                  })}
                </div>
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
                {customer.phone && (
                  <a
                    href={`tel:${customer.phone}`}
                    className="flex items-center gap-2 mt-2 text-primary text-sm"
                  >
                    <Phone className="w-4 h-4" />
                    <span>{customer.phone}</span>
                  </a>
                )}
              </div>
            )}

            {/* Materiali da installare */}
            {orderItems.length > 0 && (
              <div className="bg-background border border-border rounded-2xl p-4 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Materiali / Articoli</p>
                <div className="space-y-2">
                  {orderItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between">
                      <p className="text-sm text-foreground">{item.description || item.name}</p>
                      {item.quantity && (
                        <span className="text-xs text-primary">x{item.quantity}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Tab: Rapportini ── */}
        {activeTab === "rapportini" && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                onClick={() => navigate(rapportinoVocaleUrl)}
                className="w-full bg-primary text-primary-foreground font-bold py-3.5 rounded-xl text-base active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
              >
                <Mic className="w-5 h-5" />
                Rapportino vocale AI
              </button>
              <button
                onClick={() => navigate(`/campo/lavoro/${orderId}/rapportino`)}
                className="w-full bg-muted text-foreground border border-border font-semibold py-3.5 rounded-xl text-base active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Compila manualmente
              </button>
            </div>

            {rapportini.length === 0 ? (
              <div className="flex flex-col items-center py-12 gap-3 text-center">
                <FileText className="w-10 h-10 text-muted-foreground" />
                <div>
                  <p className="font-semibold text-foreground">Nessun rapportino per questo cantiere</p>
                  <p className="mt-1 text-sm text-muted-foreground">Aggiungi foto, ore, avanzamento e note dal cantiere.</p>
                </div>
              </div>
            ) : (
              rapportini.map((r) => (
                <div
                  key={r.id}
                  className="bg-muted border border-border rounded-2xl p-4"
                >
                  <div className="flex items-start justify-between mb-1">
                    <p className="font-semibold text-foreground">
                      {format(new Date(r.data_lavoro), "d MMM yyyy", { locale: it })}
                    </p>
                    {r.approvato ? (
                      <span className="flex items-center gap-1 text-[10px] bg-green-500/20 text-green-600 border border-green-500/20 rounded-full px-2 py-0.5">
                        <CheckCircle className="w-3 h-3" />
                        Approvato
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5">
                        <Clock className="w-3 h-3" />
                        In attesa
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    {r.ore_lavorate != null && <span>{r.ore_lavorate}h lavorate</span>}
                    {r.percentuale_avanzamento != null && <span>{r.percentuale_avanzamento}% avanzamento</span>}
                    {r.foto_urls?.length > 0 && <span>{r.foto_urls.length} foto</span>}
                  </div>
                  {r.descrizione_lavori && (
                    <p className="text-sm text-foreground mt-1 line-clamp-2">{r.descrizione_lavori}</p>
                  )}
                  {r.foto_urls?.length > 0 && (
                    <div className="flex gap-1 mt-2">
                      {r.foto_urls.slice(0, 3).map((url: string, i: number) => (
                        <img width={48} height={48} loading="lazy"
                          key={i}
                          src={url}
                          className="w-12 h-12 rounded-lg object-cover"
                          alt="Foto rapportino"
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Tab: Diario ── */}
        {activeTab === "diario" && (
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
                  const payload = entry.kind === "event" ? data.payload ?? {} : {};
                  const title = entry.kind === "event"
                    ? diaryEventLabel(data.event_type, payload)
                    : entry.kind === "audit"
                      ? data.title
                      : data.subject || (data.channel === "nota_interna" ? "Nota interna" : "Messaggio");
                  const body = entry.kind === "event"
                    ? payload.descrizione_lavori || payload.note || payload.message
                    : entry.kind === "audit"
                      ? data.description
                      : data.body;
                  const actorName = entry.kind === "message" ? data.sent_by_name : data.actor_name;
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
                          {payload.foto_count ? (
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
        )}

        {/* ── Tab: Documenti e Firma ── */}
        {activeTab === "documenti" && (
          <DocumentiFirmaTab orderId={orderId!} customer={customer} />
        )}

        {/* ── Tab: Chat ── */}
        {activeTab === "chat" && (
          <ChatCantiere orderId={orderId!} orderCode={order?.order_code ?? ""} />
        )}
      </div>

      {/* CTA sticky in basso */}
      <div className="sticky bottom-0 bg-background border-t border-border px-4 py-3 z-20 pb-20 md:pb-3">
        <button
          onClick={nextStickyAction.onClick}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-black text-white transition-transform active:scale-[0.98]",
            nextStickyAction.tone === "success" ? "bg-emerald-600" : "bg-primary",
          )}
        >
          <NextStickyIcon className="h-4 w-4" />
          {nextStickyAction.label}
        </button>
      </div>
    </div>
  );
}

function CampoCloseDayCard({
  isOperaio,
  hasTimbrato,
  isInCantiere,
  isInPausa,
  uscitaRegistrata,
  checklistDone,
  rapportinoDone,
  fotoCount,
  materialiCount,
  oreRapportino,
  avanzamentoRapportino,
}: {
  isOperaio: boolean;
  hasTimbrato: boolean;
  isInCantiere: boolean;
  isInPausa: boolean;
  uscitaRegistrata: boolean;
  checklistDone: boolean;
  rapportinoDone: boolean;
  fotoCount: number;
  materialiCount: number;
  oreRapportino: number | null;
  avanzamentoRapportino: number | null;
}) {
  // Il subappaltatore non timbra: la timbratura non è nella sua navigazione
  // (né sidebar né azioni rapide), quindi entrata/uscita resterebbero per
  // sempre "Manca" e la giornata non si chiuderebbe mai. Per lui la giornata
  // è checklist + rapportino.
  const entrataOk = isOperaio ? hasTimbrato : true;
  const uscitaOk = isOperaio ? uscitaRegistrata : true;

  const evidenceOk = fotoCount > 0 || materialiCount > 0 || avanzamentoRapportino != null;
  const requiredMissing = [entrataOk, checklistDone, rapportinoDone].filter((ok) => !ok).length;
  const readyToExit = entrataOk && checklistDone && rapportinoDone && !uscitaOk;
  const giornataCompleta = entrataOk && checklistDone && rapportinoDone && uscitaOk;

  const status = !entrataOk
    ? {
        label: "Avvio giornata",
        cls: "bg-blue-100 text-blue-800",
        text: "Prima registra l'entrata sul cantiere.",
      }
    : !checklistDone
      ? {
          label: "Sicurezza",
          cls: "bg-amber-100 text-amber-800",
          text: "Completa la checklist prima di proseguire.",
        }
      : !rapportinoDone
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
          : giornataCompleta
            ? {
                label: "Chiusa",
                cls: "bg-emerald-100 text-emerald-800",
                text: "Giornata allineata: ore, sicurezza e rapportino sono presenti.",
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
        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${status.cls}`}>
          {status.label}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
        {isOperaio && (
          <CloseDayStep ok={hasTimbrato} icon={LogIn} label="Entrata" detail={hasTimbrato ? "Registrata" : "Manca"} />
        )}
        <CloseDayStep ok={checklistDone} icon={ShieldCheck} label="Sicurezza" detail={checklistDone ? "Ok" : "Da fare"} />
        <CloseDayStep ok={evidenceOk} icon={Camera} label="Evidenze" detail={evidenceOk ? `${fotoCount} foto · ${materialiCount} mat.` : "Consigliate"} optional />
        <CloseDayStep ok={rapportinoDone} icon={FileText} label="Rapportino" detail={rapportinoDone ? `${oreRapportino ?? 0}h` : "Manca"} />
        <CloseDayStep ok={giornataCompleta} icon={LogOut} label="Uscita" detail={giornataCompleta ? "Registrata" : readyToExit ? "Pronta" : `${requiredMissing} blocchi`} />
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
}: {
  ok: boolean;
  icon: LucideIcon;
  label: string;
  detail: string;
  optional?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-xl border p-2.5",
      ok
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : optional
          ? "border-blue-100 bg-blue-50 text-blue-800"
          : "border-amber-200 bg-amber-50 text-amber-800",
    )}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" />
        <p className="min-w-0 truncate text-xs font-black">{label}</p>
      </div>
      <p className="mt-1 truncate text-[10px] font-semibold opacity-80">{detail}</p>
    </div>
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
      className="flex h-10 flex-col items-center justify-center gap-0.5 rounded-xl border bg-background px-1 text-[10px] font-bold leading-tight text-foreground shadow-sm transition-transform active:scale-[0.98] disabled:opacity-50 md:h-12 md:flex-row md:gap-2 md:px-3 md:text-xs"
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

  // Richieste firma esistenti per questo ordine
  const { data: firmeRichieste = [], isLoading } = useQuery<SignatureRequestRow[]>({
    queryKey: ["campo-firme-ordine", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signature_requests")
        .select("*")
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
        },
      });

      if (error) throw new Error(error.message || "Errore nell'invio della richiesta");
      if (data?.error) throw new Error(data.error);

      return data;
    },
    onSuccess: () => {
      toast.success("Richiesta di firma inviata! Il cliente riceverà un'email con il link per firmare.");
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
      {/* KPI documenti */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-muted border border-border rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-foreground">{firmeRichieste.length}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Totale</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-amber-600">{firmePending}</p>
          <p className="text-[10px] text-amber-600 mt-0.5">In attesa</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-green-600">{firmeSigned}</p>
          <p className="text-[10px] text-green-600 mt-0.5">Firmati</p>
        </div>
      </div>

      {/* Bottone nuova richiesta */}
      <button
        onClick={() => setShowNewDoc(!showNewDoc)}
        className="w-full bg-primary text-primary-foreground font-bold py-3.5 rounded-xl text-base active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
      >
        <PenLine className="w-5 h-5" />
        Richiedi firma documento
      </button>

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
              disabled={!selectedTipo || !customer?.email || isPending}
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
      ) : firmeRichieste.length === 0 ? (
        <div className="flex flex-col items-center py-10 gap-3 text-center">
          <ClipboardSignature className="w-12 h-12 text-muted-foreground/40" />
          <div>
            <p className="font-medium text-muted-foreground">Nessun documento</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Richiedi la firma del cliente su consegna, collaudo o altri documenti
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Storico documenti ({firmeRichieste.length})
          </p>
          {firmeRichieste.map((f) => {
            const tipoDoc = TIPI_DOCUMENTO.find(t => t.tipo === f.tipo_documento)
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
  const channelName = "cantiere-" + orderCode.toLowerCase().replace(/\s+/g, "-");

  const { data: canale, isLoading, isFetching } = useQuery({
    queryKey: ["campo-canale-cantiere", orderId, orderCode],
    queryFn: async () => {
      if (!orderCode) return null;
      const { data, error } = await supabase
        .from("internal_chat_channels")
        .select("id, name")
        .eq("name", channelName)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!orderCode,
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
