import {PulsanteProfiliRequisiti} from "@/components/sicurezza/ProfiliRequisitiDialog";
import { readAllPages } from "@/lib/personale/readAllPages";
import { usePermissions } from "@/hooks/usePermissions";
import {
  SafetyWorkflow,
  type SafetyTransition,
} from "@/components/sicurezza/SafetyWorkflow";
import {
  DUVRI_STAGES,
  VERBALI_STAGES,
  DURC_STAGES,
  SCADENZE_STAGES,
  faseNota,
  faseDurc,
  faseAdempimento,
} from "@/lib/sicurezza/workflow";
import { useMemo, useState } from "react";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { UpgradeScopriWall } from "@/components/subscription/UpgradeScopriBanner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  FileDown,
  AlertTriangle,
  Loader2,
  HardHat,
  Users,
  ClipboardList,
  Building2,
  CalendarClock,
  Pencil,
  Trash2,
  UserCheck,
  FileText,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EntityCustomFieldsSection } from "@/components/shared/EntityCustomFieldsSection";
import { OperationalKpiCard } from "@/components/orders/OperationalKpiCard";
import { KpiMobili } from "@/components/mobile/FiltriMobile";
import { format } from "date-fns";
import { PrintPreviewModal } from "@/components/shared/PrintPreviewModal";
// MP-CAN-001 Fase 3 — types/constants/helpers estratti
import type {
  OrderOption,
  PosDocument,
  DuvriDocument,
  VerbaleSicurezza,
  SubappaltatoreSicurezza,
  AdempimentoSicurezza,
  PrintableSafetyDoc,
} from "./SicurezzaCantiere/types";
import { PosElencoTab } from "@/components/sicurezza/PosElencoTab";
import { FigureSicurezzaTab } from "@/components/sicurezza/FigureSicurezzaTab";
import { corpoDuvriHtml } from "@/lib/sicurezza/duvriHtml";
import { SdsAziendali } from "@/components/sicurezza/SdsAziendali";
import { DocumentiSicurezza } from "@/components/sicurezza/DocumentiSicurezza";
import { Link, useSearchParams } from "react-router-dom";
import {
  getSupabaseErrorMessage,
  escapeHtml,
  readFunctionError,
  isPastDate,
} from "./SicurezzaCantiere/helpers";

const SCHEDE = [
  "pos",
  "documenti",
  "sds",
  "figure",
  "duvri",
  "verbali",
  "subappaltatori",
  "scadenzario",
];

