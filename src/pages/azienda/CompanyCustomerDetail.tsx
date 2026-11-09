import { useMemo, lazy, Suspense } from "react";
import { Navigate, useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Loader2, Mail, Phone, Wand2,
  AlertTriangle, Pencil, Euro, ShoppingBag, LifeBuoy,
  FileText, ChevronDown,
  ClipboardList, FileSignature, Ticket,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
// 2026-05-27 (perf fix 2): EmailComposeDialog + AppointmentDialog erano
// eager-imported ma vengono usati SOLO on-demand (click bottone). Importati
// con lazy() per togliere dal chunk principale del CustomerDetail.
import type { ComposeContext } from "@/pages/azienda/email/components/EmailComposeDialog";
const EmailComposeDialog = lazy(() =>
  import("@/pages/azienda/email/components/EmailComposeDialog").then((m) => ({ default: m.EmailComposeDialog }))
);
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ContactCallHistory } from "@/components/telephony/ContactCallHistory";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { looksLikePhone, looksLikeFiscalCode, looksLikeEmail } from "@/lib/customerDataSanitizer";
import { useState } from "react";
import { NuovoContrattoClienteDialog } from "@/components/clients/NuovoContrattoClienteDialog";
import { ChiediASilvio } from "@/components/silvio/ChiediASilvio";
import { CustomerProfileCard } from "@/components/clients/CustomerProfileCard";
import DistanceFromBase from "@/components/customers/DistanceFromBase";
import { CustomerActivityTimeline } from "@/components/clients/CustomerActivityTimeline";
import { CustomerComposeBar } from "@/components/clients/CustomerComposeBar";
const AppointmentDialog = lazy(() =>
  import("@/components/appointments/AppointmentDialog").then((m) => ({ default: m.AppointmentDialog }))
);
import { queryKeys } from "@/lib/queryKeys";
import {
  CustomerBusinessTabs,
} from "@/components/clients/CustomerBusinessTabs";
import { KpiCard } from "@/components/clients/KpiCard";
import { AzioniContattoScheda, AzioniContattoSchedaMobile, linkWhatsApp } from "@/components/clients/AzioniContattoScheda";
import { PannelloLateraleScheda } from "@/components/clients/PannelloLateraleScheda";
import { VoceEliminaCliente } from "@/components/clients/VoceEliminaCliente";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { APPALTATORE_MODULE_FLAG } from "@/hooks/useAppaltatoreModule";
import { useSchermoStretto } from "@/hooks/useSchermoStretto";
import { emailVera, useComunicazioniScheda, useContattoCollegato } from "@/hooks/useComunicazioniScheda";
import {
  ClipboardList as ClipboardListIcon, Ticket as TicketIcon,
  FileSignature as FileSignatureIcon, FileText as FileTextIcon,
  Wrench as WrenchIcon, CalendarDays as CalendarDaysIcon,
  CreditCard as CreditCardIcon, Mail as MailIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { euro, oggiRoma, rateConResiduo, totaleDaIncassare, type SchedaCliente } from "@/lib/clienti/schedaCliente";
import { azioniSuggerite } from "@/lib/clienti/cosaFareAdesso";
import { CosaFareAdesso } from "@/components/clients/CosaFareAdesso";

interface CustomerProfile {
  id: string;
  first_name: string | null;
  last_name: string;
  email: string;
  phone: string | null;
  address: string | null;
  fiscal_code: string | null;
  vat_number: string | null;
  site_address: string | null;
  notes: string | null;
  company_id: string | null;
  created_at: string;
  salesperson_id: string | null;
  marketing_contact_id?: string | null;
  // Nuovi campi
  is_business: boolean | null;
  business_name: string | null;
  city: string | null;
  postal_code: string | null;
  province: string | null;
  country: string | null;
  site_city: string | null;
  site_postal_code: string | null;
  site_province: string | null;
  customer_type: string | null;
}

// ───────────────────────────────────────────────────────────────
// RIGHT_TABS — icon strip verticale lato destro (pattern marketing).
// Ogni icona apre/chiude il pannello laterale 340px che renderizza
// CustomerBusinessTabs forzato su quella tab.
// ───────────────────────────────────────────────────────────────
const RIGHT_TABS: { key: string; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { key: "ordini",       icon: ClipboardListIcon,  label: "Commesse" },
  { key: "preventivi",   icon: FileSignatureIcon,  label: "Preventivi" },
  { key: "assistenza",   icon: TicketIcon,         label: "Assistenza" },
  { key: "interventi",   icon: WrenchIcon,         label: "Interventi" },
  { key: "documenti",    icon: FileTextIcon,       label: "Documenti / Fatture" },
  { key: "email",        icon: MailIcon,           label: "Email" },
  { key: "appuntamenti", icon: CalendarDaysIcon,   label: "Appuntamenti" },
  { key: "rate",         icon: CreditCardIcon,     label: "Rate / Scadenzario" },
];

export default function CompanyCustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // 2026-05-26: compose email dialog integrato (richiesta utente "vorrei che
  // potessi inviare email anche da qui"). Apre con destinatario pre-popolato
  // a customer.email.
  const [composeOpen, setComposeOpen] = useState(false);
  const [nuovoContratto, setNuovoContratto] = useState(false);
  const [composeContext, setComposeContext] = useState<ComposeContext>({ mode: "new" });
  // 2026-05-27 (layout 3-col): tab pannello laterale destro.
  // null = chiuso, "ordini" | "preventivi" | "assistenza" | "interventi" |
  // "documenti" | "email" | "appuntamenti" | "rate" = aperto su quella sezione.
  // Click sulla stessa icona = toggle chiude.
  // Sugli schermi larghi il pannello parte aperto sulle commesse: c'è posto, e
  // le icone da sole non dicevano che lì dentro ci sono commesse e documenti.
  const [rightTab, setRightTab] = useState<string | null>(() =>
    typeof window !== "undefined" && window.matchMedia?.("(min-width: 1536px)").matches ? "ordini" : null);
  // 2026-05-27 (richiesta utente "popup appuntamento"): apre AppointmentDialog
  // come modale invece di navigate /calendario. Pre-popolato con dati cliente
  // (address/city/province) e order_id del primo ordine (se esiste).
  const [appointmentDialogOpen, setAppointmentDialogOpen] = useState(false);
  // La vista a schede per il telefono si monta solo sugli schermi stretti:
  // nascosta col CSS sul computer, rifaceva comunque le sue letture.
  const schermoStretto = useSchermoStretto();
  // Un committente ha la sua scheda: ci si arriva anche da ricerca, fatture e
  // conversazioni, che conoscono soltanto questo indirizzo.
  const { isFeatureEnabled, isLoading: flagInCaricamento } = useFeatureFlags();
  const moduloAppaltatori = isFeatureEnabled(APPALTATORE_MODULE_FLAG);

  // ── Core customer data ──────────────────────────────────────────────────────
  const { data: customer, isLoading, refetch: refetchCustomer } = useQuery({
    queryKey: ["company-customer-detail", id, effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) throw new Error("Azienda non trovata");
      const query = supabase
        .from("profiles")
        .select("id, first_name, last_name, email, phone, address, fiscal_code, vat_number, site_address, notes, company_id, created_at, salesperson_id, marketing_contact_id, is_business, business_name, city, postal_code, province, country, site_city, site_postal_code, site_province, customer_type")
        .eq("id", id!)
        .eq("company_id", effectiveCompany.id);
      // maybeSingle: un cliente inesistente ritorna null (→ "non trovato") invece
      // di lanciare PGRST116, così un vero errore DB/RLS resta distinguibile.
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data as unknown as CustomerProfile | null;
    },
    enabled: !!id && !!effectiveCompany?.id,
  });

  // ── Tutto quello che serve alla scheda, in una lettura (23/10/2026) ───────
  // Prima erano nove richieste separate (commesse, anagrafica fiscale, fatture,
  // preventivi, ticket, interventi, appuntamenti, rate, da incassare): ognuna
  // ripreparava le regole di accesso, oltre 200 ms a tabella. La funzione
  // scheda_cliente le legge con i permessi di chi guarda e prepara una volta.
  const { data: scheda, error: schedaError } = useQuery({
    queryKey: ["scheda-cliente", id, effectiveCompany?.id],
    enabled: !!id && !!effectiveCompany?.id && !!customer,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("scheda_cliente", { p_customer_id: id, p_company_id: effectiveCompany!.id });
      if (error) throw new Error("Non riesco a leggere commesse, fatture e preventivi del cliente: riprova tra poco.");
      return (data ?? null) as SchedaCliente | null;
    },
  });
  const orders = scheda?.ordini ?? [];
  const anagraficaCollegata = scheda?.anagrafica ?? null;
  const fattureCliente = scheda?.fatture ?? [];
  const preventivi = scheda?.preventivi ?? [];
  const tickets = scheda?.ticket ?? [];
  const rapportini = scheda?.interventi ?? [];
  const appuntamenti = scheda?.appuntamenti ?? [];
  const rate = useMemo(() => rateConResiduo(scheda), [scheda]);
  const daIncassare = useMemo(() => totaleDaIncassare(scheda), [scheda]);
  const erroreScheda = schedaError instanceof Error ? schedaError.message : null;
  const azioni = useMemo(() => azioniSuggerite({ rate, preventivi, tickets }, oggiRoma()), [rate, preventivi, tickets]);

  const { emailConversazioni: emailConversationsForTimeline, messaggi: conversazioniMessaggi, note: diaryMessagesForTimeline } =
    useComunicazioniScheda(id, effectiveCompany?.id, customer?.email);
  const { data: linkedContact } = useContattoCollegato(customer?.marketing_contact_id);

  // ── Computed values ──────────────────────────────────────────────────────────
  const orderCount = orders.length;
  const totalOrderValue = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);

  // ── Name helpers + dataIssues + sanitizeMutation ────────────────────────────
  // IMPORTANTE: questi hooks DEVONO stare sopra i `return` condizionali (loading
  // / not-found) per rispettare le Rules of Hooks di React. Prima erano dopo e
  // causavano "Rendered more hooks than during the previous render" al primo
  // transitorio customer undefined → customer definito.
  const first = (customer?.first_name || "").trim();
  const last = (customer?.last_name || "").trim();
  const biz = (customer?.business_name || "").trim();
  const isFirstPlaceholder = first === "—" || first === "-" || first === "";
  const isLastPlaceholder = last === "—" || last === "-" || last === "";
  const fullName = useMemo(() => {
    if (!customer) return "";
    if (customer.is_business && biz) return biz;
    const f = isFirstPlaceholder ? "" : first;
    const l = isLastPlaceholder ? "" : last;
    const joined = `${f} ${l}`.trim();
    return joined || "(senza nome)";
  }, [customer, biz, first, last, isFirstPlaceholder, isLastPlaceholder]);
  const referentName = useMemo(() => {
    if (!customer?.is_business) return null;
    const f = isFirstPlaceholder ? "" : first;
    const l = isLastPlaceholder ? "" : last;
    const joined = `${f} ${l}`.trim();
    return joined || null;
  }, [customer, first, last, isFirstPlaceholder, isLastPlaceholder]);

  // Detect dati problematici: nome/cognome è un numero, CF o email
  const dataIssues = useMemo(() => {
    const issues: Array<{ field: "first_name" | "last_name"; value: string; kind: string; label: string }> = [];
    if (!customer) return issues;
    if (first && looksLikePhone(first)) {
      issues.push({ field: "first_name", value: first, kind: "phone", label: "Il nome è un numero di telefono" });
    }
    if (last && looksLikePhone(last)) {
      issues.push({ field: "last_name", value: last, kind: "phone", label: "Il cognome è un numero di telefono" });
    }
    if (first && looksLikeFiscalCode(first)) {
      issues.push({ field: "first_name", value: first, kind: "fiscal_code", label: "Il nome è un CF/P.IVA" });
    }
    if (last && looksLikeFiscalCode(last)) {
      issues.push({ field: "last_name", value: last, kind: "fiscal_code", label: "Il cognome è un CF/P.IVA" });
    }
    if (first && looksLikeEmail(first)) {
      issues.push({ field: "first_name", value: first, kind: "email", label: "Il nome è un'email" });
    }
    return issues;
  }, [customer, first, last]);

  const customerId = customer?.id;
  const sanitizeMutation = useMutation({
    mutationFn: async () => {
      if (!customerId) throw new Error("Cliente non disponibile");
      const { data, error } = await supabase.rpc("sanitize_customer_profile" as never, {
        p_customer_id: customerId,
      } as never);
      if (error) throw error;
      return data as unknown as { changed: boolean; fixes: string[]; error?: string };
    },
    onSuccess: (data) => {
      if (data?.error) {
        toast({ title: "Errore", description: data.error, variant: "destructive" });
        return;
      }
      if (!data?.changed) {
        toast({ title: "Nessuna correzione applicata", description: "I dati sono già coerenti." });
        return;
      }
      toast({
        title: "Correzioni applicate",
        description: (data.fixes ?? []).join(" · ") || "Dati del cliente sistemati.",
      });
      if (customerId) {
        queryClient.invalidateQueries({ queryKey: ["company-customer-detail", customerId] });
        queryClient.invalidateQueries({ queryKey: queryKeys.customersList.all });
      }
      refetchCustomer();
    },
    onError: (e) => {
      toast({
        title: "Errore",
        description: e instanceof Error ? e.message : "Impossibile correggere i dati",
        variant: "destructive",
      });
    },
  });

  // ── Loading / not found ──────────────────────────────────────────────────────
  if (isLoading || (customer?.customer_type === "appaltatore" && flagInCaricamento)) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!customer) {
    // 2026-05-26 (audit fix P1): dead-end mobile risolto. Prima il back arrow
    // era `hidden md:inline-flex` → mobile senza modo di tornare alla lista
    // se il cliente non esisteva più. Ora mostro empty state esplicita con
    // CTA visibile su tutti i breakpoint.
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center text-center p-6">
        <div className="rounded-full bg-amber-100 p-4 mb-4">
          <AlertTriangle className="h-8 w-8 text-amber-600" />
        </div>
        <h2 className="text-xl font-semibold text-slate-900">Cliente non trovato</h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-sm">
          Il cliente che cerchi non esiste più, oppure non hai più i permessi per visualizzarlo.
        </p>
        <Button onClick={() => navigate("/azienda/clienti")} className="mt-6 gap-2">
          <ArrowLeft className="h-4 w-4" />
          Torna ai clienti
        </Button>
      </div>
    );
  }

  if (customer.customer_type === "appaltatore" && moduloAppaltatori) {
    return <Navigate to={`/azienda/committenti/${customer.id}`} replace />;
  }

  // 2026-05-26: header restyle ispirato alla pagina Contatti (MarketingContactDetail).
  // Pattern: back arrow + avatar + nome/badge + chip info + bottoni quick action a
  // destra (Chiama / Email / WhatsApp / Appuntamento) + Elimina.
  const customerEmailClean = emailVera(customer.email);
  const customerInitials = (fullName.match(/\b\w/g) ?? []).slice(0, 2).join("").toUpperCase() || "?";
  const waHref = linkWhatsApp(customer.phone);

  // Il sollecito già scritto, da leggere e cambiare prima di mandarlo.
  const apriSollecito = (oggetto: string, testo: string) => {
    const html = testo.split("\n\n").map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`).join("");
    setComposeContext({ mode: "new", initialTo: customerEmailClean ? [customerEmailClean] : undefined, initialSubject: oggetto, initialBodyHtml: html });
    setComposeOpen(true);
  };

  const openCompose = () => {
    setComposeContext({
      mode: "new",
      initialTo: customerEmailClean ? [customerEmailClean] : undefined,
      initialSubject: undefined,
    });
    setComposeOpen(true);
  };

  // 2026-05-27 (richiesta utente: "rendi la pagina cliente coerente con
  // la pagina contatti marketing"): hero stile MarketingContactDetail.
  //  - background bianco/card (non più gradient blue/orange "loud")
  //  - h1 text-xl (non 2xl)
  //  - email button violet (standard marketing), WhatsApp emerald-100
  //  - dropdown "..." per azioni secondarie (Crea ordine/preventivo/
  //    ticket/appuntamento + Elimina) invece di pannello "CREA PER..."
  //  - KPI cards rounded-lg border bg-card (non più pastello pieno)
  //    con header label + icon corner + value + subtext muted
  // Gli stati veri dei ticket (aperto, in_lavorazione, risolto, chiuso…): prima
  // si escludevano «closed» e «resolved», che non esistono, e contavano tutti.
  const TICKET_CHIUSI = new Set(["risolto", "chiuso", "annullato", "preventivo_rifiutato", "closed", "resolved"]);
  const openTickets = tickets.filter((t) => !TICKET_CHIUSI.has(String(t.status ?? ""))).length;
  const PREVENTIVI_IN_ATTESA = new Set(["in_corso", "inviata", "inviato", "visualizzata", "visualizzato", "sent"]);
  const preventiviInAttesa = preventivi.filter((p) => PREVENTIVI_IN_ATTESA.has(String(p.status ?? ""))).length;
  const apri = (tab: string) => setRightTab(tab);

  return (
    <div className="space-y-4">
      {/* ───── Hero header stile MarketingContactDetail ───── */}
      <div className="rounded-2xl border bg-card p-3 md:p-4 shadow-sm">
        <div className="flex items-start gap-3 md:gap-4">
          {/* Mobile: la freccia c'è già nella barra in alto. */}
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 -ml-2 max-md:hidden"
            onClick={() => navigate("/azienda/clienti")}
            aria-label="Torna ai clienti"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-orange-500 text-white text-lg font-bold shadow-sm ring-2 ring-background">
              {customerInitials}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight truncate">
                {fullName}
              </h1>
              {customer.is_business ? (
                <Badge variant="outline" className="text-[10px] h-5 px-1.5">Azienda</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] h-5 px-1.5">Cliente</Badge>
              )}
              {!customer.is_business && isFirstPlaceholder && isLastPlaceholder && !biz && (
                <span className="text-xs font-normal text-muted-foreground">(anagrafica da completare)</span>
              )}
            </div>
            {referentName && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Referente: <span className="font-medium text-foreground">{referentName}</span>
              </p>
            )}

            {/* Chip info inline (stile marketing: gap-3 testo grigio, non pill colorati) */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
              {customerEmailClean && (
                <a href={`mailto:${customerEmailClean}`} className="inline-flex items-center gap-1 hover:text-primary transition-colors truncate">
                  <Mail className="h-3 w-3 shrink-0" />
                  <span className="truncate">{customerEmailClean}</span>
                </a>
              )}
              {customer.phone && (
                <a href={`tel:${customer.phone}`} className="inline-flex items-center gap-1 hover:text-primary transition-colors">
                  <Phone className="h-3 w-3 shrink-0" />
                  {customer.phone}
                </a>
              )}
              {(customer.city || customer.address) && (
                <span className="text-[11px]">
                  📍 {[customer.address, customer.city].filter(Boolean).join(" · ")}
                </span>
              )}
              <DistanceFromBase
                address={customer.address}
                city={customer.city}
                province={customer.province}
                className="text-[11px]"
              />
            </div>
          </div>

          {/* Quick actions (stessi colori marketing) */}
          <div className="hidden md:flex shrink-0 items-center gap-1.5">
            <ChiediASilvio
              ask={`Analizza il cliente ${fullName}: commesse/lavori, fatturato, crediti aperti, preventivi in corso e prossime azioni consigliate. Cosa devo sapere?`}
            />
            <AzioniContattoScheda
              telefono={customer.phone ?? null}
              nome={fullName}
              contactId={customer.marketing_contact_id ?? undefined}
              email={customerEmailClean}
              onEmail={openCompose}
              onAppuntamento={() => setAppointmentDialogOpen(true)}
            />

            <NuovoContrattoClienteDialog aperto={nuovoContratto} onChiudi={() => setNuovoContratto(false)} clienteId={customer.id} nomeCliente={fullName} />
            {/* Dropdown "..." con crea entità + elimina (stile marketing) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Crea per questo cliente
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={() => navigate(`/azienda/ordini/nuovo?customer_id=${customer.id}&customer_name=${encodeURIComponent(fullName)}`)}>
                  <ClipboardList className="h-3.5 w-3.5 mr-2" /> Nuovo ordine
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setNuovoContratto(true)}>
                  <FileSignature className="h-3.5 w-3.5 mr-2" /> Nuovo contratto
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(`/azienda/marketing/preventivi/nuovo?customer_id=${customer.id}&customer_name=${encodeURIComponent(fullName)}`)}>
                  <FileSignature className="h-3.5 w-3.5 mr-2" /> Nuovo preventivo
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(`/azienda/assistenza/nuovo?customer_id=${customer.id}&customer_name=${encodeURIComponent(fullName)}`)}>
                  <Ticket className="h-3.5 w-3.5 mr-2" /> Nuovo ticket
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <VoceEliminaCliente id={customer.id} commesse={orderCount} />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Quick action mobile (sotto l'header) */}
        <AzioniContattoSchedaMobile
          telefono={customer.phone ?? null}
          email={customerEmailClean}
          onEmail={openCompose}
          onAppuntamento={() => setAppointmentDialogOpen(true)}
        />

        {/* KPI strip — desktop grid 4 col, mobile scroll-x compatto stile marketing */}
        {/* MOBILE: 4 chips inline, scroll-x se serve, no subtext (compatto) */}
        <div className="mt-3 md:hidden grid grid-cols-4 gap-1.5">
          <div className="rounded-lg bg-blue-50 border border-blue-100 px-2 py-1.5 text-center">
            <p className="text-[9px] text-blue-700 uppercase font-semibold leading-none">Commesse</p>
            <p className="text-sm font-bold tabular-nums leading-tight text-blue-900 mt-0.5">{orderCount}</p>
          </div>
          <div className={cn("rounded-lg border px-2 py-1.5 text-center", daIncassare?.scaduto ? "bg-red-50 border-red-100" : "bg-emerald-50 border-emerald-100")}>
            <p className={cn("text-[9px] uppercase font-semibold leading-none", daIncassare?.scaduto ? "text-red-700" : "text-emerald-700")}>Da incassare</p>
            <p className={cn("text-sm font-bold tabular-nums leading-tight mt-0.5", daIncassare?.scaduto ? "text-red-900" : "text-emerald-900")}>
              {daIncassare ? (daIncassare.totale >= 1000 ? `${Math.round(daIncassare.totale / 1000)}k` : Math.round(daIncassare.totale)) : "—"}
            </p>
          </div>
          <div className="rounded-lg bg-violet-50 border border-violet-100 px-2 py-1.5 text-center">
            <p className="text-[9px] text-violet-700 uppercase font-semibold leading-none">Preventivi</p>
            <p className="text-sm font-bold tabular-nums leading-tight text-violet-900 mt-0.5">{preventivi.length}</p>
          </div>
          <div className="rounded-lg bg-amber-50 border border-amber-100 px-2 py-1.5 text-center">
            <p className="text-[9px] text-amber-700 uppercase font-semibold leading-none">Assistenza</p>
            <p className="text-sm font-bold tabular-nums leading-tight text-amber-900 mt-0.5">{openTickets}</p>
          </div>
        </div>

        {/* DESKTOP: KPI strip full (border bg-card + icon corner + subtext) */}
        {/* Cinque numeri che dicono come sta il cliente; ognuno apre il suo pannello. */}
        <div className="mt-2 hidden md:grid md:grid-cols-3 xl:grid-cols-5 gap-2">
          <KpiCard
            icon={ShoppingBag}
            iconColor="text-blue-500"
            label="Commesse"
            value={orderCount}
            subtext={orderCount === 0 ? "Nessuna commessa" : `l'ultima del ${new Date(orders[0].created_at).toLocaleDateString("it-IT")}`}
            onClick={() => apri("ordini")}
          />
          <KpiCard
            icon={Euro}
            iconColor="text-emerald-500"
            label="Valore lavori"
            value={euro(totalOrderValue)}
            subtext="IVA esclusa"
            onClick={() => apri("ordini")}
          />
          <KpiCard
            icon={CreditCardIcon}
            iconColor={daIncassare?.scaduto ? "text-red-500" : "text-emerald-500"}
            label="Da incassare"
            value={daIncassare ? euro(daIncassare.totale) : orderCount === 0 ? "—" : "…"}
            subtext={!daIncassare ? "IVA inclusa"
              : daIncassare.totale === 0 ? "Tutto incassato"
              : daIncassare.scaduto > 0 ? `di cui ${euro(daIncassare.scaduto)} scaduti`
              : "IVA inclusa · niente di scaduto"}
            tono={daIncassare?.scaduto ? "rosso" : undefined}
            onClick={() => apri("rate")}
          />
          <KpiCard
            icon={FileText}
            iconColor="text-violet-500"
            label="Preventivi"
            value={preventivi.length}
            subtext={preventivi.length === 0 ? "Nessun preventivo" : preventiviInAttesa > 0 ? `${preventiviInAttesa} in attesa di risposta` : "nessuno in attesa"}
            onClick={() => apri("preventivi")}
          />
          <KpiCard
            icon={LifeBuoy}
            iconColor="text-amber-500"
            label="Assistenza aperta"
            value={openTickets}
            subtext={tickets.length > 0 ? `su ${tickets.length} richieste` : "Nessuna richiesta"}
            onClick={() => apri("assistenza")}
          />
        </div>
        <CosaFareAdesso
          azioni={azioni}
          cliente={fullName}
          azienda={effectiveCompany?.name ?? ""}
          email={customerEmailClean}
          telefono={customer.phone ?? null}
          waHref={waHref}
          onEmail={apriSollecito}
          onApri={apri}
        />
      </div>

      {/* ───── Banner data hygiene ───── */}
      {dataIssues.length > 0 && (
        <Alert variant="default" className="border-amber-400 bg-amber-50/50 dark:bg-amber-900/10">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800 dark:text-amber-300">Anagrafica da correggere</AlertTitle>
          <AlertDescription className="text-amber-800 dark:text-amber-200 space-y-2">
            <ul className="list-disc pl-4 text-xs space-y-0.5">
              {dataIssues.map((iss, i) => (
                <li key={i}>
                  {iss.label}: <code className="px-1 rounded bg-amber-100 dark:bg-amber-900/30 font-mono">{iss.value}</code>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                className="bg-white dark:bg-transparent border-amber-400 text-amber-900 dark:text-amber-200 hover:bg-amber-100"
                onClick={() => sanitizeMutation.mutate()}
                disabled={sanitizeMutation.isPending}
              >
                {sanitizeMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                )}
                Sistema automaticamente
              </Button>
              <p className="text-xs text-amber-700 dark:text-amber-300/80 self-center">
                Oppure usa <Pencil className="h-3 w-3 inline -mt-0.5" /> per modificare a mano.
              </p>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/*
        2026-05-27 (richiesta utente "diario al centro come pagina contatti"):
        layout 3-COLONNE identico a MarketingContactDetail:
          LEFT  (lg:w-72)  → CustomerProfileCard (anagrafica + Titolare + tab)
          CENTER (flex-1)  → CustomerActivityTimeline + CustomerComposeBar
          RIGHT (40px+340)  → icon strip verticale + pannello collassabile
                              che mostra il pannello business della tab cliccata
                              (ordini, preventivi, ecc.) dentro
                              CustomerBusinessTabs con defaultValue forzato

        Su mobile: stack verticale (left sopra, center sotto, right come
        bottom-sheet via dialog futuro — per ora solo center+left).
      */}
      {/*
        2026-05-27 (richiesta utente "ottimizza mobile come pagina contatti"):
        Su mobile la PRIORITÀ è il diario/timeline (cosa fai ora), non
        l'anagrafica (chi è — già nel header). Quindi ordine reverse:
          MOBILE  → CENTER (timeline+compose) → LEFT (anagrafica) → CustomerBusinessTabs
          DESKTOP → LEFT (280px) → CENTER (flex) → RIGHT (icon strip)
        Usato `order-*` CSS per ribaltare l'ordine senza duplicare markup.
        Il min-h timeline è limitato su mobile per evitare scroll infinito.
      */}
      {/* Altezza LIMITATA su desktop (come la scheda contatti): così la timeline
          scrolla dentro il pannello e la barra «scrivi email / WhatsApp» resta
          FISSA in basso invece di finire in coda allo scroll della pagina. */}
      <div className="flex flex-col lg:flex-row gap-3 lg:gap-4 lg:h-[calc(100dvh-18rem)]">
        {/* ─── LEFT 280px (su mobile va dopo center → order-2) ─── */}
        <div className="order-2 lg:order-none lg:w-72 shrink-0 space-y-3">
          <CustomerProfileCard
            customer={customer}
            linkedContact={linkedContact}
            onSaved={() => refetchCustomer()}
          />
          {/* Storico chiamate sincronizzato (centralino + AI) */}
          <ContactCallHistory
            contactId={customer.marketing_contact_id ?? undefined}
            phone={customer.phone}
            name={fullName}
            showActions={false}
          />
        </div>

        {/* ─── CENTER timeline + compose (su mobile è il PRIMO blocco) ─── */}
        <div className="order-1 lg:order-none flex-1 min-w-0 rounded-2xl border bg-card shadow-sm flex flex-col overflow-hidden min-h-[50vh] lg:min-h-0">
          {/* Wrapper flex-1 min-h-0: la timeline (h-full) scrolla qui dentro,
              lasciando il composer fisso in basso (come UnifiedContactTimeline). */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <CustomerActivityTimeline
              customerId={customer.id}
              orders={orders}
              tickets={tickets}
              appuntamenti={appuntamenti}
              fatture={fattureCliente}
              emailConversations={emailConversationsForTimeline as unknown as Parameters<typeof CustomerActivityTimeline>[0]["emailConversations"]}
              diaryMessages={diaryMessagesForTimeline}
              messaggi={conversazioniMessaggi}
              customerCreatedAt={customer.created_at}
            />
          </div>
          <CustomerComposeBar
            customerId={customer.id}
            customerEmail={customerEmailClean}
            customerPhone={customer.phone ?? null}
          />
        </div>

        {/* ─── RIGHT icon strip + panel collassabile ─── */}
        <PannelloLateraleScheda
          attiva={rightTab}
          onCambia={setRightTab}
          sezioni={RIGHT_TABS.map((t) => ({
            ...t,
            conteggio: {
              ordini: orders.length, preventivi: preventivi.length, assistenza: tickets.length,
              interventi: rapportini.length, documenti: fattureCliente.length,
              appuntamenti: appuntamenti.length, rate: rate.length,
            }[t.key] ?? 0,
          }))}
        >
          <CustomerBusinessTabs
            customerId={customer.id}
            companyId={effectiveCompany?.id ?? ""}
            customerFullName={fullName}
            customerEmail={customerEmailClean}
            orders={orders}
            preventivi={preventivi}
            tickets={tickets}
            rapportini={rapportini}
            fatture={fattureCliente}
            appuntamenti={appuntamenti}
            rate={rate}
            anagraficaCollegata={anagraficaCollegata ?? null}
            defaultTab={rightTab ?? undefined}
            onCreateAppointment={() => setAppointmentDialogOpen(true)}
            /* dataWarnings volutamente OMESSO: l'alert apparirebbe duplicato
               per ogni pannello aperto. Resta nella vista mobile sotto. */
          />
        </PannelloLateraleScheda>
      </div>

      {/*
        Su mobile: tabs business in vista full SOTTO (after timeline+sidebar).
        Right panel desktop non disponibile su lg< → su mobile l'utente vede
        comunque tutte le sezioni nel TabsList scrollabile.
      */}
      {schermoStretto && <div className="lg:hidden">
        <CustomerBusinessTabs
          customerId={customer.id}
          companyId={effectiveCompany?.id ?? ""}
          customerFullName={fullName}
          customerEmail={customerEmailClean}
          orders={orders}
          preventivi={preventivi}
          tickets={tickets}
          rapportini={rapportini}
          fatture={fattureCliente}
          appuntamenti={appuntamenti}
          rate={rate}
          anagraficaCollegata={anagraficaCollegata ?? null}
          onCreateAppointment={() => setAppointmentDialogOpen(true)}
          dataWarnings={{
            anagrafica: erroreScheda,
            fatture: erroreScheda,
            preventivi: erroreScheda,
            tickets: erroreScheda,
            rapportini: erroreScheda,
            appuntamenti: erroreScheda,
            rate: erroreScheda,
          }}
        />
      </div>}

      {/* 2026-05-27 (perf): dialog lazy-loaded → Suspense wrapper.
          Renderizzato solo quando open=true grazie alla guard `composeOpen`
          / `appointmentDialogOpen`, così evitiamo il fetch del chunk anche
          al primo click se non serve. */}
      {composeOpen && (
        <Suspense fallback={null}>
          <EmailComposeDialog
            open={composeOpen}
            onOpenChange={setComposeOpen}
            context={composeContext}
            companyIdOverride={effectiveCompany?.id}
          />
        </Suspense>
      )}

      {appointmentDialogOpen && (
        <Suspense fallback={null}>
          <AppointmentDialog
            open={appointmentDialogOpen}
            onOpenChange={setAppointmentDialogOpen}
            defaultTitle={`Appuntamento ${fullName}`}
            defaultOrderId={orders[0]?.id}
            showOrderSelect
            defaultAddress={customer.site_address || customer.address || null}
            defaultCity={customer.site_city || customer.city || null}
            defaultProvince={customer.site_province || customer.province || null}
            onSaved={() => {
              setAppointmentDialogOpen(false);
              queryClient.invalidateQueries({ queryKey: ["scheda-cliente", id, effectiveCompany?.id] });
              queryClient.invalidateQueries({ queryKey: queryKeys.calendarOrders.all });
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
