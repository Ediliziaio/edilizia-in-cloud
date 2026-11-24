/**
 * NuovoSopralluogo — Wizard 3-step per creare un sopralluogo
 *
 * Step 1: Modelli di sistema e personalizzati dell’azienda
 * Step 2: Cliente + Commessa (opzionali)
 * Step 3: Indirizzo + data + tecnico assegnato
 */
import { useState, useMemo, useRef } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Calendar as DateCalendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SurveyCreatePicker } from "@/components/sopralluoghi/SurveyCreatePicker";
import { surveyAppointment, surveyCreationError } from "@/lib/surveys/creation";
import {
  appuntamentoDelSopralluogo,
  avvisoOrario,
  calendarioDelTecnico,
  durataSopralluogo,
  type CalendarioAgenda,
} from "@/lib/surveys/agendaSopralluogo";
import {
  calcolaSlotLiberi,
  type Occupato,
  type RegolaDisponibilita,
} from "@/lib/opportunita/slotCalendario";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  listTemplates,
  createSurvey,
  listCrmContacts,
  listCrmOpportunities,
  nomeContatto,
  fissaSopralluogoInAgenda,
} from "@/lib/api/surveys";
import { categorieConsigliate } from "@/lib/sopralluoghi/verticalTemplate";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import AddressAutocomplete, { type AddressData } from "@/components/shared/AddressAutocomplete";
import { useCompanyCustomers } from "@/hooks/useCompanyCustomers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  Check,
  Loader2,
  MapPin,
  Calendar,
  UserRound,
  Target,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import type { OrderSurveyContext } from "@/lib/surveys/orderVisits";
