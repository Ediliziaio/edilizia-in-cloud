import { useMemo, useState } from "react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Building2, ReceiptText, MapPin, StickyNote, Loader2, Save, Download,
  AlertTriangle, CheckCircle2, ExternalLink, Mail, Phone, Globe, Map,
  Copy, Check, Sparkles,
} from "lucide-react";
import { CompanyLogoUploader } from "./CompanyLogoUploader";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";
import type { Company, CompanyStatus } from "@/types/auth";
import { sectorLabels, sectors, statusConfig } from "@/lib/companyUtils";
import type { UseFormReturn } from "react-hook-form";
import {
  validatePartitaIva, validateCodiceFiscale, validateCAP, validateProvincia,
  validateSDI, validatePEC, validateEmail, validateWebsite, validatePhone,
} from "@/lib/italianFiscalValidation";
import {
  getEffectivePaymentStatus, PAYMENT_STATUS_META,
} from "@/lib/paymentStatus";
import { cn } from "@/lib/utils";

interface CompanyDetailsTabProps {
  company: Company;
  form: UseFormReturn<any>;
  onSubmit: (data: any) => void;
  isSaving: boolean;
  sameAsLegal: boolean;
  onSameAsLegalChange: (v: boolean) => void;
  currentPlanName: string | null;
  stats: { ordersCount: number; customersCount: number } | null;
  totalTeam: number;
  onLogoUpdated?: () => void;
}

/**
 * Hint inline sotto un campo (warning/success). Render minimale, font 11px.
 */
function ValidationHint({
  hint, ok,
}: {
  hint?: string;
  ok: boolean;
}) {
  if (ok && !hint) return null;
  if (!hint) return null;
  return (
    <p
      className={cn(
        "text-[11px] mt-1 flex items-center gap-1",
        ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive",
      )}
    >
      {ok ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <AlertTriangle className="h-3 w-3" />
      )}
      {hint}
    </p>
  );
}

