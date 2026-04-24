import { useState, useMemo } from "react";
import { logger } from "@/utils/logger";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, UserPlus, Copy, Check, ShieldCheck, ShieldOff, Mail, Phone, MapPin,
  CreditCard, HardHat, FileText, Loader2,
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
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

// Regex client-side (resta comunque validato server-side)
const PHONE_CLEAN_REGEX = /[\u200B-\u200D\uFEFF]/g; // caratteri invisibili
const PHONE_ALLOWED = /^[0-9+\-\s()\.]+$/;

export default function CreateCustomer() {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Toggle portale a livello company (letto dal contesto)
  const companyPortalEnabled = (effectiveCompany as { customer_portal_enabled?: boolean } | null)
    ?.customer_portal_enabled !== false;

  // ── Form state ─────────────────────────────────────────────
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [fiscalCode, setFiscalCode] = useState("");
  const [address, setAddress] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [notes, setNotes] = useState("");

  // Portale: default segue setting company, ma admin può disattivare per singolo cliente
  const [createPortalAccount, setCreatePortalAccount] = useState(companyPortalEnabled);
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    email.trim().length > 0 &&
    !emailError &&
    !phoneError &&
    !!effectiveCompany?.id &&
    !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName.trim()) {
      toast({ title: "Campo obbligatorio", description: "Inserisci il nome del cliente.", variant: "destructive" });
      return;
    }
    if (!lastName.trim()) {
      toast({ title: "Campo obbligatorio", description: "Inserisci il cognome del cliente.", variant: "destructive" });
      return;
    }
    if (!email.trim()) {
      toast({ title: "Campo obbligatorio", description: "Inserisci l'email del cliente.", variant: "destructive" });
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
      // Normalizzazione client-side
      const cleanPhone = phone.replace(PHONE_CLEAN_REGEX, "").replace(/\s+/g, " ").trim() || null;
      // Rispettiamo la scelta del company (se OFF → sempre OFF), altrimenti toggle UI
      const shouldCreatePortal = companyPortalEnabled && createPortalAccount;

      const { data, error } = await supabase.functions.invoke("create-customer", {
        body: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim().toLowerCase(),
          phone: cleanPhone,
          address: address.trim() || null,
          company_id: effectiveCompany.id,
          fiscal_code: fiscalCode.trim() || null,
          site_address: siteAddress.trim() || null,
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-5xl">
          {/* Colonna principale */}
          <div className="lg:col-span-2 space-y-6">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">Nome *</Label>
                    <Input
                      id="firstName"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Mario"
                      autoComplete="given-name"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Cognome *</Label>
                    <Input
                      id="lastName"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Rossi"
                      autoComplete="family-name"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    Email *
                  </Label>
                  <Input
                    id="email"
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
                    Codice Fiscale / P.IVA
                  </Label>
                  <Input
                    id="fiscalCode"
                    value={fiscalCode}
                    onChange={(e) => setFiscalCode(e.target.value.toUpperCase())}
                    placeholder="RSSMRA80A01H501U"
                    maxLength={16}
                  />
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
                <CardDescription>Residenza/sede legale e indirizzo del cantiere</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="address" className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    Indirizzo residenza / sede legale
                  </Label>
                  <Textarea
                    id="address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Via Roma 1, 00100 Roma"
                    rows={2}
                    maxLength={200}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="siteAddress" className="flex items-center gap-1.5">
                    <HardHat className="h-3.5 w-3.5" />
                    Indirizzo cantiere
                  </Label>
                  <Textarea
                    id="siteAddress"
                    value={siteAddress}
                    onChange={(e) => setSiteAddress(e.target.value)}
                    placeholder="Via del Cantiere 5, 00100 Roma"
                    rows={2}
                    maxLength={200}
                  />
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

          {/* Colonna laterale — Portale / Riepilogo */}
          <div className="space-y-6">
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
              <strong>{firstName} {lastName}</strong> è stato aggiunto all'anagrafica.
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
