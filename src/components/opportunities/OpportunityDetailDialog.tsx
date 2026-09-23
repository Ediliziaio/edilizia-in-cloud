import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/useDebounce";
import { useAuth } from "@/contexts/AuthContext";
import { useUpdateOpportunity, useDeleteOpportunity, useCompanyStaff, useCompanySalespeople, useCompanyCallCenterUsers, useOpportunityNotes, useAddOpportunityNote, usePipelines } from "@/hooks/useOpportunitiesData";
import {
  useOpportunityCustomFields,
  useContactFieldValues, useOpportunityFieldValues,
  useUpdateContact, useUpsertContactFieldValues, useUpsertOpportunityFieldValues,
} from "@/hooks/useOpportunityDetailData";
import { useIsPlatformCrm } from "@/hooks/useIsPlatformCrm";
import { ServizioAedixFields } from "./ServizioAedixFields";
import { ConvertiClienteServizioDialog } from "./ConvertiClienteServizioDialog";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { NewPreventivoMenu } from "@/components/marketing/preventivi/NewPreventivoMenu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { REGION_OPTIONS } from "@/lib/italianRegions";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { TagSelector } from "@/components/marketing/TagSelector";
import { MotivoPerditaSelect } from "./MotivoPerditaSelect";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Trash2, StickyNote, FileText, CalendarDays, Activity,
  Settings2, User, Mail, Phone, UserPlus, DatabaseZap, RefreshCw, Folder,
  Target, AlertTriangle, Trophy, MessageCircle, ExternalLink, History, Pin,
} from "lucide-react";
import { useUpdateOpportunityMutation } from "@/hooks/useSalesOS";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useMarketingRoutePrefix } from "@/hooks/useMarketingRoutePrefix";
import { syncTagsToContact, removeTagFromContact } from "@/hooks/useTagSync";
import { LinkedTasks } from "@/components/tasks/LinkedTasks";
import { useLossReasons } from "@/hooks/useLossReasons";
import { etichettaMotivo } from "@/lib/opportunita/motiviPerdita";
import { LinkedRendersList } from "@/components/render/LinkedRendersList";
import { MarketingDocumentsPanel } from "@/components/marketing/MarketingDocumentsPanel";
import { OpportunityAppointmentTab } from "@/components/opportunities/OpportunityAppointmentTab";
import { OpportunityQuotesTab } from "@/components/opportunities/OpportunityQuotesTab";
import { STATUS_OPTIONS, inferOpportunityStatusFromStage } from "@/types/opportunities";
import { usePermissions } from "@/hooks/usePermissions";
import { cleanPhone } from "@/lib/contactUtils";
import { QuickContactSendDialog, type QuickSendChannel } from "@/components/contacts/QuickContactSendDialog";
import { ContactActivityRegister } from "@/components/contacts/ContactActivityRegister";
import { LogCallButton } from "@/components/marketing/LogCallButton";
import { getAddedTags, getRemovedTags, normalizeTagList } from "@/lib/marketingTags";
import { useSoftphoneOptional } from "@/components/telephony/SoftphoneProvider";
import { NotaModificabile } from "@/components/marketing/NotaModificabile";
import { puoModificareNota } from "@/lib/marketing/modificaNota";
import { idModuloDaFonte, origineOpportunita, type DatiOrigine } from "@/lib/origineOpportunita";

interface Props {
  opportunity: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: { id: string; name: string; auto_status?: string | null }[];
  initialTab?: string;
  canEdit?: boolean;
}

type Tab = "details" | "notes" | "appointments" | "registro" | "activities" | "documents" | "quotes";

function sanitizeSearchTerm(value: string) {
  return value.replace(/[%,]/g, " ").trim();
}

// Stile condiviso dei select del form: stesso look degli input (bordo visibile +
// sfondo bianco + hover), così il campo si legge chiaramente come selezionabile
// anche quando è vuoto (es. Venditore/Follower/Call Center non assegnati).
// I `!` forzano il bordo: un reset globale `button { border: 0 }` (non in layer)
// azzerava il bordo dei trigger Radix, che sono <button>, mentre gli <input>
// restavano bordati — da qui l'incoerenza visiva.
const SELECT_TRIGGER_CLS =
  "h-10 sm:h-8 text-sm !border !border-solid !border-input bg-background hover:!border-primary/60 hover:bg-accent/40 transition-colors";

