import { useMemo, useState } from "react";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { UpgradeScopriWall } from "@/components/subscription/UpgradeScopriBanner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldAlert, Plus, AlertTriangle, CheckCircle, Download, Loader2, HardHat, Users, ClipboardList, Building2, CalendarClock, RotateCcw, Pencil, Trash2, UserCheck } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EntityCustomFieldsSection } from "@/components/shared/EntityCustomFieldsSection";
import { OperationalKpiCard } from "@/components/orders/OperationalKpiCard";
import { KpiMobili } from "@/components/mobile/FiltriMobile";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { PrintPreviewModal } from "@/components/shared/PrintPreviewModal";
// MP-CAN-001 Fase 3 — types/constants/helpers estratti
import type {
  OrderOption,
  PosDocument, DuvriDocument, VerbaleSicurezza,
  SubappaltatoreSicurezza, AdempimentoSicurezza, PrintableSafetyDoc,
} from "./SicurezzaCantiere/types";
import { STATUS_COLORS, STATUS_LABELS } from "./SicurezzaCantiere/constants";
import { PosElencoTab } from "@/components/sicurezza/PosElencoTab";
import { FigureSicurezzaTab } from "@/components/sicurezza/FigureSicurezzaTab";
import {
  getSupabaseErrorMessage, escapeHtml, readFunctionError, isPastDate,
} from "./SicurezzaCantiere/helpers";

