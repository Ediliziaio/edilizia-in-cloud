import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Building2,
  ArrowLeft,
  Loader2,
  Eye,
  EyeOff,
  Copy,
  ListChecks,
  Receipt,
  MapPin,
  UserCog,
  HandCoins,
  CreditCard,
  Info,
  Mail,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampoIndirizzo } from "@/components/shared/CampoIndirizzo";
import { riempiCampi } from "@/lib/indirizzi/ricercaIndirizzi";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getOrderStatusTemplate } from "@/lib/orderStatusTemplates";
import { sectors } from "@/lib/companyUtils";
import type { CompanySector } from "@/types/auth";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { cn } from "@/lib/utils";
import { testoGrezzoErrore } from "@/lib/messaggioErrore";

/* -------------------------------------------------------------------------- */
/*  Schema                                                                    */
/* -------------------------------------------------------------------------- */

const PROVINCE_REGEX = /^[A-Z]{2}$/;
const POSTAL_CODE_REGEX = /^\d{5}$/;
const VAT_REGEX = /^[A-Z]{0,2}\d{11}$/i;

const formSchema = z.object({
  // Azienda
  companyName: z.string().min(2, "Il nome deve avere almeno 2 caratteri"),
  companyEmail: z.string().email("Email non valida"),
  sector: z.enum([
    "serramenti",
    "infissi",
    "bagni",
    "tetti",
    "fotovoltaico",
    "pittura",
    "ristrutturazioni",
    "altro",
  ]),

  // Admin (richiesto)
  adminEmail: z.string().email("Email non valida"),
  adminFirstName: z.string().min(2, "Il nome deve avere almeno 2 caratteri"),
  adminLastName: z.string().min(2, "Il cognome deve avere almeno 2 caratteri"),

  // Dati fiscali (opzionali)
  businessName: z.string().optional().or(z.literal("")),
  vatNumber: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || VAT_REGEX.test(v.replace(/\s/g, "")), {
      message: "P. IVA non valida (11 cifre, eventuale prefisso ISO)",
    }),
  fiscalCode: z.string().optional().or(z.literal("")),
  pec: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || z.string().email().safeParse(v).success, {
      message: "PEC non valida",
    }),
  sdiCode: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  website: z.string().optional().or(z.literal("")),

  // Sede legale
  legalAddress: z.string().optional().or(z.literal("")),
  legalCity: z.string().optional().or(z.literal("")),
  legalProvince: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || PROVINCE_REGEX.test(v), {
      message: "Sigla provincia (es. MI)",
    }),
  legalPostalCode: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || POSTAL_CODE_REGEX.test(v), { message: "CAP non valido" }),

  // Sede operativa
  operationalAddress: z.string().optional().or(z.literal("")),
  operationalCity: z.string().optional().or(z.literal("")),
  operationalProvince: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || PROVINCE_REGEX.test(v), {
      message: "Sigla provincia (es. MI)",
    }),
  operationalPostalCode: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || POSTAL_CODE_REGEX.test(v), { message: "CAP non valido" }),
});

type FormData = z.infer<typeof formSchema>;

interface AdminCredentials {
  email: string;
  password: string;
  welcomeEmailStatus: "sent" | "skipped" | "failed";
}

const welcomeEmailMessages: Record<AdminCredentials["welcomeEmailStatus"], string> = {
  sent: "Email di benvenuto inviata all’amministratore.",
  skipped: "Invio dell’email di benvenuto disattivato. Puoi comunicare tu le credenziali.",
  failed: "Invio dell’email di benvenuto non riuscito. Puoi comunicare tu le credenziali.",
};

