import { useState, useMemo, useEffect } from "react";
import { logger } from "@/utils/logger";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, UserPlus, Copy, Check, ShieldCheck, ShieldOff, Mail, Phone, MapPin,
  CreditCard, HardHat, FileText, Loader2, Building2, User as UserIcon,
  Upload, X, FileCheck2, FileWarning,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useAppaltatoreModuleEnabled } from "@/hooks/useAppaltatoreModule";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

// Regex client-side (resta comunque validato server-side)
const PHONE_CLEAN_REGEX = /[\u200B-\u200D\uFEFF]/g; // caratteri invisibili
const PHONE_ALLOWED = /^[0-9+\-\s().]+$/;
const CUSTOMER_DOCUMENT_BUCKET = "customer-documents";
type CustomerDocumentType = "contract" | "identity" | "fiscal_code";

const CUSTOMER_DOCUMENTS: Array<{
  type: CustomerDocumentType;
  label: string;
  description: string;
}> = [
  {
    type: "contract",
    label: "Contratto",
    description: "Contratto, proposta firmata o accordo già disponibile.",
  },
  {
    type: "identity",
    label: "Documento identità",
    description: "CI, patente, passaporto o documento del referente.",
  },
  {
    type: "fiscal_code",
    label: "Codice fiscale",
    description: "Tessera sanitaria/CF o documento fiscale utile.",
  },
];

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^\w.-]+/g, "_");
}