export default function SicurezzaCantiere() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const { isScopriPlan } = useSubscriptionLimits();

  const [duvriDialogOpen, setDuvriDialogOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [costiSicurezza, setCostiSicurezza] = useState("0");
  const [expandedDuvri, setExpandedDuvri] = useState<string | null>(null);
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  const [printTitle, setPrintTitle] = useState("");

  // M3 — verbali, subappaltatori, scadenzario
  const [verbaleDialogOpen, setVerbaleDialogOpen] = useState(false);
  // Modifica ed eliminazione di verbali, subappaltatori e adempimenti: finora
  // le tre schede erano di SOLO inserimento. Un verbale con la data sbagliata,
  // un subappaltatore che non lavora più al cantiere o un adempimento inserito
  // due volte restavano lì per sempre.
  const [verbaleInModifica, setVerbaleInModifica] = useState<string | null>(null);
  const [subappaltatoreInModifica, setSubappaltatoreInModifica] = useState<string | null>(null);
  const [adempimentoInModifica, setAdempimentoInModifica] = useState<string | null>(null);
  const [daCancellare, setDaCancellare] = useState<
    { tabella: "verbali_sicurezza" | "subappaltatori_sicurezza" | "adempimenti_sicurezza"; id: string; etichetta: string; descrizione: string } | null
  >(null);
  const [verbaleForm, setVerbaleForm] = useState({ order_id: "", data: format(new Date(), "yyyy-MM-dd"), tipo: "sopralluogo", esito: "conforme", note: "", redatto_da: "" });
  const [subappaltatoreDialogOpen, setSubappaltatoreDialogOpen] = useState(false);
  const [subappaltatoreForm, setSubappaltatoreForm] = useState({ order_id: "", ragione_sociale: "", tipo_lavori: "", responsabile: "", telefono: "", data_inizio: "", data_fine: "", durc_scadenza: "" });
  const [adempimentoDialogOpen, setAdempimentoDialogOpen] = useState(false);
  const [adempimentoForm, setAdempimentoForm] = useState({ order_id: "", titolo: "", tipo: "corso_formazione", scadenza_data: "", note: "" });

  // Fetch orders for selector
  const { data: orders = [], isError: ordersError } = useQuery<OrderOption[]>({
    queryKey: ["orders-for-sicurezza", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      // 2026-05-27 (UX audit): .limit(50) → 500 — vedi nota in GiornaleLavori
      const { data, error } = await supabase
        .from("orders")
        .select("id, description, order_code")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(getSupabaseErrorMessage(error));
      return (data || []) as OrderOption[];
    },
    enabled: !!companyId,
  });

  // Fetch POS documents
  const { data: posDocs = [] } = useQuery<Pick<PosDocument, "id" | "status" | "order_id" | "created_at">[]>({
    queryKey: ["pos-documents", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("pos_documents")
        .select("id, status, order_id, created_at")
        .eq("company_id", companyId)
        .or("document_type.is.null,document_type.eq.pos")
        .is("superseded_by", null)
        .order("created_at", { ascending: false });
      if (error) throw new Error(getSupabaseErrorMessage(error));
      return (data || []) as PosDocument[];
    },
    enabled: !!companyId,
  });

  // Fetch DUVRI documents
  const { data: duvriDocs = [], isLoading: duvriLoading, isError: duvriError } = useQuery<DuvriDocument[]>({
    queryKey: ["duvri-documents", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("duvri_documents")
        .select("*, orders(description, order_code)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(getSupabaseErrorMessage(error));
      return (data || []) as DuvriDocument[];
    },
    enabled: !!companyId,
  });

  // M3 queries
  const { data: verbali = [], isLoading: verbaliLoading, isError: verbaliError } = useQuery<VerbaleSicurezza[]>({
    queryKey: ["verbali-sicurezza", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase.from("verbali_sicurezza").select("*, orders(description, order_code)").eq("company_id", companyId).order("data", { ascending: false });
      if (error) throw new Error(getSupabaseErrorMessage(error));
      return (data || []) as VerbaleSicurezza[];
    },
    enabled: !!companyId,
  });

  const { data: subappaltatori = [], isLoading: subappaltatoriLoading, isError: subappaltatoriError } = useQuery<SubappaltatoreSicurezza[]>({
    queryKey: ["subappaltatori-sicurezza", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase.from("subappaltatori_sicurezza").select("*, orders(description, order_code)").eq("company_id", companyId).order("created_at", { ascending: false });
      if (error) throw new Error(getSupabaseErrorMessage(error));
      return (data || []) as SubappaltatoreSicurezza[];
    },
    enabled: !!companyId,
  });

  const { data: adempimenti = [], isLoading: adempimentiLoading, isError: adempimentiError } = useQuery<AdempimentoSicurezza[]>({
    queryKey: ["adempimenti-sicurezza", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase.from("adempimenti_sicurezza").select("*, orders(description, order_code)").eq("company_id", companyId).order("scadenza_data", { ascending: true });
      if (error) throw new Error(getSupabaseErrorMessage(error));
      return (data || []) as AdempimentoSicurezza[];
    },
    enabled: !!companyId,
  });

  const safetyStats = useMemo(() => {
    const durcScaduti = subappaltatori.filter((s) => isPastDate(s.durc_scadenza)).length;
    const adempimentiScaduti = adempimenti.filter((a) => a.stato !== "completato" && isPastDate(a.scadenza_data)).length;
    const adempimentiDaFare = adempimenti.filter((a) => a.stato !== "completato").length;

    return [
      {
        label: "POS",
        value: posDocs.length,
        helper: `${posDocs.filter((d) => d.status === "bozza").length} bozze`,
        tone: "blue",
        icon: HardHat,
      },
      {
        label: "DUVRI",
        value: duvriDocs.length,
        helper: `${duvriDocs.filter((d) => d.status === "bozza").length} bozze`,
        tone: "indigo",
        icon: Users,
      },
      {
        label: "Subappaltatori",
        value: subappaltatori.length,
        helper: durcScaduti ? `${durcScaduti} DURC scaduti` : "DURC sotto controllo",
        tone: durcScaduti ? "red" : "green",
        icon: Building2,
      },
      {
        label: "Scadenze aperte",
        value: adempimentiDaFare,
        helper: adempimentiScaduti ? `${adempimentiScaduti} scadute` : "Nessuna scaduta",
        tone: adempimentiScaduti ? "red" : "amber",
        icon: CalendarClock,
      },
    ];
  }, [adempimenti, duvriDocs, posDocs, subappaltatori]);

  // M3 mutations
  const createVerbaleMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Nessuna azienda selezionata");
      if (!verbaleForm.note.trim() && !verbaleForm.redatto_da.trim()) throw new Error("Inserisci almeno le note o il nome del redattore");
      const campi = { order_id: verbaleForm.order_id || null, data: verbaleForm.data, tipo: verbaleForm.tipo, esito: verbaleForm.esito, note: verbaleForm.note.trim() || null, redatto_da: verbaleForm.redatto_da.trim() || null };
      const { error } = verbaleInModifica
        ? await supabase.from("verbali_sicurezza").update(campi).eq("id", verbaleInModifica).eq("company_id", companyId)
        : await supabase.from("verbali_sicurezza").insert({ company_id: companyId, ...campi });
      if (error) throw new Error(getSupabaseErrorMessage(error));
    },
    onSuccess: () => { toast.success(verbaleInModifica ? "Verbale corretto" : "Verbale salvato"); queryClient.invalidateQueries({ queryKey: ["verbali-sicurezza", companyId] }); setVerbaleDialogOpen(false); setVerbaleInModifica(null); setVerbaleForm({ order_id: "", data: format(new Date(), "yyyy-MM-dd"), tipo: "sopralluogo", esito: "conforme", note: "", redatto_da: "" }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const createSubappaltatoreM = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Nessuna azienda selezionata");
      if (!subappaltatoreForm.ragione_sociale.trim()) throw new Error("Ragione sociale obbligatoria");
      const campi = { order_id: subappaltatoreForm.order_id || null, ragione_sociale: subappaltatoreForm.ragione_sociale.trim(), tipo_lavori: subappaltatoreForm.tipo_lavori || null, responsabile: subappaltatoreForm.responsabile || null, telefono: subappaltatoreForm.telefono || null, data_inizio: subappaltatoreForm.data_inizio || null, data_fine: subappaltatoreForm.data_fine || null, durc_scadenza: subappaltatoreForm.durc_scadenza || null };
      const { error } = subappaltatoreInModifica
        ? await supabase.from("subappaltatori_sicurezza").update(campi).eq("id", subappaltatoreInModifica).eq("company_id", companyId)
        : await supabase.from("subappaltatori_sicurezza").insert({ company_id: companyId, ...campi });
      if (error) throw new Error(getSupabaseErrorMessage(error));
    },
    onSuccess: () => { toast.success(subappaltatoreInModifica ? "Subappaltatore aggiornato" : "Subappaltatore aggiunto"); queryClient.invalidateQueries({ queryKey: ["subappaltatori-sicurezza", companyId] }); setSubappaltatoreDialogOpen(false); setSubappaltatoreInModifica(null); setSubappaltatoreForm({ order_id: "", ragione_sociale: "", tipo_lavori: "", responsabile: "", telefono: "", data_inizio: "", data_fine: "", durc_scadenza: "" }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const createAdempimentoM = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Nessuna azienda selezionata");
      if (!adempimentoForm.titolo.trim()) throw new Error("Titolo obbligatorio");
      const campi = { order_id: adempimentoForm.order_id || null, titolo: adempimentoForm.titolo.trim(), tipo: adempimentoForm.tipo, scadenza_data: adempimentoForm.scadenza_data || null, note: adempimentoForm.note || null };
      // In modifica lo `stato` NON si tocca: è governato dal pulsante
      // Completa/Riapri, e riportarlo a "da_fare" qui riaprirebbe di nascosto
      // un adempimento già chiuso.
      const { error } = adempimentoInModifica
        ? await supabase.from("adempimenti_sicurezza").update(campi).eq("id", adempimentoInModifica).eq("company_id", companyId)
        : await supabase.from("adempimenti_sicurezza").insert({ company_id: companyId, ...campi, stato: "da_fare" });
      if (error) throw new Error(getSupabaseErrorMessage(error));
    },
    onSuccess: () => { toast.success(adempimentoInModifica ? "Adempimento aggiornato" : "Adempimento aggiunto"); queryClient.invalidateQueries({ queryKey: ["adempimenti-sicurezza", companyId] }); setAdempimentoDialogOpen(false); setAdempimentoInModifica(null); setAdempimentoForm({ order_id: "", titolo: "", tipo: "corso_formazione", scadenza_data: "", note: "" }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleAdempimentoStato = useMutation({
    mutationFn: async ({ id, stato }: { id: string; stato: string }) => {
      if (!companyId) throw new Error("Nessuna azienda selezionata");
      const { error } = await supabase.from("adempimenti_sicurezza").update({ stato }).eq("id", id).eq("company_id", companyId);
      if (error) throw new Error(getSupabaseErrorMessage(error));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["adempimenti-sicurezza", companyId] }),
    onError: (err: Error) => toast.error(err.message),
  });

  // Check subappaltatori per ordine selezionato
  const { data: hasSubappaltatori } = useQuery({
    queryKey: ["has-subappaltatori", selectedOrderId],
    queryFn: async () => {
      if (!companyId || !selectedOrderId) return false;
      const { count, error } = await supabase
        .from("purchase_orders")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("order_id", selectedOrderId);
      if (error) throw new Error(getSupabaseErrorMessage(error));
      return (count || 0) > 0;
    },
    enabled: !!companyId && !!selectedOrderId,
  });

  // Generate DUVRI
  const generateDuvri = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Nessuna azienda selezionata");
      if (!selectedOrderId) throw new Error("Seleziona una commessa prima di generare il DUVRI");
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("Sessione non valida. Accedi di nuovo e riprova.");
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/genera-duvri`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            order_id: selectedOrderId,
            company_id: companyId,
            costi_sicurezza: parseFloat(costiSicurezza) || 0,
          }),
        }
      );
      if (!res.ok) {
        throw new Error(await readFunctionError(res, "Errore generazione DUVRI"));
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("DUVRI generato con successo!");
      queryClient.invalidateQueries({ queryKey: ["duvri-documents", companyId] });
      setDuvriDialogOpen(false);
      setSelectedOrderId("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Riapertura di un documento chiuso per errore. Il flusso era a senso unico:
  // approvato un POS o firmato un DUVRI, l'unico rimedio era rifarlo da capo.
  // Non è un'azione da fare per sbaglio (sono documenti di conformità), quindi
  // si conferma prima.
  const [daRiaprire, setDaRiaprire] = useState<
    { tipo: "DUVRI"; id: string } | null
  >(null);

  /**
   * Aprire "Nuovo" azzera sempre il modulo e la modalità modifica: senza,
   * dopo aver corretto un record il pulsante Nuovo lo ripresenterebbe già
   * compilato e ne creerebbe un duplicato.
   */
  const nuovoVerbale = () => {
    setVerbaleInModifica(null);
    setVerbaleForm({ order_id: "", data: format(new Date(), "yyyy-MM-dd"), tipo: "sopralluogo", esito: "conforme", note: "", redatto_da: "" });
    setVerbaleDialogOpen(true);
  };
  const nuovoSubappaltatore = () => {
    setSubappaltatoreInModifica(null);
    setSubappaltatoreForm({ order_id: "", ragione_sociale: "", tipo_lavori: "", responsabile: "", telefono: "", data_inizio: "", data_fine: "", durc_scadenza: "" });
    setSubappaltatoreDialogOpen(true);
  };
  const nuovoAdempimento = () => {
    setAdempimentoInModifica(null);
    setAdempimentoForm({ order_id: "", titolo: "", tipo: "corso_formazione", scadenza_data: "", note: "" });
    setAdempimentoDialogOpen(true);
  };

  /** Eliminazione di un verbale / subappaltatore / adempimento inserito per errore. */
  const eliminaRiga = useMutation({
    mutationFn: async (bersaglio: { tabella: string; id: string }) => {
      if (!companyId) throw new Error("Nessuna azienda selezionata");
      const { error } = await supabase
        .from(bersaglio.tabella as never)
        .delete()
        .eq("id", bersaglio.id)
        .eq("company_id", companyId);
      if (error) throw new Error(getSupabaseErrorMessage(error));
      return bersaglio.tabella;
    },
    onSuccess: (tabella) => {
      toast.success("Eliminato");
      const chiavi: Record<string, string> = {
        verbali_sicurezza: "verbali-sicurezza",
        subappaltatori_sicurezza: "subappaltatori-sicurezza",
        adempimenti_sicurezza: "adempimenti-sicurezza",
      };
      queryClient.invalidateQueries({ queryKey: [chiavi[tabella], companyId] });
      setDaCancellare(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateDuvriStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (!companyId) throw new Error("Nessuna azienda selezionata");
      const { error } = await supabase
        .from("duvri_documents")
        .update({ status })
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw new Error(getSupabaseErrorMessage(error));
    },
    onSuccess: () => {
      toast.success("Stato DUVRI aggiornato");
      queryClient.invalidateQueries({ queryKey: ["duvri-documents", companyId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const buildDocHtml = (doc: PrintableSafetyDoc, tipo: "POS" | "DUVRI") => {
    const contenuto = doc.generated_content || "Nessun contenuto disponibile.";
    const order = orders.find((o) => o.id === doc.order_id);
    const orderLabel = order?.order_code || order?.description || doc.order_id || "";
    const safeOrderLabel = escapeHtml(orderLabel);
    const safeStatus = escapeHtml(doc.status || "—");
    const safeGeneratedDate = escapeHtml(doc.created_at ? new Date(doc.created_at).toLocaleDateString("it-IT") : "—");
    return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(tipo)} — ${safeOrderLabel}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; color: #111; line-height: 1.6; }
    h1 { font-size: 1.5rem; border-bottom: 2px solid #333; padding-bottom: 8px; }
    .meta { display: flex; gap: 24px; flex-wrap: wrap; margin: 16px 0; font-size: 0.875rem; color: #555; }
    .meta span { display: flex; gap: 4px; }
    .content { white-space: pre-wrap; margin-top: 24px; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <h1>D.Lgs 81/08 — ${escapeHtml(tipo)}</h1>
  <div class="meta">
    <span><strong>Ordine:</strong> ${safeOrderLabel}</span>
    <span><strong>Stato:</strong> ${safeStatus}</span>
    <span><strong>Generato:</strong> ${safeGeneratedDate}</span>
  </div>
  <div class="content">${escapeHtml(contenuto)}</div>
</body>
</html>`;
  };

  if (isScopriPlan) return <UpgradeScopriWall type="generic" inline />;

  return (
    <div className="space-y-6 max-sm:space-y-3">
      {/* Header */}
      <div className="testata-pagina rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-4 py-5 shadow-sm sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">Sicurezza Cantiere</h1>
            <p className="mt-0.5 text-sm text-slate-500">D.Lgs 81/08 — documenti obbligatori, scadenze e subappalti.</p>
          </div>
        </div>
      </div>

      {/* Info banner (mobile no: testo normativo, non un'azione) */}
      <div className="flex items-start gap-3 p-3 rounded-lg border bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-700 max-sm:hidden">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs sm:text-sm text-amber-700 dark:text-amber-400">
          POS e DUVRI sono documenti obbligatori ai sensi del D.Lgs 81/08. Il POS segue il modello ministeriale e l'app lo compila con i dati della commessa; il DUVRI lo prepara l'AI.
        </p>
      </div>

      {/* Mobile: i due numeri che chiedono di fare qualcosa. */}
      <KpiMobili
        className="sm:hidden"
        voci={[
          {
            label: "Scadenze aperte",
            valore: String(adempimenti.filter((a) => a.stato !== "completato").length),
            tono: adempimenti.some((a) => a.stato !== "completato" && isPastDate(a.scadenza_data)) ? "text-red-600" : undefined,
          },
          {
            label: "DURC scaduti",
            valore: String(subappaltatori.filter((s) => isPastDate(s.durc_scadenza)).length),
            tono: subappaltatori.some((s) => isPastDate(s.durc_scadenza)) ? "text-red-600" : undefined,
          },
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 max-sm:hidden">
        {safetyStats.map((stat) => (
          <OperationalKpiCard
            key={stat.label}
            icon={stat.icon}
            label={stat.label}
            value={stat.value}
            hint={stat.helper}
            tone={stat.tone === "green" ? "green" : stat.tone === "red" ? "red" : stat.tone === "amber" ? "amber" : "blue"}
          />
        ))}
      </div>

      {/* Tabs POS / DUVRI */}
      {/* Mobile: POS, verbali e scadenze (quel che serve in cantiere). Figure e
          DUVRI si preparano al computer; i subappaltatori hanno la loro pagina. */}
      <Tabs defaultValue="pos">
        <TabsList className="flex flex-nowrap overflow-x-auto scrollbar-none max-sm:grid max-sm:w-full max-sm:grid-cols-3">
          <TabsTrigger value="pos" className="shrink-0 gap-1.5">
            <HardHat className="h-4 w-4" /> POS
          </TabsTrigger>
          <TabsTrigger value="figure" className="shrink-0 gap-1.5 max-sm:hidden">
            <UserCheck className="h-4 w-4" /> Figure
          </TabsTrigger>
          <TabsTrigger value="duvri" className="shrink-0 gap-1.5 max-sm:hidden">
            <Users className="h-4 w-4" /> DUVRI
          </TabsTrigger>
          <TabsTrigger value="verbali" className="shrink-0 gap-1.5">
            <ClipboardList className="h-4 w-4" /> Verbali
          </TabsTrigger>
          <TabsTrigger value="subappaltatori" className="shrink-0 gap-1.5 max-sm:hidden">
            <Building2 className="h-4 w-4" /> Subappal.
          </TabsTrigger>
          <TabsTrigger value="scadenzario" className="shrink-0 gap-1.5">
            <CalendarClock className="h-4 w-4" /> Scadenze
          </TabsTrigger>
        </TabsList>

        {/* ───── POS TAB: modello ufficiale (DI 9/9/2014) ───── */}
        <TabsContent value="pos" className="space-y-4 mt-4 max-sm:mt-3 max-sm:space-y-2">
          <PosElencoTab orders={orders} />
        </TabsContent>

        {/* ───── FIGURE DELLA SICUREZZA ───── */}
        <TabsContent value="figure" className="space-y-4 mt-4 max-sm:mt-3 max-sm:space-y-2">
          <FigureSicurezzaTab />
        </TabsContent>

        {/* ───── DUVRI TAB ───── */}
        <TabsContent value="duvri" className="space-y-4 mt-4 max-sm:mt-3 max-sm:space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Documento Unico Valutazione Rischi Interferenza</p>
            <Button size="sm" onClick={() => setDuvriDialogOpen(true)} className="bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm hover:from-orange-600 hover:to-amber-600">
              <Plus className="h-4 w-4 mr-1" /> Genera DUVRI
            </Button>
          </div>

          {duvriLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : duvriError || ordersError ? (
            <Card>
              <CardContent className="py-10 text-center space-y-2">
                <AlertTriangle className="h-10 w-10 text-destructive/70 mx-auto" aria-hidden="true" />
                <p className="font-medium">Documenti DUVRI non disponibili</p>
                <p className="text-sm text-muted-foreground">Riprova tra poco o aggiorna la pagina.</p>
              </CardContent>
            </Card>
          ) : duvriDocs.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                <Users className="h-12 w-12 text-muted-foreground/40" />
                <div>
                  <p className="font-medium">Nessun DUVRI generato</p>
                  <p className="text-sm text-muted-foreground">Il DUVRI è richiesto quando ci sono subappaltatori sull'ordine</p>
                </div>
                <Button size="sm" onClick={() => setDuvriDialogOpen(true)} className="bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm hover:from-orange-600 hover:to-amber-600">
                  <Plus className="h-4 w-4 mr-1" /> Genera DUVRI
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {duvriDocs.map((doc) => (
                <Card key={doc.id} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-sm font-medium truncate">
                          {doc.orders?.description || "Ordine"}
                          {doc.orders?.order_code && <span className="ml-2 text-xs text-muted-foreground font-mono">#{doc.orders.order_code}</span>}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Committente: {doc.committente_nome} · {format(new Date(doc.created_at), "dd/MM/yyyy", { locale: it })}
                        </CardDescription>
                      </div>
                      <Badge className={`${STATUS_COLORS[doc.status] || STATUS_COLORS.bozza} text-xs shrink-0`}>
                        {STATUS_LABELS[doc.status] || doc.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      {doc.subappaltatori?.length > 0 && (
                        <span>🏗️ {doc.subappaltatori.length} subappaltatori</span>
                      )}
                      {doc.interferenze?.length > 0 && (
                        <><span>·</span><span>⚠️ {doc.interferenze.length} interferenze</span></>
                      )}
                      {doc.costi_sicurezza > 0 && (
                        <><span>·</span><span>💶 €{Number(doc.costi_sicurezza).toLocaleString("it-IT")}</span></>
                      )}
                    </div>

                    {expandedDuvri === doc.id && (
                      <div className="space-y-3 pt-2 border-t">
                        {doc.interferenze?.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold mb-1">Interferenze e misure</p>
                            <div className="space-y-1">
                              {doc.interferenze.map((i, idx) => (
                                <div key={idx} className="text-xs p-2 rounded bg-muted/50 space-y-0.5">
                                  <div className="font-medium">⚠️ {i.rischio || "Interferenza da verificare"}</div>
                                  {i.livello_rischio && <div className="text-muted-foreground">Livello: {i.livello_rischio}</div>}
                                  <div className="text-muted-foreground">✅ {i.misura || i.misura_prevenzione || "Misura da completare"}</div>
                                  {i.responsabile && <div className="text-muted-foreground">👷 {i.responsabile}</div>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {doc.misure_prevenzione && (
                          <div>
                            <p className="text-xs font-semibold mb-1">Misure generali</p>
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{doc.misure_prevenzione}</p>
                          </div>
                        )}
                        <EntityCustomFieldsSection entityType="duvri_document" entityId={doc.id} />
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setExpandedDuvri(expandedDuvri === doc.id ? null : doc.id)}
                      >
                        {expandedDuvri === doc.id ? "Nascondi dettagli" : "Vedi dettagli"}
                      </Button>
                      {doc.status === "bozza" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={updateDuvriStatus.isPending}
                          onClick={() => updateDuvriStatus.mutate({ id: doc.id, status: "firmato" })}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" /> Segna firmato
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={updateDuvriStatus.isPending}
                          onClick={() => setDaRiaprire({ tipo: "DUVRI", id: doc.id })}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" /> Riporta in bozza
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => { setPrintTitle(`DUVRI — ${doc.id}`); setPrintHtml(buildDocHtml(doc, "DUVRI")); }}
                      >
                        <Download className="h-3 w-3 mr-1" /> PDF
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ───── VERBALI TAB ───── */}
        <TabsContent value="verbali" className="space-y-4 mt-4 max-sm:mt-3 max-sm:space-y-2">
          <div className="flex items-center justify-between max-sm:justify-end">
            <p className="text-sm text-muted-foreground max-sm:hidden">Verbali ispezioni e sopralluoghi D.Lgs 81/08</p>
            <Button size="sm" onClick={nuovoVerbale} className="max-sm:h-8 max-sm:text-xs bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm hover:from-orange-600 hover:to-amber-600">
              <Plus className="h-4 w-4 mr-1" /> Nuovo verbale
            </Button>
          </div>
          {verbaliLoading ? <Skeleton className="h-20 w-full" /> : verbaliError ? (
            <Card><CardContent className="py-10 text-center space-y-2 max-sm:py-5">
              <AlertTriangle className="h-10 w-10 text-destructive/70 mx-auto" aria-hidden="true" />
              <p className="font-medium">Verbali non disponibili</p>
              <p className="text-sm text-muted-foreground">Riprova tra poco o aggiorna la pagina.</p>
            </CardContent></Card>
          ) : verbali.length === 0 ? (
            <Card><CardContent className="py-10 text-center space-y-2 max-sm:py-5">
              <ClipboardList className="h-10 w-10 text-muted-foreground/40 mx-auto max-sm:hidden" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">Nessun verbale registrato</p>
              <Button size="sm" onClick={nuovoVerbale} className="bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm hover:from-orange-600 hover:to-amber-600 max-sm:hidden"><Plus className="h-4 w-4 mr-1" />Aggiungi verbale</Button>
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {verbali.map((v) => (
                <Card key={v.id}>
                  <CardContent className="py-3 px-4 flex items-start justify-between gap-3 max-sm:px-3 max-sm:py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm capitalize">{v.tipo}</span>
                        <Badge className={v.esito === "conforme" ? "bg-green-100 text-green-800 text-xs" : v.esito === "non_conforme" ? "bg-red-100 text-red-800 text-xs" : "bg-yellow-100 text-yellow-800 text-xs"}>
                          {v.esito === "conforme" ? "Conforme" : v.esito === "non_conforme" ? "Non conforme" : "Parz. conforme"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{v.data?.split("-").reverse().join("/")}</span>
                      </div>
                      {v.orders && <p className="text-xs text-muted-foreground mt-0.5">Cantiere: {v.orders.description}</p>}
                      {v.redatto_da && <p className="text-xs text-muted-foreground">Redatto da: {v.redatto_da}</p>}
                      {v.note && <p className="text-xs text-muted-foreground mt-1 italic">{v.note}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8" title="Modifica verbale"
                        onClick={() => {
                          setVerbaleInModifica(v.id);
                          setVerbaleForm({
                            order_id: v.order_id ?? "",
                            data: v.data ?? format(new Date(), "yyyy-MM-dd"),
                            tipo: v.tipo ?? "sopralluogo",
                            esito: v.esito ?? "conforme",
                            note: v.note ?? "",
                            redatto_da: v.redatto_da ?? "",
                          });
                          setVerbaleDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8" title="Elimina verbale"
                        onClick={() => setDaCancellare({
                          tabella: "verbali_sicurezza", id: v.id, etichetta: "il verbale",
                          descrizione: `${v.tipo ?? "verbale"} del ${(v.data ?? "").split("-").reverse().join("/")}`,
                        })}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ───── SUBAPPALTATORI TAB ───── */}
        <TabsContent value="subappaltatori" className="space-y-4 mt-4 max-sm:mt-3 max-sm:space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Registro subappaltatori con verifica DURC</p>
            <Button size="sm" onClick={nuovoSubappaltatore} className="bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm hover:from-orange-600 hover:to-amber-600">
              <Plus className="h-4 w-4 mr-1" /> Aggiungi
            </Button>
          </div>
          {subappaltatoriLoading ? <Skeleton className="h-20 w-full" /> : subappaltatoriError ? (
            <Card><CardContent className="py-10 text-center space-y-2 max-sm:py-5">
              <AlertTriangle className="h-10 w-10 text-destructive/70 mx-auto" aria-hidden="true" />
              <p className="font-medium">Subappaltatori non disponibili</p>
              <p className="text-sm text-muted-foreground">Riprova tra poco o aggiorna la pagina.</p>
            </CardContent></Card>
          ) : subappaltatori.length === 0 ? (
            <Card><CardContent className="py-10 text-center space-y-2 max-sm:py-5">
              <Building2 className="h-10 w-10 text-muted-foreground/40 mx-auto max-sm:hidden" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">Nessun subappaltatore registrato</p>
              <Button size="sm" onClick={nuovoSubappaltatore} className="bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm hover:from-orange-600 hover:to-amber-600 max-sm:hidden"><Plus className="h-4 w-4 mr-1" />Aggiungi subappaltatore</Button>
            </CardContent></Card>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ragione Sociale</TableHead>
                    <TableHead className="hidden sm:table-cell">Lavori</TableHead>
                    <TableHead className="hidden md:table-cell">Responsabile</TableHead>
                    <TableHead>DURC Scade</TableHead>
                    <TableHead className="w-[92px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subappaltatori.map((s) => {
                    const durcScaduto = isPastDate(s.durc_scadenza);
                    return (
                      <TableRow key={s.id}>
                        <TableCell>
                          <p className="font-medium text-sm">{s.ragione_sociale}</p>
                          {s.orders && <p className="text-xs text-muted-foreground">{s.orders.description}</p>}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm">{s.tipo_lavori || "—"}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm">{s.responsabile || "—"}</TableCell>
                        <TableCell>
                          {s.durc_scadenza ? (
                            <Badge className={durcScaduto ? "bg-red-100 text-red-800 text-xs" : "bg-green-100 text-green-800 text-xs"}>
                              {s.durc_scadenza.split("-").reverse().join("/")}
                            </Badge>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8" title="Modifica"
                              onClick={() => {
                                setSubappaltatoreInModifica(s.id);
                                setSubappaltatoreForm({
                                  order_id: s.order_id ?? "",
                                  ragione_sociale: s.ragione_sociale ?? "",
                                  tipo_lavori: s.tipo_lavori ?? "",
                                  responsabile: s.responsabile ?? "",
                                  telefono: s.telefono ?? "",
                                  data_inizio: s.data_inizio ?? "",
                                  data_fine: s.data_fine ?? "",
                                  durc_scadenza: s.durc_scadenza ?? "",
                                });
                                setSubappaltatoreDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8" title="Elimina"
                              onClick={() => setDaCancellare({
                                tabella: "subappaltatori_sicurezza", id: s.id,
                                etichetta: "il subappaltatore", descrizione: s.ragione_sociale ?? "",
                              })}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ───── SCADENZARIO TAB ───── */}
        <TabsContent value="scadenzario" className="space-y-4 mt-4 max-sm:mt-3 max-sm:space-y-2">
          <div className="flex items-center justify-between max-sm:justify-end">
            <p className="text-sm text-muted-foreground max-sm:hidden">Adempimenti obbligatori D.Lgs 81/08</p>
            <Button size="sm" onClick={nuovoAdempimento} className="max-sm:h-8 max-sm:text-xs bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm hover:from-orange-600 hover:to-amber-600">
              <Plus className="h-4 w-4 mr-1" /> Aggiungi
            </Button>
          </div>
          {adempimentiLoading ? <Skeleton className="h-20 w-full" /> : adempimentiError ? (
            <Card><CardContent className="py-10 text-center space-y-2 max-sm:py-5">
              <AlertTriangle className="h-10 w-10 text-destructive/70 mx-auto" aria-hidden="true" />
              <p className="font-medium">Scadenzario non disponibile</p>
              <p className="text-sm text-muted-foreground">Riprova tra poco o aggiorna la pagina.</p>
            </CardContent></Card>
          ) : adempimenti.length === 0 ? (
            <Card><CardContent className="py-10 text-center space-y-2 max-sm:py-5">
              <CalendarClock className="h-10 w-10 text-muted-foreground/40 mx-auto max-sm:hidden" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">Nessun adempimento in scadenzario</p>
              <Button size="sm" onClick={nuovoAdempimento} className="bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm hover:from-orange-600 hover:to-amber-600 max-sm:hidden"><Plus className="h-4 w-4 mr-1" />Aggiungi adempimento</Button>
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {adempimenti.map((a) => {
                const isScaduto = isPastDate(a.scadenza_data) && a.stato !== "completato";
                return (
                  <Card key={a.id} className={isScaduto ? "border-red-200" : ""}>
                    <CardContent className="py-3 px-4 flex items-start justify-between gap-3 max-sm:px-3 max-sm:py-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{a.titolo}</span>
                          <Badge className={a.stato === "completato" ? "bg-green-100 text-green-800 text-xs" : isScaduto ? "bg-red-100 text-red-800 text-xs" : "bg-yellow-100 text-yellow-800 text-xs"}>
                            {a.stato === "completato" ? "Completato" : isScaduto ? "Scaduto" : "Da fare"}
                          </Badge>
                          {a.scadenza_data && <span className="text-xs text-muted-foreground">{a.scadenza_data.split("-").reverse().join("/")}</span>}
                        </div>
                        {a.tipo && <p className="text-xs text-muted-foreground capitalize">{a.tipo.replace(/_/g, " ")}</p>}
                        {a.note && <p className="text-xs text-muted-foreground italic mt-1">{a.note}</p>}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 h-7 text-xs"
                        disabled={toggleAdempimentoStato.isPending}
                        onClick={() => toggleAdempimentoStato.mutate({ id: a.id, stato: a.stato === "completato" ? "da_fare" : "completato" })}
                      >
                        {a.stato === "completato" ? "Riapri" : "Completa"}
                      </Button>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8" title="Modifica adempimento"
                          onClick={() => {
                            setAdempimentoInModifica(a.id);
                            setAdempimentoForm({
                              order_id: a.order_id ?? "",
                              titolo: a.titolo ?? "",
                              tipo: a.tipo ?? "corso_formazione",
                              scadenza_data: a.scadenza_data ?? "",
                              note: a.note ?? "",
                            });
                            setAdempimentoDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8" title="Elimina adempimento"
                          onClick={() => setDaCancellare({
                            tabella: "adempimenti_sicurezza", id: a.id,
                            etichetta: "l'adempimento", descrizione: a.titolo ?? "",
                          })}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

      </Tabs>

      {/* ───── Dialog Genera POS ───── */}
      {/* ───── Dialog Genera DUVRI ───── */}
      <Dialog open={duvriDialogOpen} onOpenChange={setDuvriDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Genera DUVRI con AI
            </DialogTitle>
            <DialogDescription className="max-sm:sr-only">
              Seleziona la commessa, verifica i subappaltatori e genera il documento DUVRI.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Ordine / Cantiere</Label>
              <Select value={selectedOrderId || undefined} onValueChange={setSelectedOrderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona ordine" />
                </SelectTrigger>
                <SelectContent>
                  {orders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.order_code ? `#${o.order_code} — ` : ""}{o.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedOrderId && hasSubappaltatori === false && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  Nessun subappaltatore registrato per questo ordine. Il DUVRI è richiesto quando ci sono subappaltatori. Puoi comunque generarlo come documento preventivo.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Costi sicurezza stimati (€)</Label>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={costiSicurezza}
                onChange={(e) => setCostiSicurezza(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="max-sm:hidden" onClick={() => setDuvriDialogOpen(false)}>Annulla</Button>
            <Button
              onClick={() => generateDuvri.mutate()}
              disabled={!selectedOrderId || generateDuvri.isPending}
            >
              {generateDuvri.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generazione in corso...</>
              ) : (
                <><Users className="h-4 w-4 mr-2" /> Genera con AI</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───── Dialog Nuovo Verbale ───── */}
      <Dialog open={verbaleDialogOpen} onOpenChange={(v) => { setVerbaleDialogOpen(v); if (!v) setVerbaleInModifica(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5" />{verbaleInModifica ? "Correggi il verbale" : "Nuovo Verbale"}</DialogTitle>
            <DialogDescription className="max-sm:sr-only">
              Registra un sopralluogo, una riunione o un'ispezione di sicurezza.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Cantiere (opzionale)</Label>
              <Select value={verbaleForm.order_id || "__none__"} onValueChange={(v) => setVerbaleForm((p) => ({ ...p, order_id: v === "__none__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Tutti i cantieri" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nessun cantiere</SelectItem>
                  {orders.map((o) => <SelectItem key={o.id} value={o.id}>{o.description}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Data</Label>
                <Input type="date" value={verbaleForm.data} onChange={(e) => setVerbaleForm((p) => ({ ...p, data: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select value={verbaleForm.tipo} onValueChange={(v) => setVerbaleForm((p) => ({ ...p, tipo: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sopralluogo">Sopralluogo</SelectItem>
                    <SelectItem value="riunione">Riunione</SelectItem>
                    <SelectItem value="ispezione">Ispezione</SelectItem>
                    <SelectItem value="altro">Altro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Esito</Label>
              <Select value={verbaleForm.esito} onValueChange={(v) => setVerbaleForm((p) => ({ ...p, esito: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="conforme">Conforme</SelectItem>
                  <SelectItem value="parzialmente_conforme">Parzialmente conforme</SelectItem>
                  <SelectItem value="non_conforme">Non conforme</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Redatto da</Label>
              <Input value={verbaleForm.redatto_da} onChange={(e) => setVerbaleForm((p) => ({ ...p, redatto_da: e.target.value }))} placeholder="Nome e cognome" />
            </div>
            <div className="space-y-1">
              <Label>Note</Label>
              <textarea className="w-full border rounded-md p-2 text-sm resize-none min-h-[80px]" value={verbaleForm.note} onChange={(e) => setVerbaleForm((p) => ({ ...p, note: e.target.value }))} placeholder="Osservazioni, prescrizioni..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="max-sm:hidden" onClick={() => { setVerbaleDialogOpen(false); setVerbaleInModifica(null); }}>Annulla</Button>
            <Button onClick={() => createVerbaleMutation.mutate()} disabled={createVerbaleMutation.isPending}>
              {createVerbaleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : verbaleInModifica ? "Salva correzioni" : "Salva verbale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───── Dialog Nuovo Subappaltatore ───── */}
      <Dialog open={subappaltatoreDialogOpen} onOpenChange={(v) => { setSubappaltatoreDialogOpen(v); if (!v) setSubappaltatoreInModifica(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />{subappaltatoreInModifica ? "Modifica subappaltatore" : "Nuovo Subappaltatore"}</DialogTitle>
            <DialogDescription className="max-sm:sr-only">
              Collega un subappaltatore alla sicurezza di cantiere e monitora la scadenza DURC.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Ragione Sociale *</Label>
              <Input value={subappaltatoreForm.ragione_sociale} onChange={(e) => setSubappaltatoreForm((p) => ({ ...p, ragione_sociale: e.target.value }))} placeholder="es. Impianti Rossi Srl" />
            </div>
            <div className="space-y-1">
              <Label>Cantiere (opzionale)</Label>
              <Select value={subappaltatoreForm.order_id || "__none__"} onValueChange={(v) => setSubappaltatoreForm((p) => ({ ...p, order_id: v === "__none__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Tutti i cantieri" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nessun cantiere</SelectItem>
                  {orders.map((o) => <SelectItem key={o.id} value={o.id}>{o.description}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo lavori</Label>
                <Input value={subappaltatoreForm.tipo_lavori} onChange={(e) => setSubappaltatoreForm((p) => ({ ...p, tipo_lavori: e.target.value }))} placeholder="es. Impianti elettrici" />
              </div>
              <div className="space-y-1">
                <Label>Responsabile</Label>
                <Input value={subappaltatoreForm.responsabile} onChange={(e) => setSubappaltatoreForm((p) => ({ ...p, responsabile: e.target.value }))} placeholder="Nome referente" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Data inizio</Label>
                <Input type="date" value={subappaltatoreForm.data_inizio} onChange={(e) => setSubappaltatoreForm((p) => ({ ...p, data_inizio: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Data fine</Label>
                <Input type="date" value={subappaltatoreForm.data_fine} onChange={(e) => setSubappaltatoreForm((p) => ({ ...p, data_fine: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Scadenza DURC</Label>
              <Input type="date" value={subappaltatoreForm.durc_scadenza} onChange={(e) => setSubappaltatoreForm((p) => ({ ...p, durc_scadenza: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="max-sm:hidden" onClick={() => { setSubappaltatoreDialogOpen(false); setSubappaltatoreInModifica(null); }}>Annulla</Button>
            <Button onClick={() => createSubappaltatoreM.mutate()} disabled={createSubappaltatoreM.isPending}>
              {createSubappaltatoreM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : subappaltatoreInModifica ? "Salva modifiche" : "Aggiungi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───── Dialog Nuovo Adempimento ───── */}
      <Dialog open={adempimentoDialogOpen} onOpenChange={(v) => { setAdempimentoDialogOpen(v); if (!v) setAdempimentoInModifica(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5" />{adempimentoInModifica ? "Modifica adempimento" : "Nuovo Adempimento"}</DialogTitle>
            <DialogDescription className="max-sm:sr-only">
              Inserisci una scadenza obbligatoria per formazione, certificati o controlli.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Titolo *</Label>
              <Input value={adempimentoForm.titolo} onChange={(e) => setAdempimentoForm((p) => ({ ...p, titolo: e.target.value }))} placeholder="es. Corso di aggiornamento sicurezza" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select value={adempimentoForm.tipo} onValueChange={(v) => setAdempimentoForm((p) => ({ ...p, tipo: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="corso_formazione">Corso formazione</SelectItem>
                    <SelectItem value="visita_medica">Visita medica</SelectItem>
                    <SelectItem value="manutenzione_dpi">Manutenzione DPI</SelectItem>
                    <SelectItem value="rinnovo_certificato">Rinnovo certificato</SelectItem>
                    <SelectItem value="altro">Altro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Scadenza</Label>
                <Input type="date" value={adempimentoForm.scadenza_data} onChange={(e) => setAdempimentoForm((p) => ({ ...p, scadenza_data: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Note</Label>
              <Input value={adempimentoForm.note} onChange={(e) => setAdempimentoForm((p) => ({ ...p, note: e.target.value }))} placeholder="Opzionale" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="max-sm:hidden" onClick={() => { setAdempimentoDialogOpen(false); setAdempimentoInModifica(null); }}>Annulla</Button>
            <Button onClick={() => createAdempimentoM.mutate()} disabled={createAdempimentoM.isPending}>
              {createAdempimentoM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : adempimentoInModifica ? "Salva modifiche" : "Aggiungi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Eliminazione di un verbale / subappaltatore / adempimento */}
      <AlertDialog open={!!daCancellare} onOpenChange={(v) => { if (!v) setDaCancellare(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare {daCancellare?.etichetta}?</AlertDialogTitle>
            <AlertDialogDescription>
              {daCancellare?.descrizione ? `"${daCancellare.descrizione}" ` : ""}
              verrà rimosso definitivamente. Se è un documento che hai già
              consegnato o citato altrove, meglio correggerlo che cancellarlo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={eliminaRiga.isPending}
              onClick={(e) => { e.preventDefault(); if (daCancellare) eliminaRiga.mutate(daCancellare); }}
            >
              {eliminaRiga.isPending ? "Eliminazione..." : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Riapertura di un documento chiuso per errore */}
      <AlertDialog open={!!daRiaprire} onOpenChange={(v) => { if (!v) setDaRiaprire(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Riportare il documento in bozza?</AlertDialogTitle>
            <AlertDialogDescription>
              Il DUVRI torna in bozza e potrà essere modificato e rifirmato. Finché è in bozza non risulta firmato: se ne hai già consegnato copia, avvisa chi l'ha ricevuta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (!daRiaprire) return;
                // I POS si riaprono con una nuova revisione, dalla loro pagina.
                updateDuvriStatus.mutate({ id: daRiaprire.id, status: "bozza" });
                setDaRiaprire(null);
              }}
            >
              Riporta in bozza
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {printHtml && (
        <PrintPreviewModal
          htmlContent={printHtml}
          fileName={printTitle}
          title={printTitle}
          open={!!printHtml}
          onOpenChange={(open) => { if (!open) setPrintHtml(null); }}
        />
      )}
    </div>
  );
}
