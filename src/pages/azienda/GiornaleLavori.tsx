import type { TablesUpdate } from "@/integrations/supabase/types";
import { useState, useRef } from "react";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { UpgradeScopriWall } from "@/components/subscription/UpgradeScopriBanner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useGPS } from "@/hooks/useGPS";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { NotebookPen, Plus, MapPin, Camera, Loader2, Sun, Cloud, CloudRain, Snowflake, Wind, Download, X, Trash2, Lock, PenLine, Users } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { format } from "date-fns";
import { GiornaleCard } from "@/components/orders/GiornaleCard";
import { EntityCustomFieldsSection } from "@/components/shared/EntityCustomFieldsSection";
import { PrintPreviewModal } from "@/components/shared/PrintPreviewModal";
import { useFotoGiornaleFirmate } from "@/hooks/useFotoGiornaleFirmate";
import { DettaTesto } from "@/components/campo/DettaTesto";
import {
  BUCKET_FOTO_GIORNALE, percorsoFotoGiornale, urlSalvatoFotoGiornale,
} from "../../../supabase/functions/_shared/fotoGiornale";
import {
  MAX_FOTO_PER_RAPPORTINO, avvisiPreparazione, avvisoCaricamento, postiLiberi, preparaFoto, type FotoPronta,
} from "@/lib/campo/preparaFoto";
import { messaggioErroreGiornale, paginaDelGiorno, regoleGiornale } from "@/lib/campo/statoGiornale";
import { oreLeggibili, personeDelGiorno, type RapportinoPresenze } from "@/lib/campo/presenzeGiornale";

/** Tabelle e RPC nuove (giornale_annotazioni, giornale_firma) non ancora nei tipi generati. */
const dbSenzaTipi = supabase as unknown as SupabaseClient;

interface Annotazione {
  id: string;
  testo: string;
  autore_id: string | null;
  created_at: string;
}

const nomeProfilo = (p: { first_name?: string | null; last_name?: string | null } | null | undefined) =>
  [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();

const dataOra = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : format(d, "dd/MM/yyyy HH:mm");
};

const METEO_OPTIONS = [
  { value: "soleggiato", label: "Soleggiato", icon: Sun, color: "text-yellow-500" },
  { value: "nuvoloso", label: "Nuvoloso", icon: Cloud, color: "text-slate-500" },
  { value: "pioggia", label: "Pioggia", icon: CloudRain, color: "text-blue-500" },
  { value: "neve", label: "Neve", icon: Snowflake, color: "text-sky-400" },
  { value: "vento forte", label: "Vento", icon: Wind, color: "text-teal-500" },
];

/** Una foto già compressa, in attesa del salvataggio del report. */
interface FotoPreview extends FotoPronta {
  preview: string;
}

/** Una foto già salvata sul report che si sta correggendo. */
interface FotoSalvata {
  id: string;
  url: string | null;
  storage_path: string | null;
}

/** Quel che serve per riaprire un report salvato: `giornale_lavori` ha più
 *  colonne, qui bastano quelle che il modulo ricompila. */
interface RigaGiornale {
  id: string;
  order_id?: string | null;
  data_lavori?: string | null;
  condizioni_meteo?: string | null;
  lavorazioni_eseguite?: string | null;
  materiali_utilizzati?: string | null;
  personale_presente?: number | string | null;
  note?: string | null;
  avanzamento_percentuale?: number | string | null;
  temperatura?: number | string | null;
  firmato_da?: string | null;
  visibile_cliente?: boolean | null;
  stato?: string | null;
  pm_signed_at?: string | null;
  pm_signed_by?: string | null;
}