export default function CreateCustomer() {
  const navigate = useNavigate();
  const { effectiveCompany, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Toggle portale a livello company (letto dal contesto)
  const companyPortalEnabled = (effectiveCompany as { customer_portal_enabled?: boolean } | null)
    ?.customer_portal_enabled !== false;

  // ── Modulo Appaltatori (feature flag) ─────────────────────
  const appaltatoreEnabled = useAppaltatoreModuleEnabled();

  // ── Form state ─────────────────────────────────────────────
  // customer_type pilota la UI:
  //   - "privato"     → flusso esistente (Tabs persona/azienda)
  //   - "appaltatore" → forza isBusiness=true, nasconde campi cantiere
  //                     personali, dialog success non offre portale
  // Aggiunto solo se il modulo Appaltatori è attivo.
  const [customerType, setCustomerType] = useState<"privato" | "appaltatore">("privato");
  const isAppaltatore = appaltatoreEnabled && customerType === "appaltatore";

  const [isBusiness, setIsBusiness] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [fiscalCode, setFiscalCode] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [province, setProvince] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [siteCity, setSiteCity] = useState("");
  const [sitePostalCode, setSitePostalCode] = useState("");
  const [siteProvince, setSiteProvince] = useState("");
  const [notes, setNotes] = useState("");
  const [customerDocuments, setCustomerDocuments] = useState<Partial<Record<CustomerDocumentType, File>>>({});

  // Portale: default segue setting company, ma admin può disattivare per singolo cliente
  const [createPortalAccount, setCreatePortalAccount] = useState(companyPortalEnabled);
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedDocumentCount = Object.values(customerDocuments).filter(Boolean).length;
  const missingDocumentLabels = CUSTOMER_DOCUMENTS
    .filter((doc) => !customerDocuments[doc.type])
    .map((doc) => doc.label);

  const handleDocumentChange = (type: CustomerDocumentType, file: File | null) => {
    setCustomerDocuments((prev) => {
      const next = { ...prev };
      if (file) next[type] = file;
      else delete next[type];
      return next;
    });
  };

  const uploadCustomerDocuments = async (customerId: string) => {
    if (!effectiveCompany?.id || !user?.id) return;
    const entries = Object.entries(customerDocuments) as Array<[CustomerDocumentType, File | undefined]>;
    for (const [documentType, file] of entries) {
      if (!file) continue;
      const filePath = `${effectiveCompany.id}/${customerId}/${documentType}/${Date.now()}-${sanitizeFileName(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from(CUSTOMER_DOCUMENT_BUCKET)
        .upload(filePath, file, { contentType: file.type || undefined, upsert: false });
      if (uploadError) throw uploadError;
      const customerDocumentsClient = supabase as unknown as {
        from: (table: "customer_documents") => {
          insert: (payload: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
        };
      };
      const { error: insertError } = await customerDocumentsClient.from("customer_documents").insert({
        company_id: effectiveCompany.id,
        customer_id: customerId,
        document_type: documentType,
        file_name: file.name,
        file_path: filePath,
        file_type: file.type || null,
        file_size: file.size,
        uploaded_by: user.id,
      });
      if (insertError) throw insertError;
    }
  };

  // Appaltatore = sempre azienda (P.IVA + ragione sociale obbligatorie).
  // Forziamo isBusiness=true ogni volta che si passa a quel tipo.
  useEffect(() => {
    if (isAppaltatore && !isBusiness) setIsBusiness(true);
  }, [isAppaltatore, isBusiness]);

  // ── Success dialog ─────────────────────────────────────────
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [portalWasCreated, setPortalWasCreated] = useState(false);
  const [emailWasSent, setEmailWasSent] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);

  // ── Validazioni live ───────────────────────────────────────
  const phoneError = useMemo(() => {
    if (!phone.trim()) return null;
    const cleaned = phone.replace(PHONE_CLEAN_REGEX, "").trim();
    if (!PHONE_ALLOWED.test(cleaned)) {
      return "Il telefono può contenere solo cifre, spazi, + - ( ) .";
    }
    const digits = cleaned.replace(/\D/g, "");
    if (digits.length < 6) return "Numero troppo corto (minimo 6 cifre)";
    if (digits.length > 15) return "Numero troppo lungo (massimo 15 cifre)";
    return null;
  }, [phone]);

  const emailError = useMemo(() => {
    if (!email.trim()) return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return "Formato email non valido";
    }
    return null;
  }, [email]);

  const shouldRequireEmail = companyPortalEnabled && createPortalAccount;

  const canSubmit =
    (isBusiness ? businessName.trim().length > 0 : (firstName.trim().length > 0 && lastName.trim().length > 0)) &&
    (!shouldRequireEmail || email.trim().length > 0) &&
    !emailError &&
    !phoneError &&
    !!effectiveCompany?.id &&
    !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isBusiness) {
      if (!businessName.trim()) {
        toast({ title: "Campo obbligatorio", description: "Inserisci la ragione sociale.", variant: "destructive" });
        return;
      }
    } else {
      if (!firstName.trim()) {
        toast({ title: "Campo obbligatorio", description: "Inserisci il nome del cliente.", variant: "destructive" });
        return;
      }
      if (!lastName.trim()) {
        toast({ title: "Campo obbligatorio", description: "Inserisci il cognome del cliente.", variant: "destructive" });
        return;
      }
    }
    const shouldCreatePortal = companyPortalEnabled && createPortalAccount;
    if (shouldCreatePortal && !email.trim()) {
      toast({ title: "Campo obbligatorio", description: "Inserisci l'email per creare l'accesso al portale.", variant: "destructive" });
      return;
    }
    if (emailError) {
      toast({ title: "Email non valida", description: emailError, variant: "destructive" });
      return;
    }
    if (phoneError) {
      toast({ title: "Telefono non valido", description: phoneError, variant: "destructive" });
      return;
    }
    if (!effectiveCompany?.id) {
      toast({ title: "Errore", description: "Azienda non trovata.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);

    try {
      const cleanPhone = phone.replace(PHONE_CLEAN_REGEX, "").replace(/\s+/g, " ").trim() || null;

      const { data, error } = await supabase.functions.invoke("create-customer", {
        body: {
          is_business: isBusiness,
          business_name: isBusiness ? businessName.trim() : null,
          // Categoria cliente: "appaltatore" solo se Modulo Appaltatori attivo
          // (server è permissivo: default 'privato' se valore non valido).
          customer_type: customerType,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim().toLowerCase() || null,
          phone: cleanPhone,
          address: address.trim() || null,
          city: city.trim() || null,
          postal_code: postalCode.trim() || null,
          province: province.trim().toUpperCase() || null,
          country: "IT",
          company_id: effectiveCompany.id,
          fiscal_code: fiscalCode.trim() || null,
          site_address: siteAddress.trim() || null,
          site_city: siteCity.trim() || null,
          site_postal_code: sitePostalCode.trim() || null,
          site_province: siteProvince.trim().toUpperCase() || null,
          notes: notes.trim() || null,
          create_portal_account: shouldCreatePortal,
          send_welcome_email: shouldCreatePortal && sendWelcomeEmail,
        },
      });

      if (error) {
        let errBody: { error?: string; message?: string } | null = null;
        try {
          const ctx = (error as { context?: unknown }).context;
          if (ctx instanceof Response) errBody = await ctx.json();
        } catch { /* ignore */ }
        throw new Error(errBody?.error ?? errBody?.message ?? error.message ?? "Errore");
      }
      if (!data) throw new Error("Risposta non valida dal server.");
      if (data.error) throw new Error(data.error);

      queryClient.invalidateQueries({ queryKey: queryKeys.customersList.all });

      const newCustomerId = data?.customer?.id ?? data?.customer_id ?? data?.user_id;
      if (selectedDocumentCount > 0) {
        if (!newCustomerId) {
          toast({
            title: "Cliente creato, documenti non caricati",
            description: "Il server non ha restituito l'ID cliente. Carica i documenti dalla scheda cliente.",
            variant: "destructive",
          });
        } else {
          try {
            await uploadCustomerDocuments(newCustomerId);
            toast({
              title: "Documenti cliente caricati",
              description: `${selectedDocumentCount} documento/i salvati nel fascicolo cliente.`,
            });
          } catch (uploadError) {
            logger.error("Customer documents upload error:", uploadError);
            toast({
              title: "Cliente creato, documenti non caricati",
              description: uploadError instanceof Error ? uploadError.message : "Carica i documenti dalla scheda cliente.",
              variant: "destructive",
            });
          }
        }
      }

      setGeneratedPassword(data.password ?? null);
      setPortalWasCreated(!!data.portal_account_created);
      setEmailWasSent(!!data.welcome_email_sent);
      setShowSuccessDialog(true);
    } catch (e) {
      logger.error("Create customer error:", e);
      toast({
        title: "Errore",
        description: e instanceof Error ? e.message : "Si è verificato un errore durante la creazione del cliente.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyPassword = async () => {
    if (!generatedPassword) return;
    try {
      await navigator.clipboard.writeText(generatedPassword);
      setPasswordCopied(true);
      setTimeout(() => setPasswordCopied(false), 2000);
    } catch {
      toast({ title: "Errore", description: "Impossibile copiare la password.", variant: "destructive" });
    }
  };

  const handleDialogClose = () => {
    setShowSuccessDialog(false);
    navigate("/azienda/clienti");
  };

  return (
    <div className="space-y-6">
      {/* Header con pattern h-10 w-10 bg-primary/10 */}
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="hidden md:inline-flex shrink-0"
          onClick={() => navigate(-1)}
          aria-label="Torna indietro"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <UserPlus className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight">Nuovo Cliente</h1>
          <p className="text-sm text-muted-foreground">
            Crea un nuovo cliente in anagrafica. L'accesso al portale privato è opzionale.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Colonna principale */}
          <div className="lg:col-span-8 space-y-6">
            {/* Dati anagrafici */}
            <Card className="border-l-4 border-l-primary">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Dati anagrafici
                </CardTitle>
                <CardDescription>Informazioni di contatto del cliente</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Categoria cliente — visibile solo se Modulo Appaltatori attivo */}
                {appaltatoreEnabled && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                      Categoria cliente
                      <Badge variant="outline" className="text-[9px] uppercase tracking-wider">
                        Modulo Appaltatori
                      </Badge>
                    </Label>
                    <Tabs
                      value={customerType}
                      onValueChange={(v) => setCustomerType(v as "privato" | "appaltatore")}
                    >
                      <TabsList className="grid grid-cols-2 w-full">
                        <TabsTrigger value="privato">
                          <UserIcon className="h-3.5 w-3.5 mr-1.5" />
                          Cliente privato
                        </TabsTrigger>
                        <TabsTrigger value="appaltatore">
                          <HardHat className="h-3.5 w-3.5 mr-1.5" />
                          Cliente appaltatore
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <p className="text-[11px] text-muted-foreground">
                      {isAppaltatore
                        ? "Impresa committente che ti passa lavori di sola manodopera. Solo dati aziendali."
                        : "Cliente finale per fornitura+posa (default, comportamento standard)."}
                    </p>
                  </div>
                )}

                {/* Tipo cliente persona/azienda — nascosto se Appaltatore (forzato a azienda) */}
                {!isAppaltatore && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">Tipo cliente</Label>
                    <Tabs value={isBusiness ? "business" : "person"} onValueChange={(v) => setIsBusiness(v === "business")}>
                      <TabsList className="grid grid-cols-2 w-full">
                        <TabsTrigger value="person">
                          <UserIcon className="h-3.5 w-3.5 mr-1.5" />
                          Persona fisica
                        </TabsTrigger>
                        <TabsTrigger value="business">
                          <Building2 className="h-3.5 w-3.5 mr-1.5" />
                          Azienda / P. IVA
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                )}

                {/* Ragione sociale (solo azienda) */}
                {isBusiness && (
                  <div className="space-y-2">
                    <Label htmlFor="businessName" className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5" />
                      Ragione sociale *
                    </Label>
                    <Input
                      id="businessName"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="Es. Rossi Costruzioni S.r.l."
                      maxLength={200}
                      required
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">
                      {isBusiness ? "Nome referente" : "Nome *"}
                    </Label>
                    <Input
                      id="firstName"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder={isBusiness ? "Opzionale" : "Mario"}
                      autoComplete="given-name"
                      required={!isBusiness}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">
                      {isBusiness ? "Cognome referente" : "Cognome *"}
                    </Label>
                    <Input
                      id="lastName"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder={isBusiness ? "Opzionale" : "Rossi"}
                      autoComplete="family-name"
                      required={!isBusiness}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    Email {shouldRequireEmail ? "*" : ""}
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={isBusiness ? "info@azienda.it" : "mario.rossi@email.com"}
                    autoComplete="email"
                    required={shouldRequireEmail}
                    aria-invalid={!!emailError}
                  />
                  {!shouldRequireEmail && (
                    <p className="text-xs text-muted-foreground">
                      Opzionale se crei solo l'anagrafica. Diventa obbligatoria se abiliti il portale clienti.
                    </p>
                  )}
                  {emailError && <p className="text-xs text-destructive">{emailError}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone" className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" />
                    Telefono
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+39 333 1234567"
                    autoComplete="tel"
                    aria-invalid={!!phoneError}
                  />
                  {phoneError && <p className="text-xs text-destructive">{phoneError}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fiscalCode" className="flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5" />
                    {isBusiness ? "Partita IVA / Codice Fiscale" : "Codice Fiscale"}
                  </Label>
                  <Input
                    id="fiscalCode"
                    value={fiscalCode}
                    onChange={(e) => setFiscalCode(e.target.value.toUpperCase())}
                    placeholder={isBusiness ? "IT01234567890" : "RSSMRA80A01H501U"}
                    maxLength={16}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Fascicolo documentale */}
            <Card className="border-l-4 border-l-emerald-500">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileCheck2 className="h-4 w-4 text-emerald-500" />
                  Documenti cliente
                </CardTitle>
                <CardDescription>
                  Contratto, documento identità e codice fiscale non sono obbligatori, ma il sistema segnala cosa manca.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Alert className="bg-amber-50/60 border-amber-200">
                  <FileWarning className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-xs text-amber-900">
                    Puoi creare il cliente anche senza allegati. Se mancano, rimarranno evidenziati come documenti da recuperare.
                  </AlertDescription>
                </Alert>

                <div className="grid gap-3">
                  {CUSTOMER_DOCUMENTS.map((doc) => {
                    const file = customerDocuments[doc.type];
                    return (
                      <div key={doc.type} className="rounded-lg border p-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">{doc.label}</p>
                              <Badge variant={file ? "default" : "outline"} className="text-[10px]">
                                {file ? "presente" : "mancante"}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{doc.description}</p>
                            {file && (
                              <p className="mt-1 truncate text-xs font-medium text-emerald-700">
                                {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Label
                              htmlFor={`customer-doc-${doc.type}`}
                              className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md border bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                            >
                              <Upload className="mr-1.5 h-3.5 w-3.5" />
                              {file ? "Cambia" : "Carica"}
                            </Label>
                            <Input
                              id={`customer-doc-${doc.type}`}
                              type="file"
                              className="hidden"
                              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,application/pdf,image/*"
                              onChange={(event) => handleDocumentChange(doc.type, event.target.files?.[0] ?? null)}
                            />
                            {file && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9"
                                onClick={() => handleDocumentChange(doc.type, null)}
                                aria-label={`Rimuovi ${doc.label}`}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Indirizzi */}
            <Card className="border-l-4 border-l-blue-500">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-blue-500" />
                  Indirizzi
                </CardTitle>
                <CardDescription>
                  {isBusiness ? "Sede legale e indirizzo del cantiere" : "Residenza e indirizzo del cantiere"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Indirizzo residenza / sede legale */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    {isBusiness ? "Sede legale" : "Residenza"}
                  </Label>
                  <Input
                    id="address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Via Roma, 1"
                    maxLength={200}
                  />
                  <div className="grid grid-cols-6 gap-2">
                    <Input
                      className="col-span-2"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      placeholder="CAP"
                      maxLength={10}
                      aria-label="CAP"
                    />
                    <Input
                      className="col-span-3"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Città"
                      maxLength={100}
                      aria-label="Città"
                    />
                    <Input
                      className="col-span-1"
                      value={province}
                      onChange={(e) => setProvince(e.target.value.toUpperCase())}
                      placeholder="PR"
                      maxLength={2}
                      aria-label="Provincia"
                    />
                  </div>
                </div>

                <Separator />

                {/* Indirizzo cantiere */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                    <HardHat className="h-3.5 w-3.5" />
                    Indirizzo cantiere (opzionale)
                  </Label>
                  <Input
                    id="siteAddress"
                    value={siteAddress}
                    onChange={(e) => setSiteAddress(e.target.value)}
                    placeholder="Via del Cantiere, 5"
                    maxLength={200}
                  />
                  <div className="grid grid-cols-6 gap-2">
                    <Input
                      className="col-span-2"
                      value={sitePostalCode}
                      onChange={(e) => setSitePostalCode(e.target.value)}
                      placeholder="CAP"
                      maxLength={10}
                      aria-label="CAP cantiere"
                    />
                    <Input
                      className="col-span-3"
                      value={siteCity}
                      onChange={(e) => setSiteCity(e.target.value)}
                      placeholder="Città"
                      maxLength={100}
                      aria-label="Città cantiere"
                    />
                    <Input
                      className="col-span-1"
                      value={siteProvince}
                      onChange={(e) => setSiteProvince(e.target.value.toUpperCase())}
                      placeholder="PR"
                      maxLength={2}
                      aria-label="Provincia cantiere"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Note */}
            <Card className="border-l-4 border-l-amber-500">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-amber-500" />
                  Note interne
                </CardTitle>
                <CardDescription>Informazioni aggiuntive visibili solo al tuo team</CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Preferenze, note di lavorazione, referenze..."
                  rows={4}
                  maxLength={500}
                />
                <p className="text-xs text-muted-foreground mt-1">{notes.length}/500</p>
              </CardContent>
            </Card>
          </div>

          {/* Colonna laterale — Portale / Riepilogo (sticky su desktop) */}
          <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-6 lg:self-start">
            {/* Riepilogo live */}
            <Card className="border-l-4 border-l-primary/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Riepilogo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground shrink-0">Tipo</span>
                  <span className="font-medium text-right">
                    {isAppaltatore
                      ? "Cliente appaltatore"
                      : isBusiness
                        ? "Azienda"
                        : "Persona fisica"}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground shrink-0">Nominativo</span>
                  <span className="font-medium text-right truncate">
                    {isBusiness
                      ? (businessName.trim() || <em className="text-muted-foreground font-normal">—</em>)
                      : ((`${firstName} ${lastName}`).trim() || <em className="text-muted-foreground font-normal">—</em>)}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground shrink-0">Email</span>
                  <span className="font-medium text-right truncate max-w-[60%]">
                    {email.trim() || <em className="text-muted-foreground font-normal">—</em>}
                  </span>
                </div>
                {phone.trim() && (
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground shrink-0">Telefono</span>
                    <span className="font-medium text-right truncate">{phone.trim()}</span>
                  </div>
                )}
                {fiscalCode.trim() && (
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground shrink-0">{isBusiness ? "P.IVA/CF" : "CF"}</span>
                    <span className="font-medium text-right truncate font-mono text-[11px]">{fiscalCode.trim()}</span>
                  </div>
                )}
                <Separator className="my-2" />
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground shrink-0">Documenti</span>
                  <span className="font-medium text-right">
                    {selectedDocumentCount}/{CUSTOMER_DOCUMENTS.length} presenti
                  </span>
                </div>
                {missingDocumentLabels.length > 0 && (
                  <div className="rounded-md bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
                    Mancano: {missingDocumentLabels.join(", ")}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className={`border-l-4 ${createPortalAccount && companyPortalEnabled ? "border-l-emerald-500" : "border-l-muted"}`}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  {createPortalAccount && companyPortalEnabled ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <ShieldOff className="h-4 w-4 text-muted-foreground" />
                  )}
                  Accesso al portale
                </CardTitle>
                <CardDescription>Genera credenziali di accesso al portale clienti</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!companyPortalEnabled && (
                  <Alert>
                    <ShieldOff className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      L'area privata clienti è <strong>disattivata</strong> nelle impostazioni azienda.
                      Il cliente verrà creato solo in anagrafica, senza account di accesso.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Label htmlFor="toggle-portal" className="text-sm">
                      Crea account portale
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Il cliente potrà accedere con email e password.
                    </p>
                  </div>
                  <Switch
                    id="toggle-portal"
                    checked={companyPortalEnabled && createPortalAccount}
                    onCheckedChange={setCreatePortalAccount}
                    disabled={!companyPortalEnabled}
                  />
                </div>

                {companyPortalEnabled && createPortalAccount && (
                  <>
                    <Separator />
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <Label htmlFor="toggle-welcome" className="text-sm">
                          Invia email di benvenuto
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Invia email con credenziali (consuma 1 credito).
                        </p>
                      </div>
                      <Switch
                        id="toggle-welcome"
                        checked={sendWelcomeEmail}
                        onCheckedChange={setSendWelcomeEmail}
                      />
                    </div>
                  </>
                )}

                {!createPortalAccount && companyPortalEnabled && (
                  <Alert variant="default" className="bg-muted/50">
                    <AlertDescription className="text-xs">
                      Il cliente sarà creato <strong>solo in anagrafica</strong>: nessuna password,
                      nessuna email, nessun accesso al portale.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Actions */}
            <Card>
              <CardContent className="pt-5 space-y-3">
                <Button type="submit" className="w-full" disabled={!canSubmit}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Creazione...
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Crea cliente
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate("/azienda/clienti")}
                  disabled={isSubmitting}
                >
                  Annulla
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={(open) => !open && handleDialogClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-emerald-500" />
              Cliente creato con successo
            </DialogTitle>
            <DialogDescription>
              <strong>{isBusiness ? businessName : `${firstName} ${lastName}`.trim()}</strong> è stato aggiunto all'anagrafica.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {portalWasCreated && generatedPassword ? (
              <>
                {emailWasSent ? (
                  <Alert>
                    <Mail className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      L'email di benvenuto con le credenziali è stata inviata a <strong>{email}</strong>.
                      Puoi comunque copiare la password qui sotto per comodità.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert variant="default" className="border-amber-300 bg-amber-50/50 dark:bg-amber-900/10">
                    <AlertDescription className="text-xs">
                      Nessuna email inviata. <strong>Comunica tu</strong> la password al cliente in modo sicuro.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={email} readOnly className="bg-muted" />
                </div>

                <div className="space-y-2">
                  <Label>Password generata</Label>
                  <div className="flex gap-2">
                    <Input value={generatedPassword} readOnly className="bg-muted font-mono break-all" />
                    <Button type="button" variant="outline" size="icon" onClick={copyPassword} aria-label="Copia password">
                      {passwordCopied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Conserva questa password: non sarà più visibile dopo la chiusura.
                  </p>
                </div>
              </>
            ) : (
              <Alert>
                <ShieldOff className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Cliente creato <strong>solo in anagrafica</strong>: nessun account portale,
                  nessuna password da comunicare.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button onClick={handleDialogClose}>Chiudi e torna alla lista</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