/** Bottone copia con feedback "copiato" 1.5s. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copiato`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Impossibile copiare");
    }
  };
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-6 w-6"
      onClick={handleCopy}
      title={`Copia ${label}`}
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-600" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </Button>
  );
}

export function CompanyDetailsTab({
  company, form, onSubmit, isSaving,
  sameAsLegal, onSameAsLegalChange,
  currentPlanName, stats, totalTeam, onLogoUpdated,
}: CompanyDetailsTabProps) {
  const companyStatus = (company.status || "trial") as CompanyStatus;
  const statusCfg = statusConfig[companyStatus] || statusConfig.trial;

  const [exporting, setExporting] = useState(false);

  // Watch live dei valori per validazione real-time. react-hook-form re-render
  // automatico → niente useState extra.
  const watchedVat = form.watch("vat_number") as string | undefined;
  const watchedCF = form.watch("fiscal_code") as string | undefined;
  const watchedPec = form.watch("pec") as string | undefined;
  const watchedSdi = form.watch("sdi_code") as string | undefined;
  const watchedEmail = form.watch("email") as string | undefined;
  const watchedPhone = form.watch("phone") as string | undefined;
  const watchedWebsite = form.watch("website") as string | undefined;
  const watchedLegalCap = form.watch("legal_postal_code") as string | undefined;
  const watchedLegalProv = form.watch("legal_province") as string | undefined;
  const watchedOpCap = form.watch("operational_postal_code") as string | undefined;
  const watchedOpProv = form.watch("operational_province") as string | undefined;

  const v = useMemo(
    () => ({
      vat: validatePartitaIva(watchedVat),
      cf: validateCodiceFiscale(watchedCF),
      pec: validatePEC(watchedPec),
      sdi: validateSDI(watchedSdi),
      email: validateEmail(watchedEmail),
      phone: validatePhone(watchedPhone),
      website: validateWebsite(watchedWebsite),
      legalCap: validateCAP(watchedLegalCap),
      legalProv: validateProvincia(watchedLegalProv),
      opCap: validateCAP(watchedOpCap),
      opProv: validateProvincia(watchedOpProv),
    }),
    [
      watchedVat, watchedCF, watchedPec, watchedSdi, watchedEmail, watchedPhone,
      watchedWebsite, watchedLegalCap, watchedLegalProv, watchedOpCap, watchedOpProv,
    ],
  );

  // Indicatore "completezza dati fiscali" per la sidebar
  const fiscalCompleteness = useMemo(() => {
    const fields = [
      { name: "P.IVA", value: company.vat_number },
      { name: "CF", value: company.fiscal_code },
      { name: "PEC", value: company.pec },
      { name: "SDI", value: company.sdi_code },
      { name: "Sede legale", value: company.legal_address },
    ];
    const filled = fields.filter((f) => f.value && f.value.trim()).length;
    const missing = fields.filter((f) => !f.value || !f.value.trim()).map((f) => f.name);
    return {
      pct: Math.round((filled / fields.length) * 100),
      missing,
    };
  }, [company]);

  // Stato pagamento per il sidebar (riusa helper centrale)
  const effectiveStatus = getEffectivePaymentStatus({
    status: company.status,
    payment_method: company.payment_method,
    trial_ends_at: company.trial_ends_at,
  });
  const paymentMeta = PAYMENT_STATUS_META[effectiveStatus];

  // Età cliente
  const daysSinceSignup = Math.max(
    0,
    differenceInDays(new Date(), new Date(company.created_at)),
  );
  const monthsSinceSignup = Math.max(
    1,
    Math.round(
      (Date.now() - new Date(company.created_at).getTime()) /
        (30 * 24 * 60 * 60 * 1000),
    ),
  );
  const ageLabel =
    daysSinceSignup < 30
      ? `${daysSinceSignup} giorn${daysSinceSignup === 1 ? "o" : "i"}`
      : monthsSinceSignup < 12
        ? `${monthsSinceSignup} mes${monthsSinceSignup === 1 ? "e" : "i"}`
        : `${Math.round((monthsSinceSignup / 12) * 10) / 10} anni`;

  // Apri Google Maps con l'indirizzo (sede legale o operativa)
  const buildAddressString = (which: "legal" | "operational"): string => {
    const parts = [
      company[`${which}_address` as const] as string | null | undefined,
      company[`${which}_city` as const] as string | null | undefined,
      company[`${which}_province` as const] as string | null | undefined,
      company[`${which}_postal_code` as const] as string | null | undefined,
    ].filter(Boolean);
    return parts.join(", ");
  };

  const openMaps = (which: "legal" | "operational") => {
    const addr = buildAddressString(which);
    if (!addr) {
      toast.error("Indirizzo non disponibile");
      return;
    }
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleGDPRExport = async () => {
    if (exporting) return;
    setExporting(true);
    const loadingToast = toast.loading("Preparazione export GDPR...");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Sessione non valida. Effettua di nuovo il login.");
      }
      const res = await supabase.functions.invoke("gdpr-compliance", {
        body: { action: "admin_export_company_data", company_id: company.id },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.error) throw new Error(await edgeErrorMessage(res.error, "Errore export GDPR"));
      const blob = new Blob([JSON.stringify(res.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gdpr-export-${company.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.dismiss(loadingToast);
      toast.success("Export GDPR scaricato");
    } catch (e: unknown) {
      toast.dismiss(loadingToast);
      const err = e instanceof Error ? e : new Error("Errore sconosciuto");
      toast.error("Errore export: " + err.message);
    } finally {
      setExporting(false);
    }
  };

  const legalAddress = buildAddressString("legal");
  const opAddress = buildAddressString("operational");

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Form - 2/3 */}
      <div className="lg:col-span-2">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Identificazione */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  Identificazione
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField control={form.control} name="business_name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ragione Sociale</FormLabel>
                      <FormControl><Input placeholder="Ragione sociale..." {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome Commerciale *</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email *</FormLabel>
                      <FormControl><Input type="email" {...field} /></FormControl>
                      {watchedEmail && <ValidationHint hint={v.email.hint} ok={v.email.ok} />}
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefono</FormLabel>
                      <FormControl><Input placeholder="+39..." {...field} /></FormControl>
                      {watchedPhone && <ValidationHint hint={v.phone.hint} ok={v.phone.ok} />}
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="sector" render={({ field }) => (
                  <FormItem className="sm:w-1/2">
                    <FormLabel>Settore</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sectors.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                {company.logo_url && (
                  <div>
                    <p className="text-sm font-medium mb-2">Logo attuale</p>
                    <img width={64} height={64} loading="lazy" src={company.logo_url} alt="Logo" className="h-16 w-16 rounded-lg object-cover border" />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Dati Fiscali */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <ReceiptText className="h-4 w-4 text-primary" />
                  Dati Fiscali
                </CardTitle>
                <CardDescription className="text-xs">
                  Necessari per fatturazione elettronica e documenti ufficiali.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField control={form.control} name="vat_number" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Partita IVA</FormLabel>
                      <FormControl>
                        {/* Auto-uppercase + trim spazi su blur */}
                        <Input
                          placeholder="12345678901"
                          {...field}
                          onBlur={(e) => {
                            const cleaned = e.target.value
                              .replace(/\s/g, "")
                              .replace(/^IT/i, "")
                              .toUpperCase();
                            if (cleaned !== e.target.value) {
                              field.onChange(cleaned);
                            }
                            field.onBlur();
                          }}
                        />
                      </FormControl>
                      {watchedVat && <ValidationHint hint={v.vat.hint} ok={v.vat.ok} />}
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="fiscal_code" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Codice Fiscale</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="RSSMRA85M01H501Z"
                          {...field}
                          onBlur={(e) => {
                            const cleaned = e.target.value.replace(/\s/g, "").toUpperCase();
                            if (cleaned !== e.target.value) field.onChange(cleaned);
                            field.onBlur();
                          }}
                        />
                      </FormControl>
                      {watchedCF && <ValidationHint hint={v.cf.hint} ok={v.cf.ok} />}
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField control={form.control} name="pec" render={({ field }) => (
                    <FormItem>
                      <FormLabel>PEC</FormLabel>
                      <FormControl><Input placeholder="azienda@pec.it" {...field} /></FormControl>
                      {watchedPec && <ValidationHint hint={v.pec.hint} ok={v.pec.ok} />}
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="sdi_code" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Codice SDI</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="ABCDEFG"
                          maxLength={7}
                          {...field}
                          onBlur={(e) => {
                            const cleaned = e.target.value.replace(/\s/g, "").toUpperCase();
                            if (cleaned !== e.target.value) field.onChange(cleaned);
                            field.onBlur();
                          }}
                        />
                      </FormControl>
                      {watchedSdi && <ValidationHint hint={v.sdi.hint} ok={v.sdi.ok} />}
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="website" render={({ field }) => (
                  <FormItem className="sm:w-1/2">
                    <FormLabel>Sito Web</FormLabel>
                    <FormControl><Input placeholder="https://www.esempio.it" {...field} /></FormControl>
                    {watchedWebsite && <ValidationHint hint={v.website.hint} ok={v.website.ok} />}
                    <FormMessage />
                  </FormItem>
                )} />
              </CardContent>
            </Card>

            {/* Sede Legale */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    Sede Legale
                  </CardTitle>
                  {legalAddress && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => openMaps("legal")}
                    >
                      <Map className="h-3 w-3 mr-1" />
                      Maps
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField control={form.control} name="legal_address" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Indirizzo</FormLabel>
                    <FormControl><Input placeholder="Via Roma, 1" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField control={form.control} name="legal_city" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Città</FormLabel>
                      <FormControl><Input placeholder="Milano" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="legal_province" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Provincia</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="MI"
                          maxLength={2}
                          {...field}
                          onBlur={(e) => {
                            const cleaned = e.target.value.replace(/\s/g, "").toUpperCase();
                            if (cleaned !== e.target.value) field.onChange(cleaned);
                            field.onBlur();
                          }}
                        />
                      </FormControl>
                      {watchedLegalProv && (
                        <ValidationHint hint={v.legalProv.hint} ok={v.legalProv.ok} />
                      )}
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="legal_postal_code" render={({ field }) => (
                    <FormItem>
                      <FormLabel>CAP</FormLabel>
                      <FormControl><Input placeholder="20100" maxLength={5} {...field} /></FormControl>
                      {watchedLegalCap && (
                        <ValidationHint hint={v.legalCap.hint} ok={v.legalCap.ok} />
                      )}
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </CardContent>
            </Card>

            {/* Sede Operativa */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    Sede Operativa
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {opAddress && !sameAsLegal && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => openMaps("operational")}
                      >
                        <Map className="h-3 w-3 mr-1" />
                        Maps
                      </Button>
                    )}
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="same-as-legal"
                        checked={sameAsLegal}
                        onCheckedChange={(val) => onSameAsLegalChange(!!val)}
                      />
                      <label htmlFor="same-as-legal" className="text-sm text-muted-foreground cursor-pointer">
                        Uguale alla sede legale
                      </label>
                    </div>
                  </div>
                </div>
              </CardHeader>
              {!sameAsLegal && (
                <CardContent className="space-y-4">
                  <FormField control={form.control} name="operational_address" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Indirizzo</FormLabel>
                      <FormControl><Input placeholder="Via Roma, 1" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="grid gap-4 sm:grid-cols-3">
                    <FormField control={form.control} name="operational_city" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Città</FormLabel>
                        <FormControl><Input placeholder="Milano" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="operational_province" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Provincia</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="MI"
                            maxLength={2}
                            {...field}
                            onBlur={(e) => {
                              const cleaned = e.target.value.replace(/\s/g, "").toUpperCase();
                              if (cleaned !== e.target.value) field.onChange(cleaned);
                              field.onBlur();
                            }}
                          />
                        </FormControl>
                        {watchedOpProv && (
                          <ValidationHint hint={v.opProv.hint} ok={v.opProv.ok} />
                        )}
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="operational_postal_code" render={({ field }) => (
                      <FormItem>
                        <FormLabel>CAP</FormLabel>
                        <FormControl><Input placeholder="20100" maxLength={5} {...field} /></FormControl>
                        {watchedOpCap && (
                          <ValidationHint hint={v.opCap.hint} ok={v.opCap.ok} />
                        )}
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Note */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <StickyNote className="h-4 w-4 text-primary" />
                  Note Interne
                </CardTitle>
                <CardDescription>Visibili solo al Super Admin</CardDescription>
              </CardHeader>
              <CardContent>
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea placeholder="Annotazioni interne sull'azienda..." rows={4} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </CardContent>
            </Card>

            {/* Save button */}
            <div className="sticky bottom-4 z-10">
              <Button type="submit" disabled={isSaving} className="w-full sm:w-auto shadow-lg">
                {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Salva Modifiche
              </Button>
            </div>
          </form>
        </Form>
      </div>

      {/* Sidebar Panoramica */}
      <div className="space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center space-y-4">
              {company.logo_url ? (
                <img width={80} height={80} loading="lazy"
                  src={company.logo_url}
                  alt={company.name}
                  className="h-20 w-20 rounded-2xl object-cover shadow-sm"
                />
              ) : (
                <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-10 w-10 text-primary" />
                </div>
              )}
              <div className="min-w-0 max-w-full">
                <h3 className="font-semibold text-lg truncate">{company.name}</h3>
                {company.business_name && (
                  <p className="text-sm text-muted-foreground truncate">
                    {company.business_name}
                  </p>
                )}
                {/* Email + phone cliccabili */}
                <div className="flex flex-col gap-0.5 items-center mt-1">
                  <a
                    href={`mailto:${company.email}`}
                    className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 max-w-full"
                  >
                    <Mail className="h-3 w-3 shrink-0" />
                    <span className="truncate">{company.email}</span>
                  </a>
                  {company.phone && (
                    <a
                      href={`tel:${company.phone.replace(/\s/g, "")}`}
                      className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                    >
                      <Phone className="h-3 w-3 shrink-0" />
                      <span>{company.phone}</span>
                    </a>
                  )}
                  {company.website && (
                    <a
                      href={
                        company.website.startsWith("http")
                          ? company.website
                          : `https://${company.website}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 max-w-full"
                    >
                      <Globe className="h-3 w-3 shrink-0" />
                      <span className="truncate">{company.website.replace(/^https?:\/\//, "")}</span>
                      <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                    </a>
                  )}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap justify-center">
                <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                {/* Stato pagamento (riusa helper centrale) */}
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] cursor-help", paymentMeta.className)}
                      >
                        {effectiveStatus === "comped" && (
                          <Sparkles className="h-2.5 w-2.5 mr-1" />
                        )}
                        {paymentMeta.shortLabel}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">
                      {paymentMeta.description}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Badge variant="secondary">
                  {sectorLabels[company.sector] || company.sector}
                </Badge>
              </div>
            </div>

            <Separator className="my-5" />

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Piano</span>
                <span className="font-medium">{currentPlanName || "Nessuno"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cliente da</span>
                <span className="font-medium">{ageLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Creata</span>
                <span className="font-medium">
                  {format(new Date(company.created_at), "dd/MM/yyyy", { locale: it })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Aggiornata</span>
                <span className="font-medium">
                  {formatDistanceToNow(new Date(company.updated_at), {
                    addSuffix: true,
                    locale: it,
                  })}
                </span>
              </div>
              {companyStatus === "trial" && company.trial_ends_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Scadenza trial</span>
                  <span className="font-medium">
                    {format(new Date(company.trial_ends_at), "dd/MM/yyyy", {
                      locale: it,
                    })}
                  </span>
                </div>
              )}
              {company.vat_number && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">P.IVA</span>
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="font-medium font-mono text-xs truncate">
                      {company.vat_number}
                    </span>
                    <CopyButton value={company.vat_number} label="P.IVA" />
                  </div>
                </div>
              )}
              {stats && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ordini</span>
                    <span className="font-medium">{stats.ordersCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Clienti</span>
                    <span className="font-medium">{stats.customersCount}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Team</span>
                <span className="font-medium">{totalTeam}</span>
              </div>
            </div>

            {/* Indicatore completezza dati fiscali */}
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground">
                  Completezza dati fiscali
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] h-4",
                    fiscalCompleteness.pct === 100
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300"
                      : fiscalCompleteness.pct >= 60
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-300"
                        : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-300",
                  )}
                >
                  {fiscalCompleteness.pct}%
                </Badge>
              </div>
              {fiscalCompleteness.missing.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Mancano: {fiscalCompleteness.missing.join(", ")}
                </p>
              )}
            </div>

            <div className="pt-4 border-t mt-4">
              <p className="text-xs text-muted-foreground mb-2">Conformità GDPR</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleGDPRExport()}
                disabled={exporting}
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Esporta Dati Azienda (GDPR)
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Feature 10 — Logo Upload */}
        {onLogoUpdated && (
          <CompanyLogoUploader company={company} onLogoUpdated={onLogoUpdated} />
        )}
      </div>
    </div>
  );
}