import { useT, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";

type LinkMode = "nessuno" | "cliente" | "prospect";

const CATEGORY_ICON: Record<string, string> = {
  infissi: "🪟",
  bagno: "🛁",
  fotovoltaico: "☀️",
  ristrutturazione: "🏗️",
  cucina: "🍳",
  cappotto: "🏠",
  tetto: "🏘️",
  impianti: "⚡",
  pavimentazioni: "🪜",
  porte_interne: "🚪",
  climatizzazione: "❄️",
  pergole: "⛱️",
  piscine: "🏊",
  custom: "📋",
};

export default function NuovoSopralluogo() {
  const companyId = useEffectiveCompanyId();
  return (
    <SurveyCreateForm key={companyId || "no-company"} companyId={companyId} />
  );
}
export function SurveyCreateForm({
  companyId, commessa, onCreated, onCancel, onBusyChange,
}: {
  companyId: ReturnType<typeof useEffectiveCompanyId>;
  commessa?: OrderSurveyContext;
  onCreated?: (id: string) => void;
  onCancel?: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const tr = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  // Pre-popolato da query params (es. da pagina Commessa)
  const [orderId, setOrderId] = useState<string | null>(
    commessa?.orderId ?? params.get("order") ?? null,
  );
  const [clientId, setClientId] = useState<string | null>(
    commessa?.clientId ?? params.get("client") ?? null,
  );
  /* Dalla commessa si va a prendere le misure per ordinare; prima del contratto sono di massima. */
  // Commerciale (misure di massima per l'offerta) o tecnico (misure precise, da ordinare):
  // il tipo decide anche le misure. Piano sopralluoghi, lotto 2.
  const [tipo, setTipo] = useState<"commerciale" | "tecnico">(
    commessa?.orderId || params.get("order") || params.get("tipo") === "tecnico" ? "tecnico" : "commerciale",
  );
  const ruoloMisure = tipo === "commerciale" ? "preliminare" : "definitivo";
  const [technicianId, setTechnicianId] = useState<string | null>(commessa?.appointment?.assigned_to ?? null);
  const [address, setAddress] = useState(commessa?.address ?? params.get("address") ?? "");
  const [city, setCity] = useState(params.get("city") ?? "");
  const [zip, setZip] = useState("");
  /* L'indirizzo scelto dal cercatore: tiene anche coordinate e provincia, che
     i tre campi liberi non avevano. `address`/`city`/`zip` restano come sono
     perché è quello che il salvataggio scrive già. */
  const [indirizzoCantiere, setIndirizzoCantiere] = useState<AddressData>({
    address_line: commessa?.address ?? params.get("address") ?? "",
    address_city: params.get("city") ?? "",
    address_postal_code: "",
    address_province: "",
    address_country: "IT",
    address_notes: "",
    formatted_address: "",
    lat: null,
    lng: null,
    place_id: "",
  });
  const [scheduledDay, setScheduledDay] = useState(commessa?.appointment?.appointment_date ?? "");
  const [scheduledTime, setScheduledTime] = useState(commessa?.appointment?.appointment_time?.slice(0,5) ?? "09:00");
  /** Il calendario su cui fissare il rilievo, quando il tecnico ne ha piu' d'uno. */
  const [calendarioId, setCalendarioId] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [submitError, setSubmitError] = useState("");
  const creating = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const [notes, setNotes] = useState("");

  // A chi si riferisce: cliente esistente OPPURE contatto/opportunità (prospect).
  // Chi arriva con ?client= parte da "cliente"; se non c'è nulla, si sceglie.
  // Dalle Vendite si arriva con ?contact= e ?opportunity= (piano sopralluoghi, lotto 3).
  const [linkMode, setLinkMode] = useState<LinkMode>(
    commessa || params.get("client") || params.get("order") ? "cliente"
      : params.get("contact") || params.get("opportunity") ? "prospect" : "nessuno",
  );
  const [contactId, setContactId] = useState<string | null>(commessa ? null : params.get("contact"));
  const [opportunityId, setOpportunityId] = useState<string | null>(commessa ? null : params.get("opportunity"));
  const [crmSearch, setCrmSearch] = useState("");

  const {
    data: templates,
    isLoading: tplLoading,
    isError: tplError,
    refetch: tplRefetch,
  } = useQuery({
    queryKey: ["sopralluoghi-templates", companyId],
    enabled: !!companyId,
    queryFn: () => listTemplates(),
  });

  // Settore dell'azienda: per consigliare/pre-selezionare il template giusto.
  const { data: azienda } = useQuery({
    queryKey: ["azienda-vertical", companyId],
    enabled: !!companyId,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("companies")
        .select("vertical_key, sector")
        .eq("id", companyId)
        .maybeSingle();
      return (data ?? null) as {
        vertical_key: string | null;
        sector: string | null;
      } | null;
    },
  });

  // Categorie consigliate per il settore + template ordinati (consigliati prima).
  const consigliate = useMemo(
    () => categorieConsigliate(azienda?.vertical_key, azienda?.sector),
    [azienda?.vertical_key, azienda?.sector],
  );
  const rango = (cat: string) => {
    const i = consigliate.indexOf(cat);
    return i === -1 ? 999 : i;
  };
  const templatesOrdinati = useMemo(() => {
    const list = [...(templates ?? [])].filter(
      (t) => t.is_system || t.company_id === companyId,
    );
    // Stabile: prima i consigliati (nell'ordine della mappa), poi il resto.
    return list.sort((a, b) => rango(a.category) - rango(b.category));
  }, [templates, consigliate, companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-seleziona il template del settore principale, se non arrivo con uno scelto.
  const selectedModel =
    templatesOrdinati.find((t) => t.id === selectedTemplate) ||
    (!selectedTemplate
      ? templatesOrdinati.find((t) => consigliate.includes(t.category))
      : undefined);

  /**
   * Chi si puo' mandare in sopralluogo: lo STAFF, non tutti i profili.
   *
   * Prima la lista prendeva ogni riga di `profiles` con questo `company_id`.
   * Ma i clienti sono profili anche loro: nel menu «Tecnico incaricato»
   * comparivano «ZAHREBEER SOCIETA' SEMPLICE AGRICOLA» e mezzo archivio
   * clienti, e il tecnico vero andava cercato in centinaia di nomi — col
   * rischio di assegnare il rilievo a un cliente.
   *
   * `useCompanyStaffUsers` e' il filtro gia' usato da «Assegnato a» sulle
   * commesse: esclude customer, referrer e il team della piattaforma. Stessa
   * domanda, stessa risposta, in tutta l'applicazione.
   */
  const { data: members } = useCompanyStaffUsers(companyId);

  const { data: orders } = useQuery({
    queryKey: ["company-orders-for-surveys", companyId],
    enabled: !!companyId && !commessa,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("orders")
        .select(
          "id, order_code, customer_id, client_name, work_address, indirizzo_lavori, client_address",
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        console.error("[NuovoSopralluogo] query orders fallita", error);
        throw error;
      }
      return (data ?? []) as Array<{
        id: string;
        order_code: string | null;
        customer_id: string | null;
        client_name: string | null;
        work_address: string | null;
        indirizzo_lavori: string | null;
        client_address: string | null;
      }>;
    },
  });

  /* ── L'agenda del tecnico ────────────────────────────────────────────────
     Il sopralluogo è un appuntamento come gli altri: deve rispettare le
     impostazioni del calendario di chi ci va (fasce di lavoro, passo, margini,
     preavviso, tetto al giorno) e occupare lo slot. Le stesse query della
     scheda «Prenota appuntamento» delle opportunità. */
  const { data: calendari = [] } = useQuery({
    queryKey: ["marketing_calendars_active", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("marketing_calendars")
        .select(
          "id, name, owner_id, duration_minutes, slot_interval_min, buffer_before_min, buffer_after_min, min_notice_minutes, max_per_day",
        )
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as CalendarioAgenda[];
    },
  });
  /* Un tecnico puo' avere piu' calendari (per anno, per tipo di lavoro):
     il ripiego e' il primo in ordine di nome, ma se ne ha piu' d'uno la
     scelta la fa chi crea il rilievo, non un ordinamento alfabetico. */
  const calendariDelTecnicoScelto = useMemo(
    () => calendari.filter((c) => !!technicianId && c.owner_id === technicianId),
    [calendari, technicianId],
  );
  const calendarioAgenda = useMemo(() => {
    const scelto = calendariDelTecnicoScelto.find((c) => c.id === calendarioId);
    return scelto ?? calendarioDelTecnico(calendari, technicianId);
  }, [calendari, calendariDelTecnicoScelto, calendarioId, technicianId]);
  const giornoScelto = useMemo(
    () => (scheduledDay ? new Date(`${scheduledDay}T12:00:00`) : null),
    [scheduledDay],
  );

  // Tutte le regole di quel giorno, anche quelle spente: una giornata speciale
  // spenta (ferie) chiude il giorno, non ricade sulla regola settimanale.
  const { data: regoleGiorno = [] } = useQuery({
    queryKey: ["calendar_availability", calendarioAgenda?.id, scheduledDay],
    enabled: !!calendarioAgenda?.id && !!scheduledDay,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("marketing_calendar_availability")
        .select("*")
        .eq("calendar_id", calendarioAgenda!.id)
        .or(
          `specific_date.eq.${scheduledDay},and(specific_date.is.null,day_of_week.eq.${giornoScelto!.getDay()})`,
        );
      if (error) throw error;
      return (data ?? []) as RegolaDisponibilita[];
    },
  });

  // Gli appuntamenti del giorno su TUTTI i calendari dello stesso tecnico.
  const calendariDelTecnico = useMemo(
    () =>
      calendarioAgenda
        ? calendari
            .filter((c) => c.owner_id === calendarioAgenda.owner_id)
            .map((c) => c.id)
        : [],
    [calendari, calendarioAgenda],
  );
  const { data: appuntamentiGiorno = [] } = useQuery({
    queryKey: ["appointments_for_slot", calendarioAgenda?.id, scheduledDay],
    enabled: calendariDelTecnico.length > 0 && !!scheduledDay,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("appointments")
        .select("id, appointment_time, appointment_end_time")
        .in("calendar_id", calendariDelTecnico)
        .eq("appointment_date", scheduledDay)
        .neq("status", "annullato");
      if (error) throw error;
      return (data ?? []) as Array<{
        appointment_time: string | null;
        appointment_end_time: string | null;
      }>;
    },
  });

  // Gli impegni del tecnico su Google, Outlook e Apple Calendar.
  const { data: occupatiEsterni = [] } = useQuery({
    queryKey: ["calendar_busy_owner", calendarioAgenda?.owner_id, scheduledDay],
    enabled: !!calendarioAgenda?.owner_id && !!giornoScelto,
    staleTime: 60_000,
    queryFn: async (): Promise<Occupato[]> => {
      const g = giornoScelto!;
      const inizio = new Date(
        g.getFullYear(),
        g.getMonth(),
        g.getDate(),
      ).toISOString();
      const fine = new Date(
        g.getFullYear(),
        g.getMonth(),
        g.getDate(),
        23,
        59,
        59,
        999,
      ).toISOString();
      const leggi = async (tabella: string): Promise<Occupato[]> => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from(tabella)
          .select("start_at, end_at")
          .eq("user_id", calendarioAgenda!.owner_id)
          .lt("start_at", fine)
          .gt("end_at", inizio);
        return error ? [] : ((data ?? []) as Occupato[]);
      };
      const [gg, oo, aa] = await Promise.all([
        leggi("google_calendar_busy_slots"),
        leggi("outlook_calendar_busy_slots"),
        leggi("apple_calendar_busy_slots"),
      ]);
      return [...gg, ...oo, ...aa];
    },
  });

  const esitoSlot = useMemo(() => {
    if (!calendarioAgenda || !giornoScelto) return null;
    return calcolaSlotLiberi({
      giorno: giornoScelto,
      regole: regoleGiorno,
      appuntamenti: appuntamentiGiorno.map((a) => ({
        inizio: a.appointment_time,
        fine: a.appointment_end_time,
      })),
      occupatiEsterni,
      durataMin: durataSopralluogo(calendarioAgenda),
      passoMin: calendarioAgenda.slot_interval_min,
      bufferPrimaMin: calendarioAgenda.buffer_before_min ?? 0,
      bufferDopoMin: calendarioAgenda.buffer_after_min ?? 0,
      preavvisoMin: calendarioAgenda.min_notice_minutes ?? 0,
      maxAlGiorno: calendarioAgenda.max_per_day,
    });
  }, [
    calendarioAgenda,
    giornoScelto,
    regoleGiorno,
    appuntamentiGiorno,
    occupatiEsterni,
  ]);
  const avvisoAgenda = avvisoOrario({
    ora: scheduledTime,
    calendario: calendarioAgenda,
    esito: esitoSlot,
    haRegole: regoleGiorno.length > 0,
  });

  // Clienti dell'azienda (per la modalità «Cliente»), via hook canonico.
  const { data: customers = [] } = useCompanyCustomers(
    companyId,
    linkMode === "cliente",
  );

  // Contatti e opportunità del CRM (per la modalità «Contatto/Opportunità»).
  const { data: crmContacts = [] } = useQuery({
    queryKey: ["survey-crm-contacts", companyId, crmSearch],
    enabled: !!companyId && linkMode === "prospect",
    queryFn: () => listCrmContacts(companyId!, crmSearch, 50),
  });
  const { data: crmOpps = [] } = useQuery({
    queryKey: ["survey-crm-opps", companyId, crmSearch],
    enabled: !!companyId && linkMode === "prospect",
    queryFn: () => listCrmOpportunities(companyId!, crmSearch, 50),
  });

  // Cambio modalità: azzera i collegamenti dell'altra modalità (un cliente NON
  // è un contatto: niente combinazioni ambigue).
  const cambiaModalita = (m: LinkMode) => {
    setLinkMode(m);
    if (m === "nessuno") {
      setClientId(null);
      setContactId(null);
      setOpportunityId(null);
      setOrderId(null);
      return;
    }
    if (m === "cliente") {
      setContactId(null);
      setOpportunityId(null);
    } else {
      setClientId(null);
    }
  };

  /* Precompilare l'indirizzo da un contatto, un'opportunità o una commessa
     deve aggiornare anche il cercatore, altrimenti il campo resta vuoto a
     video mentre i dati ci sono. */
  const precompilaIndirizzo = (via: string | null, comune: string | null) => {
    if (via) {
      setAddress(via);
      setIndirizzoCantiere((p) => ({ ...p, address_line: via }));
    }
    if (comune) {
      setCity(comune);
      setIndirizzoCantiere((p) => ({ ...p, address_city: comune }));
    }
  };

  // Scelta di un'opportunità: eredita in automatico il suo contatto e
  // precompila l'indirizzo se vuoto.
  const scegliOpportunita = (id: string | null) => {
    setOpportunityId(id);
    const opp = crmOpps.find((o) => o.id === id);
    if (opp?.contact) {
      setContactId(opp.contact.id);
      precompilaIndirizzo(
        !address ? opp.contact.address ?? null : null,
        !city ? opp.contact.city ?? null : null,
      );
    }
  };
  const scegliContatto = (id: string | null) => {
    setContactId(id);
    const c =
      crmContacts.find((x) => x.id === id) ??
      crmOpps.find((o) => o.contact?.id === id)?.contact ??
      null;
    if (c) {
      precompilaIndirizzo(
        !address ? c.address ?? null : null,
        !city ? c.city ?? null : null,
      );
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!companyId)
        throw new Error(tr("Apri un’azienda prima di creare il sopralluogo."));
      if (!selectedModel) throw new Error(tr("Seleziona un modello disponibile."));
      const error = surveyCreationError(zip, scheduledDay, scheduledTime);
      if (error) throw new Error(error);
      const survey = await createSurvey(
        {
          template_id: selectedModel.id,
          client_id: commessa ? commessa.clientId : linkMode === "cliente" ? clientId : null,
          contact_id: linkMode === "prospect" ? contactId : null,
          opportunity_id: linkMode === "prospect" ? opportunityId : null,
          order_id: commessa?.orderId ?? orderId,
          ...(commessa?.appointment?.id ? {appointment_id: commessa.appointment.id} : {}),
          technician_id: technicianId,
          scheduled_at: surveyAppointment(scheduledDay, scheduledTime),
          address: address.trim() || null,
          city: city.trim() || null,
          zip: zip.trim() || null,
          notes: notes.trim() || null,
          ruolo_misure: ruoloMisure,
          tipo,
        },
        companyId,
      );
      /* Il rilievo va in agenda: occupa lo slot e compare nel calendario.
         Se l'agenda rifiuta la riga il sopralluogo resta creato comunque. */
      let inAgenda = false;
      if (!commessa?.appointment && calendarioAgenda && scheduledDay && technicianId) {
        const id = await fissaSopralluogoInAgenda(
          survey.id,
          appuntamentoDelSopralluogo({
            companyId,
            calendario: calendarioAgenda,
            technicianId,
            giorno: scheduledDay,
            ora: scheduledTime,
            titolo: `Sopralluogo ${survey.code}`,
            contactId: linkMode === "prospect" ? contactId : null,
            opportunityId: linkMode === "prospect" ? opportunityId : null,
            orderId,
            indirizzo: indirizzoCantiere,
            note: notes.trim() || null,
          }),
        );
        inAgenda = !!id;
      }
      return { survey, inAgenda, conCalendario: !!calendarioAgenda };
    },
    onSuccess: ({ survey, inAgenda, conCalendario }) => {
      toast.success(commessa?.appointment ? tr("Sopralluogo {codice} aperto", { codice: survey.code ?? "" }) : tr("Sopralluogo {codice} creato", { codice: survey.code ?? "" }), {
        description: inAgenda
          ? tr("In agenda il {data} alle {ora}.", { data: format(new Date(`${scheduledDay}T12:00:00`), "d MMMM", { locale: dateFnsCampo() }), ora: scheduledTime })
          : conCalendario
            ? tr("Creato, ma non è stato possibile metterlo in agenda.")
            : undefined,
      });
      if (onCreated) onCreated(survey.id);
      else navigate(`/azienda/sopralluoghi/${survey.id}?modifica=1`);
    },
    onError: (e) => {
      setSubmitError(
        e instanceof Error ? e.message : tr("Creazione non riuscita. Riprova."),
      );
      toast.error(tr("Creazione non riuscita"), { description: String(e) });
    },
    onSettled: () => {
      creating.current = false;
      onBusyChange?.(false);
    },
  });

  const canNext1 = !!selectedModel && !!companyId;
  const canSubmit =
    canNext1 && !surveyCreationError(zip, scheduledDay, scheduledTime);

  const selectedCustomer = customers.find((c) => c.id === clientId);
  const selectedContact =
    crmContacts.find((c) => c.id === contactId) ||
    crmOpps.find((o) => o.contact?.id === contactId)?.contact;
  const selectedOpportunity = crmOpps.find((o) => o.id === opportunityId);
  const selectedOrder = orders?.find((o) => o.id === orderId);
  const selectedMember = members?.find((m) => m.id === technicianId);
  const person = (
    p:
      | {
          first_name?: string | null;
          last_name?: string | null;
          email?: string | null;
        }
      | null
      | undefined,
  ) =>
    [p?.first_name, p?.last_name].filter(Boolean).join(" ") || p?.email || "";
  const stepNames = [
    tr("Tipo di rilievo"),
    tr("Cliente e commessa"),
    tr("Luogo e organizzazione"),
  ];
  const stepHelp = [
    tr("Scegli la scheda tecnica da compilare sul posto."),
    tr("Collega i dati che hai già, oppure continua senza collegamenti."),
    tr("Bastano le informazioni che conosci. Il resto si completa nel rilievo."),
  ];
  const fieldError = surveyCreationError(zip, scheduledDay, scheduledTime);
  const visibleModels = templatesOrdinati.filter((t) =>
    `${t.name} ${t.description || ""} ${t.category}`
      .toLocaleLowerCase("it")
      .includes(modelSearch.toLocaleLowerCase("it").trim()),
  );
  function go(next: number) {
    if (createMutation.isPending) return;
    if (commessa && next === 2) next = step === 1 ? 3 : 1;
    setStep(next);
    setSubmitError("");
    requestAnimationFrame(() => heading.current?.focus());
  }
  function submit() {
    if (creating.current || !canSubmit) return;
    creating.current = true;
    onBusyChange?.(true);
    setSubmitError("");
    createMutation.mutate();
  }

  const summary = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {tr("Il tuo sopralluogo")}
      </p>
      <h3 className="mt-2 text-base font-semibold text-slate-900">
        {selectedModel?.name || tr("Scegli un modello")}
      </h3>
      <dl className="mt-4 space-y-4 text-sm">
        <div>
          <dt className="mb-1 text-xs text-slate-500">{tr("Collegamenti")}</dt>
          <dd className="break-words">
            {linkMode === "nessuno"
              ? tr("Bozza autonoma")
              : opportunityId
                ? selectedOpportunity?.name || tr("Opportunità selezionata")
                : contactId
                  ? nomeContatto(selectedContact) || tr("Contatto selezionato")
              : commessa?.clientName || (clientId
                    ? person(selectedCustomer) || tr("Cliente selezionato")
                    : tr("Nessun cliente selezionato"))}
            {orderId && (
              <span className="mt-1 block text-xs text-slate-500">
                {commessa?.orderCode || selectedOrder?.order_code || tr("Commessa selezionata")}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="mb-1 text-xs text-slate-500">{tr("Cantiere")}</dt>
          <dd className="break-words">
            {[address.trim(), zip.trim(), city.trim()]
              .filter(Boolean)
              .join(", ") || tr("Luogo da completare")}
          </dd>
        </div>
        <div>
          <dt className="mb-1 text-xs text-slate-500">{tr("Appuntamento")}</dt>
          <dd>
            {scheduledDay
              ? `${format(new Date(`${scheduledDay}T12:00:00`), "d MMMM yyyy", { locale: dateFnsCampo() })} · ${scheduledTime || tr("ora da indicare")}`
              : tr("Da programmare")}
          </dd>
        </div>
        <div>
          <dt className="mb-1 text-xs text-slate-500">{tr("Tecnico")}</dt>
          <dd className="break-words">
            {technicianId
              ? person(selectedMember) || tr("Tecnico selezionato")
              : tr("Da assegnare")}
          </dd>
        </div>
      </dl>
      {step === 3 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={createMutation.isPending}
            className="min-h-9 rounded-lg"
            onClick={() => go(1)}
          >
            {tr("Cambia modello")}
          </Button>
          {!commessa && <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={createMutation.isPending}
            className="min-h-9 rounded-lg"
            onClick={() => go(2)}
          >
            {tr("Cambia collegamenti")}
          </Button>}
        </div>
      )}
      <p className="mt-4 border-t pt-3 text-xs leading-relaxed text-slate-500">
        {tr("Si crea una bozza, senza firma o invio al cliente. Dopo la creazione potrai inserire ambienti, misure, foto e posizionamenti.")}
      </p>
    </>
  );
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-3 pb-6 sm:p-6">
      <header className="flex items-start gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={step > 1 ? tr("Torna al passaggio precedente") : tr("Torna ai sopralluoghi")}
          className="h-11 w-11 shrink-0 rounded-xl"
          disabled={createMutation.isPending}
          onClick={() =>
            step > 1 ? go(step - 1) : onCancel ? onCancel() : navigate("/azienda/sopralluoghi")
          }
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500 max-md:hidden">
            {tr("Nuovo sopralluogo")}
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 max-md:text-base sm:text-2xl">
            {tr("Prepara il rilievo, poi lavora sul posto.")}
          </h1>
          <p className="mt-1 text-sm text-slate-500 max-md:hidden">
            {tr("Modello, collegamenti e appuntamento in un unico percorso.")}
          </p>
        </div>
      </header>
      {commessa && <div className="rounded-xl border bg-muted/30 px-4 py-3 text-sm"><span className="font-medium">{commessa.orderCode || tr("Commessa corrente")}</span>{commessa.clientName ? ` · ${commessa.clientName}` : ""}<p className="mt-1 text-xs text-muted-foreground">{tr("Cliente e commessa sono già collegati. Qui prepari solo il sopralluogo.")}</p></div>}
      {!companyId && (
        <p
          role="alert"
          className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm"
        >
          {tr("Apri un’azienda per continuare.")}
        </p>
      )}
      <nav
        aria-label={tr("Passaggi nuovo sopralluogo")}
        className={cn("grid gap-1 rounded-2xl border bg-white p-1.5 shadow-sm",commessa ? "grid-cols-2" : "grid-cols-3")}
      >
        {stepNames.map((name, i) => !commessa || i !== 1 ? (
          <button
            key={name}
            type="button"
            aria-current={step === i + 1 ? "step" : undefined}
            aria-label={`${commessa && i === 2 ? 2 : i + 1}. ${name}`}
            disabled={createMutation.isPending || (i > 0 && !canNext1)}
            onClick={() => go(i + 1)}
            className={cn(
              "flex min-h-14 min-w-0 items-center gap-2 rounded-xl px-2 py-2 text-left text-xs transition-colors motion-reduce:transition-none sm:px-4 sm:text-sm",
              step === i + 1
                ? "bg-slate-900 text-white"
                : "text-slate-500 hover:bg-slate-50",
            )}
          >
            <span
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs",
                step > i + 1
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-current/20",
              )}
            >
              {step > i + 1 ? <Check className="h-3.5 w-3.5" /> : commessa && i === 2 ? 2 : i + 1}
            </span>
            <span className="min-w-0 font-medium leading-snug sm:hidden">
              {[tr("Rilievo"), tr("Cliente"), tr("Luogo e data")][i]}
            </span>
            <span className="hidden min-w-0 font-medium leading-snug sm:inline">
              {name}
            </span>
          </button>
        ) : null)}
      </nav>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-4">
          <div className="px-1">
            <p className="text-xs font-medium text-slate-500">
              {tr("Passaggio {n} di {totale}", { n: commessa && step === 3 ? 2 : step, totale: commessa ? 2 : 3 })}
            </p>
            <h2
              ref={heading}
              tabIndex={-1}
              className="mt-1 text-lg font-semibold outline-none"
            >
              {stepNames[step - 1]}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{stepHelp[step - 1]}</p>
          </div>
          <fieldset disabled={createMutation.isPending} className="min-w-0">
            {step === 1 && (
              <section
                aria-label={tr("Modelli di sopralluogo")}
                className="space-y-4 rounded-2xl border bg-white p-4 sm:p-5"
              >
                <div className="relative">
                  <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                  <Input
                    aria-label={tr("Cerca modello di rilievo")}
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    placeholder={tr("Cerca infissi, clima, fotovoltaico…")}
                    className="min-h-11 rounded-xl pl-9"
                  />
                </div>
                {selectedModel &&
                  modelSearch &&
                  !visibleModels.some((t) => t.id === selectedModel.id) && (
                    <p className="rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-800">{tr("Modello attivo: {nome}. Seleziona un risultato per cambiarlo.", { nome: selectedModel.name })}</p>
                  )}
                {tplLoading ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[1, 2, 3, 4].map((n) => (
                      <Skeleton key={n} className="h-32 rounded-xl" />
                    ))}
                  </div>
                ) : tplError ? (
                  <div
                    role="alert"
                    className="rounded-xl bg-orange-50 p-4 text-sm"
                  >
                    <p>
                      {tr("Non riesco a caricare i modelli. Controlla la connessione.")}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3 min-h-11 rounded-xl"
                      onClick={() => tplRefetch()}
                    >
                      {tr("Riprova")}
                    </Button>
                  </div>
                ) : !templatesOrdinati.length ? (
                  <p className="p-4 text-sm text-slate-500">
                    {tr("Nessun modello disponibile per questa azienda.")}
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-slate-500">{tr("{n} modelli · quelli consigliati per la tua azienda vengono prima", { n: visibleModels.length })}</p>
                    <div
                      role="radiogroup"
                      aria-label={tr("Tipo di rilievo")}
                      className="grid gap-3 sm:grid-cols-2"
                    >
                      {visibleModels.map((t) => (
                        <button
                          type="button"
                          role="radio"
                          aria-checked={selectedModel?.id === t.id}
                          key={t.id}
                          onClick={() => setSelectedTemplate(t.id)}
                          className={cn(
                            "min-w-0 rounded-2xl border p-4 text-left transition-colors motion-reduce:transition-none",
                            selectedModel?.id === t.id
                              ? "border-blue-500 bg-blue-50/60 ring-1 ring-blue-500"
                              : "border-slate-200 hover:border-slate-400 hover:bg-slate-50",
                          )}
                        >
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <span
                              className="grid h-10 w-10 place-items-center rounded-xl bg-slate-50 text-xl"
                              aria-hidden="true"
                            >
                              {CATEGORY_ICON[t.category] || "📋"}
                            </span>
                            {selectedModel?.id === t.id ? (
                              <span className="flex items-center gap-1 text-xs font-medium text-blue-700">
                                <Check className="h-4 w-4" />
                                {tr("Selezionato")}
                              </span>
                            ) : consigliate.includes(t.category) ? (
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600">
                                {tr("Consigliato")}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-sm font-semibold text-slate-900">
                            {t.name}
                          </p>
                          {t.description && (
                            <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-500">
                              {t.description}
                            </p>
                          )}
                          <p className="mt-3 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                            {t.is_system
                              ? tr("Modello standard")
                              : tr("Modello della tua azienda")}
                          </p>
                        </button>
                      ))}
                    </div>
                    {!visibleModels.length && (
                      <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                        {tr("Nessun modello corrisponde alla ricerca.")}{" "}
                        <button
                          type="button"
                          className="font-medium text-blue-700"
                          onClick={() => setModelSearch("")}
                        >
                          {tr("Mostra tutti")}
                        </button>
                      </p>
                    )}
                  </>
                )}
              </section>
            )}
            {step === 2 && (
              <section
                aria-label={tr("Collegamenti del sopralluogo")}
                className="space-y-5 rounded-2xl border bg-white p-4 sm:p-5"
              >
                {commessa ? <div className="space-y-2 text-sm"><h3 className="font-semibold">{tr("Collegato a questa commessa")}</h3><p>{commessa.orderCode || tr("Commessa corrente")}{commessa.clientName ? ` · ${commessa.clientName}` : ""}</p><p className="text-xs text-muted-foreground">{tr("Il rilievo rimane nella commessa e usa il cliente già presente.")}</p></div> : <>
                <div
                  role="radiogroup"
                  aria-label={tr("A chi si riferisce")}
                  className="grid gap-2 sm:grid-cols-3"
                >
                  {[
                    {
                      key: "nessuno" as const,
                      label: tr("Collega più avanti"),
                      description: tr("Crea una bozza autonoma"),
                      icon: ClipboardList,
                    },
                    {
                      key: "cliente" as const,
                      label: tr("Cliente o commessa"),
                      description: tr("Dati già nel gestionale"),
                      icon: UserRound,
                    },
                    {
                      key: "prospect" as const,
                      label: tr("Contatto CRM"),
                      description: tr("Contatto o opportunità"),
                      icon: Target,
                    },
                  ].map((m) => (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={linkMode === m.key}
                      key={m.key}
                      onClick={() => cambiaModalita(m.key)}
                      className={cn(
                        "rounded-xl border p-3 text-left",
                        linkMode === m.key
                          ? "border-blue-500 bg-blue-50/60 ring-1 ring-blue-500"
                          : "border-slate-200 hover:bg-slate-50",
                      )}
                    >
                      <m.icon className="mb-2 h-4 w-4 text-slate-500" />
                      <p className="text-sm font-medium">{m.label}</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">
                        {m.description}
                      </p>
                    </button>
                  ))}
                </div>
                {linkMode === "nessuno" ? (
                  <p className="rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-600">
                    {tr("Nessun cliente o commessa verrà associato. Potrai aggiungere i collegamenti quando avrai le informazioni.")}
                  </p>
                ) : (
                  <>
                    {linkMode === "cliente" ? (
                      <div className="space-y-2">
                        <Label htmlFor="survey-create-client">
                          {tr("Cliente")}{" "}
                          <span className="font-normal text-slate-400">
                            {tr("· facoltativo")}
                          </span>
                        </Label>
                        <SurveyCreatePicker
                          id="survey-create-client"
                          label={tr("Cliente")}
                          value={clientId}
                          options={customers.map((c) => ({
                            id: c.id,
                            label: person(c) || c.id.slice(0, 8),
                          }))}
                          emptyLabel={tr("Nessun cliente selezionato")}
                          onChange={setClientId}
                        />
                        <p className="text-xs text-slate-500">
                          {tr("Puoi scegliere anche soltanto la commessa qui sotto.")}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="survey-crm-search">
                            {tr("Cerca nel CRM")}
                          </Label>
                          <Input
                            id="survey-crm-search"
                            value={crmSearch}
                            onChange={(e) => setCrmSearch(e.target.value)}
                            placeholder={tr("Nome del contatto o dell’opportunità…")}
                            className="mt-2 min-h-11 rounded-xl"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="survey-create-opportunity">
                            {tr("Opportunità")}{" "}
                            <span className="font-normal text-slate-400">
                              {tr("· facoltativa")}
                            </span>
                          </Label>
                          <SurveyCreatePicker
                            id="survey-create-opportunity"
                            label={tr("Opportunità")}
                            value={opportunityId}
                            options={crmOpps.map((o) => ({
                              id: o.id,
                              label: o.name || tr("Opportunità"),
                            }))}
                            emptyLabel={tr("Nessuna opportunità selezionata")}
                            onChange={scegliOpportunita}
                          />
                          <p className="text-xs text-slate-500">
                            {tr("Il contatto dell’opportunità viene collegato automaticamente.")}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="survey-create-contact">
                            {tr("Contatto")}{" "}
                            <span className="font-normal text-slate-400">
                              {tr("· facoltativo")}
                            </span>
                          </Label>
                          <SurveyCreatePicker
                            id="survey-create-contact"
                            label={tr("Contatto")}
                            value={contactId}
                            options={crmContacts.map((c) => ({
                              id: c.id,
                              label:
                                nomeContatto(c) ||
                                c.phone ||
                                c.email ||
                                c.id.slice(0, 8),
                            }))}
                            emptyLabel={tr("Nessun contatto selezionato")}
                            disabled={!!opportunityId}
                            onChange={scegliContatto}
                          />
                          {!!opportunityId && (
                            <p className="text-xs text-slate-500">
                              {tr("Per scegliere un altro contatto, rimuovi prima l’opportunità.")}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="space-y-2 border-t pt-4">
                      <Label htmlFor="survey-create-order">
                        {tr("Commessa")}{" "}
                        <span className="font-normal text-slate-400">
                          {tr("· facoltativa")}
                        </span>
                      </Label>
                      <SurveyCreatePicker
                        id="survey-create-order"
                        label={tr("Commessa")}
                        value={orderId}
                        options={(orders || []).map((o) => ({
                          id: o.id,
                          label: `${o.order_code || o.id.slice(0, 8)} · ${o.client_name || "Commessa"}`,
                        }))}
                        emptyLabel={tr("Nessuna commessa selezionata")}
                        onChange={(id) => {
                          setOrderId(id);
                          const order = orders?.find((o) => o.id === id);
                          if (order) {
                            if (linkMode === "cliente" && order.customer_id)
                              setClientId(order.customer_id);
                            const place =
                              order.work_address ||
                              order.indirizzo_lavori ||
                              order.client_address;
                            if (!address) precompilaIndirizzo(place ?? null, null);
                          }
                        }}
                      />
                      <p className="text-xs text-slate-500">
                        {tr("La scheda sarà visibile anche nella commessa scelta. Sono elencate le 50 commesse più recenti.")}
                      </p>
                    </div>
                  </>
                )}
                </>}
              </section>
            )}
            {step === 3 && (
              <div className="space-y-4">
                <section
                  aria-label={tr("A cosa servono le misure")}
                  className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5"
                >
                  <div>
                    <h3 className="font-semibold">{tr("Che sopralluogo è?")}</h3>
                    <p className="text-xs text-slate-500">
                      {tr("Si ordina ai fornitori solo dalle misure del tecnico.")}
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={tr("Tipo di sopralluogo")}>
                    {([
                      ["commerciale", "Commerciale", "Misure di massima, per fare l'offerta."],
                      ["tecnico", "Tecnico", "Misure precise: computo, preventivo e ordini."],
                    ] as const).map(([valore, titolo, testo]) => (
                      <button
                        key={valore}
                        type="button"
                        role="radio"
                        aria-checked={tipo === valore}
                        onClick={() => setTipo(valore)}
                        className={cn(
                          "min-h-11 rounded-xl border p-3 text-left",
                          tipo === valore
                            ? "border-blue-500 bg-blue-50/60 ring-1 ring-blue-500"
                            : "border-slate-200 hover:bg-slate-50",
                        )}
                      >
                        <span className="block text-sm font-medium">{tr(titolo)}</span>
                        <span className="block text-xs text-slate-500">{tr(testo)}</span>
                      </button>
                    ))}
                  </div>
                </section>
                <section
                  aria-label={tr("Luogo del sopralluogo")}
                  className="space-y-4 rounded-2xl border bg-white p-4 sm:p-5"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-50">
                      <MapPin className="h-4 w-4 text-slate-600" />
                    </span>
                    <div>
                      <h3 className="font-semibold">{tr("Dove si svolge?")}</h3>
                      <p className="text-xs text-slate-500">
                        {tr("Indica il cantiere, non l’indirizzo di fatturazione.")}
                      </p>
                    </div>
                  </div>
                  {/* Tre campi liberi — via, città, CAP — e nessuno che
                      trovasse l'indirizzo vero: si scriveva «sdgasdg» e la
                      bozza partiva con un cantiere che non esiste, senza
                      coordinate, quindi senza mappa e senza navigatore per chi
                      ci deve andare. Qui si usa lo stesso cercatore della
                      commessa: scegli il suggerimento e città, CAP, provincia e
                      coordinate vengono da soli. `editableSearch` lascia
                      comunque scrivere a mano, perché il luogo si può
                      completare durante il rilievo. */}
                  <AddressAutocomplete
                    label={tr("Indirizzo del cantiere")}
                    searchPlaceholder={tr("Cerca via, civico o città...")}
                    editableSearch
                    value={indirizzoCantiere}
                    onChange={(dati) => {
                      setIndirizzoCantiere(dati);
                      setAddress(dati.address_line || dati.formatted_address || "");
                      setCity(dati.address_city || "");
                      setZip(dati.address_postal_code || "");
                    }}
                  />
                  <p className="text-xs text-slate-500">
                    {address || city
                      ? tr("Puoi completare l’indirizzo anche durante il rilievo.")
                      : tr("Non conosci ancora il luogo? Lascia vuoto e completalo nella bozza.")}
                  </p>
                </section>
                {commessa?.appointment ? <section className="space-y-2 rounded-2xl border bg-white p-4"><h3 className="text-sm font-semibold">{tr("Appuntamento già fissato")}</h3><p className="text-sm">{scheduledDay ? format(new Date(`${scheduledDay}T12:00:00`), "d MMMM yyyy", {locale:dateFnsCampo()}) : tr("Data da verificare")}{commessa.appointment.appointment_time ? ` · ${scheduledTime}` : ""}</p><p className="text-xs text-muted-foreground">{tr("Il rilievo sarà collegato a questo appuntamento. Data e tecnico si modificano dalla pianificazione.")}</p></section> : <section
                  aria-label={tr("Appuntamento e incaricato")}
                  className="space-y-4 rounded-2xl border bg-white p-4 sm:p-5"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-50">
                      <Calendar className="h-4 w-4 text-slate-600" />
                    </span>
                    <div>
                      <h3 className="font-semibold">{tr("Quando e con chi?")}</h3>
                      <p className="text-xs text-slate-500">
                        {tr("Facoltativo · puoi organizzarlo anche dopo.")}
                      </p>
                    </div>
                  </div>
                  {/* Prima chi: è il suo calendario a dire quali orari esistono. */}
                  <div className="space-y-2">
                    <Label htmlFor="survey-create-technician">
                      {tr("Tecnico incaricato")}
                    </Label>
                    <SurveyCreatePicker
                      id="survey-create-technician"
                      label={tr("Tecnico")}
                      value={technicianId}
                      options={(members || []).map((m) => ({
                        id: m.id,
                        label: person(m) || m.id.slice(0, 8),
                      }))}
                      emptyLabel={tr("Da assegnare")}
                      onChange={(id) => {
                        setTechnicianId(id);
                        setCalendarioId(null);
                      }}
                    />
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="survey-create-day">{tr("Data")}</Label>
                      <Popover
                        open={calendarOpen}
                        onOpenChange={setCalendarOpen}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            id="survey-create-day"
                            type="button"
                            variant="outline"
                            aria-label={tr("Data del sopralluogo")}
                            className="min-h-11 w-full justify-start gap-2 rounded-xl font-normal"
                          >
                            <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
                            <span className="truncate">
                              {scheduledDay
                                ? format(
                                    new Date(`${scheduledDay}T12:00:00`),
                                    "d MMM yyyy",
                                    { locale: dateFnsCampo() },
                                  )
                                : tr("Da programmare")}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-auto rounded-2xl p-0"
                        >
                          <DateCalendar
                            mode="single"
                            locale={it}
                            selected={
                              scheduledDay
                                ? new Date(`${scheduledDay}T12:00:00`)
                                : undefined
                            }
                            onSelect={(date) => {
                              setScheduledDay(
                                date ? format(date, "yyyy-MM-dd") : "",
                              );
                              setCalendarOpen(false);
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            className="min-h-11 w-full rounded-b-2xl"
                            onClick={() => {
                              setScheduledDay("");
                              setCalendarOpen(false);
                            }}
                          >
                            {tr("Lascia da programmare")}
                          </Button>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="survey-create-time">{tr("Ora")}</Label>
                      <Input
                        id="survey-create-time"
                        type="time"
                        value={scheduledTime}
                        disabled={!scheduledDay}
                        onChange={(e) => setScheduledTime(e.target.value)}
                        className="min-h-11 rounded-xl"
                      />
                    </div>
                  </div>
                  {calendariDelTecnicoScelto.length > 1 && (
                    <div className="space-y-2">
                      <Label htmlFor="survey-create-calendar">
                        {tr("Su quale calendario")}
                      </Label>
                      <SurveyCreatePicker
                        id="survey-create-calendar"
                        label={tr("Calendario")}
                        value={calendarioAgenda?.id ?? null}
                        options={calendariDelTecnicoScelto.map((c) => ({
                          id: c.id,
                          label: c.name,
                        }))}
                        emptyLabel={tr("Scegli il calendario")}
                        onChange={setCalendarioId}
                      />
                    </div>
                  )}
                  {/* Gli orari liberi del calendario del tecnico: stessi di
                      tutti gli altri appuntamenti. L'ora a mano resta: un
                      cliente che riceve solo di sabato esiste. */}
                  {scheduledDay && calendarioAgenda && esitoSlot && (
                    <div className="space-y-2 rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-600">
                        {tr("Calendario «{nome}»", { nome: calendarioAgenda.name })}
                        {esitoSlot.fasce.length > 0
                          ? ` · ${esitoSlot.fasce.map((f) => `${f.da}–${f.a}`).join(", ")}`
                          : ""}
                        {(calendarioAgenda.min_notice_minutes ?? 0) > 0
                          ? ` · ${tr("preavviso {n} min", { n: calendarioAgenda.min_notice_minutes ?? 0 })}`
                          : ""}
                        {` · ${tr("{n} min", { n: durataSopralluogo(calendarioAgenda) })}`}
                      </p>
                      {esitoSlot.slot.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {esitoSlot.slot.map((s) => (
                            <Button
                              key={s}
                              type="button"
                              size="sm"
                              variant={
                                scheduledTime === s ? "default" : "outline"
                              }
                              className="rounded-lg"
                              onClick={() => setScheduledTime(s)}
                            >
                              {s}
                            </Button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">
                          {regoleGiorno.length === 0
                            ? tr("Questo calendario non ha ancora orari di lavoro impostati: scegli l’ora a mano.")
                            : tr("Nessun orario libero quel giorno: puoi comunque scegliere l’ora a mano.")}
                        </p>
                      )}
                    </div>
                  )}
                  {avvisoAgenda && (
                    <p
                      role="status"
                      className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800"
                    >
                      {avvisoAgenda}
                    </p>
                  )}
                  {scheduledDay && !calendarioAgenda && (
                    <p className="text-xs text-slate-500">
                      {technicianId
                        ? tr("Questo tecnico non ha un calendario: l’ora resta libera e il rilievo non occupa nessuno slot.")
                        : tr("Scegli il tecnico per vedere i suoi orari liberi e fissare il rilievo nel suo calendario.")}
                    </p>
                  )}
                </section>}
                <details className="rounded-2xl border bg-white p-4 sm:p-5">
                  <summary className="cursor-pointer text-sm font-semibold">
                    {tr("Note e accesso al cantiere")}{" "}
                    <span className="font-normal text-slate-400">
                      {tr("· facoltativo")}
                    </span>
                    {notes && (
                      <span className="ml-2 text-xs text-blue-700">
                        {tr("Compilate")}
                      </span>
                    )}
                  </summary>
                  <div className="mt-4 space-y-2">
                    <Label htmlFor="survey-create-notes">
                      {tr("Indicazioni per il tecnico")}
                    </Label>
                    <Textarea
                      id="survey-create-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={4}
                      placeholder={tr("Citofono, referente sul posto, accesso al tetto, cosa controllare…")}
                      className="rounded-xl"
                    />
                    <p className="text-xs text-slate-500">
                      {tr("Misure, foto e dettagli tecnici si aggiungono nella scheda successiva.")}
                    </p>
                  </div>
                </details>
              </div>
            )}
          </fieldset>
          {(submitError || (step === 3 && fieldError)) && (
            <p
              role="alert"
              className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900"
            >
              {submitError || (fieldError ? tr(fieldError) : "")}
            </p>
          )}
        </div>
        <aside
          aria-label={tr("Riepilogo nuovo sopralluogo")}
          className={cn(
            "min-w-0 rounded-2xl border bg-slate-50 p-4 lg:sticky lg:top-4 lg:block",
            step < 3 && "hidden",
          )}
        >
          {summary}
        </aside>
      </div>
      <footer className="sticky bottom-0 z-20 flex items-center justify-between gap-3 rounded-2xl border bg-white/95 p-3 shadow-sm backdrop-blur-sm supports-[backdrop-filter]:bg-white/90">
        <div className="min-w-0">
          {step > 1 ? (
            <Button
              type="button"
              variant="ghost"
              disabled={createMutation.isPending}
              className="min-h-11 rounded-xl gap-1"
              onClick={() => go(step - 1)}
            >
              <ArrowLeft className="h-4 w-4" />
              {tr("Indietro")}
            </Button>
          ) : (
            <span className="pl-2 text-xs text-slate-500">
              {tr("Scegli il modello")}
            </span>
          )}
        </div>
        {step < 3 ? (
          <Button
            type="button"
            disabled={!canNext1 || createMutation.isPending}
            className="min-h-11 rounded-xl gap-2 px-5"
            onClick={() => go(step + 1)}
          >
            {tr("Continua")}
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="button"
            disabled={!canSubmit || createMutation.isPending}
            className="min-h-11 rounded-xl gap-2 px-4"
            onClick={submit}
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            <span>
              {createMutation.isPending
                ? tr("Creazione…")
                : tr("Crea e apri il rilievo")}
            </span>
          </Button>
        )}
      </footer>
    </div>
  );
}