export default function SicurezzaCantiere() {
  const [searchParams, setSearchParams] = useSearchParams();
  const schedaAttiva = SCHEDE.includes(searchParams.get("tab") ?? "")
    ? searchParams.get("tab")!
    : "pos";
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const permissions = usePermissions();
  const canWrite =
    (permissions.canViewSicurezzaCantiere || permissions.isAdmin) &&
    !permissions.solaLettura;
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
  const [verbaleInModifica, setVerbaleInModifica] = useState<string | null>(
    null,
  );
  const [subappaltatoreInModifica, setSubappaltatoreInModifica] = useState<
    string | null
  >(null);
  const [adempimentoInModifica, setAdempimentoInModifica] = useState<
    string | null
  >(null);
  const [daCancellare, setDaCancellare] = useState<{
    tabella:
      | "verbali_sicurezza"
      | "subappaltatori_sicurezza"
      | "adempimenti_sicurezza";
    id: string;
    etichetta: string;
    descrizione: string;
  } | null>(null);
  const [verbaleForm, setVerbaleForm] = useState({
    order_id: "",
    data: format(new Date(), "yyyy-MM-dd"),
    tipo: "sopralluogo",
    esito: "conforme",
    note: "",
    redatto_da: "",
  });
  const [subappaltatoreDialogOpen, setSubappaltatoreDialogOpen] =
    useState(false);
  const [subappaltatoreForm, setSubappaltatoreForm] = useState({
    order_id: "",
    ragione_sociale: "",
    tipo_lavori: "",
    responsabile: "",
    telefono: "",
    data_inizio: "",
    data_fine: "",
    durc_scadenza: "",
  });
  const [adempimentoDialogOpen, setAdempimentoDialogOpen] = useState(false);
  const [adempimentoForm, setAdempimentoForm] = useState({
    order_id: "",
    titolo: "",
    tipo: "corso_formazione",
    scadenza_data: "",
    note: "",
  });

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
  const { data: posDocs = [] } = useQuery<
    Pick<PosDocument, "id" | "status" | "order_id" | "created_at">[]
  >({
    // Sotto ["pos"]: è la chiave che le mutation di usePos invalidano (prima il
    // numero dei POS in alto restava vecchio dopo una creazione o eliminazione).
    queryKey: ["pos", "kpi", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const rows = await readAllPages((from,to)=>supabase
        .from("pos_documents")
        .select("id, status, order_id, created_at")
        .eq("company_id", companyId)
        .or("document_type.is.null,document_type.eq.pos")
        .is("superseded_by", null)
        .order("created_at", { ascending: false }).order("id").range(from,to));
      return rows as PosDocument[];
    },
    enabled: !!companyId,
  });

  // Fetch DUVRI documents
  const {
    data: duvriDocs = [],
    isLoading: duvriLoading,
    isError: duvriError,
  } = useQuery<DuvriDocument[]>({
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
  const {
    data: verbali = [],
    isLoading: verbaliLoading,
    isError: verbaliError,
  } = useQuery<VerbaleSicurezza[]>({
    queryKey: ["verbali-sicurezza", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("verbali_sicurezza")
        .select("*, orders(description, order_code)")
        .eq("company_id", companyId)
        .order("data", { ascending: false });
      if (error) throw new Error(getSupabaseErrorMessage(error));
      return (data || []) as VerbaleSicurezza[];
    },
    enabled: !!companyId,
  });

  const {
    data: subappaltatori = [],
    isLoading: subappaltatoriLoading,
    isError: subappaltatoriError,
  } = useQuery<SubappaltatoreSicurezza[]>({
    queryKey: ["subappaltatori-sicurezza", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("subappaltatori_sicurezza")
        .select("*, orders(description, order_code)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(getSupabaseErrorMessage(error));
      return (data || []) as SubappaltatoreSicurezza[];
    },
    enabled: !!companyId,
  });

  const {
    data: adempimenti = [],
    isLoading: adempimentiLoading,
    isError: adempimentiError,
  } = useQuery<AdempimentoSicurezza[]>({
    queryKey: ["adempimenti-sicurezza", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("adempimenti_sicurezza")
        .select("*, orders(description, order_code)")
        .eq("company_id", companyId)
        .order("scadenza_data", { ascending: true });
      if (error) throw new Error(getSupabaseErrorMessage(error));
      return (data || []) as AdempimentoSicurezza[];
    },
    enabled: !!companyId,
  });

  const safetyStats = useMemo(() => {
    const durcScaduti = subappaltatori.filter((s) =>
      isPastDate(s.durc_scadenza),
    ).length;
    const adempimentiScaduti = adempimenti.filter(
      (a) => a.stato !== "completato" && isPastDate(a.scadenza_data),
    ).length;
    const adempimentiDaFare = adempimenti.filter(
      (a) => a.stato !== "completato",
    ).length;

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
        helper: durcScaduti
          ? `${durcScaduti} DURC scaduti`
          : `${subappaltatori.filter((s) => !s.durc_scadenza).length} date DURC mancanti`,
        tone: durcScaduti ? "red" : "green",
        icon: Building2,
      },
      {
        label: "Scadenze aperte",
        value: adempimentiDaFare,
        helper: adempimentiScaduti
          ? `${adempimentiScaduti} scadute`
          : "Nessuna scaduta",
        tone: adempimentiScaduti ? "red" : "amber",
        icon: CalendarClock,
      },
    ];
  }, [adempimenti, duvriDocs, posDocs, subappaltatori]);

  // M3 mutations
  const createVerbaleMutation = useMutation({
    mutationFn: async () => {
      if (!canWrite)
        throw new Error(
          "Non hai il permesso di modificare la sicurezza cantiere",
        );
      if (!companyId) throw new Error("Nessuna azienda selezionata");
      if (!verbaleForm.note.trim() && !verbaleForm.redatto_da.trim())
        throw new Error("Inserisci almeno le note o il nome del redattore");
      const campi = {
        order_id: verbaleForm.order_id || null,
        data: verbaleForm.data,
        tipo: verbaleForm.tipo,
        esito: verbaleForm.esito,
        note: verbaleForm.note.trim() || null,
        redatto_da: verbaleForm.redatto_da.trim() || null,
      };
      const { error } = verbaleInModifica
        ? await supabase
            .from("verbali_sicurezza")
            .update(campi)
            .eq("id", verbaleInModifica)
            .eq("company_id", companyId)
        : await supabase
            .from("verbali_sicurezza")
            .insert({ company_id: companyId, ...campi });
      if (error) throw new Error(getSupabaseErrorMessage(error));
    },
    onSuccess: () => {
      toast.success(verbaleInModifica ? "Verbale corretto" : "Verbale salvato");
      queryClient.invalidateQueries({
        queryKey: ["verbali-sicurezza", companyId],
      });
      setVerbaleDialogOpen(false);
      setVerbaleInModifica(null);
      setVerbaleForm({
        order_id: "",
        data: format(new Date(), "yyyy-MM-dd"),
        tipo: "sopralluogo",
        esito: "conforme",
        note: "",
        redatto_da: "",
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createSubappaltatoreM = useMutation({
    mutationFn: async () => {
      if (!canWrite)
        throw new Error(
          "Non hai il permesso di modificare la sicurezza cantiere",
        );
      if (!companyId) throw new Error("Nessuna azienda selezionata");
      if (!subappaltatoreForm.ragione_sociale.trim())
        throw new Error("Ragione sociale obbligatoria");
      const campi = {
        order_id: subappaltatoreForm.order_id || null,
        ragione_sociale: subappaltatoreForm.ragione_sociale.trim(),
        tipo_lavori: subappaltatoreForm.tipo_lavori || null,
        responsabile: subappaltatoreForm.responsabile || null,
        telefono: subappaltatoreForm.telefono || null,
        data_inizio: subappaltatoreForm.data_inizio || null,
        data_fine: subappaltatoreForm.data_fine || null,
        durc_scadenza: subappaltatoreForm.durc_scadenza || null,
      };
      const { error } = subappaltatoreInModifica
        ? await supabase
            .from("subappaltatori_sicurezza")
            .update(campi)
            .eq("id", subappaltatoreInModifica)
            .eq("company_id", companyId)
        : await supabase
            .from("subappaltatori_sicurezza")
            .insert({ company_id: companyId, ...campi });
      if (error) throw new Error(getSupabaseErrorMessage(error));
    },
    onSuccess: () => {
      toast.success(
        subappaltatoreInModifica
          ? "Subappaltatore aggiornato"
          : "Subappaltatore aggiunto",
      );
      queryClient.invalidateQueries({
        queryKey: ["subappaltatori-sicurezza", companyId],
      });
      setSubappaltatoreDialogOpen(false);
      setSubappaltatoreInModifica(null);
      setSubappaltatoreForm({
        order_id: "",
        ragione_sociale: "",
        tipo_lavori: "",
        responsabile: "",
        telefono: "",
        data_inizio: "",
        data_fine: "",
        durc_scadenza: "",
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createAdempimentoM = useMutation({
    mutationFn: async () => {
      if (!canWrite)
        throw new Error(
          "Non hai il permesso di modificare la sicurezza cantiere",
        );
      if (!companyId) throw new Error("Nessuna azienda selezionata");
      if (!adempimentoForm.titolo.trim())
        throw new Error("Titolo obbligatorio");
      const campi = {
        order_id: adempimentoForm.order_id || null,
        titolo: adempimentoForm.titolo.trim(),
        tipo: adempimentoForm.tipo,
        scadenza_data: adempimentoForm.scadenza_data || null,
        note: adempimentoForm.note || null,
      };
      // In modifica lo `stato` NON si tocca: è governato dal pulsante
      // Completa/Riapri, e riportarlo a "da_fare" qui riaprirebbe di nascosto
      // un adempimento già chiuso.
      const { error } = adempimentoInModifica
        ? await supabase
            .from("adempimenti_sicurezza")
            .update(campi)
            .eq("id", adempimentoInModifica)
            .eq("company_id", companyId)
        : await supabase
            .from("adempimenti_sicurezza")
            .insert({ company_id: companyId, ...campi, stato: "da_fare" });
      if (error) throw new Error(getSupabaseErrorMessage(error));
    },
    onSuccess: () => {
      toast.success(
        adempimentoInModifica
          ? "Adempimento aggiornato"
          : "Adempimento aggiunto",
      );
      queryClient.invalidateQueries({
        queryKey: ["adempimenti-sicurezza", companyId],
      });
      setAdempimentoDialogOpen(false);
      setAdempimentoInModifica(null);
      setAdempimentoForm({
        order_id: "",
        titolo: "",
        tipo: "corso_formazione",
        scadenza_data: "",
        note: "",
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleAdempimentoStato = useMutation({
    mutationFn: async ({ id, stato }: { id: string; stato: string }) => {
      if (!canWrite)
        throw new Error(
          "Non hai il permesso di modificare la sicurezza cantiere",
        );
      if (!companyId) throw new Error("Nessuna azienda selezionata");
      const prima = adempimenti.find((a) => a.id === id);
      if (!prima || !["da_fare", "completato"].includes(stato))
        throw new Error("Passaggio non valido");
      const { data, error } = await supabase
        .from("adempimenti_sicurezza")
        .update({ stato })
        .eq("id", id)
        .eq("company_id", companyId)
        .eq("stato", prima.stato)
        .select("id")
        .single();
      if (error || !data)
        throw new Error(
          "Stato non aggiornato: la voce è cambiata o non hai i permessi. Aggiorna e riprova.",
        );
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["adempimenti-sicurezza", companyId],
      }),
    onError: (err: Error) => toast.error(err.message),
  });

  // Check subappaltatori per ordine selezionato
  const { data: hasSubappaltatori } = useQuery({
    queryKey: ["has-subappaltatori", selectedOrderId],
    queryFn: async () => {
      if (!companyId || !selectedOrderId) return false;
      // I subappaltatori della commessa sono quelli dell'elenco sicurezza: un
      // ordine d'acquisto a un fornitore di materiali non è un subappalto.
      const { count, error } = await supabase
        .from("subappaltatori_sicurezza")
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
      if (!canWrite)
        throw new Error(
          "Non hai il permesso di modificare la sicurezza cantiere",
        );
      if (!companyId) throw new Error("Nessuna azienda selezionata");
      if (!selectedOrderId)
        throw new Error("Seleziona una commessa prima di generare il DUVRI");
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token)
        throw new Error("Sessione non valida. Accedi di nuovo e riprova.");
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
        },
      );
      if (!res.ok) {
        throw new Error(
          await readFunctionError(res, "Errore generazione DUVRI"),
        );
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("DUVRI generato con successo!");
      queryClient.invalidateQueries({
        queryKey: ["duvri-documents", companyId],
      });
      setDuvriDialogOpen(false);
      setSelectedOrderId("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  /**
   * Aprire "Nuovo" azzera sempre il modulo e la modalità modifica: senza,
   * dopo aver corretto un record il pulsante Nuovo lo ripresenterebbe già
   * compilato e ne creerebbe un duplicato.
   */
  const nuovoVerbale = () => {
    setVerbaleInModifica(null);
    setVerbaleForm({
      order_id: "",
      data: format(new Date(), "yyyy-MM-dd"),
      tipo: "sopralluogo",
      esito: "conforme",
      note: "",
      redatto_da: "",
    });
    setVerbaleDialogOpen(true);
  };
  const nuovoSubappaltatore = () => {
    setSubappaltatoreInModifica(null);
    setSubappaltatoreForm({
      order_id: "",
      ragione_sociale: "",
      tipo_lavori: "",
      responsabile: "",
      telefono: "",
      data_inizio: "",
      data_fine: "",
      durc_scadenza: "",
    });
    setSubappaltatoreDialogOpen(true);
  };
  const nuovoAdempimento = () => {
    setAdempimentoInModifica(null);
    setAdempimentoForm({
      order_id: "",
      titolo: "",
      tipo: "corso_formazione",
      scadenza_data: "",
      note: "",
    });
    setAdempimentoDialogOpen(true);
  };

  /** Eliminazione di un verbale / subappaltatore / adempimento inserito per errore. */
  const eliminaRiga = useMutation({
    mutationFn: async (bersaglio: { tabella: string; id: string }) => {
      if (!canWrite)
        throw new Error(
          "Non hai il permesso di modificare la sicurezza cantiere",
        );
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
      if (!canWrite)
        throw new Error(
          "Non hai il permesso di modificare la sicurezza cantiere",
        );
      if (!companyId) throw new Error("Nessuna azienda selezionata");
      const prima = duvriDocs.find((d) => d.id === id);
      if (!prima || !["bozza", "firmato", "archiviato"].includes(status))
        throw new Error("Passaggio non valido");
      const { data, error } = await supabase
        .from("duvri_documents")
        .update({ status })
        .eq("id", id)
        .eq("company_id", companyId)
        .eq("status", prima.status)
        .select("id")
        .single();
      if (error || !data)
        throw new Error(
          "Stato non aggiornato: il documento è cambiato o non hai i permessi. Aggiorna e riprova.",
        );
    },
    onSuccess: () => {
      toast.success("Stato DUVRI aggiornato");
      queryClient.invalidateQueries({
        queryKey: ["duvri-documents", companyId],
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const buildDocHtml = (doc: PrintableSafetyDoc, tipo: "POS" | "DUVRI") => {
    const order = orders.find((o) => o.id === doc.order_id);
    const orderLabel =
      order?.order_code || order?.description || doc.order_id || "";
    const safeOrderLabel = escapeHtml(orderLabel);
    const safeStatus = escapeHtml(doc.status || "—");
    const safeGeneratedDate = escapeHtml(
      doc.created_at
        ? new Date(doc.created_at).toLocaleDateString("it-IT")
        : "—",
    );
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
    .content { white-space: pre-wrap; margin-top: 8px; }
    h2 { font-size: 1.05rem; margin-top: 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.8rem; margin-top: 8px; }
    th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: left; vertical-align: top; }
    th { background: #f2f2f2; }
    table.firme td { height: 40px; width: 65%; }
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
  ${corpoDuvriHtml(doc.generated_content)}
</body>
</html>`;
  };

  const dataBreve = (value?: string | null) =>
    value ? value.slice(0, 10).split("-").reverse().join("/") : "—";
  const commessa = (id?: string | null) =>
    id
      ? (orders.find((o) => o.id === id)?.order_code ?? "Commessa")
      : "Senza commessa";
  const linkCommessa = (id?: string | null) =>
    id ? (
      <Link
        to={`/azienda/ordini/${id}`}
        className="text-xs text-primary hover:underline"
      >
        {commessa(id)}
      </Link>
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  const modificaVerbale = (v: VerbaleSicurezza) => {
    if (!canWrite) return;
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
  };
  const modificaSub = (r: SubappaltatoreSicurezza) => {
    if (!canWrite) return;
    setSubappaltatoreInModifica(r.id);
    setSubappaltatoreForm({
      order_id: r.order_id ?? "",
      ragione_sociale: r.ragione_sociale ?? "",
      tipo_lavori: r.tipo_lavori ?? "",
      responsabile: r.responsabile ?? "",
      telefono: r.telefono ?? "",
      data_inizio: r.data_inizio ?? "",
      data_fine: r.data_fine ?? "",
      durc_scadenza: r.durc_scadenza ?? "",
    });
    setSubappaltatoreDialogOpen(true);
  };
  const modificaAdempimento = (a: AdempimentoSicurezza) => {
    if (!canWrite) return;
    setAdempimentoInModifica(a.id);
    setAdempimentoForm({
      order_id: a.order_id ?? "",
      titolo: a.titolo ?? "",
      tipo: a.tipo ?? "corso_formazione",
      scadenza_data: a.scadenza_data ?? "",
      note: a.note ?? "",
    });
    setAdempimentoDialogOpen(true);
  };
  const transitionAdempimento = (
    a: AdempimentoSicurezza,
    target: string,
  ): SafetyTransition =>
    target === "completato"
      ? {
          title: "Completa l’adempimento",
          description: `Confermi di aver completato «${a.titolo}»?`,
          label: "Conferma completamento",
          run: () =>
            toggleAdempimentoStato.mutateAsync({
              id: a.id,
              stato: "completato",
            }),
        }
      : target === "da_fare" && faseDurc(a.scadenza_data) !== "scaduto"
        ? {
            title: "Riapri l’adempimento",
            description:
              "L’attività tornerà tra quelle da fare; la scadenza registrata resta invariata.",
            label: "Riapri",
            run: () =>
              toggleAdempimentoStato.mutateAsync({
                id: a.id,
                stato: "da_fare",
              }),
          }
        : {
            title: "Verifica la scadenza",
            description:
              "La colonna Scaduti dipende dalla data registrata. Apri l’attività per controllare scadenza e dettagli, senza inventare un ritardo o un rinnovo.",
            run: () => modificaAdempimento(a),
          };
  const transitionDuvri = (
    d: DuvriDocument,
    target: string,
  ): SafetyTransition =>
    target === "altro"
      ? {
          title: "Controlla il documento",
          description: "Apri il DUVRI per verificare il suo stato registrato.",
          run: () => setExpandedDuvri(d.id),
        }
      : {
          title:
            target === "firmato"
              ? "Registra la firma già raccolta"
              : target === "archiviato"
                ? "Archivia il DUVRI"
                : "Riapri il DUVRI",
          description:
            target === "firmato"
              ? "Confermi che il documento sia già stato firmato? Questo passaggio registra lo stato, senza apporre una firma al documento."
              : target === "archiviato"
                ? "Il documento resterà consultabile nella colonna Archiviati."
                : "Il documento tornerà in bozza; controlla che i dati e la versione da usare siano corretti.",
          label: "Conferma passaggio",
          run: () =>
            updateDuvriStatus.mutateAsync({ id: d.id, status: target }),
        };
  const azioniDuvri = (d: DuvriDocument) => (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6"
        aria-label="Scarica PDF DUVRI"
        title="Scarica PDF DUVRI"
        onClick={() => {
          setPrintTitle(`DUVRI — ${commessa(d.order_id)}`);
          setPrintHtml(buildDocHtml(d, "DUVRI"));
        }}
      >
        <FileDown className="h-3.5 w-3.5" />
      </Button>
    </>
  );
  if (isScopriPlan) return <UpgradeScopriWall type="generic" inline />;

  return (
    <div className="space-y-6 max-sm:space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><div>
        <h1 className="text-2xl font-bold tracking-tight">Sicurezza cantiere</h1>
        <p className="mt-1 text-sm text-muted-foreground">Documenti, verifiche e scadenze collegati alle commesse.</p>
      </div>{companyId&&<PulsanteProfiliRequisiti companyId={companyId}/>}</div>
      {/* Niente fascia gialla col testo normativo: era un avviso fisso, non
          un'azione, e ripeteva a ogni visita cosa sono POS e DUVRI. */}

      {/* Mobile: i due numeri che chiedono di fare qualcosa. */}
      <KpiMobili
        className="sm:hidden"
        voci={[
          {
            label: "Scadenze aperte",
            valore: String(
              adempimenti.filter((a) => a.stato !== "completato").length,
            ),
            tono: adempimenti.some(
              (a) => a.stato !== "completato" && isPastDate(a.scadenza_data),
            )
              ? "text-red-600"
              : undefined,
          },
          {
            label: "DURC scaduti",
            valore: String(
              subappaltatori.filter((s) => isPastDate(s.durc_scadenza)).length,
            ),
            tono: subappaltatori.some((s) => isPastDate(s.durc_scadenza))
              ? "text-red-600"
              : undefined,
          },
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 max-sm:hidden">
        {safetyStats.map((stat) => (
          <OperationalKpiCard
            key={stat.label}
            icon={stat.icon}
            label={stat.label}
            value={stat.value}
            hint={stat.helper}
            onClick={() =>
              setSearchParams(
                (p) => {
                  const n = new URLSearchParams(p);
                  n.set(
                    "tab",
                    stat.label === "POS"
                      ? "pos"
                      : stat.label === "DUVRI"
                        ? "duvri"
                        : stat.label === "Subappaltatori"
                          ? "subappaltatori"
                          : "scadenzario",
                  );
                  return n;
                },
                { replace: true },
              )
            }
            tone={
              stat.tone === "green"
                ? "green"
                : stat.tone === "red"
                  ? "red"
                  : stat.tone === "amber"
                    ? "amber"
                    : "blue"
            }
          />
        ))}
      </div>

      {/* Tabs POS / DUVRI */}
      {/* Mobile: POS, verbali e scadenze (quel che serve in cantiere). Figure e
          DUVRI si preparano al computer; i subappaltatori hanno la loro pagina. */}
      {/* La scheda segue ?tab= (link dalla commessa: «Tutti i verbali e le scadenze»). */}
      <Tabs
        value={schedaAttiva}
        onValueChange={(v) =>
          setSearchParams(
            (p) => {
              const n = new URLSearchParams(p);
              n.set("tab", v);
              return n;
            },
            { replace: true },
          )
        }
      >
        {/* Da 640 le schede stanno a sinistra, larghe quanto servono: su tutta
            la riga restavano sei voci centrate in una fascia grigia. */}
        <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl border bg-white p-1.5 shadow-sm">
          <TabsTrigger value="pos" className="shrink-0 gap-1.5">
            <HardHat className="h-4 w-4" /> POS
          </TabsTrigger>
          <TabsTrigger value="documenti" className="shrink-0 gap-1.5">
            <FileText className="h-4 w-4" /> Documenti
          </TabsTrigger>
          <TabsTrigger value="sds" className="shrink-0 gap-1.5"><FileText className="h-4 w-4" /> SDS prodotti</TabsTrigger>
          <TabsTrigger
            value="figure"
            className="shrink-0 gap-1.5 max-sm:hidden"
          >
            <UserCheck className="h-4 w-4" /> Figure
          </TabsTrigger>
          <TabsTrigger value="duvri" className="shrink-0 gap-1.5 max-sm:hidden">
            <Users className="h-4 w-4" /> DUVRI
          </TabsTrigger>
          <TabsTrigger value="verbali" className="shrink-0 gap-1.5">
            <ClipboardList className="h-4 w-4" /> Verbali
          </TabsTrigger>
          <TabsTrigger
            value="subappaltatori"
            className="shrink-0 gap-1.5 max-sm:hidden"
          >
            <Building2 className="h-4 w-4" /> Subappaltatori
          </TabsTrigger>
          <TabsTrigger value="scadenzario" className="shrink-0 gap-1.5">
            <CalendarClock className="h-4 w-4" /> Scadenze
          </TabsTrigger>
        </TabsList>

        {/* ───── DOCUMENTI: archivio di tutti i cantieri (PSC, notifica, PiMUS, DURC…) ───── */}
        <TabsContent value="documenti" className="mt-4 max-sm:mt-3">
          {companyId && (
            <DocumentiSicurezza
              companyId={companyId}
              sola={!canWrite}
              workflow
            />
          )}
        </TabsContent>

        <TabsContent value="sds" className="mt-4">{companyId && <SdsAziendali companyId={companyId} />}</TabsContent>

        {/* ───── POS TAB: modello ufficiale (DI 9/9/2014) ───── */}
        <TabsContent
          value="pos"
          className="space-y-4 mt-4 max-sm:mt-3 max-sm:space-y-2"
        >
          <PosElencoTab orders={orders} />
        </TabsContent>

        {/* ───── FIGURE DELLA SICUREZZA ───── */}
        <TabsContent
          value="figure"
          className="space-y-4 mt-4 max-sm:mt-3 max-sm:space-y-2"
        >
          <FigureSicurezzaTab />
        </TabsContent>

        {/* ───── DUVRI TAB ───── */}
        <TabsContent value="duvri" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!canWrite}
              onClick={() => setDuvriDialogOpen(true)}
              className="bg-orange-500 text-white hover:bg-orange-600"
            >
              <Plus className="mr-1 h-4 w-4" />
              Genera DUVRI
            </Button>
          </div>
          {duvriLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : duvriError || ordersError ? (
            <p role="alert">
              Documenti DUVRI non disponibili. Aggiorna la pagina e riprova.
            </p>
          ) : (
            <SafetyWorkflow<DuvriDocument>
              namespace="duvri"
              onOpen={(d) => setExpandedDuvri(d.id)}
              label="DUVRI"
              items={duvriDocs}
              stages={DUVRI_STAGES}
              orders={orders}
              getOrderId={(d) => d.order_id}
              getTitle={(d) => `DUVRI · ${commessa(d.order_id)}`}
              getStage={(d) => faseNota(d.status, DUVRI_STAGES)}
              getSearch={(d) =>
                [
                  d.committente_nome,
                  d.orders?.description,
                  d.orders?.order_code,
                  d.status,
                ].join(" ")
              }
              canWrite={canWrite}
              onTransition={transitionDuvri}
              note="La firma va raccolta sul documento. Lo spostamento in Firmati ne registra soltanto l’avvenuta raccolta."
              renderActions={azioniDuvri}
              renderCard={(d) => (
                <>
                  <p className="text-xs text-muted-foreground">
                    Committente: {d.committente_nome || "da indicare"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {d.interferenze?.length ?? 0} interferenze ·{" "}
                    {dataBreve(d.created_at)}
                  </p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {d.orders?.description}
                  </p>
                </>
              )}
              columns={[
                {
                  label: "Documento",
                  render: (d) => `DUVRI · ${d.id.slice(0, 8)}`,
                },
                { label: "Commessa", render: (d) => linkCommessa(d.order_id) },
                {
                  label: "Cantiere",
                  render: (d) => (
                    <span
                      className="block max-w-64 truncate"
                      title={d.orders?.description ?? undefined}
                    >
                      {d.orders?.description || "—"}
                    </span>
                  ),
                },
                {
                  label: "Committente",
                  render: (d) => d.committente_nome || "—",
                },
                {
                  label: "Interferenze",
                  render: (d) => d.interferenze?.length ?? 0,
                },
                {
                  label: "Imprese",
                  render: (d) => d.subappaltatori?.length ?? 0,
                },
                {
                  label: "Costi sicurezza",
                  render: (d) =>
                    d.costi_sicurezza == null
                      ? "—"
                      : Number(d.costi_sicurezza).toLocaleString("it-IT", {
                          style: "currency",
                          currency: "EUR",
                        }),
                },
                { label: "Creazione", render: (d) => dataBreve(d.created_at) },
              ]}
            />
          )}
          {duvriDocs
            .filter((d) => d.id === expandedDuvri)
            .map((doc) => (
              <Dialog
                key={doc.id}
                open={true}
                onOpenChange={(v) => {
                  if (!v) setExpandedDuvri(null);
                }}
              >
                <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>DUVRI · {commessa(doc.order_id)}</DialogTitle>
                    <DialogDescription>
                      {doc.committente_nome || "Dettagli del documento"} ·{" "}
                      {dataBreve(doc.created_at)}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 pt-2 border-t">
                    <p className="text-sm">
                      <strong>Costi sicurezza: </strong>
                      {doc.costi_sicurezza == null
                        ? "Non indicati"
                        : Number(doc.costi_sicurezza).toLocaleString("it-IT", {
                            style: "currency",
                            currency: "EUR",
                          })}
                    </p>
                    {doc.interferenze?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold mb-1">
                          Interferenze e misure
                        </p>
                        <div className="space-y-1">
                          {doc.interferenze.map((i, idx) => (
                            <div
                              key={idx}
                              className="text-xs p-2 rounded bg-muted/50 space-y-0.5"
                            >
                              <div className="font-medium">
                                ⚠️ {i.rischio || "Interferenza da verificare"}
                              </div>
                              {i.livello_rischio && (
                                <div className="text-muted-foreground">
                                  Livello: {i.livello_rischio}
                                </div>
                              )}
                              <div className="text-muted-foreground">
                                ✅{" "}
                                {i.misura ||
                                  i.misura_prevenzione ||
                                  "Misura da completare"}
                              </div>
                              {i.responsabile && (
                                <div className="text-muted-foreground">
                                  👷 {i.responsabile}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {doc.misure_prevenzione && (
                      <div>
                        <p className="text-xs font-semibold mb-1">
                          Misure generali
                        </p>
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                          {doc.misure_prevenzione}
                        </p>
                      </div>
                    )}
                    <EntityCustomFieldsSection
                      entityType="duvri_document"
                      entityId={doc.id}
                    />
                  </div>
                  <DialogFooter>
                    {azioniDuvri(doc)}
                    <Button
                      variant="outline"
                      onClick={() => setExpandedDuvri(null)}
                    >
                      Chiudi
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ))}
        </TabsContent>

        {/* ───── VERBALI TAB ───── */}
        <TabsContent value="verbali" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!canWrite}
              onClick={nuovoVerbale}
              className="bg-orange-500 text-white hover:bg-orange-600"
            >
              <Plus className="mr-1 h-4 w-4" />
              Nuovo verbale
            </Button>
          </div>
          {verbaliLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : verbaliError ? (
            <p role="alert">
              Verbali non disponibili. Aggiorna la pagina e riprova.
            </p>
          ) : (
            <SafetyWorkflow<VerbaleSicurezza>
              namespace="verbali"
              label="Verbali"
              items={verbali}
              stages={VERBALI_STAGES}
              orders={orders}
              getOrderId={(v) => v.order_id}
              getTitle={(v) => `${v.tipo} · ${dataBreve(v.data)}`}
              getStage={(v) => faseNota(v.esito, VERBALI_STAGES)}
              getSearch={(v) =>
                [
                  v.tipo,
                  v.esito,
                  v.note,
                  v.redatto_da,
                  v.orders?.description,
                  v.orders?.order_code,
                ].join(" ")
              }
              canWrite={canWrite}
              note="Le colonne rappresentano l’esito registrato del verbale. Per modificarlo, rivedi il verbale e salva l’esito effettivo."
              onTransition={(v) => ({
                title: "Rivedi l’esito del verbale",
                description:
                  "Apri il verbale, verifica note e osservazioni e registra l’esito corretto. Il trascinamento non dichiara da solo la conformità del cantiere.",
                run: () => modificaVerbale(v),
              })}
              renderCard={(v) => (
                <>
                  <p className="text-xs text-muted-foreground">
                    Redatto da: {v.redatto_da || "non indicato"}
                  </p>
                  <p className="line-clamp-4 text-xs text-muted-foreground">
                    {v.note || "Nessuna nota"}
                  </p>
                </>
              )}
              renderActions={
                canWrite
                  ? (v) => (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          aria-label="Modifica verbale"
                          title="Modifica verbale"
                          onClick={() => modificaVerbale(v)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-destructive"
                          aria-label="Elimina verbale"
                          onClick={() =>
                            setDaCancellare({
                              tabella: "verbali_sicurezza",
                              id: v.id,
                              etichetta: "il verbale",
                              descrizione: `${v.tipo} del ${dataBreve(v.data)}`,
                            })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )
                  : undefined
              }
              columns={[
                {
                  label: "Tipo",
                  render: (v) => <span className="capitalize">{v.tipo}</span>,
                },
                { label: "Commessa", render: (v) => linkCommessa(v.order_id) },
                { label: "Data", render: (v) => dataBreve(v.data) },
                { label: "Redatto da", render: (v) => v.redatto_da || "—" },
                {
                  label: "Note",
                  render: (v) => (
                    <span
                      className="block max-w-80 truncate"
                      title={v.note ?? undefined}
                    >
                      {v.note || "—"}
                    </span>
                  ),
                },
              ]}
            />
          )}
        </TabsContent>

        {/* ───── SUBAPPALTATORI TAB ───── */}
        <TabsContent value="subappaltatori" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!canWrite}
              onClick={nuovoSubappaltatore}
              className="bg-orange-500 text-white hover:bg-orange-600"
            >
              <Plus className="mr-1 h-4 w-4" />
              Aggiungi subappaltatore
            </Button>
          </div>
          {subappaltatoriLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : subappaltatoriError ? (
            <p role="alert">
              Subappaltatori non disponibili. Aggiorna la pagina e riprova.
            </p>
          ) : (
            <SafetyWorkflow<SubappaltatoreSicurezza>
              namespace="subappaltatori"
              defaultView="elenco"
              label="Subappaltatori"
              items={subappaltatori}
              stages={DURC_STAGES}
              orders={orders}
              getOrderId={(r) => r.order_id}
              getTitle={(r) => r.ragione_sociale}
              getStage={(r) => faseDurc(r.durc_scadenza)}
              getSearch={(r) =>
                [
                  r.ragione_sociale,
                  r.tipo_lavori,
                  r.responsabile,
                  r.telefono,
                  r.orders?.description,
                  r.orders?.order_code,
                ].join(" ")
              }
              canWrite={canWrite}
              note="Le colonne derivano dalla data DURC registrata; non attestano la verifica del documento. Per un rinnovo aggiorna il documento e la sua data."
              onTransition={(r) => ({
                title: "Aggiorna il DURC del subappaltatore",
                description:
                  "La fase dipende dalla scadenza registrata. Controlla il documento aggiornato e inserisci la data effettiva; trascinare la scheda non rinnova il DURC.",
                run: () => modificaSub(r),
              })}
              renderCard={(r) => (
                <>
                  <p className="text-xs text-muted-foreground">
                    {r.tipo_lavori || "Lavori non indicati"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Responsabile: {r.responsabile || "da indicare"}
                  </p>
                  {r.telefono && (
                    <a
                      className="block text-xs text-primary"
                      href={`tel:${r.telefono}`}
                    >
                      {r.telefono}
                    </a>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Scadenza DURC: {dataBreve(r.durc_scadenza)}
                  </p>
                </>
              )}
              renderActions={
                canWrite
                  ? (r) => (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          aria-label="Modifica subappaltatore"
                          title="Modifica subappaltatore"
                          onClick={() => modificaSub(r)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-destructive"
                          aria-label="Elimina subappaltatore"
                          onClick={() =>
                            setDaCancellare({
                              tabella: "subappaltatori_sicurezza",
                              id: r.id,
                              etichetta: "il subappaltatore",
                              descrizione: r.ragione_sociale,
                            })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )
                  : undefined
              }
              columns={[
                { label: "Impresa", render: (r) => r.ragione_sociale },
                { label: "Commessa", render: (r) => linkCommessa(r.order_id) },
                { label: "Lavori", render: (r) => r.tipo_lavori || "—" },
                { label: "Responsabile", render: (r) => r.responsabile || "—" },
                {
                  label: "Telefono",
                  render: (r) =>
                    r.telefono ? (
                      <a className="text-primary" href={`tel:${r.telefono}`}>
                        {r.telefono}
                      </a>
                    ) : (
                      "—"
                    ),
                },
                {
                  label: "Scadenza DURC",
                  render: (r) => dataBreve(r.durc_scadenza),
                },
                {
                  label: "Inizio lavori",
                  render: (r) => dataBreve(r.data_inizio),
                },
                { label: "Fine lavori", render: (r) => dataBreve(r.data_fine) },
              ]}
            />
          )}
        </TabsContent>

        {/* ───── SCADENZARIO TAB ───── */}
        <TabsContent value="scadenzario" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!canWrite}
              onClick={nuovoAdempimento}
              className="bg-orange-500 text-white hover:bg-orange-600"
            >
              <Plus className="mr-1 h-4 w-4" />
              Aggiungi adempimento
            </Button>
          </div>
          {adempimentiLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : adempimentiError ? (
            <p role="alert">
              Scadenzario non disponibile. Aggiorna la pagina e riprova.
            </p>
          ) : (
            <SafetyWorkflow<AdempimentoSicurezza>
              namespace="scadenze"
              defaultView="elenco"
              label="Adempimenti"
              items={[...adempimenti].sort(
                (a, b) =>
                  Number(a.stato === "completato") -
                    Number(b.stato === "completato") ||
                  (a.scadenza_data || "9999").localeCompare(
                    b.scadenza_data || "9999",
                  ),
              )}
              stages={SCADENZE_STAGES}
              orders={orders}
              getOrderId={(a) => a.order_id}
              getTitle={(a) => a.titolo}
              getStage={faseAdempimento}
              getSearch={(a) =>
                [a.titolo, a.tipo, a.note, commessa(a.order_id)].join(" ")
              }
              canWrite={canWrite}
              onTransition={transitionAdempimento}
              note="Sposta in Completati per registrare un’attività svolta. La colonna Scaduti dipende dalla data; per ripianificare modifica la scadenza."
              renderCard={(a) => (
                <>
                  <p className="text-xs capitalize text-muted-foreground">
                    {a.tipo?.replace(/_/g, " ")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Scadenza: {dataBreve(a.scadenza_data)}
                  </p>
                  <p className="line-clamp-3 text-xs text-muted-foreground">
                    {a.note}
                  </p>
                </>
              )}
              renderActions={
                canWrite
                  ? (a) => (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          disabled={toggleAdempimentoStato.isPending}
                          onClick={() =>
                            toggleAdempimentoStato.mutate({
                              id: a.id,
                              stato:
                                a.stato === "completato"
                                  ? "da_fare"
                                  : "completato",
                            })
                          }
                        >
                          {a.stato === "completato" ? "Riapri" : "Completa"}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          aria-label="Modifica adempimento"
                          onClick={() => modificaAdempimento(a)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-destructive"
                          aria-label="Elimina adempimento"
                          onClick={() =>
                            setDaCancellare({
                              tabella: "adempimenti_sicurezza",
                              id: a.id,
                              etichetta: "l’adempimento",
                              descrizione: a.titolo,
                            })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )
                  : undefined
              }
              columns={[
                { label: "Attività", render: (a) => a.titolo },
                { label: "Commessa", render: (a) => linkCommessa(a.order_id) },
                {
                  label: "Tipo",
                  render: (a) => (
                    <span className="capitalize">
                      {a.tipo?.replace(/_/g, " ") || "—"}
                    </span>
                  ),
                },
                {
                  label: "Scadenza",
                  render: (a) => dataBreve(a.scadenza_data),
                },
                {
                  label: "Note",
                  render: (a) => (
                    <span
                      className="block max-w-80 truncate"
                      title={a.note ?? undefined}
                    >
                      {a.note || "—"}
                    </span>
                  ),
                },
              ]}
            />
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
              Seleziona la commessa, verifica i subappaltatori e genera il
              documento DUVRI.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Ordine / Cantiere</Label>
              <Select
                value={selectedOrderId || undefined}
                onValueChange={setSelectedOrderId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona ordine" />
                </SelectTrigger>
                <SelectContent>
                  {orders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.order_code ? `#${o.order_code} — ` : ""}
                      {o.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedOrderId && hasSubappaltatori === false && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  Nessun subappaltatore registrato per questo ordine. Il DUVRI è
                  richiesto quando ci sono subappaltatori. Puoi comunque
                  generarlo come documento preventivo.
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
            <Button
              variant="outline"
              className="max-sm:hidden"
              onClick={() => setDuvriDialogOpen(false)}
            >
              Annulla
            </Button>
            <Button
              onClick={() => generateDuvri.mutate()}
              disabled={
                !canWrite || !selectedOrderId || generateDuvri.isPending
              }
            >
              {generateDuvri.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generazione
                  in corso...
                </>
              ) : (
                <>
                  <Users className="h-4 w-4 mr-2" /> Genera con AI
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───── Dialog Nuovo Verbale ───── */}
      <Dialog
        open={verbaleDialogOpen}
        onOpenChange={(v) => {
          setVerbaleDialogOpen(v);
          if (!v) setVerbaleInModifica(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              {verbaleInModifica ? "Correggi il verbale" : "Nuovo Verbale"}
            </DialogTitle>
            <DialogDescription className="max-sm:sr-only">
              Registra un sopralluogo, una riunione o un'ispezione di sicurezza.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Cantiere (opzionale)</Label>
              <Select
                value={verbaleForm.order_id || "__none__"}
                onValueChange={(v) =>
                  setVerbaleForm((p) => ({
                    ...p,
                    order_id: v === "__none__" ? "" : v,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tutti i cantieri" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nessun cantiere</SelectItem>
                  {orders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Data</Label>
                <Input
                  type="date"
                  value={verbaleForm.data}
                  onChange={(e) =>
                    setVerbaleForm((p) => ({ ...p, data: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select
                  value={verbaleForm.tipo}
                  onValueChange={(v) =>
                    setVerbaleForm((p) => ({ ...p, tipo: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
              <Select
                value={verbaleForm.esito}
                onValueChange={(v) =>
                  setVerbaleForm((p) => ({ ...p, esito: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="conforme">Conforme</SelectItem>
                  <SelectItem value="parzialmente_conforme">
                    Parzialmente conforme
                  </SelectItem>
                  <SelectItem value="non_conforme">Non conforme</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Redatto da</Label>
              <Input
                value={verbaleForm.redatto_da}
                onChange={(e) =>
                  setVerbaleForm((p) => ({ ...p, redatto_da: e.target.value }))
                }
                placeholder="Nome e cognome"
              />
            </div>
            <div className="space-y-1">
              <Label>Note</Label>
              <textarea
                className="w-full border rounded-md p-2 text-sm resize-none min-h-[80px]"
                value={verbaleForm.note}
                onChange={(e) =>
                  setVerbaleForm((p) => ({ ...p, note: e.target.value }))
                }
                placeholder="Osservazioni, prescrizioni..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="max-sm:hidden"
              onClick={() => {
                setVerbaleDialogOpen(false);
                setVerbaleInModifica(null);
              }}
            >
              Annulla
            </Button>
            <Button
              onClick={() => createVerbaleMutation.mutate()}
              disabled={!canWrite || createVerbaleMutation.isPending}
            >
              {createVerbaleMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : verbaleInModifica ? (
                "Salva correzioni"
              ) : (
                "Salva verbale"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───── Dialog Nuovo Subappaltatore ───── */}
      <Dialog
        open={subappaltatoreDialogOpen}
        onOpenChange={(v) => {
          setSubappaltatoreDialogOpen(v);
          if (!v) setSubappaltatoreInModifica(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {subappaltatoreInModifica
                ? "Modifica subappaltatore"
                : "Nuovo Subappaltatore"}
            </DialogTitle>
            <DialogDescription className="max-sm:sr-only">
              Collega un subappaltatore alla sicurezza di cantiere e monitora la
              scadenza DURC.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Ragione Sociale *</Label>
              <Input
                value={subappaltatoreForm.ragione_sociale}
                onChange={(e) =>
                  setSubappaltatoreForm((p) => ({
                    ...p,
                    ragione_sociale: e.target.value,
                  }))
                }
                placeholder="es. Impianti Rossi Srl"
              />
            </div>
            <div className="space-y-1">
              <Label>Cantiere (opzionale)</Label>
              <Select
                value={subappaltatoreForm.order_id || "__none__"}
                onValueChange={(v) =>
                  setSubappaltatoreForm((p) => ({
                    ...p,
                    order_id: v === "__none__" ? "" : v,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tutti i cantieri" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nessun cantiere</SelectItem>
                  {orders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo lavori</Label>
                <Input
                  value={subappaltatoreForm.tipo_lavori}
                  onChange={(e) =>
                    setSubappaltatoreForm((p) => ({
                      ...p,
                      tipo_lavori: e.target.value,
                    }))
                  }
                  placeholder="es. Impianti elettrici"
                />
              </div>
              <div className="space-y-1">
                <Label>Responsabile</Label>
                <Input
                  value={subappaltatoreForm.responsabile}
                  onChange={(e) =>
                    setSubappaltatoreForm((p) => ({
                      ...p,
                      responsabile: e.target.value,
                    }))
                  }
                  placeholder="Nome referente"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Data inizio</Label>
                <Input
                  type="date"
                  value={subappaltatoreForm.data_inizio}
                  onChange={(e) =>
                    setSubappaltatoreForm((p) => ({
                      ...p,
                      data_inizio: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Data fine</Label>
                <Input
                  type="date"
                  value={subappaltatoreForm.data_fine}
                  onChange={(e) =>
                    setSubappaltatoreForm((p) => ({
                      ...p,
                      data_fine: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Scadenza DURC</Label>
              <Input
                type="date"
                value={subappaltatoreForm.durc_scadenza}
                onChange={(e) =>
                  setSubappaltatoreForm((p) => ({
                    ...p,
                    durc_scadenza: e.target.value,
                  }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="max-sm:hidden"
              onClick={() => {
                setSubappaltatoreDialogOpen(false);
                setSubappaltatoreInModifica(null);
              }}
            >
              Annulla
            </Button>
            <Button
              onClick={() => createSubappaltatoreM.mutate()}
              disabled={!canWrite || createSubappaltatoreM.isPending}
            >
              {createSubappaltatoreM.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : subappaltatoreInModifica ? (
                "Salva modifiche"
              ) : (
                "Aggiungi"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───── Dialog Nuovo Adempimento ───── */}
      <Dialog
        open={adempimentoDialogOpen}
        onOpenChange={(v) => {
          setAdempimentoDialogOpen(v);
          if (!v) setAdempimentoInModifica(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5" />
              {adempimentoInModifica
                ? "Modifica adempimento"
                : "Nuovo Adempimento"}
            </DialogTitle>
            <DialogDescription className="max-sm:sr-only">
              Inserisci una scadenza obbligatoria per formazione, certificati o
              controlli.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {/* La commessa: prima order_id restava sempre vuoto e la scadenza non
                si vedeva nel cantiere a cui si riferisce. */}
            <div className="space-y-1">
              <Label>Commessa</Label>
              <Select
                value={adempimentoForm.order_id || "nessuna"}
                onValueChange={(v) =>
                  setAdempimentoForm((p) => ({
                    ...p,
                    order_id: v === "nessuna" ? "" : v,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tutta l'azienda" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nessuna">Tutta l'azienda</SelectItem>
                  {orders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.order_code ? `${o.order_code} · ` : ""}
                      {o.description ?? ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Titolo *</Label>
              <Input
                value={adempimentoForm.titolo}
                onChange={(e) =>
                  setAdempimentoForm((p) => ({ ...p, titolo: e.target.value }))
                }
                placeholder="es. Corso di aggiornamento sicurezza"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select
                  value={adempimentoForm.tipo}
                  onValueChange={(v) =>
                    setAdempimentoForm((p) => ({ ...p, tipo: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="corso_formazione">
                      Corso formazione
                    </SelectItem>
                    <SelectItem value="visita_medica">Visita medica</SelectItem>
                    <SelectItem value="manutenzione_dpi">
                      Manutenzione DPI
                    </SelectItem>
                    <SelectItem value="rinnovo_certificato">
                      Rinnovo certificato
                    </SelectItem>
                    <SelectItem value="altro">Altro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Scadenza</Label>
                <Input
                  type="date"
                  value={adempimentoForm.scadenza_data}
                  onChange={(e) =>
                    setAdempimentoForm((p) => ({
                      ...p,
                      scadenza_data: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Note</Label>
              <Input
                value={adempimentoForm.note}
                onChange={(e) =>
                  setAdempimentoForm((p) => ({ ...p, note: e.target.value }))
                }
                placeholder="Opzionale"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="max-sm:hidden"
              onClick={() => {
                setAdempimentoDialogOpen(false);
                setAdempimentoInModifica(null);
              }}
            >
              Annulla
            </Button>
            <Button
              onClick={() => createAdempimentoM.mutate()}
              disabled={!canWrite || createAdempimentoM.isPending}
            >
              {createAdempimentoM.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : adempimentoInModifica ? (
                "Salva modifiche"
              ) : (
                "Aggiungi"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Eliminazione di un verbale / subappaltatore / adempimento */}
      <AlertDialog
        open={!!daCancellare}
        onOpenChange={(v) => {
          if (!v) setDaCancellare(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Eliminare {daCancellare?.etichetta}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {daCancellare?.descrizione
                ? `"${daCancellare.descrizione}" `
                : ""}
              verrà rimosso definitivamente. Se è un documento che hai già
              consegnato o citato altrove, meglio correggerlo che cancellarlo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={eliminaRiga.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (daCancellare) eliminaRiga.mutate(daCancellare);
              }}
            >
              {eliminaRiga.isPending ? "Eliminazione..." : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Riapertura di un documento chiuso per errore */}

      {printHtml && (
        <PrintPreviewModal
          htmlContent={printHtml}
          fileName={printTitle}
          title={printTitle}
          open={!!printHtml}
          onOpenChange={(open) => {
            if (!open) setPrintHtml(null);
          }}
        />
      )}
    </div>
  );
}