export default function CreateCompany() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { permissions: saPermissions } = useSuperAdminPermissions();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sameAsLegal, setSameAsLegal] = useState(false);
  const [inviaBenvenuto, setInviaBenvenuto] = useState(true);
  const [createdAdmin, setCreatedAdmin] = useState<(AdminCredentials & { companyName: string }) | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [selectedReferrerId, setSelectedReferrerId] = useState<string>("none");
  const [selectedPlanId, setSelectedPlanId] = useState<string>("none");

  // ── Data: referrers attivi ───────────────────────────────────────────────
  const { data: referrers = [] } = useQuery({
    queryKey: queryKeys.admin.referrersActive,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referrers")
        .select("id, name, referral_code")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: saPermissions.can_manage_companies,
  });

  // ── Data: piani attivi ───────────────────────────────────────────────────
  const { data: plans = [] } = useQuery({
    queryKey: ["admin-subscription-plans-active"],
    queryFn: async () => {
      // Solo piani globali (no piani ad hoc dei produttori). produttore_id non nei tipi → cast.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("subscription_plans")
        .select("id, name, slug, trial_days, price_monthly")
        .eq("is_active", true)
        .is("produttore_id", null)
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
    enabled: saPermissions.can_manage_companies,
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    defaultValues: {
      companyName: "",
      companyEmail: "",
      adminEmail: "",
      adminFirstName: "",
      adminLastName: "",
      sector: "altro",
      businessName: "",
      vatNumber: "",
      fiscalCode: "",
      pec: "",
      sdiCode: "",
      phone: "",
      website: "",
      legalAddress: "",
      legalCity: "",
      legalProvince: "",
      legalPostalCode: "",
      operationalAddress: "",
      operationalCity: "",
      operationalProvince: "",
      operationalPostalCode: "",
    },
  });

  const watchedSector = form.watch("sector");
  const statusTemplate = useMemo(
    () => (watchedSector ? getOrderStatusTemplate(watchedSector as CompanySector) : []),
    [watchedSector],
  );

  // ── Sync sede operativa quando "uguale alla sede legale" è attivo ───────
  // Watch legali per ricopiare in tempo reale (no più "solo on submit").
  const legalAddress = form.watch("legalAddress");
  const legalCity = form.watch("legalCity");
  const legalProvince = form.watch("legalProvince");
  const legalPostalCode = form.watch("legalPostalCode");

  useEffect(() => {
    if (!sameAsLegal) return;
    form.setValue("operationalAddress", legalAddress ?? "", { shouldValidate: false });
    form.setValue("operationalCity", legalCity ?? "", { shouldValidate: false });
    form.setValue("operationalProvince", legalProvince ?? "", { shouldValidate: false });
    form.setValue("operationalPostalCode", legalPostalCode ?? "", { shouldValidate: false });
  }, [sameAsLegal, legalAddress, legalCity, legalProvince, legalPostalCode, form]);

  if (!saPermissions.can_manage_companies) return <AccessDenied />;

  // ── Submit ───────────────────────────────────────────────────────────────
  async function onSubmit(data: FormData) {
    setIsSubmitting(true);
    try {
      const planIdToSend = selectedPlanId && selectedPlanId !== "none" ? selectedPlanId : null;

      const body: Record<string, unknown> = {
        companyName: data.companyName.trim(),
        companyEmail: data.companyEmail.trim().toLowerCase(),
        adminEmail: data.adminEmail.trim().toLowerCase(),
        adminFirstName: data.adminFirstName.trim(),
        adminLastName: data.adminLastName.trim(),
        sector: data.sector,
        businessName: data.businessName?.trim() || null,
        vatNumber: data.vatNumber?.replace(/\s/g, "").toUpperCase() || null,
        fiscalCode: data.fiscalCode?.trim().toUpperCase() || null,
        pec: data.pec?.trim().toLowerCase() || null,
        sdiCode: data.sdiCode?.trim().toUpperCase() || null,
        phone: data.phone?.trim() || null,
        website: data.website?.trim() || null,
        legalAddress: data.legalAddress?.trim() || null,
        legalCity: data.legalCity?.trim() || null,
        legalProvince: data.legalProvince?.toUpperCase() || null,
        legalPostalCode: data.legalPostalCode?.trim() || null,
        planId: planIdToSend,
        inviaBenvenuto,
      };

      if (sameAsLegal) {
        body.operationalAddress = data.legalAddress?.trim() || null;
        body.operationalCity = data.legalCity?.trim() || null;
        body.operationalProvince = data.legalProvince?.toUpperCase() || null;
        body.operationalPostalCode = data.legalPostalCode?.trim() || null;
      } else {
        body.operationalAddress = data.operationalAddress?.trim() || null;
        body.operationalCity = data.operationalCity?.trim() || null;
        body.operationalProvince = data.operationalProvince?.toUpperCase() || null;
        body.operationalPostalCode = data.operationalPostalCode?.trim() || null;
      }

      // Bug fix preesistente: chiamiamo direttamente fetch perché supabase-js
      // `functions.invoke()` perde il body dell'errore reale del server.
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
        import.meta.env.VITE_SUPABASE_ANON_KEY) as string;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Sessione scaduta. Riesegui l'accesso.");
      }

      let response: Response;
      try {
        response = await fetch(`${supabaseUrl}/functions/v1/create-company`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: anonKey,
          },
          body: JSON.stringify(body),
        });
      } catch (networkErr) {
        const msg = testoGrezzoErrore(networkErr);
        throw new Error(
          `Impossibile contattare il server Supabase (${msg}). Verifica la connessione.`,
          { cause: networkErr },
        );
      }

      const rawText = await response.text();
      let parsed: {
        success?: boolean;
        error?: string;
        message?: string;
        company?: { id: string };
        adminCredentials?: AdminCredentials;
      } | null = null;
      try {
        parsed = rawText ? JSON.parse(rawText) : null;
      } catch {
        throw new Error(`Risposta server non valida (HTTP ${response.status}).`);
      }

      if (!response.ok) {
        const msg =
          parsed?.error ?? parsed?.message ?? `HTTP ${response.status} ${response.statusText}`;
        throw new Error(String(msg));
      }
      if (!parsed?.success) {
        throw new Error(parsed?.error ?? "Risposta non valida dal server");
      }

      const companyId = parsed.company?.id;
      if (parsed.adminCredentials) {
        setCreatedAdmin({ ...parsed.adminCredentials, companyName: data.companyName.trim() });
      }

      // ── Referrer (post-create) ─────────────────────────────────────────
      // Best-effort: se fallisce non bloccare la creazione, ma logga e mostra
      // un warning all'utente in modo che possa ripetere il binding manualmente.
      if (selectedReferrerId && selectedReferrerId !== "none" && companyId) {
        const { error: refErr } = await supabase.from("referral_companies").insert({
          referrer_id: selectedReferrerId,
          company_id: companyId,
        });
        if (refErr) {
          console.error("[create-company] referral_companies insert failed", refErr);
          toast({
            title: "Azienda creata, ma referrer non collegato",
            description: `${refErr.message} — collega il referrer manualmente dalla scheda azienda.`,
            variant: "destructive",
          });
        } else {
          const { error: updErr } = await supabase
            .from("companies")
            .update({ referred_by: selectedReferrerId })
            .eq("id", companyId);
          if (updErr) {
            console.error("[create-company] companies.referred_by update failed", updErr);
          }
          const selectedReferrer = referrers.find((r) => r.id === selectedReferrerId);
          if (selectedReferrer?.referral_code) {
            await (supabase as any).rpc("record_referral_conversion", {
              p_referral_code: selectedReferrer.referral_code,
              p_company_id: companyId,
              p_status: "registered",
            }).catch((err: unknown) => {
              console.error("[create-company] referral conversion tracking failed", err);
            });
          }
        }
      }

      // Invalida le query della lista aziende per garantire che la nuova
      // azienda sia visibile immediatamente al ritorno alla lista.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.companiesFull }),
        queryClient.invalidateQueries({ queryKey: ["admin-companies-summary"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.companiesOrderStats }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.companiesUserCounts }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.companiesHealth }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.companiesLastAccess }),
        // Una nuova azienda cambia anche i numeri di Fatturato e della home admin.
        queryClient.invalidateQueries({ queryKey: ["admin-fatturato-snapshot"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-revenue-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-home-soldi"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-home-aziende"] }),
      ]);

      if (!parsed.adminCredentials) {
        toast({
          title: "Azienda creata con successo",
          description: `${data.companyName} è stata creata con ${statusTemplate.length} stati ordine.`,
        });
        navigate("/admin/aziende");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossibile creare l'azienda";
      toast({
        title: "Errore creazione azienda",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function closeCredentials() {
    setCreatedAdmin(null);
    setShowPassword(false);
    navigate("/admin/aziende");
  }

  async function copyPassword() {
    if (!createdAdmin) return;
    try {
      await navigator.clipboard.writeText(createdAdmin.password);
      toast({ title: "Password copiata" });
    } catch {
      toast({
        title: "Copia non riuscita",
        description: "Usa «Mostra password» per copiarla a mano.",
        variant: "destructive",
      });
    }
  }

  /* -------------------------------------------------------------------- */
  /*  Render                                                              */
  /* -------------------------------------------------------------------- */

  const SectionHeader = ({
    icon: Icon,
    title,
    optional,
  }: {
    icon: typeof Building2;
    title: string;
    optional?: boolean;
  }) => (
    <div className="flex items-center gap-2 pb-1">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h3 className="font-medium text-sm uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {optional && (
        <Badge variant="outline" className="text-[10px] font-normal h-5">
          opzionale
        </Badge>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/admin/aziende")}
          disabled={isSubmitting}
          aria-label="Torna alla lista aziende"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold truncate">Nuova Azienda</h1>
          <p className="text-muted-foreground text-sm">
            Crea l'azienda, l'admin, gli stati ordine e collega piano e referrer.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* ── Form ───────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Dati Azienda
            </CardTitle>
            <CardDescription>
              Tutti i campi richiesti sono contrassegnati. Gli altri sono opzionali.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8" noValidate>
                {/* Informazioni base */}
                <section className="space-y-4">
                  <SectionHeader icon={Building2} title="Informazioni Azienda" />

                  <FormField
                    control={form.control}
                    name="companyName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Nome Azienda <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            autoComplete="organization"
                            placeholder="Es. Serramenti Rossi Srl"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="companyEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Email Azienda <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            autoComplete="email"
                            inputMode="email"
                            placeholder="info@azienda.it"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>Email principale di contatto dell'azienda</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="sector"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Settore <span className="text-destructive">*</span>
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleziona il settore" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {sectors.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Determina il template degli stati ordine (preview a destra).
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </section>

                {/* Piano & Referrer */}
                <section className="space-y-4">
                  <SectionHeader icon={CreditCard} title="Piano & Referrer" optional />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Piano</label>
                      <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Senza piano · prova di 14 giorni" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Senza piano · prova di 14 giorni</SelectItem>
                          {plans.map((p: any) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                              {/* come decide create-company: prezzo 0 = gratis; senza giorni
                                  di prova un piano a pagamento chiede il pagamento al primo accesso */}
                              {p.slug === "scopri" || Number(p.price_monthly ?? 0) === 0
                                ? " · gratis"
                                : p.trial_days
                                  ? ` · prova ${p.trial_days} giorni`
                                  : " · senza prova: paga al primo accesso"}
                              {p.price_monthly ? ` · €${p.price_monthly}/mese` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        I piani gratis partono senza scadenza; gli altri con la prova del piano, o col pagamento al primo accesso se il piano non ne ha.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Referrer</label>
                      <Select value={selectedReferrerId} onValueChange={setSelectedReferrerId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Nessun referrer" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nessuno</SelectItem>
                          {referrers.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name} ({r.referral_code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Chi ha portato l'azienda (per le commissioni).
                      </p>
                    </div>
                  </div>
                </section>

                {/* Dati fiscali */}
                <section className="space-y-4">
                  <SectionHeader icon={Receipt} title="Dati Fiscali" optional />

                  <FormField
                    control={form.control}
                    name="businessName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ragione Sociale</FormLabel>
                        <FormControl>
                          <Input placeholder="Ragione sociale completa" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="vatNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Partita IVA</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="IT01234567890"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="fiscalCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Codice Fiscale</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="RSSMRA80A01F205X"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="pec"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>PEC</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              inputMode="email"
                              placeholder="azienda@pec.it"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value.toLowerCase())}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="sdiCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Codice SDI</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="ABCDEFG"
                              maxLength={7}
                              {...field}
                              onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Telefono</FormLabel>
                          <FormControl>
                            <Input
                              type="tel"
                              inputMode="tel"
                              autoComplete="tel"
                              placeholder="+39 0123 456789"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="website"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sito Web</FormLabel>
                          <FormControl>
                            <Input
                              type="url"
                              inputMode="url"
                              placeholder="https://www.azienda.it"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </section>

                {/* Sede legale */}
                <section className="space-y-4">
                  <SectionHeader icon={MapPin} title="Sede Legale" optional />

                  <FormField
                    control={form.control}
                    name="legalAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Indirizzo</FormLabel>
                        <FormControl>
                          <CampoIndirizzo
                            placeholder="Via Roma 1"
                            name={field.name}
                            value={field.value ?? ""}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            onScegli={(a) => riempiCampi(a, (campo, valore) =>
                              form.setValue(({ via: "legalAddress", citta: "legalCity", provincia: "legalProvince", cap: "legalPostalCode" } as const)[campo], valore, { shouldDirty: true, shouldValidate: true }))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid gap-4 sm:grid-cols-3">
                    <FormField
                      control={form.control}
                      name="legalCity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Città</FormLabel>
                          <FormControl>
                            <Input
                              autoComplete="address-level2"
                              placeholder="Milano"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="legalProvince"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Provincia</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="MI"
                              maxLength={2}
                              {...field}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value.replace(/[^A-Za-z]/g, "").toUpperCase(),
                                )
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="legalPostalCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CAP</FormLabel>
                          <FormControl>
                            <Input
                              inputMode="numeric"
                              placeholder="20100"
                              maxLength={5}
                              {...field}
                              onChange={(e) =>
                                field.onChange(e.target.value.replace(/\D/g, ""))
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </section>

                {/* Sede operativa */}
                <section className="space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <SectionHeader icon={MapPin} title="Sede Operativa" optional />
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="sameAsLegal"
                        checked={sameAsLegal}
                        onCheckedChange={(checked) => setSameAsLegal(checked === true)}
                      />
                      <label
                        htmlFor="sameAsLegal"
                        className="text-sm text-muted-foreground cursor-pointer select-none"
                      >
                        Uguale alla sede legale
                      </label>
                    </div>
                  </div>
                  {!sameAsLegal && (
                    <>
                      <FormField
                        control={form.control}
                        name="operationalAddress"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Indirizzo</FormLabel>
                            <FormControl>
                              <CampoIndirizzo
                                placeholder="Via Roma 1"
                                name={field.name}
                                value={field.value ?? ""}
                                onChange={field.onChange}
                                onBlur={field.onBlur}
                                onScegli={(a) => riempiCampi(a, (campo, valore) =>
                                  form.setValue(({ via: "operationalAddress", citta: "operationalCity", provincia: "operationalProvince", cap: "operationalPostalCode" } as const)[campo], valore, { shouldDirty: true, shouldValidate: true }))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid gap-4 sm:grid-cols-3">
                        <FormField
                          control={form.control}
                          name="operationalCity"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Città</FormLabel>
                              <FormControl>
                                <Input placeholder="Milano" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="operationalProvince"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Provincia</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="MI"
                                  maxLength={2}
                                  {...field}
                                  onChange={(e) =>
                                    field.onChange(
                                      e.target.value.replace(/[^A-Za-z]/g, "").toUpperCase(),
                                    )
                                  }
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="operationalPostalCode"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>CAP</FormLabel>
                              <FormControl>
                                <Input
                                  inputMode="numeric"
                                  placeholder="20100"
                                  maxLength={5}
                                  {...field}
                                  onChange={(e) =>
                                    field.onChange(e.target.value.replace(/\D/g, ""))
                                  }
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </>
                  )}
                </section>

                {/* Admin */}
                <section className="space-y-4">
                  <SectionHeader icon={UserCog} title="Amministratore Azienda" />

                  <Alert className="bg-muted/50">
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      La password viene generata quando crei l’azienda. Puoi copiarla dalla conferma.
                    </AlertDescription>
                  </Alert>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="adminFirstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Nome <span className="text-destructive">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input autoComplete="given-name" placeholder="Mario" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="adminLastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Cognome <span className="text-destructive">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input autoComplete="family-name" placeholder="Rossi" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="adminEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Email Admin <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            autoComplete="email"
                            inputMode="email"
                            placeholder="admin@azienda.it"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </section>

                <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end pt-2 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate("/admin/aziende")}
                    disabled={isSubmitting}
                    className="sm:w-auto w-full"
                  >
                    Annulla
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="sm:w-auto w-full"
                  >
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isSubmitting ? "Creazione in corso…" : "Crea Azienda"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* ── Preview & Recap ────────────────────────────────────────── */}
        <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <HandCoins className="h-4 w-4" />
                Cosa succederà
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2 text-muted-foreground">
              <ul className="list-disc list-inside space-y-1">
                <li>Creazione record azienda + dati fiscali</li>
                <li>Creazione utente admin (email confermata)</li>
                <li>Assegnazione ruolo <code>company_admin</code></li>
                <li>
                  {(() => {
                    if (selectedPlanId === "none") return "Senza piano: prova di 14 giorni";
                    const p = (plans as Array<{ id: string; name: string; slug: string; trial_days: number | null; price_monthly: number | null }>).find((x) => x.id === selectedPlanId);
                    if (!p) return "Piano selezionato";
                    if (p.slug === "scopri" || Number(p.price_monthly ?? 0) === 0) return `${p.name}: gratis, senza scadenza`;
                    return p.trial_days ? `${p.name}: prova di ${p.trial_days} giorni` : `${p.name}: senza prova, il pagamento si attiva al primo accesso`;
                  })()}
                </li>
                <li>Stati ordine pre-popolati dal template settore</li>
                {selectedReferrerId !== "none" && <li>Collegamento al referrer selezionato</li>}
              </ul>
            </CardContent>
          </Card>

          {/* Le email che partono davvero (vedi create-company e system-emails-tick):
              prima partiva anche una «copia dei termini accettati» falsa. */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="h-4 w-4" />
                Email al cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <Checkbox checked={inviaBenvenuto} onCheckedChange={(v) => setInviaBenvenuto(v === true)} className="mt-0.5" />
                <span>
                  <span className="font-medium text-foreground">Invia l'email di benvenuto</span>
                  <span className="block text-xs text-muted-foreground">
                    Il messaggio contiene l’email di accesso, la password generata e il link per entrare.
                  </span>
                </span>
              </label>
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Dopo 48 ore</span>, solo se non ha ancora creato il primo cantiere:
                «Manca poco per partire», una volta sola. Nessun'altra email parte dalla creazione.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ListChecks className="h-4 w-4" />
                Anteprima Stati Ordine
              </CardTitle>
              <CardDescription className="text-xs">
                {statusTemplate.length > 0
                  ? `${statusTemplate.length} stati per «${watchedSector}»`
                  : "Seleziona un settore"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {statusTemplate.length > 0 ? (
                <div className="space-y-2">
                  {statusTemplate.map((status, index) => (
                    <div
                      key={status.name}
                      className={cn(
                        "flex items-center gap-3 p-2.5 rounded-lg border bg-card",
                        status.is_support_phase && "border-dashed",
                      )}
                    >
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0"
                        style={{ backgroundColor: status.color }}
                      >
                        {index + 1}
                      </div>
                      <span className="font-medium text-sm truncate flex-1">{status.name}</span>
                      {status.is_support_phase && (
                        <Badge variant="outline" className="text-[10px] font-normal h-5 shrink-0">
                          supporto
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  Seleziona un settore per vedere gli stati ordine predefiniti.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={createdAdmin !== null} onOpenChange={(open) => { if (!open) closeCredentials(); }}>
        {createdAdmin && (
          <DialogContent onInteractOutside={(event) => event.preventDefault()}>
            <DialogHeader>
              <DialogTitle>Azienda creata</DialogTitle>
              <DialogDescription>
                Credenziali dell’amministratore di {createdAdmin.companyName}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 rounded-lg border bg-muted/40 p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">Email amministratore</p>
                <p className="break-all text-sm text-muted-foreground">{createdAdmin.email}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password-iniziale-azienda">Password iniziale</Label>
                <div className="flex gap-2">
                  <Input
                    id="password-iniziale-azienda"
                    className="min-w-0 font-mono"
                    type={showPassword ? "text" : "password"}
                    autoComplete="off"
                    value={createdAdmin.password}
                    readOnly
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="shrink-0"
                    aria-label={showPassword ? "Nascondi password" : "Mostra password"}
                    onClick={() => setShowPassword((visible) => !visible)}
                  >
                    {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  </Button>
                </div>
              </div>
            </div>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>{welcomeEmailMessages[createdAdmin.welcomeEmailStatus]}</p>
              <p>La password è disponibile in questa finestra fino alla chiusura.</p>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={copyPassword}>
                <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                Copia password
              </Button>
              <Button onClick={closeCredentials}>Torna alle aziende</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
