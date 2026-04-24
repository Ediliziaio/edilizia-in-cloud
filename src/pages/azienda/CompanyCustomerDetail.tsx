import { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Mail, Phone, MapPin, ClipboardList, Trash2, Wand2, AlertTriangle, Pencil } from "lucide-react";
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

export default function CompanyCustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);

  // ── Core customer data ──────────────────────────────────────────────────────
  const { data: customer, isLoading, refetch: refetchCustomer } = useQuery({
    queryKey: ["company-customer-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, phone, address, fiscal_code, site_address, notes, company_id, created_at, salesperson_id, is_business, business_name, city, postal_code, province, country, site_city, site_postal_code, site_province")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as unknown as CustomerProfile;
    },
    enabled: !!id,
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
  const { data: anagraficaCollegata } = useQuery({
    queryKey: ["anagrafica-by-cliente", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("anagrafiche_native" as never)
        .select("id, ragione_sociale, partita_iva")
        .eq("cliente_id", id!)
        .maybeSingle();
      return data as { id: string; ragione_sociale: string | null; partita_iva: string | null } | null;
    },
    enabled: !!id,
  });

  // ── Fatture ─────────────────────────────────────────────────────────────────
  const { data: fattureCliente = [] } = useQuery({
    queryKey: ["fatture-cliente", id, anagraficaCollegata?.id],
    enabled: !!anagraficaCollegata?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("documenti_fiscali" as never)
        .select("id, tipo, numero, data_emissione, stato, totale_documento")
        .eq("anagrafica_id", anagraficaCollegata?.id ?? "")
        .is("deleted_at", null)
        .order("data_emissione", { ascending: false })
        .limit(20);
      return (data ?? []) as unknown as FatturaRow[];
    },
  });

  // ── Preventivi ──────────────────────────────────────────────────────────────
  // NOTA: quotes.contact_id punta a marketing_contacts.id — il link arriva con Sprint 2.
  // Ritorna [] finché il link non esiste.
  const { data: preventivi = [] } = useQuery({
    queryKey: ["customer-preventivi", id, effectiveCompany?.id],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("quotes")
          .select("id, quote_number, title, total, status, created_at")
          .eq("contact_id", id!)
          .eq("company_id", effectiveCompany!.id)
          .order("created_at", { ascending: false });
        if (error) return [];
        return (data ?? []) as PreventivoRow[];
      } catch {
        return [];
      }
    },
    enabled: !!id && !!effectiveCompany?.id,
  });

  // ── Tickets ─────────────────────────────────────────────────────────────────
  const { data: tickets = [] } = useQuery({
    queryKey: ["customer-tickets", id, effectiveCompany?.id],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("tickets")
          .select("id, title, status, created_at, priority")
          .eq("customer_id", id!)
          .eq("company_id", effectiveCompany!.id)
          .order("created_at", { ascending: false });
        if (error) return [];
        return (data ?? []) as TicketRow[];
      } catch {
        return [];
      }
    },
    enabled: !!id && !!effectiveCompany?.id,
  });

  const openTicketsCount = tickets.filter(
    (t) => t.status !== "closed" && t.status !== "resolved",
  ).length;

  // ── Rapportini Intervento ────────────────────────────────────────────────────
  // TODO: verificare il nome corretto della colonna customer_id in rapportini_intervento
  const { data: rapportini = [] } = useQuery({
    queryKey: ["customer-rapportini", id, effectiveCompany?.id],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("rapportini_intervento" as never)
          .select("id, created_at, tipo_intervento, note")
          .eq("customer_id", id!)
          .eq("company_id", effectiveCompany!.id)
          .order("created_at", { ascending: false })
          .limit(20);
        if (error) return [];
        return (data ?? []) as unknown as RapportinoRow[];
      } catch {
        return [];
      }
    },
    enabled: !!id && !!effectiveCompany?.id,
  });

  // ── Appuntamenti ─────────────────────────────────────────────────────────────
  const { data: appuntamenti = [] } = useQuery({
    queryKey: ["customer-appuntamenti", id, effectiveCompany?.id],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("appointments" as never)
          .select("id, title, start_at, end_at, status")
          .eq("customer_id", id!)
          .eq("company_id", effectiveCompany!.id)
          .order("start_at", { ascending: false })
          .limit(20);
        if (error) return [];
        return (data ?? []) as unknown as AppuntamentoRow[];
      } catch {
        return [];
      }
    },
    enabled: !!id && !!effectiveCompany?.id,
  });

  // ── Rate / Scadenzario ───────────────────────────────────────────────────────
  const orderIds = orders.map((o) => o.id);
  const { data: rate = [] } = useQuery({
    queryKey: ["customer-rate", id, orderIds],
    queryFn: async () => {
      if (orderIds.length === 0) return [];
      try {
        const { data, error } = await supabase
          .from("order_installments" as never)
          .select("id, amount, due_date, paid_at, order_id")
          .in("order_id", orderIds)
          .order("due_date", { ascending: true });
        if (error) return [];
        return (data ?? []) as unknown as RataRow[];
      } catch {
        return [];
      }
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

      queryClient.invalidateQueries({ queryKey: ["customers-list"] });
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
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <p className="text-muted-foreground">Cliente non trovato.</p>
      </div>
    );
  }

  // Name helpers — aware di is_business (ragione sociale) e placeholder "—"
  const first = (customer.first_name || "").trim();
  const last = (customer.last_name || "").trim();
  const biz = (customer.business_name || "").trim();
  const isFirstPlaceholder = first === "—" || first === "-" || first === "";
  const isLastPlaceholder = last === "—" || last === "-" || last === "";
  const fullName = useMemo(() => {
    if (customer.is_business && biz) return biz;
    const f = isFirstPlaceholder ? "" : first;
    const l = isLastPlaceholder ? "" : last;
    const joined = `${f} ${l}`.trim();
    return joined || "(senza nome)";
  }, [customer.is_business, biz, first, last, isFirstPlaceholder, isLastPlaceholder]);
  const referentName = useMemo(() => {
    if (!customer.is_business) return null;
    const f = isFirstPlaceholder ? "" : first;
    const l = isLastPlaceholder ? "" : last;
    const joined = `${f} ${l}`.trim();
    return joined || null;
  }, [customer.is_business, first, last, isFirstPlaceholder, isLastPlaceholder]);

  // Detect dati problematici: nome/cognome è un numero, CF o email
  const dataIssues = useMemo(() => {
    const issues: Array<{ field: "first_name" | "last_name"; value: string; kind: string; label: string }> = [];
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
  }, [first, last]);

  // Mutation per il fix rapido via RPC
  const sanitizeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("sanitize_customer_profile" as never, {
        p_customer_id: customer.id,
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
      queryClient.invalidateQueries({ queryKey: ["company-customer-detail", customer.id] });
      queryClient.invalidateQueries({ queryKey: ["customers-list"] });
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="hidden md:inline-flex shrink-0"
          onClick={() => navigate("/azienda/clienti")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">
              {fullName}
              {!customer.is_business && isFirstPlaceholder && isLastPlaceholder && !biz && (
                <span className="text-xs font-normal text-muted-foreground ml-2">(anagrafica da completare)</span>
              )}
            </h1>
            {customer.is_business && (
              <Badge variant="secondary" className="gap-1 bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300">
                Azienda
              </Badge>
            )}
            <Badge variant="secondary" className="gap-1">
              <ClipboardList className="h-3 w-3" />
              {orderCount} {orderCount === 1 ? "ordine" : "ordini"}
            </Badge>
          </div>
          {referentName && (
            <p className="text-xs text-muted-foreground mt-1">
              Referente: <span className="font-medium text-foreground">{referentName}</span>
            </p>
          )}

          {/* Chip cliccabili email / telefono / indirizzo */}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {customer.email && (
              <a
                href={`mailto:${customer.email}`}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-xs text-muted-foreground hover:bg-muted/70 transition-colors"
              >
                <Mail className="h-3 w-3" />
                {customer.email}
              </a>
            )}
            {customer.phone && (
              <a
                href={`tel:${customer.phone}`}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-xs text-muted-foreground hover:bg-muted/70 transition-colors"
              >
                <Phone className="h-3 w-3" />
                {customer.phone}
              </a>
            )}
            {customer.address && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {customer.address}
              </span>
            )}
          </div>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" disabled={isDeleting} className="shrink-0">
              <Trash2 className="h-4 w-4 mr-2" />
              Elimina
            </Button>
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
            customerEmail={customer.email}
          />
        </div>

        {/* RIGHT COLUMN — 3/5 */}
        <div className="lg:col-span-3">
          <CustomerBusinessTabs
            customerId={customer.id}
            companyId={effectiveCompany?.id ?? ""}
            customerFullName={fullName}
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
          />
        </div>
      </div>
    </div>
  );
}