export default function GiornaleLavori() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const permissions = usePermissions();
  const canEditGiornale = permissions.isAdmin || permissions.canEditGiornaleLavori;
  const isMobile = useIsMobile();
  /** Il rapportino che si sta per cancellare, in attesa di conferma. */
  const [daCancellare, setDaCancellare] = useState<any | null>(null);
  const queryClient = useQueryClient();
  const { isScopriPlan } = useSubscriptionLimits();
  const [searchParams] = useSearchParams();
  const { lat: gpsLat, lng: gpsLng, status: gpsStatus, requestPosition } = useGPS(companyId || null);

  const [selectedOrderId, setSelectedOrderId] = useState(searchParams.get("ordine") || "");
  const [isExporting, setIsExporting] = useState(false);
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasFirma, setHasFirma] = useState(false);
  const [visibileCliente, setVisibileCliente] = useState(true);
  const [fotoPreview, setFotoPreview] = useState<FotoPreview[]>([]);
  const [fotoProgresso, setFotoProgresso] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleriaInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [formData, setFormData] = useState({
    data_lavori: format(new Date(), "yyyy-MM-dd"),
    condizioni_meteo: "soleggiato",
    lavorazioni_eseguite: "",
    materiali_utilizzati: "",
    personale_presente: 1,
    note: "",
    avanzamento_percentuale: 0,
    temperatura: "",
    firmato_da: "",
  });

  // Fetch orders — filter out any with missing/empty id to prevent Radix SelectItem crash
  const { data: rawOrders = [], isError: ordersError } = useQuery({
    queryKey: ["orders-attivi", companyId],
    queryFn: async () => {
      // 2026-05-27 (UX audit fix): rimosso .limit(50) — l'impresa con 50+
      // cantieri vedeva il 51° in poi sparire dal dropdown senza errore
      // visibile, impossibile registrare giornale lavori su cantieri vecchi.
      // Alzato a 500: copre tutte le imprese reali; per chi supera, va aggiunto
      // un combobox cercabile (TODO).
      const { data, error } = await supabase
        .from("orders")
        .select("id, description, order_code")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });
  const orders = rawOrders.filter((o: any) => o?.id && typeof o.id === "string" && o.id.length > 0);

  // Fetch giornale entries
  const { data: entries = [], isLoading, isError: entriesError } = useQuery({
    queryKey: ["giornale-lavori", companyId, selectedOrderId],
    queryFn: async () => {
      let q = supabase
        .from("giornale_lavori")
        .select("*, giornale_foto(id, url, storage_path)")
        .eq("company_id", companyId!)
        .order("data_lavori", { ascending: false })
        .limit(200);
      if (selectedOrderId) q = q.eq("order_id", selectedOrderId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  // Le foto già salvate del report in correzione: si vedono e, con il permesso di modifica, si tolgono.
  const editingId: string | undefined = editingEntry?.id;
  const { data: fotoSalvate = [] } = useQuery({
    queryKey: ["giornale-foto-salvate", editingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("giornale_foto")
        .select("id, url, storage_path")
        .eq("giornale_id", editingId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as FotoSalvata[];
    },
    enabled: !!editingId && sheetOpen,
  });

  const fotoSalvateLink = useFotoGiornaleFirmate(fotoSalvate);
  const fotoAlCompleto = postiLiberi(fotoSalvate.length + fotoPreview.length) === 0;

  // Bozza o firmata: la firmata è in sola lettura e accetta solo annotazioni (lo impone anche il database).
  const regole = regoleGiornale(
    editingEntry ? { ...editingEntry, lavorazioni_eseguite: formData.lavorazioni_eseguite } : null,
    canEditGiornale,
  );
  const solaLettura = !regole.puoModificare;
  const [firmaDaConfermare, setFirmaDaConfermare] = useState(false);
  const [nuovaAnnotazione, setNuovaAnnotazione] = useState("");

  // Chi ha lavorato quel giorno su quel cantiere, dai rapportini. Il numero di operai resta la correzione a mano.
  const orderDelGiorno: string = editingEntry?.order_id ?? selectedOrderId;
  const { data: rapportiniGiorno = [] } = useQuery({
    queryKey: ["giornale-rapportini-giorno", companyId, orderDelGiorno, formData.data_lavori],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campo_rapportini")
        .select("id, user_id, stato, ore_lavorate, ore_straordinario, presenze, autore:profiles!campo_rapportini_user_id_fkey(first_name, last_name)")
        .eq("company_id", companyId!)
        .eq("order_id", orderDelGiorno)
        .eq("data_lavoro", formData.data_lavori);
      if (error) throw error;
      return (data ?? []) as unknown as Array<RapportinoPresenze & { autore?: { first_name?: string | null; last_name?: string | null } | null }>;
    },
    enabled: sheetOpen && !!companyId && !!orderDelGiorno && !!formData.data_lavori,
  });
  const personeGiorno = personeDelGiorno(
    rapportiniGiorno,
    Object.fromEntries(rapportiniGiorno.filter((r) => r.user_id).map((r) => [r.user_id as string, nomeProfilo(r.autore)])),
  );

  // Una pagina per cantiere e per giorno: su «Nuovo» con un giorno già scritto si apre quella.
  const nuovaPagina = sheetOpen && !editingEntry?.id;
  const { data: paginaEsistente } = useQuery({
    queryKey: ["giornale-pagina-del-giorno", companyId, selectedOrderId, formData.data_lavori],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("giornale_lavori")
        .select("*, giornale_foto(id, url, storage_path)")
        .eq("company_id", companyId!)
        .eq("order_id", selectedOrderId)
        .eq("data_lavori", formData.data_lavori)
        .maybeSingle();
      if (error) throw error;
      return data as RigaGiornale | null;
    },
    enabled: nuovaPagina && !!companyId && !!selectedOrderId && !!formData.data_lavori,
  });
  const paginaGiaScritta: RigaGiornale | undefined = nuovaPagina
    ? paginaDelGiorno(entries as RigaGiornale[], selectedOrderId, formData.data_lavori) ?? paginaEsistente ?? undefined
    : undefined;

  // Annotazioni: solo sulle pagine firmate, solo aggiunta.
  const { data: annotazioni = [] } = useQuery({
    queryKey: ["giornale-annotazioni", editingId],
    queryFn: async () => {
      const { data, error } = await dbSenzaTipi
        .from("giornale_annotazioni")
        .select("id, testo, autore_id, created_at")
        .eq("giornale_id", editingId!)
        .order("created_at", { ascending: true });
      if (error) throw new Error(messaggioErroreGiornale(error));
      return (data ?? []) as Annotazione[];
    },
    enabled: sheetOpen && !!editingId && regole.stato === "firmata",
  });

  // Nomi di chi ha firmato e di chi ha annotato.
  const idsNomi = [...new Set([editingEntry?.pm_signed_by, ...annotazioni.map((a) => a.autore_id)]
    .filter((x): x is string => !!x))].sort();
  const { data: nomi = {} } = useQuery({
    queryKey: ["giornale-nomi", idsNomi.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, first_name, last_name").in("id", idsNomi);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((p) => [p.id, nomeProfilo(p)])) as Record<string, string>;
    },
    enabled: idsNomi.length > 0,
  });

  const resetForm = () => {
    setFormData({
      data_lavori: format(new Date(), "yyyy-MM-dd"),
      condizioni_meteo: "soleggiato",
      lavorazioni_eseguite: "",
      materiali_utilizzati: "",
      personale_presente: 1,
      note: "",
      avanzamento_percentuale: 0,
      temperatura: "",
      firmato_da: "",
    });
    // Revoke object URLs to prevent memory leaks before clearing state
    setFotoPreview((prev) => {
      prev.forEach((f) => URL.revokeObjectURL(f.preview));
      return [];
    });
    setHasFirma(false);
    setVisibileCliente(true);
    setEditingEntry(null);
    // Clear canvas
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  const openNew = () => {
    resetForm();
    setSheetOpen(true);
  };

  /**
   * Apre un report già salvato per correggerlo. Finora `GiornaleCard` accettava
   * un `onClick` che nessuno le passava: un rapportino sbagliato — ore, meteo,
   * lavorazioni — restava sbagliato per sempre, e l'unico rimedio era scriverne
   * un altro il giorno dopo con la correzione nelle note.
   *
   * La firma NON si ricarica nel canvas: è la firma del capocantiere di quel
   * giorno. Se non si rifirma resta quella; se si rifirma, si sovrascrive.
   */
  // Aperta da tutti quelli che vedono il giornale: chi non può modificare la legge e basta.
  const openEdit = (entry: RigaGiornale) => {
    setFormData({
      data_lavori: entry.data_lavori ?? format(new Date(), "yyyy-MM-dd"),
      condizioni_meteo: entry.condizioni_meteo ?? "soleggiato",
      lavorazioni_eseguite: entry.lavorazioni_eseguite ?? "",
      materiali_utilizzati: entry.materiali_utilizzati ?? "",
      personale_presente: Number(entry.personale_presente ?? 1),
      note: entry.note ?? "",
      avanzamento_percentuale: Number(entry.avanzamento_percentuale ?? 0),
      temperatura: entry.temperatura != null ? String(entry.temperatura) : "",
      firmato_da: entry.firmato_da ?? "",
    });
    setFotoPreview((prev) => {
      prev.forEach((f) => URL.revokeObjectURL(f.preview));
      return [];
    });
    setHasFirma(false);
    setVisibileCliente(entry.visibile_cliente !== false);
    setNuovaAnnotazione("");
    setFirmaDaConfermare(false);
    if (entry.order_id) setSelectedOrderId(entry.order_id);
    setEditingEntry(entry);
    setSheetOpen(true);
  };

  // Canvas drawing for firma — with HiDPI scaling so coordinates match on Retina/mobile screens
  const getCanvasPos = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement,
  ) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCanvasPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCanvasPos(e, canvas);
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    setHasFirma(true);
  };

  const stopDrawing = () => setIsDrawing(false);

  const clearFirma = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasFirma(false);
  };

  // Stessa preparazione del rapportino di campo: compressione in sequenza, limiti chiari, nome file sicuro.
  const handleFotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    // Azzerato subito: riscegliere la stessa foto deve funzionare.
    e.target.value = "";
    if (!files.length) return;
    const giaPresenti = fotoSalvate.length + fotoPreview.length;
    if (postiLiberi(giaPresenti) === 0) {
      toast.error(`Questo report ha già ${MAX_FOTO_PER_RAPPORTINO} foto: togline una per aggiungerne altre.`);
      return;
    }
    try {
      const esito = await preparaFoto(files, {
        giaPresenti,
        onProgresso: (i, n) => setFotoProgresso(`Preparo le foto ${i} di ${n}…`),
      });
      setFotoPreview((prev) => [...prev, ...esito.pronte.map((f) => ({ ...f, preview: URL.createObjectURL(f.blob) }))]);
      avvisiPreparazione(esito).forEach((a) => toast.error(a));
    } finally {
      setFotoProgresso(null);
    }
  };

  const removeFoto = (index: number) => {
    setFotoPreview((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  /** Toglie una foto già salvata: prima il file, poi la riga (un file orfano è meglio di una riga che punta al vuoto). */
  const eliminaFotoSalvata = useMutation({
    mutationFn: async (foto: FotoSalvata) => {
      if (!canEditGiornale) throw new Error("Permesso di modifica del Giornale non attivo");
      if (foto.storage_path) await supabase.storage.from(BUCKET_FOTO_GIORNALE).remove([foto.storage_path]);
      const { error } = await supabase.from("giornale_foto").delete().eq("id", foto.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Foto tolta dal report");
      queryClient.invalidateQueries({ queryKey: ["giornale-foto-salvate", editingId] });
      queryClient.invalidateQueries({ queryKey: ["giornale-lavori", companyId, selectedOrderId] });
    },
    onError: (err: Error) => toast.error("Impossibile togliere la foto", { description: err.message }),
  });

  // Save mutation
  const saveEntry = useMutation({
    mutationFn: async () => {
      if (!canEditGiornale) throw new Error("Permesso di modifica del Giornale non attivo");
      if (!selectedOrderId) throw new Error("Seleziona un ordine");
      if (!formData.lavorazioni_eseguite.trim()) throw new Error("Le lavorazioni eseguite sono obbligatorie");

      // Get firma as base64 if present
      let firmaBase64: string | undefined;
      if (hasFirma && canvasRef.current) {
        firmaBase64 = canvasRef.current.toDataURL("image/png");
      }

      // Get GPS if available
      const lat = gpsStatus === "success" ? gpsLat : undefined;
      const lng = gpsStatus === "success" ? gpsLng : undefined;

      const session = await supabase.auth.getSession();
      const userId = session.data.session?.user?.id;

      const campi = {
        order_id: selectedOrderId,
        ...formData,
        personale_presente: Number(formData.personale_presente),
        avanzamento_percentuale: Number(formData.avanzamento_percentuale),
        visibile_cliente: visibileCliente,
        firmato_da: formData.firmato_da || null,
      };

      // Correzione di un report esistente: si aggiorna, non se ne crea un altro.
      // Firma e posizione si riscrivono SOLO se in questa sessione si è
      // rifirmato / si ha davvero un GPS: altrimenti una correzione fatta in
      // ufficio cancellerebbe la firma e le coordinate prese in cantiere.
      let entry: { id: string };
      if (editingEntry?.id) {
        const patch: TablesUpdate<"giornale_lavori"> = { ...campi };
        if (firmaBase64) {
          patch.firma_capocantiere = firmaBase64;
          patch.firmato_il = new Date().toISOString();
        }
        if (lat != null && lng != null) {
          patch.latitude = lat;
          patch.longitude = lng;
        }
        const { data, error } = await supabase
          .from("giornale_lavori")
          .update(patch)
          .eq("id", editingEntry.id)
          .eq("company_id", companyId!)
          .select()
          .single();
        if (error) throw new Error(messaggioErroreGiornale(error));
        entry = data;
      } else {
        const { data, error } = await supabase
          .from("giornale_lavori")
          .insert({
            company_id: companyId,
            ...campi,
            latitude: lat,
            longitude: lng,
            firma_capocantiere: firmaBase64,
            firmato_il: hasFirma ? new Date().toISOString() : null,
            created_by: userId,
          })
          .select()
          .single();
        if (error) throw new Error(messaggioErroreGiornale(error));
        entry = data;
      }

      // Upload delle foto: si contano quelle arrivate davvero (file + riga), per dirlo a chi salva.
      let caricate = 0;
      const caricateIdx: number[] = [];
      for (const [i, foto] of fotoPreview.entries()) {
        setFotoProgresso(`Carico le foto ${i + 1} di ${fotoPreview.length}…`);
        // Bucket privato delle foto di cantiere: azienda/commessa sono le cartelle che la policy controlla.
        const fileName = percorsoFotoGiornale(companyId!, selectedOrderId, foto.nomeFile);
        const { error: uploadError } = await supabase.storage
          .from(BUCKET_FOTO_GIORNALE)
          .upload(fileName, foto.blob, { contentType: foto.contentType, upsert: false });
        if (uploadError) { console.error("[GiornaleLavori] upload foto:", uploadError); continue; }
        const { error: rigaError } = await supabase.from("giornale_foto").insert({
          giornale_id: entry.id,
          company_id: companyId,
          storage_path: fileName,
          // Percorso nudo, non un URL: il bucket è privato e si legge solo con link firmati.
          url: urlSalvatoFotoGiornale(fileName),
          latitude: lat,
          longitude: lng,
        });
        if (rigaError) {
          console.error("[GiornaleLavori] riga foto:", rigaError);
          await supabase.storage.from(BUCKET_FOTO_GIORNALE).remove([fileName]);
          continue;
        }
        caricate++;
        caricateIdx.push(i);
      }
      setFotoProgresso(null);
      // Le foto arrivate escono dall'elenco «da caricare»: il pannello resta aperto e un secondo salvataggio le duplicherebbe.
      if (caricateIdx.length) {
        setFotoPreview((prev) => prev.filter((f, i) => {
          if (!caricateIdx.includes(i)) return true;
          URL.revokeObjectURL(f.preview);
          return false;
        }));
      }
      const avvisoFoto = avvisoCaricamento(caricate, fotoPreview.length);
      if (avvisoFoto) toast.error(avvisoFoto);
      queryClient.invalidateQueries({ queryKey: ["giornale-foto-salvate", entry.id] });

      return entry;
    },
    onSuccess: (entry) => {
      toast.success(editingEntry?.id ? "Report corretto" : "Report giornaliero salvato!");
      queryClient.invalidateQueries({ queryKey: ["giornale-lavori", companyId, selectedOrderId] });
      // Keep sheet open to allow filling in custom fields for the newly saved entry
      setEditingEntry(entry);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  /**
   * Cancella un rapportino sbagliato.
   *
   * Finora un report si poteva scrivere e — da poco — correggere, ma non
   * disfare: un rapportino inserito sull'ordine sbagliato, o doppio, restava
   * nel diario ufficiale del cantiere per sempre.
   *
   * Le foto non si cancellano da sole: `giornale_foto` sparirebbe anche in
   * CASCADE, ma i file nel bucket resterebbero lì a occupare spazio senza
   * nessuna riga che li nomini. Qui si tolgono prima i file, poi le righe,
   * poi il rapportino — e se i file non si cancellano si va avanti lo stesso:
   * meglio un file orfano che un rapportino sbagliato che non si può togliere.
   */
  const eliminaEntry = useMutation({
    mutationFn: async (entry: { id: string }) => {
      if (!canEditGiornale) throw new Error("Permesso di modifica del Giornale non attivo");
      if (!companyId) throw new Error("Azienda non disponibile");
      if (regoleGiornale(entry as RigaGiornale, true).stato === "firmata") {
        throw new Error("Questa pagina del giornale è firmata: non si può eliminare.");
      }

      const { data: foto } = await supabase
        .from("giornale_foto")
        .select("id, storage_path")
        .eq("giornale_id", entry.id);

      const percorsi = (foto ?? [])
        .map((f: { storage_path: string | null }) => f.storage_path)
        .filter((p): p is string => !!p);
      if (percorsi.length > 0) {
        await supabase.storage.from(BUCKET_FOTO_GIORNALE).remove(percorsi);
      }
      await supabase.from("giornale_foto").delete().eq("giornale_id", entry.id);

      const { error } = await supabase
        .from("giornale_lavori")
        .delete()
        .eq("id", entry.id)
        .eq("company_id", companyId);
      if (error) throw new Error(messaggioErroreGiornale(error));
      return percorsi.length;
    },
    onSuccess: (nFoto) => {
      toast.success("Rapportino eliminato", {
        description: nFoto > 0 ? `Rimosse anche ${nFoto} foto.` : undefined,
      });
      setDaCancellare(null);
      setSheetOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["giornale-lavori", companyId, selectedOrderId] });
    },
    onError: (err: Error) => toast.error("Impossibile eliminare", { description: err.message }),
  });

  /** Firma: prima si salva quel che c'è nel modulo (testo e foto), poi si firma la pagina salvata. */
  const firmaPagina = useMutation({
    mutationFn: async () => {
      if (!regole.puoFirmare) throw new Error("Questa pagina non si può firmare.");
      const salvata = await saveEntry.mutateAsync();
      const { data, error } = await dbSenzaTipi.rpc("giornale_firma", { p_giornale_id: salvata.id });
      if (error) throw new Error(messaggioErroreGiornale(error));
      return data as { stato: string; pm_signed_at: string | null; pm_signed_by: string | null } | null;
    },
    onSuccess: (esito) => {
      toast.success("Giornale firmato: da ora si possono solo aggiungere annotazioni.");
      setFirmaDaConfermare(false);
      setEditingEntry((e: RigaGiornale | null) => (e ? {
        ...e, stato: "firmata", pm_signed_at: esito?.pm_signed_at ?? null, pm_signed_by: esito?.pm_signed_by ?? null,
      } : e));
      queryClient.invalidateQueries({ queryKey: ["giornale-lavori", companyId, selectedOrderId] });
    },
    onError: (err: Error) => {
      setFirmaDaConfermare(false);
      toast.error("Firma non riuscita", { description: err.message });
    },
  });

  const aggiungiAnnotazione = useMutation({
    mutationFn: async () => {
      const testo = nuovaAnnotazione.trim();
      if (!testo) throw new Error("Scrivi il testo dell'annotazione.");
      if (!editingEntry?.id || !regole.puoAnnotare) throw new Error("Le annotazioni si aggiungono alle pagine firmate.");
      // L'autore lo mette il database (auth.uid()).
      const { error } = await dbSenzaTipi
        .from("giornale_annotazioni")
        .insert({ company_id: companyId, giornale_id: editingEntry.id, testo });
      if (error) throw new Error(messaggioErroreGiornale(error));
    },
    onSuccess: () => {
      toast.success("Annotazione aggiunta");
      setNuovaAnnotazione("");
      queryClient.invalidateQueries({ queryKey: ["giornale-annotazioni", editingId] });
    },
    onError: (err: Error) => toast.error("Annotazione non salvata", { description: err.message }),
  });

  const handleExportPdf = async () => {
    if (!companyId) return;
    setIsExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-giornale-pdf", {
        body: { company_id: companyId, ...(selectedOrderId ? { order_id: selectedOrderId } : {}) },
      });
      if (error) {
        const detail = error.context ? await error.context.json?.().catch((): null => null) : null;
        throw new Error(detail?.error || error.message || "Errore nella generazione del PDF");
      }
      if (!data?.html) throw new Error("Nessun contenuto generato");
      setPrintHtml(data.html);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore nell'esportazione");
    } finally {
      setIsExporting(false);
    }
  };

  if (isScopriPlan) return <UpgradeScopriWall type="generic" inline />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/50 p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-eic-amber-strong text-white shadow-sm shadow-orange-200">
              <NotebookPen className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-slate-950 sm:text-2xl">Giornale dei Lavori</h1>
              <p className="text-xs text-slate-600 sm:text-sm">Diario ufficiale del cantiere</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* Su telefono niente export: qui era icon-only, ma un pulsante che
                scarica un PDF resta un download anche senza etichetta. */}
            {!isMobile && (
              <Button variant="outline" size="sm" className="border-slate-200 bg-white/80 hover:bg-white" onClick={handleExportPdf} disabled={isExporting}>
                {isExporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                <span className="ml-1">{isExporting ? "Generazione..." : "Esporta PDF"}</span>
              </Button>
            )}
            {canEditGiornale && (
              <Button size="sm" className="bg-gradient-to-r from-orange-500 to-eic-amber-strong text-white shadow-sm shadow-orange-200 hover:from-orange-600 hover:to-amber-600" onClick={openNew}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">Report</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Order selector */}
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row">
        <Select
          value={selectedOrderId || "__all__"}
          onValueChange={(v) => setSelectedOrderId(v === "__all__" ? "" : v)}
        >
          <SelectTrigger className="flex-1 sm:max-w-xs">
            <SelectValue placeholder="Tutti gli ordini" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Tutti gli ordini</SelectItem>
            {orders.map((o: any) => (
              <SelectItem key={o.id} value={o.id}>
                {o.order_code ? `#${o.order_code} — ` : ""}{o.description}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {gpsStatus === "success" && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 text-green-500" />
            <span>GPS attivo</span>
          </div>
        )}
      </div>

      {/* Errore di caricamento — non mascherare con l'empty-state "Nessun report" */}
      {(entriesError || ordersError) && (
        <Alert variant="destructive">
          <AlertDescription>Errore nel caricamento. Riprova.</AlertDescription>
        </Alert>
      )}

      {/* Entries list */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-4">
            <NotebookPen className="h-16 w-16 text-muted-foreground/40" />
            <div>
              <p className="font-semibold text-lg">Nessun report giornaliero</p>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedOrderId ? "Nessun report per questo ordine." : "Seleziona un ordine e aggiungi il primo report."}
              </p>
            </div>
            {canEditGiornale && (
              <Button onClick={openNew}>
                <Plus className="h-4 w-4 mr-2" /> Aggiungi report
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {entries.map((entry: any) => (
            <GiornaleCard
              key={entry.id}
              entry={entry}
              onClick={() => openEdit(entry)}
            />
          ))}
        </div>
      )}

      {/* ───── Sheet inserimento ───── */}
      <Sheet open={sheetOpen} onOpenChange={(open) => { if (!open) resetForm(); setSheetOpen(open); }}>
        <SheetContent side="bottom" className="h-[95dvh] overflow-y-auto">
          <SheetHeader className="pb-4">
            <SheetTitle className="flex items-center gap-2">
              <NotebookPen className="h-5 w-5" />
              {!editingEntry?.id ? "Report Giornaliero" : solaLettura ? "Pagina del giornale" : "Correggi il report"}
              {editingEntry?.id && (regole.stato === "firmata" ? (
                <Badge variant="secondary" className="bg-green-100 text-green-700">
                  <Lock className="mr-1 h-3 w-3" aria-hidden="true" />Firmata
                </Badge>
              ) : (
                <Badge variant="outline">Bozza</Badge>
              ))}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-5 pb-8">
            {regole.stato === "firmata" && (
              <Alert>
                <Lock className="h-4 w-4" />
                <AlertDescription>
                  Firmata il {dataOra(editingEntry?.pm_signed_at)}
                  {editingEntry?.pm_signed_by && nomi[editingEntry.pm_signed_by] ? ` da ${nomi[editingEntry.pm_signed_by]}` : ""}.
                  {" "}Non si può più modificare: si possono solo aggiungere annotazioni.
                </AlertDescription>
              </Alert>
            )}

            {/* Una pagina per cantiere e per giorno: c'è già, si apre quella invece di scriverne un'altra. */}
            {paginaGiaScritta && (
              <Alert>
                <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                  <span>Per questo cantiere c'è già la pagina del {format(new Date(`${formData.data_lavori}T00:00:00`), "dd/MM/yyyy")}.</span>
                  <Button size="sm" variant="outline" onClick={() => openEdit(paginaGiaScritta)}>Apri la pagina</Button>
                </AlertDescription>
              </Alert>
            )}

            {/* Chi ha lavorato quel giorno, dai rapportini */}
            {orderDelGiorno && formData.data_lavori && (
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    Presenze dai rapportini
                  </p>
                  {rapportiniGiorno.length > 0 && (
                    <Link
                      to={`/azienda/ordini/${orderDelGiorno}?tab=cantiere&vista_cantiere=diario`}
                      className="text-xs text-primary underline-offset-2 hover:underline"
                    >
                      {rapportiniGiorno.length === 1 ? "Apri il rapportino" : `Apri i ${rapportiniGiorno.length} rapportini`}
                    </Link>
                  )}
                </div>
                {personeGiorno.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nessun rapportino per questo giorno su questo cantiere.</p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5" aria-label="Persone presenti">
                    {personeGiorno.map((p) => (
                      <li key={p.chiave} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                        {p.nome} · <span className="tabular-nums">{oreLeggibili(p.ore)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* In sola lettura (firmata o senza permesso) i campi restano visibili ma spenti. */}
            <fieldset disabled={solaLettura} className="min-w-0 space-y-5">
            {/* Ordine (se non già selezionato) */}
            {!selectedOrderId && (
              <div className="space-y-2">
                <Label>Cantiere / Ordine *</Label>
                <Select value={selectedOrderId || undefined} onValueChange={setSelectedOrderId}>
                  <SelectTrigger><SelectValue placeholder="Seleziona ordine" /></SelectTrigger>
                  <SelectContent>
                    {orders.map((o: any) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.order_code ? `#${o.order_code} — ` : ""}{o.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Data */}
            <div className="space-y-2">
              <Label>Data lavori</Label>
              <Input
                type="date"
                value={formData.data_lavori}
                onChange={(e) => setFormData((p) => ({ ...p, data_lavori: e.target.value }))}
              />
            </div>

            {/* Meteo */}
            <div className="space-y-2">
              <Label>Condizioni meteo</Label>
              <div className="flex flex-wrap gap-2">
                {METEO_OPTIONS.map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setFormData((p) => ({ ...p, condizioni_meteo: m.value }))}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors ${
                        formData.condizioni_meteo === m.value
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${m.color}`} />
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Temperatura */}
            <div className="space-y-2">
              <Label>Temperatura (opzionale)</Label>
              <Input
                placeholder="es. 18°C"
                value={formData.temperatura}
                onChange={(e) => setFormData((p) => ({ ...p, temperatura: e.target.value }))}
              />
            </div>

            {/* Lavorazioni */}
            <div className="space-y-2">
              <Label>Lavorazioni eseguite oggi *</Label>
              <Textarea
                placeholder="Descrivi le attività svolte nella giornata..."
                value={formData.lavorazioni_eseguite}
                onChange={(e) => setFormData((p) => ({ ...p, lavorazioni_eseguite: e.target.value }))}
                rows={4}
                className="resize-none"
              />
              {/* Detta: il testo pulito si aggiunge in fondo, chi scrive lo rivede prima di salvare. */}
              <DettaTesto value={formData.lavorazioni_eseguite} onChange={(t) => setFormData((p) => ({ ...p, lavorazioni_eseguite: t }))} companyId={companyId} contesto="giornale" campo="lavorazioni" etichetta="Lavorazioni eseguite" disabled={saveEntry.isPending} />
            </div>

            {/* Materiali */}
            <div className="space-y-2">
              <Label>Materiali utilizzati</Label>
              <Textarea
                placeholder="Cemento, ferro, laterizi..."
                value={formData.materiali_utilizzati}
                onChange={(e) => setFormData((p) => ({ ...p, materiali_utilizzati: e.target.value }))}
                rows={2}
                className="resize-none"
              />
            </div>

            {/* Personale */}
            <div className="space-y-2">
              <Label>N. operai presenti</Label>
              <Input
                type="number"
                inputMode="numeric"
                min="0"
                max="999"
                value={formData.personale_presente}
                onChange={(e) => setFormData((p) => ({ ...p, personale_presente: parseInt(e.target.value) || 0 }))}
                className="w-24"
              />
            </div>

            {/* Avanzamento */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Avanzamento lavori</Label>
                <span className="text-sm font-semibold text-primary">{formData.avanzamento_percentuale}%</span>
              </div>
              <Slider
                min={0}
                max={100}
                step={5}
                disabled={solaLettura}
                value={[formData.avanzamento_percentuale]}
                onValueChange={([v]) => setFormData((p) => ({ ...p, avanzamento_percentuale: v }))}
                className="py-2"
              />
            </div>

            {/* Note */}
            <div className="space-y-2">
              <Label>Note aggiuntive</Label>
              <Textarea
                placeholder="Problemi, osservazioni, comunicazioni..."
                value={formData.note}
                onChange={(e) => setFormData((p) => ({ ...p, note: e.target.value }))}
                rows={2}
                className="resize-none"
              />
              <DettaTesto value={formData.note} onChange={(t) => setFormData((p) => ({ ...p, note: t }))} companyId={companyId} contesto="giornale" campo="note" etichetta="Note aggiuntive" disabled={saveEntry.isPending} />
            </div>

            {/* Visibilità cliente */}
            <div className="flex items-center gap-2 p-3 rounded-lg border">
              <input
                type="checkbox"
                id="visibile_cliente"
                checked={visibileCliente}
                onChange={(e) => setVisibileCliente(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <Label htmlFor="visibile_cliente" className="text-sm font-normal cursor-pointer">
                Visibile nel portale cliente
              </Label>
            </div>

            {/* GPS */}
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <MapPin className={`h-5 w-5 shrink-0 ${gpsStatus === "success" ? "text-green-500" : "text-muted-foreground"}`} />
              <div className="flex-1 min-w-0">
                {gpsStatus === "success" ? (
                  <p className="text-sm text-green-600 font-medium">
                    GPS: {gpsLat.toFixed(4)}, {gpsLng.toFixed(4)}
                  </p>
                ) : gpsStatus === "loading" ? (
                  <p className="text-sm text-muted-foreground">Rilevamento posizione...</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Posizione GPS non rilevata</p>
                )}
              </div>
              {gpsStatus !== "success" && gpsStatus !== "loading" && (
                <Button variant="outline" size="sm" onClick={requestPosition}>Richiedi GPS</Button>
              )}
            </div>

            {/* Foto: fotocamera e galleria separate. Un input con capture E multiple, sul telefono, apre solo la fotocamera. */}
            <div className="space-y-2">
              <Label>Foto cantiere</Label>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                aria-label="Scatta una foto"
                className="hidden"
                onChange={handleFotoSelect}
              />
              <input
                ref={galleriaInputRef}
                type="file"
                accept="image/*"
                multiple
                aria-label="Scegli foto dalla galleria"
                className="hidden"
                onChange={handleFotoSelect}
              />
              {(fotoSalvate.length > 0 || fotoPreview.length > 0) && (
                <div className="grid grid-cols-3 gap-2">
                  {fotoSalvate.map((foto, i) => (
                    <div key={foto.id} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                      {fotoSalvateLink[i]
                        ? <img loading="lazy" src={fotoSalvateLink[i]} alt={`Foto salvata ${i + 1}`} className="w-full h-full object-cover" />
                        : <div className="flex h-full items-center justify-center"><Camera className="h-5 w-5 text-muted-foreground" aria-label={`Foto salvata ${i + 1} non disponibile`} /></div>}
                      {regole.puoModificare && (
                        <button
                          type="button"
                          aria-label={`Togli la foto salvata ${i + 1}`}
                          disabled={eliminaFotoSalvata.isPending}
                          onClick={() => eliminaFotoSalvata.mutate(foto)}
                          className="tap-compact absolute top-1 right-1 bg-black/60 rounded-full p-1.5 disabled:opacity-50"
                        >
                          <X className="h-3 w-3 text-white" />
                        </button>
                      )}
                    </div>
                  ))}
                  {fotoPreview.map((foto, i) => (
                    <div key={foto.preview} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                      <img loading="lazy" src={foto.preview} alt={`Foto da caricare ${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        aria-label={`Togli la foto ${i + 1}`}
                        onClick={() => removeFoto(i)}
                        className="tap-compact absolute top-1 right-1 bg-black/60 rounded-full p-1.5"
                      >
                        <X className="h-3 w-3 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!!fotoProgresso || fotoAlCompleto}
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera className="h-4 w-4 mr-2" />
                  {fotoSalvate.length + fotoPreview.length > 0 ? "Scatta un'altra" : "Scatta foto"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!!fotoProgresso || fotoAlCompleto}
                  onClick={() => galleriaInputRef.current?.click()}
                >
                  {fotoProgresso ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  Dalla galleria
                </Button>
              </div>
              <p role="status" className="text-xs text-muted-foreground">
                {fotoProgresso
                  ?? (fotoAlCompleto
                    ? `${MAX_FOTO_PER_RAPPORTINO} foto: è il massimo per un report.`
                    : `${fotoSalvate.length + fotoPreview.length} di ${MAX_FOTO_PER_RAPPORTINO} foto${fotoPreview.length > 0 ? ` · ${fotoPreview.length} da caricare al salvataggio` : ""}.`)}
              </p>
            </div>

            {/* Firma */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Firma capocantiere</Label>
                {hasFirma && (
                  <Button variant="ghost" size="sm" className="h-9 md:h-6 text-xs" onClick={clearFirma}>
                    Cancella
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                <Input
                  placeholder="Nome e cognome firmatario"
                  value={formData.firmato_da}
                  onChange={(e) => setFormData((p) => ({ ...p, firmato_da: e.target.value }))}
                />
                {!solaLettura && (
                <div className="border rounded-lg overflow-hidden bg-white">
                  <canvas
                    ref={canvasRef}
                    width={400}
                    height={120}
                    className="w-full touch-none cursor-crosshair"
                    style={{ maxHeight: "120px" }}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                </div>
                )}
                {!hasFirma && !solaLettura && (
                  <p className="text-xs text-muted-foreground text-center">Firma nello spazio sopra</p>
                )}
              </div>
            </div>

            </fieldset>

            {/* Annotazioni: l'unica cosa che si aggiunge a una pagina firmata */}
            {regole.stato === "firmata" && editingEntry?.id && (
              <div className="space-y-3 rounded-lg border p-3">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <PenLine className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  Annotazioni
                </p>
                {annotazioni.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nessuna annotazione.</p>
                ) : (
                  <ul className="space-y-2">
                    {annotazioni.map((a) => (
                      <li key={a.id} className="rounded-md bg-muted/60 p-2">
                        <p className="text-xs text-muted-foreground">
                          {dataOra(a.created_at)}{a.autore_id && nomi[a.autore_id] ? ` · ${nomi[a.autore_id]}` : ""}
                        </p>
                        <p className="whitespace-pre-wrap text-sm">{a.testo}</p>
                      </li>
                    ))}
                  </ul>
                )}
                {regole.puoAnnotare && (
                  <div className="space-y-2">
                    <Label htmlFor="nuova_annotazione">Aggiungi annotazione</Label>
                    <Textarea
                      id="nuova_annotazione"
                      placeholder="Correzione, precisazione, evento successivo…"
                      value={nuovaAnnotazione}
                      onChange={(e) => setNuovaAnnotazione(e.target.value)}
                      rows={2}
                      maxLength={5000}
                      className="resize-none"
                    />
                    <DettaTesto value={nuovaAnnotazione} onChange={setNuovaAnnotazione} companyId={companyId} contesto="giornale" campo="note" etichetta="Annotazione" disabled={aggiungiAnnotazione.isPending} />
                    <Button
                      size="sm"
                      onClick={() => aggiungiAnnotazione.mutate()}
                      disabled={aggiungiAnnotazione.isPending || !nuovaAnnotazione.trim()}
                    >
                      {aggiungiAnnotazione.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                      Aggiungi annotazione
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Custom fields — shown after save when entry has an id */}
            {editingEntry?.id && (
              <div className="border rounded-lg p-3">
                <EntityCustomFieldsSection
                  entityType="giornale_lavori"
                  entityId={editingEntry.id}
                />
              </div>
            )}

            {/* Hint se ordine non selezionato */}
            {!selectedOrderId && !editingEntry?.id && (
              <p className="text-xs text-amber-600 text-center">
                Seleziona un cantiere prima di salvare.
              </p>
            )}

            {/* Salvataggio. Su un report già salvato il pulsante c'era solo
                "Chiudi": si potevano compilare i campi personalizzati ma non
                correggere niente di quello che era stato scritto. */}
            <div className="space-y-2">
              {!solaLettura && (
              <Button
                className="w-full"
                size="lg"
                onClick={() => saveEntry.mutate()}
                disabled={saveEntry.isPending || firmaPagina.isPending || !!fotoProgresso || !formData.lavorazioni_eseguite.trim() || !selectedOrderId || !!paginaGiaScritta}
              >
                {saveEntry.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvataggio in corso...</>
                ) : editingEntry?.id ? (
                  "Salva correzioni"
                ) : (
                  "Salva report giornaliero"
                )}
              </Button>
              )}
              {regole.puoFirmare && (
                <Button
                  className="w-full"
                  size="lg"
                  variant="secondary"
                  onClick={() => setFirmaDaConfermare(true)}
                  disabled={saveEntry.isPending || firmaPagina.isPending || !!fotoProgresso}
                >
                  <Lock className="mr-2 h-4 w-4" aria-hidden="true" />
                  Firma il giornale
                </Button>
              )}
              {editingEntry?.id && (
                /* Chiudi riempie la riga, Elimina è l'azione secondaria e
                   sta stretta: su 375 px la riga resta piena e la scelta
                   pericolosa non è quella grande. */
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    size="lg"
                    variant="outline"
                    onClick={() => { setSheetOpen(false); resetForm(); }}
                  >
                    Chiudi
                  </Button>
                  {regole.puoEliminare && (
                  <Button
                    size="lg"
                    variant="outline"
                    className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setDaCancellare(editingEntry)}
                    aria-label="Elimina questo rapportino"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="ml-1.5 hidden sm:inline">Elimina</span>
                  </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {printHtml && (
        <PrintPreviewModal
          htmlContent={printHtml}
          fileName="giornale-lavori"
          title="Giornale dei Lavori"
          open={!!printHtml}
          onOpenChange={(open) => { if (!open) setPrintHtml(null); }}
        />
      )}

      {/* Mobile FAB — fixed above bottom nav */}
      {canEditGiornale && (
      <button
        onClick={openNew}
        className="md:hidden fixed right-4 z-40 flex items-center justify-center h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 active:scale-95 transition-all"
        aria-label="Nuovo report giornaliero"
        // safe-area sull'OFFSET, non come padding interno: il padding schiacciava
        // il content-box del cerchio h-14 e l'icona finiva decentrata/clippata
        style={{ bottom: "calc(5rem + env(safe-area-inset-bottom))" }}
      >
        <Plus className="h-7 w-7" aria-hidden="true" />
      </button>
      )}

      <AlertDialog open={firmaDaConfermare} onOpenChange={(o) => { if (!o && !firmaPagina.isPending) setFirmaDaConfermare(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Firmare questa pagina del giornale?</AlertDialogTitle>
            <AlertDialogDescription>
              Dopo la firma non si potrà più modificare: si potranno solo aggiungere annotazioni.
              Prima della firma si salva quello che c'è nel modulo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={firmaPagina.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); firmaPagina.mutate(); }}
              disabled={firmaPagina.isPending}
            >
              {firmaPagina.isPending ? "Firmo..." : "Firma il giornale"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!daCancellare} onOpenChange={(o) => { if (!o) setDaCancellare(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questo rapportino?</AlertDialogTitle>
            <AlertDialogDescription>
              {daCancellare?.data_lavori
                ? `Il report del ${format(new Date(daCancellare.data_lavori), "dd/MM/yyyy")} `
                : "Il report "}
              sparisce dal diario del cantiere
              {(daCancellare?.giornale_foto?.length ?? 0) > 0
                ? `, insieme alle sue ${daCancellare.giornale_foto.length} foto`
                : ""}
              . Non si può annullare.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); if (daCancellare) eliminaEntry.mutate(daCancellare); }}
              disabled={eliminaEntry.isPending}
            >
              {eliminaEntry.isPending ? "Elimino..." : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