export function OpportunityDetailDialog({ opportunity, open, onOpenChange, stages, initialTab, canEdit = true }: Props) {
  const navigate = useNavigate();
  // Rotte relative al contesto: dall'hub admin si resta su /admin/marketing
  // (prima si finiva su /azienda/* perdendo il PlatformCompanyProvider).
  const routePrefix = useMarketingRoutePrefix();
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const isPlatformCrm = useIsPlatformCrm();
  const permissions = usePermissions();
  const canEditOpportunity = canEdit && permissions.canEditMarketingOpportunities;
  // Chi può correggere una nota: le proprie, o tutte se vede tutti i clienti.
  const chiModificaNote = {
    userId: user?.id,
    isAdmin: permissions.isAdmin,
    puoModificareContatti: permissions.canEditMarketingContacts,
    soloAssegnati: permissions.onlyAssigned,
  };
  const queryClient = useQueryClient();
  const softphone = useSoftphoneOptional();
  const updateOpp = useUpdateOpportunity();
  const deleteOpp = useDeleteOpportunity();
  const { data: staff = [] } = useCompanyStaff();
  const { data: salespeople = [] } = useCompanySalespeople();
  const { data: callCenterUsers = [] } = useCompanyCallCenterUsers();
  const { data: notes = [] } = useOpportunityNotes(opportunity?.id || null, opportunity?.contact_id || null);
  const addNote = useAddOpportunityNote();
  const { data: pipelines = [] } = usePipelines();

  const { data: oppCustomFields = [] } = useOpportunityCustomFields();
  const { data: contactFieldValues = [] } = useContactFieldValues(opportunity?.contact_id || null);
  const { data: oppFieldValues = [] } = useOpportunityFieldValues(opportunity?.id || null);
  const updateContact = useUpdateContact();
  const upsertContactFields = useUpsertContactFieldValues();
  const upsertOppFields = useUpsertOpportunityFieldValues();

  // «Creato il … da …»: chi l'ha inserita e da quale fonte. Le liste (kanban,
  // pagine) non portano questi campi, quindi si leggono qui, a scheda aperta.
  const { data: creazione } = useQuery({
    queryKey: ["opportunita-creazione", opportunity?.id],
    enabled: open && !!opportunity?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_opportunities")
        .select("created_at, created_by, source, tags, meta_lead_id")
        .eq("id", opportunity.id)
        .maybeSingle();
      if (error) throw error;
      const riga = data as unknown as (DatiOrigine & { created_at: string }) | null;
      // Moduli del sito più vecchi: la fonte è `form_<id>`, il nome sta nel modulo.
      const idModulo = idModuloDaFonte(riga?.source);
      let nomeModulo: string | null = null;
      if (idModulo) {
        const { data: modulo } = await supabase
          .from("lead_forms").select("name").eq("id", idModulo).maybeSingle();
        nomeModulo = (modulo as { name?: string | null } | null)?.name ?? null;
      }
      return { riga, nomeModulo };
    },
  });
  const nomiStaff = new Map<string, string>();
  for (const s of [...staff, ...salespeople, ...callCenterUsers] as unknown as Array<{ id: string; name: string }>) {
    if (s?.id && s.name) nomiStaff.set(s.id, s.name);
  }
  const origine = creazione?.riga
    ? origineOpportunita(creazione.riga, (id) => nomiStaff.get(id), () => creazione.nomeModulo)
    : null;
  const testoCreazione = opportunity?.created_at
    ? [
        `Creato il ${format(new Date(opportunity.created_at), "d MMM yyyy 'alle' HH:mm", { locale: it })}`,
        origine ? (origine.tipo === "utente" ? `da ${origine.testo}` : `· fonte: ${origine.testo}`) : null,
        origine?.importata ? "· importata" : null,
      ].filter(Boolean).join(" ")
    : "";

  const [tab, setTab] = useState<Tab>("details");
  const [hideEmpty, setHideEmpty] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Contact fields
  const [contactFirstName, setContactFirstName] = useState("");
  const [contactLastName, setContactLastName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  // Popup invio rapido SMS/WhatsApp/Email al contatto (senza navigare via).
  const [quickSend, setQuickSend] = useState<{ open: boolean; channel: QuickSendChannel }>({ open: false, channel: "whatsapp" });
  const [contactCity, setContactCity] = useState("");
  // Indirizzo/provincia/regione: STESSI campi del contatto (marketing_contacts),
  // non duplicati. Cambiando città, il trigger DB enrich_marketing_contact_geo
  // ricalcola provincia e regione in automatico dal dataset comuni.
  const [contactAddress, setContactAddress] = useState("");
  const [contactProvince, setContactProvince] = useState("");
  const [contactRegion, setContactRegion] = useState("");
  const [contactCustomValues, setContactCustomValues] = useState<Record<string, string>>({});

  // Servizio AEDIX venduto (solo CRM di piattaforma) + conversione a cliente-servizio
  const [productLineId, setProductLineId] = useState<string | null>(null);
  const [packageId, setPackageId] = useState<string | null>(null);
  const [convertiOpen, setConvertiOpen] = useState(false);

  // Opportunity fields
  const [name, setName] = useState("");
  const [stageId, setStageId] = useState("");
  // La pipeline si può cambiare dalla scheda: prima «Sequenza» era una casella
  // grigia e l'unico modo per passare da una pipeline all'altra non esisteva.
  const [pipelineId, setPipelineId] = useState("");
  const [status, setStatus] = useState("open");
  const [value, setValue] = useState("");
  const [source, setSource] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [followerId, setFollowerId] = useState("");
  const [callCenterId, setCallCenterId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [oppNotes, setOppNotes] = useState("");
  const [oppTags, setOppTags] = useState<string[]>([]);
  const [oppCustomValues, setOppCustomValues] = useState<Record<string, string>>({});

  // Sales OS state
  const [showLostDialog, setShowLostDialog] = useState(false);
  // «Aggiorna» con lo stato Persa ma senza motivo apre la finestra del motivo:
  // confermata quella, il salvataggio riparte da solo.
  const riprendiSalvataggio = useRef(false);
  const [pendingLostStatus, setPendingLostStatus] = useState<string | null>(null);
  const [lostReason, setLostReason] = useState("");
  const [lostCategory, setLostCategory] = useState("");
  const [competitorWon, setCompetitorWon] = useState("");
  const updateOpportunity = useUpdateOpportunityMutation();
  const { motivi: motiviPerdita } = useLossReasons();
  // Il motivo che risulta scritto adesso: prima quello appena scelto, poi
  // quello salvato (lost_reason e la vecchia loss_reason delle importazioni).
  const motivoPerditaScritto = [
    etichettaMotivo(lostCategory || opportunity.lost_reason_category || "", motiviPerdita),
    lostReason || opportunity.lost_reason || opportunity.loss_reason || "",
  ].filter(Boolean).join(" — ");

  // Change contact state
  const [changingContact, setChangingContact] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [showNewContactForm, setShowNewContactForm] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [pendingContactId, setPendingContactId] = useState<string | null>(null);

  // Track synced IDs to prevent infinite loops
  const lastSyncedContactFieldsRef = useRef<string>("");
  const lastSyncedOppFieldsRef = useRef<string>("");

  // Fetch contacts for change contact combobox
  // Catena commerciale: la commessa nata da questo deal (via preventivo
  // convertito) e l'eventuale preventivo accettato non ancora convertito.
  const { data: catena } = useQuery({
    queryKey: ["opportunita-catena", opportunity?.id],
    enabled: !!opportunity?.id && open,
    staleTime: 30_000,
    queryFn: async () => {
      const [commessaRes, accettatoRes] = await Promise.all([
        (supabase as any)
          .from("orders")
          .select("id, order_code")
          .eq("opportunity_id", opportunity.id)
          .limit(1)
          .maybeSingle(),
        supabase
          .from("quotes")
          .select("id, quote_number")
          .eq("opportunity_id", opportunity.id)
          .eq("status", "accettata")
          .limit(1)
          .maybeSingle(),
      ]);
      return {
        commessa: (commessaRes?.data ?? null) as { id: string; order_code: string | null } | null,
        preventivoAccettato: (accettatoRes?.data ?? null) as { id: string; quote_number: string | null } | null,
      };
    },
  });

  // CRM di piattaforma: questa trattativa e' gia' diventata un cliente-servizio?
  // Serve a non proporre due volte la stessa conversione.
  const { data: clienteServizio, refetch: refetchClienteServizio } = useQuery({
    queryKey: ["opportunita-cliente-servizio", opportunity?.id],
    enabled: !!opportunity?.id && open && isPlatformCrm,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("aedix_service_clients")
        .select("id, cliente_nome, stato")
        .eq("opportunity_id", opportunity.id)
        .limit(1)
        .maybeSingle();
      return (data ?? null) as { id: string; cliente_nome: string; stato: string } | null;
    },
  });

  // La ricerca parte 300 ms dopo l'ultima lettera, non a ogni tasto: il 15/09/2026
  // con il database saturo ogni lettera diventava una query da 8 secondi.
  const ricercaContatti = useDebounce(contactSearch, 300);
  const { data: searchContacts = [] } = useQuery({
    queryKey: ["marketing_contacts_search_detail", companyId, ricercaContatti],
    queryFn: async () => {
      let query = supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name, email, phone, city, address, province, region")
        .eq("company_id", companyId!)
        .limit(20);
      const safeSearch = sanitizeSearchTerm(ricercaContatti);
      if (safeSearch) {
        query = query.or(`first_name.ilike.%${safeSearch}%,last_name.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%`);
      }
      const { data, error } = await query.order("first_name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId && changingContact,
  });

  useEffect(() => {
    if (opportunity) {
      const contact = opportunity.marketing_contacts;
      setContactFirstName(contact?.first_name || "");
      setContactLastName(contact?.last_name || "");
      setContactEmail(contact?.email || "");
      setContactPhone(contact?.phone || "");
      setContactCity(contact?.city || "");
      setContactAddress(contact?.address || "");
      setContactProvince(contact?.province || "");
      setContactRegion(contact?.region || "");
      setName(opportunity.name || "");
      setStageId(opportunity.stage_id || "");
      setPipelineId(opportunity.pipeline_id || "");
      setStatus(opportunity.status || "open");
      setValue(String(opportunity.value || 0));
      setSource(opportunity.source || "");
      setAssignedTo(opportunity.assigned_to || "");
      setFollowerId(opportunity.follower_id || "");
      setCallCenterId(opportunity.call_center_id || "");
      setCompanyName(opportunity.company_name || "");
      setOppNotes(opportunity.notes || "");
      setOppTags(opportunity.tags || []);
      setProductLineId(opportunity.product_line_id || null);
      setPackageId(opportunity.package_id || null);
      setTab((initialTab as Tab) || "details");
      setNewNote("");
      setChangingContact(false);
      setShowNewContactForm(false);
      setPendingContactId(null);
      lastSyncedContactFieldsRef.current = "";
      lastSyncedOppFieldsRef.current = "";
    }
  }, [opportunity, initialTab]);

  // Auto-sync: merge contact tags into opportunity if missing (safety net)
  // Guard: only write if there are actually missing tags to avoid unnecessary DB writes
  const lastSyncedTagsRef = useRef<string>("");
  useEffect(() => {
    if (!opportunity || !open || !companyId || !canEditOpportunity) return;
    const contact = opportunity.marketing_contacts;
    if (!contact?.tags?.length) return;
    const oppTagsCurrent = normalizeTagList(opportunity.tags || []);
    const contactTags = normalizeTagList(contact.tags);
    const missing = getAddedTags(contactTags, oppTagsCurrent);
    if (missing.length === 0) return;
    // Prevent duplicate syncs for the same opportunity
    const syncKey = `${opportunity.id}-${missing.sort().join(",")}`;
    if (lastSyncedTagsRef.current === syncKey) return;
    lastSyncedTagsRef.current = syncKey;
    const merged = normalizeTagList([...oppTagsCurrent, ...contactTags]);
    setOppTags(merged);
    supabase
      .from("marketing_opportunities")
      .update({ tags: merged, updated_at: new Date().toISOString() })
      .eq("id", opportunity.id)
      .eq("company_id", companyId)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["marketing-opportunities"] });
      });
  }, [opportunity?.id, open, queryClient, companyId, canEditOpportunity]);

  // Sync contact custom field values - with guard to prevent infinite loop
  useEffect(() => {
    const serialized = JSON.stringify(contactFieldValues);
    if (serialized === lastSyncedContactFieldsRef.current) return;
    lastSyncedContactFieldsRef.current = serialized;
    const map: Record<string, string> = {};
    contactFieldValues.forEach((v: any) => { map[v.field_id] = v.value || ""; });
    setContactCustomValues(map);
  }, [contactFieldValues]);

  // Sync opportunity custom field values - with guard to prevent infinite loop
  useEffect(() => {
    const serialized = JSON.stringify(oppFieldValues);
    if (serialized === lastSyncedOppFieldsRef.current) return;
    lastSyncedOppFieldsRef.current = serialized;
    const map: Record<string, string> = {};
    oppFieldValues.forEach((v: any) => { map[v.field_id] = v.value || ""; });
    setOppCustomValues(map);
  }, [oppFieldValues]);

  // "now" catturato una volta al mount (lazy init) → niente Date.now() impuro in
  // render per il badge "ferma da Xgg". Va prima dell'early return (regole Hook).
  const [nowMs] = useState(() => Date.now());

  if (!opportunity) return null;

  const contact = opportunity.marketing_contacts;
  const fullName = contact ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim() : opportunity.name;
  const cityPart = contact?.city ? ` - ${contact.city}` : "";
  const pipelineName = pipelines.find((p: any) => p.id === opportunity.pipeline_id)?.name || "";
  // Le fasi da mostrare sono quelle della pipeline scelta nella scheda, non
  // per forza quelle della vista da cui si è aperta l'opportunità.
  const fasiDellaPipelineScelta = (pipelines.find((p: any) => p.id === pipelineId)?.marketing_pipeline_stages ?? []) as Array<{ id: string; name: string; auto_status?: string | null }>;
  const fasiDisponibili = fasiDellaPipelineScelta.length > 0 ? fasiDellaPipelineScelta : stages;

  const isSaving = updateOpp.isPending || updateContact.isPending || upsertContactFields.isPending || upsertOppFields.isPending;

  const handleSave = async () => {
    if (!canEditOpportunity) {
      toast.error("Non hai i permessi per modificare opportunità");
      return;
    }
    if (!name.trim()) {
      toast.error("Inserisci il nome dell'opportunità");
      return;
    }
    if (contact && !pendingContactId && !showNewContactForm && !contactFirstName.trim()) {
      toast.error("Il nome del contatto non può restare vuoto");
      return;
    }
    if (!stageId) {
      toast.error("Seleziona una fase");
      return;
    }
    // Persa: il motivo è obbligatorio. Prima «Aggiorna» diceva solo «Indica il
    // motivo» senza dire dove: anche dopo aver già confermato la perdita (il
    // motivo non viaggiava nel salvataggio) o dopo aver scelto una fase persa
    // (la finestra del motivo non si apriva). Ora si usa quello già scritto,
    // e se non c'è si apre la finestra (BeMade/Suntech, Sonia, 16/09).
    const motivoCategoria = lostCategory || opportunity.lost_reason_category || null;
    const motivoDettaglio = lostReason || opportunity.lost_reason || opportunity.loss_reason || null;
    if (status === "lost" && !motivoCategoria && !motivoDettaglio) {
      setPendingLostStatus("lost");
      riprendiSalvataggio.current = true;
      setShowLostDialog(true);
      return;
    }
    const numericValue = value.trim() ? Number(value) : 0;
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      toast.error("Il valore economico deve essere un numero positivo");
      return;
    }
    // Handle new contact creation if pending
    let finalContactId = pendingContactId || opportunity.contact_id;

    if (showNewContactForm && newContactName.trim()) {
      const nameParts = newContactName.trim().split(" ");
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(" ") || null;

      const { data: newContact, error } = await supabase
        .from("marketing_contacts")
        .insert({
          company_id: companyId!,
          first_name: firstName,
          last_name: lastName,
          email: newContactEmail.trim().toLowerCase() || null,
          phone: newContactPhone.trim() ? cleanPhone(newContactPhone) : null,
        })
        .select("id")
        .single();

      if (error) { toast.error(error.message); return; }
      finalContactId = newContact.id;
    }

    // 2. Update contact base fields if changed (only if not changing contact)
    if (!pendingContactId && !showNewContactForm && contact && (
      contactFirstName.trim() !== (contact.first_name || "") ||
      contactLastName.trim() !== (contact.last_name || "") ||
      contactEmail !== (contact.email || "") ||
      contactPhone !== (contact.phone || "") ||
      contactCity !== (contact.city || "") ||
      contactAddress !== ((contact as any).address || "") ||
      contactProvince !== ((contact as any).province || "") ||
      contactRegion !== ((contact as any).region || "")
    )) {
      updateContact.mutate({
        id: contact.id,
        first_name: contactFirstName.trim(),
        last_name: contactLastName.trim() || null,
        email: contactEmail.trim().toLowerCase() || null,
        phone: contactPhone.trim() ? cleanPhone(contactPhone) : null,
        city: contactCity || null,
        address: contactAddress.trim() || null,
        province: contactProvince.trim() || null,
        region: contactRegion || null,
      });
    }

    // 3. Upsert contact custom field values
    const contactFieldsToUpsert = Object.entries(contactCustomValues)
      .filter(([fieldId, val]) => {
        const original = contactFieldValues.find((v: any) => v.field_id === fieldId);
        return (original?.value || "") !== val;
      })
      .map(([field_id, value]) => ({ contact_id: finalContactId, field_id, value: value || null }));
    if (contactFieldsToUpsert.length) upsertContactFields.mutate(contactFieldsToUpsert);

    // 4. Upsert opportunity custom field values
    const oppFieldsToUpsert = Object.entries(oppCustomValues)
      .filter(([fieldId, val]) => {
        const original = oppFieldValues.find((v: any) => v.field_id === fieldId);
        return (original?.value || "") !== val;
      })
      .map(([field_id, value]) => ({ opportunity_id: opportunity.id, field_id, value: value || null }));
    if (oppFieldsToUpsert.length) upsertOppFields.mutate(oppFieldsToUpsert);

    // 1. Update opportunity (toast + close on success)
    updateOpp.mutate({
      id: opportunity.id,
      name: name.trim(), stage_id: stageId, status,
      // Spostamento in un'altra pipeline: senza questo la fase cambierebbe ma
      // l'opportunità resterebbe agganciata alla pipeline vecchia.
      ...(pipelineId && pipelineId !== opportunity.pipeline_id ? { pipeline_id: pipelineId } : {}),
      value: numericValue,
      source: source || null,
      assigned_to: assignedTo || null,
      follower_id: followerId || null,
      call_center_id: callCenterId || null,
      company_name: companyName || null,
      notes: oppNotes || null,
      ...(status === "lost" ? { lost_reason_category: motivoCategoria, lost_reason: motivoDettaglio } : {}),
      tags: normalizeTagList(oppTags),
      contact_id: finalContactId,
      // Solo il CRM di piattaforma ha queste colonne valorizzate; per le aziende
      // clienti restano quelle che erano (null).
      ...(isPlatformCrm ? { product_line_id: productLineId, package_id: packageId } : {}),
    }, {
      onSuccess: async () => {
        // Bidirectional tag sync: added tags → contact, removed tags → contact
        const originalTags = normalizeTagList(opportunity.tags || []);
        const savedTags = normalizeTagList(oppTags);
        const addedTags = getAddedTags(savedTags, originalTags);
        const removedTags = getRemovedTags(originalTags, savedTags);

        if (addedTags.length > 0) {
          await syncTagsToContact(finalContactId, addedTags, companyId);
        }
        for (const tag of removedTags) {
          await removeTagFromContact(finalContactId, tag, companyId);
        }
        toast.success("Opportunità aggiornata con successo");
        onOpenChange(false);
      },
      onError: (e: any) => toast.error(e.message || "Errore durante il salvataggio"),
    });
  };

  // Sales OS: intercetta status → lost/abandoned per mostrare dialog motivo
  /**
   * Finestra del motivo, già compilata con quello che c'è: prima si apriva
   * vuota e, se l'opportunità aveva un motivo vecchio (importato o scritto in
   * un'altra scheda), «Aggiorna» lo riscriveva tale e quale. Elena (Ener
   * Italia) se lo ritrovava sempre uguale senza poterlo cambiare.
   */
  const apriMotivoPerdita = (statoPerdita: string) => {
    setPendingLostStatus(statoPerdita);
    setLostCategory(lostCategory || opportunity.lost_reason_category || "");
    setLostReason(lostReason || opportunity.lost_reason || opportunity.loss_reason || "");
    setCompetitorWon(competitorWon || opportunity.competitor_won || "");
    setShowLostDialog(true);
  };

  const handleStatusChange = (newStatus: string) => {
    if (newStatus === "lost" || newStatus === "abandoned") {
      apriMotivoPerdita(newStatus);
    } else {
      setStatus(newStatus);
    }
  };

  const handleDelete = () => {
    if (!canEditOpportunity) {
      toast.error("Non hai i permessi per eliminare opportunità");
      return;
    }
    setConfirmDelete(true);
  };

  const confirmDeleteAction = () => {
    deleteOpp.mutate(opportunity.id, { onSuccess: () => { setConfirmDelete(false); onOpenChange(false); } });
  };

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    if (!canEditOpportunity) {
      toast.error("Non hai i permessi per aggiungere note");
      return;
    }
    addNote.mutate({ opportunityId: opportunity.id, contactId: opportunity.contact_id, content: newNote.trim() }, { onSuccess: () => setNewNote("") });
  };

  const handleSelectExistingContact = (c: any) => {
    setPendingContactId(c.id);
    setContactFirstName(c.first_name || "");
    setContactLastName(c.last_name || "");
    setContactEmail(c.email || "");
    setContactPhone(c.phone || "");
    setContactCity(c.city || "");
    setContactAddress(c.address || "");
    setContactProvince(c.province || "");
    setContactRegion(c.region || "");
    setContactSearch(`${c.first_name} ${c.last_name || ""}`.trim());
    setShowContactDropdown(false);
    setShowNewContactForm(false);
  };

  const renderCustomField = (field: any, values: Record<string, string>, setValues: (v: Record<string, string>) => void) => {
    const val = values[field.id] || "";
    if (hideEmpty && !val && tab === "details") return null;

    const onChange = (newVal: string) => setValues({ ...values, [field.id]: newVal });

    return (
      <div key={field.id} className="space-y-1">
        <Label className="text-xs text-muted-foreground">{field.name}</Label>
        {field.field_type === "select" ? (
          <Select value={val || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)}>
            <SelectTrigger className="h-10 sm:h-8 text-sm"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {(field.options || []).map((opt: string) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : field.field_type === "number" ? (
          <Input value={val} onChange={(e) => onChange(e.target.value)} type="number" className="h-10 sm:h-8 text-sm" />
        ) : field.field_type === "date" ? (
          <Input value={val} onChange={(e) => onChange(e.target.value)} type="date" className="h-10 sm:h-8 text-sm" />
        ) : field.field_type === "textarea" ? (
          <Textarea value={val} onChange={(e) => onChange(e.target.value)} rows={2} className="text-sm" />
        ) : (
          <Input value={val} onChange={(e) => onChange(e.target.value)} className="h-10 sm:h-8 text-sm" />
        )}
      </div>
    );
  };

  // La nota della scheda (marketing_opportunities.notes) e il registro delle
  // note (marketing_contact_notes) sono due archivi: fino al 21/09/2026 la
  // sezione «Note» mostrava solo il secondo, e 11.330 opportunità — quasi tutte
  // con la storia commerciale importata da GHL — sembravano senza note. Ora la
  // nota della scheda sta in cima alla sezione Note, modificabile da lì o dai
  // Dettagli: è lo stesso campo, si salva con «Aggiorna».
  const notaSchedaPresente = oppNotes.trim().length > 0;
  const notaSchedaDaSalvare = !!opportunity && (oppNotes || "") !== (opportunity.notes || "");
  const totaleNote = notes.length + (notaSchedaPresente ? 1 : 0);
  const ultimaNotaRegistro = (notes as any[])[0] ?? null;

  const sidebarTabs: { key: Tab; label: string; mobileLabel?: string; icon: React.ReactNode; enabled: boolean }[] = [
    { key: "details", label: "Dettagli dell'opportunità", mobileLabel: "Dettagli", icon: <FileText className="h-4 w-4" />, enabled: true },
    { key: "appointments", label: "Prenota/aggiorna appuntamento", mobileLabel: "Appuntamento", icon: <CalendarDays className="h-4 w-4" />, enabled: true },
    { key: "registro", label: "Registro attività", mobileLabel: "Registro", icon: <History className="h-4 w-4" />, enabled: true },
    { key: "activities", label: "Attività", icon: <Activity className="h-4 w-4" />, enabled: true },
    { key: "notes", label: totaleNote ? `Note (${totaleNote})` : "Note", icon: <StickyNote className="h-4 w-4" />, enabled: true },
    { key: "documents", label: "Documenti", icon: <Folder className="h-4 w-4" />, enabled: true },
    { key: "quotes", label: "Preventivi", icon: <FileText className="h-4 w-4" />, enabled: true },
  ];

  const searchTrimmed = contactSearch.trim();

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Altezza FISSA su desktop (21/09/2026): con sm:h-auto il pop-up si
          stringeva e si allungava a ogni sezione — Note e Attività corte,
          Dettagli lunga — e la barra laterale saltava. Ora ogni sezione scorre
          dentro lo stesso riquadro. Su telefono resta a tutto schermo. */}
      <DialogContent className="w-screen h-[100dvh] max-w-none max-h-[100dvh] rounded-none sm:w-full sm:max-w-5xl sm:h-[min(88vh,880px)] sm:max-h-[92vh] sm:rounded-lg flex flex-col p-0 gap-0 [&>button]:hidden">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background px-3 sm:px-6 pt-3 sm:pt-5 pb-2 sm:pb-3 border-b sm:border-b-0">
          <div className="flex flex-wrap items-start gap-2 pr-1">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="sm:hidden shrink-0 -ml-1 mt-0.5 h-9 w-9 inline-flex items-center justify-center rounded-full hover:bg-muted active:bg-muted/70 transition-colors"
              aria-label="Chiudi"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="text-[15px] sm:text-lg font-semibold leading-tight truncate max-w-full">
                  <span className="hidden sm:inline">Modifica "</span>{fullName}{cityPart}<span className="hidden sm:inline">"</span>
                </DialogTitle>
                {/* SALES OS: Badge opportunità ferma */}
                {(() => {
                  const stageTouchedAt = opportunity.stage_changed_at || opportunity.updated_at;
                  const daysSince = stageTouchedAt
                    ? Math.floor((nowMs - new Date(stageTouchedAt).getTime()) / 86400000)
                    : 0;
                  return daysSince >= 14 && opportunity.status === "open" ? (
                    <Badge variant="destructive" className="text-[10px] sm:text-xs h-5 px-1.5 shrink-0">
                      ⚠ {daysSince}gg
                    </Badge>
                  ) : null;
                })()}
              </div>
              <DialogDescription className="hidden sm:block text-xs text-muted-foreground mt-0.5">
                Aggiorna dettagli, attività, note e appuntamenti dell'opportunità.
              </DialogDescription>
            </div>
            {/* Trigger rapidi contatto: chiama (centralino) · email · whatsapp */}
            {opportunity.contact_id && (
              <div className="flex items-center gap-0.5 shrink-0 mt-1 w-full overflow-x-auto scrollbar-none [&>*]:shrink-0 sm:mt-0 sm:w-auto sm:overflow-visible">
                {contactPhone && (
                  <button
                    type="button"
                    onClick={() => {
                      if (softphone) softphone.startCall(contactPhone, { name: fullName, contactId: opportunity.contact_id });
                      else window.open(`tel:${contactPhone}`, "_self");
                    }}
                    className="h-9 w-9 sm:h-8 sm:w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                    aria-label="Chiama contatto"
                    title={`Chiama ${contactPhone}`}
                  >
                    <Phone className="h-4 w-4" />
                  </button>
                )}
                {contactEmail && (
                  <button
                    type="button"
                    onClick={() => setQuickSend({ open: true, channel: "email" })}
                    className="h-9 w-9 sm:h-8 sm:w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-violet-50 hover:text-violet-600 transition-colors"
                    aria-label="Invia email"
                    title={`Email a ${contactEmail}`}
                  >
                    <Mail className="h-4 w-4" />
                  </button>
                )}
                {contactPhone && (
                  <button
                    type="button"
                    onClick={() => setQuickSend({ open: true, channel: "whatsapp" })}
                    className="h-9 w-9 sm:h-8 sm:w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                    aria-label="Invia SMS o WhatsApp"
                    title="Invia SMS o WhatsApp"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </button>
                )}
                <LogCallButton
                  companyId={companyId}
                  contactId={opportunity.contact_id}
                  userId={user?.id}
                  opportunityId={opportunity.id}
                  className="h-9 sm:h-8"
                />
                <span className="mx-0.5 hidden sm:block h-5 w-px bg-border" aria-hidden />
                {/* Crea preventivo direttamente dal deal — link contatto/opportunità preservato */}
                <NewPreventivoMenu
                  opportunityId={opportunity.id}
                  contactId={opportunity.contact_id ?? null}
                  size="sm"
                  label="Preventivo"
                />
              </div>
            )}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="hidden sm:inline-flex shrink-0 h-8 w-8 items-center justify-center rounded-md hover:bg-muted transition-colors"
              aria-label="Chiudi"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        </div>

        <Separator />

        <div className="flex flex-col sm:flex-row flex-1 min-h-0">
          {/* Sidebar — vertical su desktop, tabs orizzontali su mobile */}
          <div className="sm:w-[200px] sm:border-r border-b sm:border-b-0 bg-muted/20 py-1 sm:py-2 shrink-0 overflow-x-auto sm:overflow-x-visible">
            <div className="flex sm:flex-col gap-0.5 sm:gap-0 px-1 sm:px-0 scrollbar-none">
              {sidebarTabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => {
                    if (!t.enabled) { toast.info(`${t.label}: in arrivo`); return; }
                    setTab(t.key);
                  }}
                  className={`shrink-0 sm:w-full flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 text-xs whitespace-nowrap sm:whitespace-normal transition-colors text-left rounded-lg sm:rounded-none ${
                    tab === t.key
                      ? "bg-primary/10 text-primary font-medium sm:border-r-2 sm:border-primary border-b-2 sm:border-b-0 border-primary"
                      : "text-muted-foreground hover:bg-muted/50"
                  } ${!t.enabled ? "opacity-50" : ""}`}
                  aria-label={t.label}
                  aria-current={tab === t.key ? "page" : undefined}
                >
                  {t.icon}
                  <span className="leading-tight sm:hidden">{t.mobileLabel || t.label}</span>
                  <span className="leading-tight hidden sm:inline">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <ScrollArea className="flex-1">
            <div className="p-4 sm:p-5">
              {tab === "details" && (
                <div className="space-y-5 sm:space-y-6">
                  {/* Contatto Dettagli */}
                  <div>
                    <div className="flex items-center justify-between mb-2.5 sm:mb-3 gap-2">
                      <h3 className="text-sm font-semibold">Contatto</h3>
                      <label className="flex items-center gap-1.5 text-[11px] sm:text-xs text-muted-foreground cursor-pointer shrink-0">
                        <Checkbox checked={hideEmpty} onCheckedChange={(c) => setHideEmpty(!!c)} className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                        <span className="hidden sm:inline">Nascondi campi vuoti</span>
                        <span className="sm:hidden">Nascondi vuoti</span>
                      </label>
                    </div>

                    <div className="space-y-2.5 sm:space-y-3">
                      {/* Contact name - with change button */}
                      {!changingContact ? (
                        <div className="space-y-1">
                          <Label className="text-[11px] sm:text-xs text-muted-foreground">Nome contatto</Label>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2 h-10 sm:h-8 px-3 border rounded-md bg-muted/30 text-sm flex-1 min-w-0">
                              <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              {!pendingContactId && opportunity.contact_id ? (
                                <button
                                  type="button"
                                  onClick={() => { navigate(`${routePrefix}/contatti/${opportunity.contact_id}`); onOpenChange(false); }}
                                  className="group/clink inline-flex items-center gap-1 min-w-0 text-left hover:text-primary transition-colors"
                                  title="Apri scheda contatto"
                                >
                                  <span className="truncate group-hover/clink:underline">{fullName || "—"}</span>
                                  <ExternalLink className="h-3 w-3 shrink-0 opacity-50 group-hover/clink:opacity-100" />
                                </button>
                              ) : (
                                <span className="truncate">{pendingContactId ? contactSearch : (fullName || "—")}</span>
                              )}
                            </div>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-10 w-10 sm:h-8 sm:w-auto sm:px-3 sm:gap-1 shrink-0"
                              onClick={() => {
                                setChangingContact(true);
                                setContactSearch("");
                                setShowNewContactForm(false);
                                setPendingContactId(null);
                              }}
                              aria-label="Cambia contatto"
                            >
                              <RefreshCw className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                              <span className="hidden sm:inline text-xs">Cambia</span>
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Cerca o crea contatto</Label>
                          <div className="relative">
                            <Input
                              placeholder="Cerca contatto..."
                              value={contactSearch}
                              onChange={(e) => {
                                setContactSearch(e.target.value);
                                setShowContactDropdown(true);
                                setShowNewContactForm(false);
                              }}
                              onFocus={() => setShowContactDropdown(true)}
                              onBlur={() => setTimeout(() => setShowContactDropdown(false), 200)}
                              className="h-10 sm:h-8 text-sm"
                            />
                            {showContactDropdown && (
                              <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
                                {searchContacts.length > 0 ? (
                                  searchContacts.map((c: any) => (
                                    <button
                                      key={c.id}
                                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-b last:border-b-0 flex items-center gap-2"
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() => {
                                        handleSelectExistingContact(c);
                                        setChangingContact(false);
                                      }}
                                    >
                                      <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                      <div className="min-w-0">
                                        <p className="font-medium text-xs truncate">{c.first_name} {c.last_name || ""}</p>
                                        {c.email && <p className="text-[11px] text-muted-foreground truncate">{c.email}</p>}
                                      </div>
                                    </button>
                                  ))
                                ) : (
                                  <div className="flex flex-col items-center py-4 text-muted-foreground">
                                    <DatabaseZap className="h-6 w-6 mb-1 opacity-40" />
                                    <p className="text-xs">Nessun risultato</p>
                                  </div>
                                )}
                                <button
                                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent transition-colors flex items-center gap-2 text-primary font-medium border-t"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    setShowNewContactForm(true);
                                    setShowContactDropdown(false);
                                    setChangingContact(false);
                                    setPendingContactId(null);
                                    if (searchTrimmed) setNewContactName(searchTrimmed);
                                  }}
                                >
                                  <UserPlus className="h-3.5 w-3.5" />
                                  + {searchTrimmed || ""} (Crea nuovo contatto)
                                </button>
                              </div>
                            )}
                          </div>
                          <button
                            className="text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              setChangingContact(false);
                              setPendingContactId(null);
                            }}
                          >
                            Annulla
                          </button>
                        </div>
                      )}

                      {/* New contact inline form */}
                      {showNewContactForm && (
                        <div className="space-y-2 p-3 rounded-lg border border-dashed bg-muted/30">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-semibold flex items-center gap-1.5"><UserPlus className="h-3.5 w-3.5" /> Nuovo contatto</Label>
                            <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowNewContactForm(false)}>Annulla</button>
                          </div>
                          <Input placeholder="Nome e cognome *" value={newContactName} onChange={(e) => setNewContactName(e.target.value)} className="h-10 sm:h-8 text-sm" />
                          <div className="grid grid-cols-2 gap-2">
                            <Input placeholder="Email" value={newContactEmail} onChange={(e) => setNewContactEmail(e.target.value)} className="h-10 sm:h-8 text-sm" type="email" />
                            <Input placeholder="Telefono" value={newContactPhone} onChange={(e) => setNewContactPhone(e.target.value)} className="h-10 sm:h-8 text-sm" type="tel" />
                          </div>
                        </div>
                      )}

                      {contact && !pendingContactId && !showNewContactForm && (
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Nome</Label>
                            <Input value={contactFirstName} onChange={(e) => setContactFirstName(e.target.value)} disabled={!canEditOpportunity} className="h-10 sm:h-8 text-sm" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Cognome</Label>
                            <Input value={contactLastName} onChange={(e) => setContactLastName(e.target.value)} disabled={!canEditOpportunity} className="h-10 sm:h-8 text-sm" />
                          </div>
                        </div>
                      )}

                      {(!hideEmpty || contactEmail) && !showNewContactForm && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Email primaria</Label>
                          <div className="relative">
                            <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} type="email" inputMode="email" className="h-10 sm:h-8 text-sm pl-8" />
                          </div>
                        </div>
                      )}

                      {(!hideEmpty || contactPhone) && !showNewContactForm && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Telefono primario</Label>
                          <div className="relative">
                            <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} type="tel" inputMode="tel" className="h-10 sm:h-8 text-sm pl-8" />
                          </div>
                        </div>
                      )}

                      {(!hideEmpty || contactAddress) && !showNewContactForm && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Indirizzo</Label>
                          <Input value={contactAddress} onChange={(e) => setContactAddress(e.target.value)} placeholder="Via e numero civico" className="h-10 sm:h-8 text-sm" />
                        </div>
                      )}

                      {(!hideEmpty || contactCity) && !showNewContactForm && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Città</Label>
                          <Input value={contactCity} onChange={(e) => setContactCity(e.target.value)} className="h-10 sm:h-8 text-sm" />
                          <p className="text-[10px] text-muted-foreground">Provincia e regione si compilano da sole dalla città.</p>
                        </div>
                      )}

                      {(!hideEmpty || contactProvince || contactRegion) && !showNewContactForm && (
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Provincia</Label>
                            <Input value={contactProvince} onChange={(e) => setContactProvince(e.target.value)} placeholder="Es: RM" className="h-10 sm:h-8 text-sm" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Regione</Label>
                            <Select value={contactRegion || "__none__"} onValueChange={(v) => setContactRegion(v === "__none__" ? "" : v)}>
                              <SelectTrigger className="h-10 sm:h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">—</SelectItem>
                                {REGION_OPTIONS.map((r) => (
                                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* Opportunità Dettagli */}
                  <div>
                    <h3 className="text-sm font-semibold mb-2.5 sm:mb-3">Opportunità</h3>
                    <div className="space-y-2.5 sm:space-y-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Nome opportunità</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-10 sm:h-8 text-sm" />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Sequenza</Label>
                          {canEditOpportunity && pipelines.length > 1 ? (
                            <Select
                              value={pipelineId}
                              onValueChange={(nuovaPipeline) => {
                                setPipelineId(nuovaPipeline);
                                // Cambiando pipeline la fase vecchia non esiste più:
                                // si parte dalla prima della nuova.
                                const fasi = (pipelines.find((p: any) => p.id === nuovaPipeline)?.marketing_pipeline_stages ?? []) as Array<{ id: string; name: string; auto_status?: string | null }>;
                                const prima = fasi[0];
                                if (prima) {
                                  setStageId(prima.id);
                                  setStatus(inferOpportunityStatusFromStage(prima, "open"));
                                }
                              }}
                            >
                              <SelectTrigger className={SELECT_TRIGGER_CLS}><SelectValue placeholder="Sequenza" /></SelectTrigger>
                              <SelectContent>
                                {pipelines.map((p: any) => (
                                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <div className="h-10 sm:h-8 px-3 border rounded-md bg-muted/30 text-sm flex items-center truncate">
                              {pipelineName || "—"}
                            </div>
                          )}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Fase</Label>
                          <Select value={stageId} onValueChange={(newStageId) => {
                            setStageId(newStageId);
                            // Auto-update status based on stage's auto_status
                            const targetStage = fasiDisponibili.find((s) => s.id === newStageId);
                            setStatus(inferOpportunityStatusFromStage(targetStage, "open"));
                          }}>
                            <SelectTrigger className={SELECT_TRIGGER_CLS}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {fasiDisponibili.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Stato</Label>
                          <Select value={status} onValueChange={handleStatusChange}>
                            <SelectTrigger className={SELECT_TRIGGER_CLS}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map((s) => (
                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Valore dell'opportunità (€)</Label>
                          <Input value={value} onChange={(e) => setValue(e.target.value)} type="number" inputMode="decimal" className="h-10 sm:h-8 text-sm" />
                        </div>
                      </div>

                      {/* Persa: il motivo si legge e si cambia da qui. Prima esisteva
                          solo dentro la finestra che si apriva cambiando lo stato: con
                          l'opportunità già persa non si riapriva più. */}
                      {(status === "lost" || status === "abandoned") && (
                        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">Motivo della perdita</p>
                            <p className="truncate text-sm font-medium">
                              {motivoPerditaScritto || "Non indicato"}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            disabled={!canEditOpportunity}
                            onClick={() => apriMotivoPerdita(status === "abandoned" ? "abandoned" : "lost")}
                          >
                            {motivoPerditaScritto ? "Cambia" : "Indica il motivo"}
                          </Button>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Venditore</Label>
                          <Select value={salespeople.some((s: any) => s.id === assignedTo) ? assignedTo : "none"} onValueChange={(v) => setAssignedTo(v === "none" ? "" : v)}>
                            <SelectTrigger className={SELECT_TRIGGER_CLS}><SelectValue placeholder="Non assegnato" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Non assegnato</SelectItem>
                              {salespeople.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Follower</Label>
                          <Select value={staff.some((s: any) => s.id === followerId) ? followerId : "none"} onValueChange={(v) => setFollowerId(v === "none" ? "" : v)}>
                            <SelectTrigger className={SELECT_TRIGGER_CLS}><SelectValue placeholder="Nessuno" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Nessuno</SelectItem>
                              {staff.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Call Center</Label>
                          <Select value={callCenterUsers.some((s: any) => s.id === callCenterId) ? callCenterId : "none"} onValueChange={(v) => setCallCenterId(v === "none" ? "" : v)}>
                            <SelectTrigger className={SELECT_TRIGGER_CLS}><SelectValue placeholder="Nessuno" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Nessuno</SelectItem>
                              {callCenterUsers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Nome dell'azienda</Label>
                          <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="h-10 sm:h-8 text-sm" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Fonte dell'opportunità</Label>
                          <Input value={source} onChange={(e) => setSource(e.target.value)} className="h-10 sm:h-8 text-sm" />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Etichette</Label>
                        <TagSelector selectedTags={oppTags} onTagsChange={setOppTags} />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Note</Label>
                        <Textarea value={oppNotes} onChange={(e) => setOppNotes(e.target.value)} rows={2} className="text-sm" />
                        {/* Il registro delle note sta nella sezione «Note»: da qui
                            se ne vede l'ultima, e un clic porta a tutte. */}
                        {ultimaNotaRegistro && (
                          <button
                            type="button"
                            onClick={() => setTab("notes")}
                            className="block w-full text-left text-[11px] text-muted-foreground hover:text-primary transition-colors"
                          >
                            <span className="font-medium">
                              Registro note: {notes.length} {notes.length === 1 ? "nota" : "note"}
                            </span>
                            {" · ultima del "}
                            {format(new Date(ultimaNotaRegistro.created_at), "d MMM yyyy", { locale: it })}
                            {": "}
                            <span className="italic">
                              «{String(ultimaNotaRegistro.content ?? "").slice(0, 90)}{String(ultimaNotaRegistro.content ?? "").length > 90 ? "…" : ""}»
                            </span>
                            <span className="text-primary"> · vedi tutte</span>
                          </button>
                        )}
                      </div>

                      {/* Custom opportunity fields */}
                      {oppCustomFields.map((field: any) =>
                        renderCustomField(field, oppCustomValues, setOppCustomValues)
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* SALES OS: Avanzamento Commerciale */}
                  <Card className="border-primary/20 bg-primary/5">
                    <CardHeader className="pb-3 pt-4 px-4">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Target className="h-4 w-4 text-primary" />
                        Avanzamento Commerciale
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 px-4 pb-4">

                      {/* Riga 1: Data chiusura prevista + Probabilità */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1">
                            Data chiusura prevista
                            {!opportunity.expected_close_date && (
                              <span className="text-destructive">*</span>
                            )}
                          </Label>
                          {/* Salvataggio al BLUR, non a ogni tasto: onChange su
                              type=date/number sparava una mutation per battitura
                              (digitare "100" = 3 update + 3 giri di invalidazioni
                              sull'infinite query). onBlur committa il valore finale. */}
                          <Input
                            type="date"
                            defaultValue={opportunity.expected_close_date ?? ""}
                            className="h-10 sm:h-8 text-sm"
                            onBlur={(e) => {
                              const v = e.target.value || null;
                              if (v === (opportunity.expected_close_date ?? null)) return;
                              updateOpportunity.mutate({
                                id: opportunity.id,
                                data: { expected_close_date: v },
                              });
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">
                            Probabilità % (override)
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            placeholder="Auto da stage"
                            defaultValue={opportunity.probability ?? ""}
                            className="h-10 sm:h-8 text-sm"
                            onBlur={(e) => {
                              const raw = e.target.value ? parseInt(e.target.value) : null;
                              // Clamp 0-100: il min/max HTML non vale per i valori digitati.
                              const val = raw === null ? null : Math.max(0, Math.min(100, raw));
                              if (val === (opportunity.probability ?? null)) return;
                              updateOpportunity.mutate({
                                id: opportunity.id,
                                data: { probability: val },
                              });
                            }}
                          />
                        </div>
                      </div>

                      {/* Catena commerciale: commessa nata dal deal, o vittoria da confermare */}
                      {catena?.commessa && (
                        <button
                          type="button"
                          onClick={() => navigate(`/azienda/ordini/${catena.commessa!.id}`)}
                          className="w-full flex items-center justify-between gap-2 rounded-md border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/40 px-2.5 py-2 text-xs text-green-800 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-950/70 transition-colors"
                        >
                          <span>
                            Da questo deal è nata la commessa{" "}
                            <span className="font-semibold">{catena.commessa.order_code ?? "—"}</span>
                          </span>
                          <span className="underline shrink-0">Apri</span>
                        </button>
                      )}
                      {!catena?.commessa && catena?.preventivoAccettato && opportunity.status === "open" && (
                        <div className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 px-2.5 py-2 text-xs text-amber-800 dark:text-amber-300">
                          <span>
                            Il preventivo{" "}
                            <span className="font-semibold">{catena.preventivoAccettato.quote_number ?? ""}</span>{" "}
                            è stato accettato: questo deal è ancora aperto.
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs shrink-0"
                            disabled={updateOpportunity.isPending || !canEditOpportunity}
                            onClick={() => {
                              const faseVinta = fasiDisponibili?.find((st) => st.auto_status === "won");
                              updateOpportunity.mutate({
                                id: opportunity.id,
                                data: { status: "won", ...(faseVinta ? { stage_id: faseVinta.id } : {}) },
                              });
                            }}
                          >
                            Segna come vinta
                          </Button>
                        </div>
                      )}

                      {/* CRM di piattaforma: il servizio venduto e il passaggio da
                          trattativa vinta a relazione ricorrente. */}
                      {isPlatformCrm && (
                        <>
                          <ServizioAedixFields
                            productLineId={productLineId}
                            packageId={packageId}
                            disabled={!canEditOpportunity}
                            onChange={({ productLineId: pl, packageId: pk }) => { setProductLineId(pl); setPackageId(pk); }}
                          />

                          {clienteServizio ? (
                            <div className="flex items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40 px-2.5 py-2 text-xs text-emerald-800 dark:text-emerald-300">
                              <span>
                                Da questo deal è nato il cliente-servizio{" "}
                                <span className="font-semibold">{clienteServizio.cliente_nome}</span>
                                {clienteServizio.stato !== "attivo" && ` (${clienteServizio.stato})`}
                              </span>
                              <a href="/admin/marketing/clienti-servizio" className="underline shrink-0">Apri</a>
                            </div>
                          ) : opportunity.status === "won" ? (
                            <div className="flex items-center justify-between gap-2 rounded-md border border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40 px-2.5 py-2 text-xs text-sky-800 dark:text-sky-300">
                              <span>Trattativa vinta: manca la relazione ricorrente con i suoi incassi.</span>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-6 text-xs shrink-0"
                                disabled={!canEditOpportunity}
                                onClick={() => setConvertiOpen(true)}
                              >
                                Crea cliente-servizio
                              </Button>
                            </div>
                          ) : null}
                        </>
                      )}

                      {/* Riga 2: Prossima azione + Data */}
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3 text-yellow-500" />
                          Prossima azione
                          {!opportunity.next_action && (
                            <span className="text-destructive">*</span>
                          )}
                        </Label>
                        <Textarea
                          placeholder="Es: Inviare preventivo, Chiamare per follow-up..."
                          defaultValue={opportunity.next_action ?? ""}
                          className="text-sm min-h-[60px] resize-none"
                          onBlur={(e) =>
                            updateOpportunity.mutate({
                              id: opportunity.id,
                              data: { next_action: e.target.value || null },
                            })
                          }
                        />
                        <Input
                          type="date"
                          defaultValue={opportunity.next_action_date ?? ""}
                          placeholder="Data scadenza azione"
                          className="mt-1 h-10 sm:h-8 text-sm"
                          // onBlur come gli altri campi (commit 5c9c21b9d): con
                          // onChange ogni keystroke della data lanciava una
                          // mutation (anche valori parziali/vuoti → null).
                          onBlur={(e) => {
                            const v = e.target.value || null;
                            if (v === (opportunity.next_action_date ?? null)) return;
                            updateOpportunity.mutate({
                              id: opportunity.id,
                              data: { next_action_date: v },
                            });
                          }}
                        />
                      </div>

                    </CardContent>
                  </Card>
                </div>
              )}

              {tab === "notes" && (
                <div className="space-y-4">
                  {/* Nota della scheda: lo STESSO campo «Note» dei Dettagli (stato
                      oppNotes), quindi quello che si scrive in un posto è già
                      nell'altro. Si salva con «Aggiorna», come i Dettagli. */}
                  <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium">
                        <Pin className="h-3.5 w-3.5 text-amber-600" />
                        Nota dell'opportunità
                      </div>
                      {notaSchedaDaSalvare && (
                        <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                          Modificata: premi «Aggiorna» per salvarla
                        </span>
                      )}
                    </div>
                    <Textarea
                      value={oppNotes}
                      onChange={(e) => setOppNotes(e.target.value)}
                      rows={notaSchedaPresente ? Math.min(8, Math.max(3, oppNotes.split("\n").length + 1)) : 2}
                      placeholder="Nessuna nota nella scheda."
                      className="text-sm bg-background"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      È il campo «Note» dei Dettagli: si modifica da qui o da lì.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-xs font-medium">Registro note</span>
                    <span className="text-[11px] text-muted-foreground">ogni nota con data e autore</span>
                  </div>
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Scrivi una nota..."
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      rows={2}
                      className="text-sm flex-1"
                    />
                    {/* Le note finiscono su marketing_contact_notes, che la RLS apre a
                        can_edit_marketing_contacts: serve quel permesso, non l'opportunità. */}
                    <Button
                      size="sm"
                      onClick={handleAddNote}
                      disabled={addNote.isPending || !newNote.trim() || !canEdit || !permissions.canEditMarketingContacts}
                      title={!permissions.canEditMarketingContacts ? (permissions.solaLettura ? "Sei in sola lettura" : "Non hai il permesso di modifica") : undefined}
                      className="self-end"
                    >
                      {addNote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aggiungi"}
                    </Button>
                  </div>
                  <Separator />
                  {notes.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Nessuna nota nel registro</p>
                  ) : (
                    <div className="space-y-3">
                      {notes.map((note: any) => (
                        <NotaModificabile
                          key={note.id}
                          nota={note}
                          className="p-3 rounded-lg border bg-muted/20"
                          puoModificare={puoModificareNota(note, chiModificaNote)}
                          intestazione={
                            <div className="flex items-center gap-2 mb-1">
                            {note.opportunity_id === opportunity.id ? (
                              <Badge variant="secondary" className="text-[9px] h-4 px-1.5">Opportunità</Badge>
                            ) : note.opportunity_id ? (
                              <Badge variant="outline" className="text-[9px] h-4 px-1.5">Altra opp.</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] h-4 px-1.5">Contatto</Badge>
                            )}
                          </div>
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tab === "appointments" && (
                <OpportunityAppointmentTab
                  contactId={opportunity.contact_id}
                  companyId={companyId!}
                  opportunityId={opportunity.id}
                  contactName={fullName}
                />
              )}

              {tab === "activities" && (
                <LinkedTasks
                  opportunityId={opportunity.id}
                  category="opportunita"
                  companyId={companyId}
                />
              )}

              {tab === "documents" && (
                <MarketingDocumentsPanel
                  contactId={opportunity.contact_id}
                  opportunityId={opportunity.id}
                  companyId={companyId!}
                  linkToOpportunity
                />
              )}

              {tab === "activities" && (
                <LinkedRendersList contactId={opportunity.contact_id} opportunityId={opportunity.id} />
              )}

              {tab === "registro" && (
                <ContactActivityRegister
                  companyId={companyId}
                  contactId={opportunity.contact_id}
                  phone={contactPhone}
                  email={contactEmail}
                  contactCreatedAt={contact?.created_at ?? opportunity.created_at}
                  contactSource={contact?.source ?? opportunity.source}
                  members={[...salespeople, ...staff, ...callCenterUsers].reduce((acc: { id: string; name: string }[], m: any) => {
                    if (m?.id && !acc.some((x) => x.id === m.id)) acc.push({ id: m.id, name: m.name });
                    return acc;
                  }, [])}
                />
              )}

              {tab === "quotes" && opportunity.contact_id && companyId && (
                <OpportunityQuotesTab
                  contactId={opportunity.contact_id}
                  companyId={companyId}
                  opportunityId={opportunity.id}
                />
              )}
            </div>
          </ScrollArea>
        </div>

        <Separator />

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-3 sm:px-6 py-2.5 sm:py-3 bg-background pb-safe sm:pb-3">
          <div className="hidden sm:flex items-center gap-3 min-w-0">
            <button
              onClick={() => { navigate("/azienda/impostazioni/campi-personalizzati"); onOpenChange(false); }}
              className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0"
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Aggiungi/gestisci campi</span>
              <span className="sm:hidden">Gestisci campi</span>
            </button>
            {/* Va a capo invece di troncare: la fonte è in fondo alla riga ed è la parte che serve. */}
            <span className="text-[11px] leading-tight text-muted-foreground" title={testoCreazione}>
              {testoCreazione}
            </span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
            <Button variant="ghost" size="icon" onClick={handleDelete} disabled={deleteOpp.isPending || !canEditOpportunity} className="h-10 w-10 sm:h-9 sm:w-9 text-destructive hover:text-destructive shrink-0" aria-label="Elimina opportunità">
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-10 sm:h-9 px-3 sm:px-4">Annulla</Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving || !canEditOpportunity} className="h-10 sm:h-9 px-4">
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Aggiorna
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {isPlatformCrm && (
      <ConvertiClienteServizioDialog
        opportunity={{ ...opportunity, product_line_id: productLineId, package_id: packageId }}
        open={convertiOpen}
        onOpenChange={setConvertiOpen}
        clienteNome={companyName || [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || contact?.company_name || opportunity?.name || ""}
        onConverted={() => { void refetchClienteServizio(); }}
      />
    )}

    <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminare questa opportunità?</AlertDialogTitle>
          <AlertDialogDescription>Finisce nel cestino: la puoi ripristinare da Opportunità → Altre azioni → Cestino.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction onClick={confirmDeleteAction} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Elimina
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* SALES OS: Dialog motivo perdita */}
    <Dialog open={showLostDialog} onOpenChange={setShowLostDialog}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-destructive" />
            Perché hai perso questa opportunità?
          </DialogTitle>
          <DialogDescription>
            Queste informazioni migliorano le previsioni e aiutano il team.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <MotivoPerditaSelect value={lostCategory} onChange={setLostCategory} />
          <div className="space-y-1">
            <Label className="text-sm font-medium">Dettaglio (opzionale)</Label>
            <Textarea
              placeholder="Descrivi cosa è successo..."
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              className="mt-1 text-sm min-h-[80px] resize-none"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-sm font-medium">Concorrente che ha vinto (opzionale)</Label>
            <Input
              placeholder="Es: Competitor SpA, nessuno, cliente interno..."
              value={competitorWon}
              onChange={(e) => setCompetitorWon(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { riprendiSalvataggio.current = false; setShowLostDialog(false); }}>
            Annulla
          </Button>
          <Button
            variant="destructive"
            disabled={!lostCategory || updateOpportunity.isPending || !canEditOpportunity}
            onClick={() => {
              if (!lostCategory || !canEditOpportunity) return;
              updateOpportunity.mutate(
                {
                  id: opportunity.id,
                  data: {
                    status: pendingLostStatus as string,
                    lost_reason: lostReason || null,
                    // Anche la colonna legacy: automazioni (opportunita.loss_reason)
                    // e report vecchi leggono quella.
                    loss_reason: lostReason || null,
                    lost_reason_category: lostCategory,
                    competitor_won: competitorWon || null,
                  },
                },
                {
                  onSuccess: () => {
                    setStatus(pendingLostStatus!);
                    setShowLostDialog(false);
                    if (riprendiSalvataggio.current) {
                      // Motivo scritto dopo «Aggiorna»: si completa il salvataggio (fase e altri campi).
                      riprendiSalvataggio.current = false;
                      void handleSave();
                      return;
                    }
                    toast.success("Opportunità aggiornata");
                  },
                }
              );
            }}
          >
            {updateOpportunity.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Conferma perdita
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {opportunity.contact_id && (
      <QuickContactSendDialog
        open={quickSend.open}
        onOpenChange={(v) => setQuickSend((s) => ({ ...s, open: v }))}
        contactId={opportunity.contact_id}
        name={fullName}
        phone={contactPhone}
        email={contactEmail}
        context={opportunity.name}
        defaultChannel={quickSend.channel}
        onSent={() => {
          // Aggiorna il Registro attività (timeline) dopo l'invio dal popup.
          queryClient.invalidateQueries({ queryKey: ["reg-sms"] });
          queryClient.invalidateQueries({ queryKey: ["reg-wa"] });
          queryClient.invalidateQueries({ queryKey: ["reg-email-out"] });
        }}
      />
    )}
    </>
  );
}
