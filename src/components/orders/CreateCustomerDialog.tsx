import { useEffect, useMemo, useState } from "react";
import { User, Copy, Check, ShieldCheck, ShieldOff, Upload, X, FileCheck2, FileWarning } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { logger } from "@/utils/logger";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { companyCustomersKeys, type CompanyCustomer } from "@/hooks/useCompanyCustomers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PHONE_CLEAN_REGEX = /[\u200B-\u200D\uFEFF]/g;
const PHONE_ALLOWED = /^[0-9+\-\s().]+$/;
const CUSTOMER_DOCUMENT_BUCKET = "customer-documents";
type CustomerDocumentType = "contract" | "identity" | "fiscal_code";
const CUSTOMER_DOCUMENTS: Array<{ type: CustomerDocumentType; label: string }> = [
  { type: "contract", label: "Contratto" },
  { type: "identity", label: "Documento identità" },
  { type: "fiscal_code", label: "Codice fiscale" },
];

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^\w.-]+/g, "_");
}

/** Divide un nome completo / ragione sociale in nome + cognome (best-effort:
 *  primo token = nome, resto = cognome; parola singola → tutto nel nome). */
function splitFullName(full: string): { first: string; last: string } {
  const tokens = full.trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return { first: tokens[0] ?? "", last: "" };
  return { first: tokens[0], last: tokens.slice(1).join(" ") };
}

interface CreateCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCustomerCreated: (customerId: string, customerName: string) => void;
  /** Precompila i campi all'apertura (es. dal contatto di un preventivo). */
  initialValues?: {
    /** Nome completo / ragione sociale — diviso in automatico in nome/cognome. */
    fullName?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    address?: string;
    fiscalCode?: string;
  };
  /** Default per il toggle "crea account portale" (es. dal preventivo: OFF → solo
   *  anagrafica, niente email di benvenuto a sorpresa). Se assente usa companyPortalEnabled. */
  defaultCreatePortalAccount?: boolean;
}

