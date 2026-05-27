import { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Loader2, Mail, Phone, Trash2, Wand2,
  AlertTriangle, Pencil, Euro, ShoppingBag, LifeBuoy,
  FileText, CalendarDays, MessageSquare, ChevronDown, Plus,
  ClipboardList, FileSignature, Ticket,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { EmailComposeDialog, type ComposeContext } from "@/pages/azienda/email/components/EmailComposeDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/utils/logger";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { looksLikePhone, looksLikeFiscalCode, looksLikeEmail } from "@/lib/customerDataSanitizer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { CustomerProfileCard } from "@/components/clients/CustomerProfileCard";
import { CustomerDiaryPanel } from "@/components/clients/CustomerDiaryPanel";
import { queryKeys } from "@/lib/queryKeys";
import {
  CustomerBusinessTabs,
  type OrderRow,
  type PreventivoRow,
  type TicketRow,
  type RapportinoRow,
  type FatturaRow,
  type AppuntamentoRow,
  type RataRow,
} from "@/components/clients/CustomerBusinessTabs";

interface CustomerProfile {
  id: string;
  first_name: string | null;
  last_name: string;
  email: string;
  phone: string | null;
  address: string | null;
  fiscal_code: string | null;
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
}

const INTERNAL_NO_EMAIL_DOMAIN = "@no-email.ediliziaincloud.local";

function formatCustomerEmail(email: string | null | undefined): string | null {
  const value = (email ?? "").trim();
  if (!value || value.endsWith(INTERNAL_NO_EMAIL_DOMAIN)) return null;
  return value;
}

export default function CompanyCustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);
  // 2026-05-26: compose email dialog integrato (richiesta utente "vorrei che
  // potessi inviare email anche da qui"). Apre con destinatario pre-popolato
  // a customer.email.
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeContext, setComposeContext] = useState<ComposeContext>({ mode: "new" });

  // ── Core customer data ──────────────────────────────────────────────────────
  const { data: customer, isLoading, refetch: refetchCustomer } = useQuery({
    queryKey: ["company-customer-detail", id, effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) throw new Error("Azienda non trovata");
      const query = supabase
        .from("profiles")
        .select("id, first_name, last_name, email, phone, address, fiscal_code, site_address, notes, company_id, created_at, salesperson_id, is_business, business_name, city, postal_code, province, country, site_city, site_postal_code, site_province")
        .eq("id", id!)
        .eq("company_id", effectiveCompany.id);
      const { data, error } = await query.single();
      if (error) throw error;
      return data as unknown as CustomerProfile;
    },
    enabled: !!id && !!effectiveCompany?.id,
  });

  // ── Orders ──────────────────────────────────────────────────────────────────
  const { data: orders = [] } = useQuery({
    queryKey: ["customer-orders-history", id, effectiveCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_code, description, total_amount, created_at, current_status_id, order_statuses:current_status_id(name, color)")
        .eq("customer_id", id!)
        .eq("company_id", effectiveCompany?.id ?? "")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OrderRow[];
    },
    enabled: !!id && !!effectiveCompany?.id,
  });

  // ── Anagrafica fiscale collegata ────────────────────────────────────────────
  const { data: anagraficaCollegata, error: anagraficaError } = useQuery({
    queryKey: ["anagrafica-by-cliente", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("anagrafiche_native" as never)
        .select("id, ragione_sociale, partita_iva")
        .eq("cliente_id", id!)
        .maybeSingle();
      if (error) throw new Error("Impossibile verificare l'anagrafica fiscale collegata.");
      return data as { id: string; ragione_sociale: string | null; partita_iva: string | null } | null;
    },
    enabled: !!id,
  });

  // ── Fatture ─────────────────────────────────────────────────────────────────
  const { data: fattureCliente = [], error: fattureError } = useQuery({
    queryKey: ["fatture-cliente", id, anagraficaCollegata?.id],
    enabled: !!anagraficaCollegata?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documenti_fiscali" as never)
        .select("id, tipo, numero, data_emissione, stato, totale_documento")
        .eq("anagrafica_id", anagraficaCollegata?.id ?? "")
        .is("deleted_at", null)
        .order("data_emissione", { ascending: false })
        .limit(20);
      if (error) throw new Error("Impossibile caricare i documenti fiscali del cliente.");
      return (data ?? []) as unknown as FatturaRow[];
    },
  });

  // ── Preventivi ──────────────────────────────────────────────────────────────
  // quotes.contact_id punta a marketing_contacts.id; quando manca quel link
  // usiamo l'email reale del cliente come fallback operativo.
  const customerEmailForLinks = formatCustomerEmail(customer?.email);
  const { data: preventivi = [], error: preventiviError } = useQuery({
    queryKey: ["customer-preventivi", id, effectiveCompany?.id, customer?.marketing_contact_id, customerEmailForLinks],
    queryFn: async () => {
      try {
        let query = supabase
          .from("quotes")
          .select("id, quote_number, title, total, status, created_at")
          .eq("company_id", effectiveCompany!.id)
          .order("created_at", { ascending: false });

        if (customer?.marketing_contact_id) {
          query = query.eq("contact_id", customer.marketing_contact_id);
        } else if (customerEmailForLinks) {
          query = query.eq("client_email", customerEmailForLinks);
        } else {
          return [];
        }

        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []) as PreventivoRow[];
      } catch {
        throw new Error("Impossibile caricare i preventivi collegati al cliente.");
      }
    },
    enabled: !!id && !!effectiveCompany?.id && (!!customer?.marketing_contact_id || !!customerEmailForLinks),
  });

  // ── Tickets ─────────────────────────────────────────────────────────────────
  // 2026-05-27 (audit dettaglio cliente): soft-fail su errori di permessi/schema.
  // Definito qui per evitare hoisting issues con useQuery sopra.
  const isSoftTableError = (e: unknown): boolean => {
    const code = (e as { code?: string })?.code;
    return code === "42P01" || code === "42501" || code === "PGRST116" || code === "PGRST301";
  };

  const { data: tickets = [], error: ticketsError } = useQuery({
    queryKey: ["customer-tickets", id, effectiveCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("id, title, status, created_at, priority")
        .eq("customer_id", id!)
        .eq("company_id", effectiveCompany!.id)
        .order("created_at", { ascending: false });
      if (error) {
        if (isSoftTableError(error)) {
          logger.warn("[customer] tickets soft-error:", error);
          return [] as TicketRow[];
        }
        throw new Error("Impossibile caricare le richieste di assistenza del cliente.");
      }
      return (data ?? []) as TicketRow[];
    },
    enabled: !!id && !!effectiveCompany?.id,
  });

  const openTicketsCount = tickets.filter(
    (t) => t.status !== "closed" && t.status !== "resolved",
  ).length;

  // ── Rapportini Intervento ────────────────────────────────────────────────────
  // FIX 2026-05-09: rapportini_intervento NON ha customer_id (vedi migration
  // 20260809000001_interventi.sql) — la relazione passa via tickets.customer_id.
  // La vecchia query `.eq("customer_id", id)` ritornava SEMPRE vuoto (colonna
  // inesistente, nessun errore lato Supabase REST). Bug silente da audit.
  const { data: rapportini = [], error: rapportiniError } = useQuery({
    queryKey: ["customer-rapportini", id, effectiveCompany?.id],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("rapportini_intervento" as never)
          .select("id, created_at, descrizione, note, tickets!inner(customer_id)")
          .eq("tickets.customer_id", id!)
          .eq("company_id", effectiveCompany!.id)
          .order("created_at", { ascending: false })
          .limit(20);
        if (error) throw error;
        // Stripping del nested ticket per matchare RapportinoRow shape
        return ((data ?? []) as unknown as Array<RapportinoRow & { tickets?: unknown }>)
          .map(({ tickets: _t, ...rest }) => rest);
      } catch {
        throw new Error("Impossibile caricare i rapportini/interventi collegati al cliente.");
      }
    },
    enabled: !!id && !!effectiveCompany?.id,
  });

  // ── Appuntamenti ─────────────────────────────────────────────────────────────
  // 2026-05-27 (audit dettaglio cliente): soft-fail.
  // PRIMA: try/catch → throw "Impossibile caricare..." su QUALSIASI errore
  // (RLS pending, tabella non disponibile per il ruolo, schema mismatch).
  // Risultato: alert giallo permanente anche quando il cliente semplicemente
  // non ha appuntamenti.
  // ORA: errori di tabella mancante (42P01) o accesso negato (42501) →
  // empty array silenzioso + log dev. Solo errori veri (network, 500)
  // popolano dataWarnings.
  const { data: appuntamenti = [], error: appuntamentiError } = useQuery({
    queryKey: ["customer-appuntamenti", id, effectiveCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments" as never)
        .select("id, title, start_at, end_at, status")
        .eq("customer_id", id!)
        .eq("company_id", effectiveCompany!.id)
        .order("start_at", { ascending: false })
        .limit(20);
      if (error) {
        if (isSoftTableError(error)) {
          logger.warn("[customer] appointments soft-error:", error);
          return [] as AppuntamentoRow[];
        }
        throw new Error("Impossibile caricare gli appuntamenti collegati al cliente.");
      }
      return (data ?? []) as unknown as AppuntamentoRow[];
    },
    enabled: !!id && !!effectiveCompany?.id,
  });

  // ── Rate / Scadenzario ───────────────────────────────────────────────────────
  const orderIds = orders.map((o) => o.id);
  const { data: rate = [], error: rateError } = useQuery({
    queryKey: ["customer-rate", id, orderIds],
    queryFn: async () => {
      if (orderIds.length === 0) return [];
      const { data, error } = await supabase
        .from("order_installments" as never)
        .select("id, amount, due_date, paid_at, order_id")
        .in("order_id", orderIds)
        .order("due_date", { ascending: true });
      if (error) {
        if (isSoftTableError(error)) {
          logger.warn("[customer] order_installments soft-error:", error);
          return [] as RataRow[];
        }
        throw new Error("Impossibile caricare rate e scadenze collegate al cliente.");
      }
      return (data ?? []) as unknown as RataRow[];
    },
    enabled: orderIds.length > 0,
  });

  // ── Contatto marketing collegato ─────────────────────────────────────────────
  const { data: linkedContact } = useQuery({
    queryKey: ["linked-marketing-contact", customer?.marketing_contact_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name, source, lead_score, contact_type, created_at, attr_campaign, tags")
        .eq("id", customer!.marketing_contact_id!)
        .single();
      return data;
    },
    enabled: !!customer?.marketing_contact_id,
    staleTime: 5 * 60 * 1000,
  });

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

  // ── Delete ───────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (orderCount > 0) {
      toast({
        title: "Impossibile eliminare",
        description: `Il cliente ha ${orderCount} ${orderCount === 1 ? "ordine associato" : "ordini associati"}. Elimina prima gli ordini.`,
        variant: "destructive",
      });
      return;
    }

    setIsDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("delete-company-user", {
        body: { userId: id },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (res.error) {
        let body: { error?: string } | null = null;
        try {
          const ctx = (res.error as { context?: unknown }).context;
          if (ctx instanceof Response) body = await ctx.json();
        } catch {
          body = null;
        }
        throw new Error(body?.error || res.error.message || "Errore eliminazione");
      }
      if (res.data?.error) throw new Error(res.data.error);

      queryClient.invalidateQueries({ queryKey: queryKeys.customersList.all });
      toast({ title: "Cliente eliminato", description: "Il cliente è stato eliminato con successo." });
      navigate("/azienda/clienti");
    } catch (error: unknown) {
      logger.error("Error deleting customer:", error);
      const message = error instanceof Error ? error.message : "Impossibile eliminare il cliente.";
      toast({ title: "Errore", description: message, variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  // ── Loading / not found ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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

  // 2026-05-26: header restyle ispirato alla pagina Contatti (MarketingContactDetail).
  // Pattern: back arrow + avatar + nome/badge + chip info + bottoni quick action a
  // destra (Chiama / Email / WhatsApp / Appuntamento) + Elimina.
  const customerEmailClean = formatCustomerEmail(customer.email);
  const customerInitials = (fullName.match(/\b\w/g) ?? []).slice(0, 2).join("").toUpperCase() || "?";
  const cleanPhoneForWa = (customer.phone ?? "").replace(/\D/g, "");
  const waHref = cleanPhoneForWa
    ? `https://wa.me/${cleanPhoneForWa.startsWith("39") || cleanPhoneForWa.length > 10 ? cleanPhoneForWa : `39${cleanPhoneForWa}`}`
    : null;

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
  const openTickets = tickets.filter((t) => t.status !== "closed" && t.status !== "resolved").length;

  return (
    <div className="space-y-6">
      {/* ───── Hero header stile MarketingContactDetail ───── */}
      <div className="rounded-2xl border bg-card p-4 md:p-5 shadow-sm">
        <div className="flex items-start gap-3 md:gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 -ml-2"
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
            </div>
          </div>

          {/* Quick actions (stessi colori marketing) */}
          <div className="hidden md:flex shrink-0 items-center gap-1.5">
            {customer.phone && (
              <Button asChild variant="outline" size="sm" className="gap-1.5 h-9 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                <a href={`tel:${customer.phone}`}><Phone className="h-3.5 w-3.5" /> Chiama</a>
              </Button>
            )}
            {customerEmailClean && (
              <Button
                variant="outline" size="sm"
                className="gap-1.5 h-9 border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"
                onClick={openCompose}
              >
                <Mail className="h-3.5 w-3.5" /> Email
              </Button>
            )}
            {waHref && (
              <Button asChild variant="outline" size="sm" className="gap-1.5 h-9 border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-200">
                <a href={waHref} target="_blank" rel="noopener noreferrer">
                  <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
                </a>
              </Button>
            )}
            <Button
              variant="outline" size="sm" className="gap-1.5 h-9"
              onClick={() => navigate(`/azienda/calendario?customer_id=${customer.id}`)}
            >
              <CalendarDays className="h-3.5 w-3.5" /> Appuntam.
            </Button>

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
                <DropdownMenuItem onClick={() => navigate(`/azienda/marketing/preventivi/nuovo?customer_id=${customer.id}&customer_name=${encodeURIComponent(fullName)}`)}>
                  <FileSignature className="h-3.5 w-3.5 mr-2" /> Nuovo preventivo
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(`/azienda/assistenza/nuovo?customer_id=${customer.id}&customer_name=${encodeURIComponent(fullName)}`)}>
                  <Ticket className="h-3.5 w-3.5 mr-2" /> Nuovo ticket
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem
                      onSelect={(e) => e.preventDefault()}
                      disabled={isDeleting}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Elimina cliente
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Eliminare questo cliente?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {orderCount > 0
                          ? `Impossibile eliminare: il cliente ha ${orderCount} ${orderCount === 1 ? "ordine associato" : "ordini associati"}. Elimina prima gli ordini.`
                          : "Questa azione è irreversibile. Il cliente e il suo account verranno eliminati permanentemente."}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annulla</AlertDialogCancel>
                      {orderCount === 0 && (
                        <AlertDialogAction
                          onClick={handleDelete}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                          Elimina
                        </AlertDialogAction>
                      )}
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Quick action mobile (sotto l'header) */}
        <div className="mt-3 flex md:hidden flex-wrap gap-1.5">
          {customer.phone && (
            <Button asChild variant="outline" size="sm" className="flex-1 min-w-[80px] gap-1.5 border-emerald-200 bg-emerald-50 text-emerald-700">
              <a href={`tel:${customer.phone}`}><Phone className="h-3.5 w-3.5" /> Chiama</a>
            </Button>
          )}
          {customerEmailClean && (
            <Button
              variant="outline" size="sm"
              className="flex-1 min-w-[80px] gap-1.5 border-violet-200 bg-violet-50 text-violet-700"
              onClick={openCompose}
            >
              <Mail className="h-3.5 w-3.5" /> Email
            </Button>
          )}
          {waHref && (
            <Button asChild variant="outline" size="sm" className="flex-1 min-w-[80px] gap-1.5 border-emerald-300 bg-emerald-100 text-emerald-800">
              <a href={waHref} target="_blank" rel="noopener noreferrer">
                <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
              </a>
            </Button>
          )}
          <Button
            variant="outline" size="sm" className="flex-1 min-w-[80px] gap-1.5"
            onClick={() => navigate(`/azienda/calendario?customer_id=${customer.id}`)}
          >
            <CalendarDays className="h-3.5 w-3.5" /> Appuntam.
          </Button>
        </div>

        {/* KPI strip — stile marketing (border bg-card + icon corner + subtext) */}
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
          <KpiCard
            icon={ShoppingBag}
            iconColor="text-blue-500"
            label="Ordini"
            value={orderCount}
            subtext={orderCount === 0 ? "Nessuna commessa" : orderCount === 1 ? "1 commessa attiva" : `${orderCount} commesse totali`}
          />
          <KpiCard
            icon={Euro}
            iconColor="text-emerald-500"
            label="Valore totale"
            value={`€ ${totalOrderValue.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
            subtext="in ordini"
          />
          <KpiCard
            icon={LifeBuoy}
            iconColor="text-amber-500"
            label="Ticket aperti"
            value={openTickets}
            subtext={tickets.length > 0 ? `su ${tickets.length} totali` : "Nessuna richiesta"}
          />
          <KpiCard
            icon={FileText}
            iconColor="text-violet-500"
            label="Preventivi"
            value={preventivi.length}
            subtext={preventivi.length === 0 ? "Nessun preventivo" : "totali"}
          />
        </div>
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

      {/* 2-column CRM layout: 2/5 left + 3/5 right */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* LEFT COLUMN — 2/5 */}
        <div className="lg:col-span-2 space-y-4">
          <CustomerProfileCard
            customer={customer}
            linkedContact={linkedContact}
            onSaved={() => refetchCustomer()}
          />
          <CustomerDiaryPanel
            customerId={customer.id}
            customerName={fullName}
            customerEmail={formatCustomerEmail(customer.email)}
          />
        </div>

        {/* RIGHT COLUMN — 3/5 */}
        <div className="lg:col-span-3">
          <CustomerBusinessTabs
            customerId={customer.id}
            companyId={effectiveCompany?.id ?? ""}
            customerFullName={fullName}
            customerEmail={formatCustomerEmail(customer.email)}
            orders={orders}
            preventivi={preventivi}
            tickets={tickets}
            rapportini={rapportini}
            fatture={fattureCliente}
            appuntamenti={appuntamenti}
            rate={rate}
            anagraficaCollegata={anagraficaCollegata ?? null}
            totalOrderValue={totalOrderValue}
            openTicketsCount={openTicketsCount}
            dataWarnings={{
              anagrafica: anagraficaError instanceof Error ? anagraficaError.message : null,
              fatture: fattureError instanceof Error ? fattureError.message : null,
              preventivi: preventiviError instanceof Error ? preventiviError.message : null,
              tickets: ticketsError instanceof Error ? ticketsError.message : null,
              rapportini: rapportiniError instanceof Error ? rapportiniError.message : null,
              appuntamenti: appuntamentiError instanceof Error ? appuntamentiError.message : null,
              rate: rateError instanceof Error ? rateError.message : null,
            }}
          />
        </div>
      </div>

      {/* Email compose dialog — apre con destinatario pre-popolato */}
      <EmailComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        context={composeContext}
        companyIdOverride={effectiveCompany?.id}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// KpiCard — stile MarketingContactDetail (border bg-card + icon corner + subtext)
// 2026-05-27: refactor signature per matchare visivamente la pagina contatti.
// ───────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  iconColor,
  label,
  value,
  subtext,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  label: string;
  value: number | string;
  subtext?: string;
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold truncate">
          {label}
        </span>
        <Icon className={`h-3 w-3 ${iconColor ?? "text-muted-foreground"}`} />
      </div>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className="text-xl font-bold tabular-nums truncate">{value}</span>
      </div>
      {subtext && (
        <p className="text-[10px] text-muted-foreground mt-1 truncate">{subtext}</p>
      )}
    </div>
  );
}
