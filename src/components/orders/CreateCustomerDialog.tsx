import { useMemo, useState } from "react";
import { User, Copy, Check, ShieldCheck, ShieldOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { logger } from "@/utils/logger";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

interface CreateCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCustomerCreated: (customerId: string, customerName: string) => void;
}

export function CreateCustomerDialog({
  open,
  onOpenChange,
  onCustomerCreated,
}: CreateCustomerDialogProps) {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();

  const companyPortalEnabled = (effectiveCompany as { customer_portal_enabled?: boolean } | null)
    ?.customer_portal_enabled !== false;

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [fiscalCode, setFiscalCode] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [createPortalAccount, setCreatePortalAccount] = useState(companyPortalEnabled);
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Success step state
  const [showSuccessStep, setShowSuccessStep] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [portalWasCreated, setPortalWasCreated] = useState(false);
  const [createdCustomerId, setCreatedCustomerId] = useState("");
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);

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
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setAddress("");
    setFiscalCode("");
    setSiteAddress("");
    setNotes("");
    setCreatePortalAccount(companyPortalEnabled);
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
     siteAddress.trim() !== "" || notes.trim() !== "");

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

    if (!firstName.trim()) {
      toast.error("Campo obbligatorio", { description: "Inserisci il nome del cliente." });
      return;
    }
    if (!lastName.trim()) {
      toast.error("Campo obbligatorio", { description: "Inserisci il cognome del cliente." });
      return;
    }
    if (!email.trim()) {
      toast.error("Campo obbligatorio", { description: "Inserisci l'email del cliente." });
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
      const shouldCreatePortal = companyPortalEnabled && createPortalAccount;

      const { data, error } = await supabase.functions.invoke("create-customer", {
        body: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim().toLowerCase(),
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

      queryClient.invalidateQueries({ queryKey: ["customers", effectiveCompany?.id] });
      queryClient.invalidateQueries({ queryKey: queryKeys.customersList.all });

      const newCustomerId = data?.customer?.id ?? data?.user_id ?? data?.customer_id;
      if (!newCustomerId) {
        throw new Error("Risposta non valida dal server (ID cliente mancante).");
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dialog-firstName">Nome *</Label>
                  <Input
                    id="dialog-firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Mario"
                    autoComplete="given-name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dialog-lastName">Cognome *</Label>
                  <Input
                    id="dialog-lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Rossi"
                    autoComplete="family-name"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dialog-email">Email *</Label>
                <Input
                  id="dialog-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="mario.rossi@email.com"
                  autoComplete="email"
                  required
                  aria-invalid={!!emailError}
                />
                {emailError && <p className="text-xs text-destructive">{emailError}</p>}
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
                {!companyPortalEnabled && (
                  <Alert className="py-2">
                    <ShieldOff className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Area privata disattivata dalle impostazioni azienda.
                    </AlertDescription>
                  </Alert>
                )}
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-2">
                    {companyPortalEnabled && createPortalAccount ? (
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
                    checked={companyPortalEnabled && createPortalAccount}
                    onCheckedChange={setCreatePortalAccount}
                    disabled={!companyPortalEnabled}
                  />
                </div>
                {companyPortalEnabled && createPortalAccount && (
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