export function CreateCustomerDialog({
  open,
  onOpenChange,
  onCustomerCreated,
  initialValues,
  defaultCreatePortalAccount,
}: CreateCustomerDialogProps) {
  const { effectiveCompany, user } = useAuth();
  const queryClient = useQueryClient();

  const companyPortalEnabled = (effectiveCompany as { customer_portal_enabled?: boolean } | null)
    ?.customer_portal_enabled !== false;

  // Init dai valori del contatto (es. preventivo). Il RE-mount via `key` lato
  // chiamante rifà l'init quando i dati async arrivano → niente effetto/ref.
  const _initialFullName = initialValues?.fullName ?? [initialValues?.firstName, initialValues?.lastName].filter(Boolean).join(" ");
  const _initialSplit = splitFullName(_initialFullName ?? "");
  const [fullName, setFullName] = useState(_initialFullName ?? "");
  const [firstName, setFirstName] = useState(initialValues?.firstName ?? _initialSplit.first);
  const [lastName, setLastName] = useState(initialValues?.lastName ?? _initialSplit.last);
  const [email, setEmail] = useState(initialValues?.email ?? "");
  const [phone, setPhone] = useState(initialValues?.phone ?? "");
  const [address, setAddress] = useState(initialValues?.address ?? "");
  const [fiscalCode, setFiscalCode] = useState(initialValues?.fiscalCode ?? "");
  const [siteAddress, setSiteAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [customerDocuments, setCustomerDocuments] = useState<Partial<Record<CustomerDocumentType, File>>>({});
  const [createPortalAccount, setCreatePortalAccount] = useState(defaultCreatePortalAccount ?? companyPortalEnabled);
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Success step state
  const [showSuccessStep, setShowSuccessStep] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [portalWasCreated, setPortalWasCreated] = useState(false);
  const [createdCustomerId, setCreatedCustomerId] = useState("");
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const selectedDocumentCount = Object.values(customerDocuments).filter(Boolean).length;

  useEffect(() => {
    if (!companyPortalEnabled) {
      setCreatePortalAccount(false);
      setSendWelcomeEmail(false);
    }
  }, [companyPortalEnabled]);

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

  const phoneError = useMemo(() => {
    if (!phone.trim()) return null;
    const cleaned = phone.replace(PHONE_CLEAN_REGEX, "").trim();
    if (!PHONE_ALLOWED.test(cleaned)) {
      return "Telefono: solo cifre, spazi, + - ( ) .";
    }
    const digits = cleaned.replace(/\D/g, "");
    if (digits.length < 6) return "Numero troppo corto";
    if (digits.length > 15) return "Numero troppo lungo";
    return null;
  }, [phone]);

  const emailError = useMemo(() => {
    if (!email.trim()) return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return "Formato email non valido";
    }
    return null;
  }, [email]);

  const resetForm = () => {
    setFullName("");
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setAddress("");
    setFiscalCode("");
    setSiteAddress("");
    setNotes("");
    setCustomerDocuments({});
    setCreatePortalAccount(defaultCreatePortalAccount ?? companyPortalEnabled);
    setSendWelcomeEmail(true);
    setShowSuccessStep(false);
    setGeneratedPassword(null);
    setPortalWasCreated(false);
    setCreatedCustomerId("");
    setPasswordCopied(false);
    setShowConfirmClose(false);
  };

  const isDirty =
    !showSuccessStep &&
    (firstName.trim() !== "" || lastName.trim() !== "" || email.trim() !== "" ||
     phone.trim() !== "" || address.trim() !== "" || fiscalCode.trim() !== "" ||
     siteAddress.trim() !== "" || notes.trim() !== "" || selectedDocumentCount > 0);
  const shouldRequireEmail = companyPortalEnabled && createPortalAccount;

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const requestClose = () => {
    if (isDirty) {
      setShowConfirmClose(true);
    } else {
      handleClose();
    }
  };

  const confirmDiscardAndClose = () => {
    setShowConfirmClose(false);
    handleClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName.trim() && !lastName.trim()) {
      toast.error("Campo obbligatorio", { description: "Inserisci il nome completo o la ragione sociale del cliente." });
      return;
    }
    const shouldCreatePortal = companyPortalEnabled && createPortalAccount;
    if (shouldCreatePortal && !email.trim()) {
      toast.error("Campo obbligatorio", { description: "Inserisci l'email per creare l'accesso al portale." });
      return;
    }
    if (emailError) {
      toast.error("Email non valida", { description: emailError });
      return;
    }
    if (phoneError) {
      toast.error("Telefono non valido", { description: phoneError });
      return;
    }
    if (!effectiveCompany?.id) {
      toast.error("Errore", { description: "Azienda non trovata." });
      return;
    }

    setIsSubmitting(true);

    try {
      const cleanPhone = phone.replace(PHONE_CLEAN_REGEX, "").replace(/\s+/g, " ").trim() || null;

      const { data, error } = await supabase.functions.invoke("create-customer", {
        body: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim().toLowerCase() || null,
          phone: cleanPhone,
          address: address.trim() || null,
          fiscal_code: fiscalCode.trim() || null,
          site_address: siteAddress.trim() || null,
          notes: notes.trim() || null,
          company_id: effectiveCompany.id,
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
      if (data?.error) throw new Error(data.error);

      const newCustomerId = data?.customer?.id ?? data?.user_id ?? data?.customer_id;
      if (!newCustomerId) {
        throw new Error("Risposta non valida dal server (ID cliente mancante).");
      }

      // 🛠️ Cache invalidation v2 (2026-05-10): bug fix "cliente appena creato non visibile"
      //
      // Prima invalidavamo solo `["customers"]` e `customersList.all`, ma il
      // dropdown della creazione commessa usa la query key `companyCustomersKeys`
      // (`["company-customers", companyId]`) → la cache restava stale per 5min
      // e l'utente non vedeva il cliente appena creato.
      //
      // Strategia ottimistica: aggiungiamo subito il cliente alla cache + invalidiamo
      // tutte le 3 query keys per refresh completo nei sub-componenti.
      const optimisticCustomer: CompanyCustomer = {
        id: newCustomerId,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim() || null,
      };
      queryClient.setQueryData<CompanyCustomer[]>(
        companyCustomersKeys.byCompany(effectiveCompany?.id),
        (prev) => {
          const list = prev ?? [];
          // Evita duplicati se per qualche motivo il customer è già lì
          if (list.some((c) => c.id === newCustomerId)) return list;
          return [...list, optimisticCustomer].sort((a, b) => {
            const aLast = (a.last_name ?? "").toLowerCase();
            const bLast = (b.last_name ?? "").toLowerCase();
            if (aLast !== bLast) return aLast < bLast ? -1 : 1;
            const aFirst = (a.first_name ?? "").toLowerCase();
            const bFirst = (b.first_name ?? "").toLowerCase();
            return aFirst < bFirst ? -1 : aFirst > bFirst ? 1 : 0;
          });
        },
      );
      // Invalida le 2 chiavi reali in uso nel codebase:
      //   - companyCustomersKeys.byCompany — alimentata da useCompanyCustomers
      //     (dropdown commesse, ticket, interventi)
      //   - queryKeys.customersList.all — alimentata da CustomersList page
      // La key "customers" legacy è stata rimossa (nessuna query la usava più).
      queryClient.invalidateQueries({ queryKey: companyCustomersKeys.byCompany(effectiveCompany?.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.customersList.all });
      if (selectedDocumentCount > 0) {
        try {
          await uploadCustomerDocuments(newCustomerId);
          toast.success("Documenti cliente caricati", {
            description: `${selectedDocumentCount} documento/i salvati nel fascicolo cliente.`,
          });
        } catch (uploadError) {
          logger.error("Customer documents upload error:", uploadError);
          toast.error("Cliente creato, documenti non caricati", {
            description: uploadError instanceof Error ? uploadError.message : "Carica i documenti dalla scheda cliente.",
          });
        }
      }
      setCreatedCustomerId(newCustomerId);
      setGeneratedPassword(data.password ?? null);
      setPortalWasCreated(!!data.portal_account_created);

      // Se non è stato creato un account portale (solo anagrafica),
      // non serve mostrare lo step password — seleziona subito il cliente.
      if (!data.portal_account_created) {
        const customerName = `${firstName.trim()} ${lastName.trim()}`;
        onCustomerCreated(newCustomerId, customerName);
        handleClose();
        toast.success("Cliente creato", {
          description: `${customerName} (solo anagrafica) è stato selezionato per la commessa.`,
        });
        return;
      }

      setShowSuccessStep(true);
    } catch (e) {
      logger.error("Create customer error:", e);
      toast.error("Errore", {
        description: e instanceof Error ? e.message : "Si è verificato un errore durante la creazione del cliente.",
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
      toast.error("Errore", { description: "Impossibile copiare la password." });
    }
  };

  const handleConfirm = () => {
    const customerName = `${firstName.trim()} ${lastName.trim()}`;
    onCustomerCreated(createdCustomerId, customerName);
    handleClose();
    toast.success("Cliente creato", {
      description: `${customerName} è stato selezionato per la commessa.`,
    });
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) requestClose(); }}>
      <DialogContent
        className="max-w-md max-h-[85vh] overflow-y-auto"
        onPointerDownOutside={(e) => { if (isDirty) { e.preventDefault(); setShowConfirmClose(true); } }}
        onEscapeKeyDown={(e) => { if (isDirty) { e.preventDefault(); setShowConfirmClose(true); } }}
      >
        {!showSuccessStep ? (
          <>
            <DialogHeader>
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <DialogTitle>Nuovo Cliente</DialogTitle>
                  <DialogDescription>
                    Crea un nuovo cliente e selezionalo per la commessa
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="dialog-fullName">Nome completo / Ragione sociale</Label>
                <Input
                  id="dialog-fullName"
                  value={fullName}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFullName(v);
                    const s = splitFullName(v);
                    setFirstName(s.first);
                    setLastName(s.last);
                  }}
                  placeholder="Es. Mario Rossi — oppure Edilizia Rossi SRL"
                  autoComplete="name"
                />
                <p className="text-xs text-muted-foreground">
                  Diviso in automatico in Nome/Cognome. Correggi sotto se serve (basta Nome o Cognome).
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dialog-firstName">Nome</Label>
                  <Input
                    id="dialog-firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Mario"
                    autoComplete="given-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dialog-lastName">Cognome</Label>
                  <Input
                    id="dialog-lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Rossi"
                    autoComplete="family-name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dialog-email">Email {shouldRequireEmail ? "*" : ""}</Label>
                <Input
                  id="dialog-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="mario.rossi@email.com"
                  autoComplete="email"
                  required={shouldRequireEmail}
                  aria-invalid={!!emailError}
                />
                {emailError && <p className="text-xs text-destructive">{emailError}</p>}
                {!shouldRequireEmail && (
                  <p className="text-xs text-muted-foreground">
                    Opzionale se crei solo l'anagrafica. Obbligatoria per il portale clienti.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="dialog-phone">Telefono</Label>
                <Input
                  id="dialog-phone"
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
                <Label htmlFor="dialog-address">Indirizzo</Label>
                <Textarea
                  id="dialog-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Via Roma 1, 00100 Roma"
                  rows={2}
                  maxLength={200}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dialog-fiscalCode">CF / P.IVA</Label>
                <Input
                  id="dialog-fiscalCode"
                  value={fiscalCode}
                  onChange={(e) => setFiscalCode(e.target.value.toUpperCase())}
                  placeholder="RSSMRA80A01H501U"
                  maxLength={16}
                />
              </div>

              <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
                <div className="flex items-start gap-2">
                  <FileCheck2 className="h-4 w-4 text-emerald-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Documenti cliente</p>
                    <p className="text-xs text-muted-foreground">
                      Opzionali, ma tracciati come presenti o mancanti nel fascicolo.
                    </p>
                  </div>
                </div>
                <Alert className="py-2 bg-amber-50/60 border-amber-200">
                  <FileWarning className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-xs text-amber-900">
                    Se non li carichi ora, il cliente viene creato comunque.
                  </AlertDescription>
                </Alert>
                <div className="space-y-2">
                  {CUSTOMER_DOCUMENTS.map((doc) => {
                    const file = customerDocuments[doc.type];
                    return (
                      <div key={doc.type} className="flex items-center justify-between gap-2 rounded-md border bg-background p-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-medium">{doc.label}</p>
                            <Badge variant={file ? "default" : "outline"} className="text-[10px]">
                              {file ? "presente" : "mancante"}
                            </Badge>
                          </div>
                          {file && <p className="truncate text-[11px] text-muted-foreground">{file.name}</p>}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Label
                            htmlFor={`dialog-customer-doc-${doc.type}`}
                            className="inline-flex h-8 cursor-pointer items-center justify-center rounded-md border bg-background px-2 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
                          >
                            <Upload className="mr-1 h-3.5 w-3.5" />
                            {file ? "Cambia" : "Carica"}
                          </Label>
                          <Input
                            id={`dialog-customer-doc-${doc.type}`}
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
                              className="h-8 w-8"
                              onClick={() => handleDocumentChange(doc.type, null)}
                              aria-label={`Rimuovi ${doc.label}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dialog-siteAddress">Indirizzo Cantiere</Label>
                <Textarea
                  id="dialog-siteAddress"
                  value={siteAddress}
                  onChange={(e) => setSiteAddress(e.target.value)}
                  placeholder="Via del Cantiere 5, 00100 Roma"
                  rows={2}
                  maxLength={200}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dialog-notes">Note</Label>
                <Textarea
                  id="dialog-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Note aggiuntive sul cliente..."
                  rows={2}
                  maxLength={500}
                />
              </div>

              {/* Toggle area privata */}
              <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
                {!companyPortalEnabled ? (
                  <Alert className="py-2">
                    <ShieldOff className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Area privata disattivata dalle impostazioni azienda. Il cliente verrà creato
                      solo in anagrafica e non è possibile creare l'accesso al portale.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex items-center gap-2">
                        {createPortalAccount ? (
                          <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                        ) : (
                          <ShieldOff className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <div className="min-w-0">
                          <Label htmlFor="dialog-toggle-portal" className="text-sm">
                            Crea account portale
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Genera password di accesso per il cliente.
                          </p>
                        </div>
                      </div>
                      <Switch
                        id="dialog-toggle-portal"
                        checked={createPortalAccount}
                        onCheckedChange={setCreatePortalAccount}
                      />
                    </div>
                    {createPortalAccount && (
                      <div className="flex items-center justify-between gap-3 pt-1 border-t">
                        <div className="min-w-0">
                          <Label htmlFor="dialog-toggle-welcome" className="text-sm">
                            Invia email di benvenuto
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Email con credenziali al cliente.
                          </p>
                        </div>
                        <Switch
                          id="dialog-toggle-welcome"
                          checked={sendWelcomeEmail}
                          onCheckedChange={setSendWelcomeEmail}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={requestClose}>
                  Annulla
                </Button>
                <Button type="submit" disabled={isSubmitting || !!emailError || !!phoneError}>
                  {isSubmitting ? "Creazione..." : "Crea Cliente"}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-emerald-500" />
                Cliente creato!
              </DialogTitle>
              <DialogDescription>
                {portalWasCreated
                  ? "Comunica al cliente la password generata per accedere al suo account."
                  : "Il cliente è stato creato solo in anagrafica."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {portalWasCreated && generatedPassword ? (
                <>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input value={email} readOnly className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Password generata</Label>
                    <div className="flex gap-2">
                      <Input
                        value={generatedPassword}
                        readOnly
                        className="bg-muted font-mono break-all"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={copyPassword}
                        aria-label="Copia password"
                      >
                        {passwordCopied ? (
                          <Check className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Conserva questa password in un luogo sicuro.
                    </p>
                  </div>
                </>
              ) : (
                <Alert>
                  <ShieldOff className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Cliente creato <strong>solo in anagrafica</strong>. Nessun accesso al portale.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <Button onClick={handleConfirm}>
                Seleziona e Continua
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>

    {/* Conferma annullamento creazione */}
    <AlertDialog open={showConfirmClose} onOpenChange={setShowConfirmClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Annullare la creazione del cliente?</AlertDialogTitle>
          <AlertDialogDescription>
            Hai inserito dei dati che non sono ancora stati salvati. Se esci ora, tutte le informazioni verranno perse.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Continua creazione</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmDiscardAndClose}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Esci e annulla
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
