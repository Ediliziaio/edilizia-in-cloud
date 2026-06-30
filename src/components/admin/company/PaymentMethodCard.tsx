import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Wallet, Save, Loader2, Link as LinkIcon, Copy, Check, CreditCard, Building2, AlertCircle, CheckCircle2, Sparkles } from "lucide-react";
import type { Company } from "@/types/auth";

// NB: "comped" = regalata (demo, partner, early adopter). Non contabilizzata
// nel MRR. La colonna companies.payment_method è TEXT senza enum DB, quindi
// lo storage accetta il valore senza bisogno di migrazione.
type PaymentMethodType = "none" | "stripe" | "bank_transfer" | "sepa_debit" | "comped" | "other";

interface PaymentMethodCardProps {
  company: Company;
  onSave: (data: {
    payment_method: string;
    bank_iban: string | null;
    bank_account_holder: string | null;
    bank_name: string | null;
    payment_notes: string | null;
  }) => Promise<void>;
  isSaving: boolean;
  onGenerateCheckout?: (billingPeriod?: string) => void;
  isGeneratingCheckout?: boolean;
  checkoutUrl?: string | null;
}

// IBAN validation: checks format and basic structure
function validateIban(iban: string): { valid: boolean; message: string } {
  const cleaned = iban.replace(/\s/g, "").toUpperCase();
  if (!cleaned) return { valid: false, message: "" };
  if (cleaned.length < 15 || cleaned.length > 34) {
    return { valid: false, message: "Lunghezza IBAN non valida" };
  }
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(cleaned)) {
    return { valid: false, message: "Formato IBAN non valido" };
  }
  // Italian IBAN: IT + 25 chars total = 27
  if (cleaned.startsWith("IT") && cleaned.length !== 27) {
    return { valid: false, message: "IBAN italiano: deve essere 27 caratteri (IT + 25)" };
  }
  // Mod-97 check
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
  const numeric = rearranged.split("").map((c) => {
    const code = c.charCodeAt(0);
    return code >= 65 ? String(code - 55) : c;
  }).join("");
  let remainder = 0;
  for (const char of numeric) {
    remainder = (remainder * 10 + parseInt(char)) % 97;
  }
  if (remainder !== 1) {
    return { valid: false, message: "IBAN non valido (checksum fallito)" };
  }
  return { valid: true, message: "IBAN valido" };
}

function formatIban(iban: string): string {
  const cleaned = iban.replace(/\s/g, "").toUpperCase();
  return cleaned.replace(/(.{4})/g, "$1 ").trim();
}

const METHOD_ICONS: Record<PaymentMethodType, React.ComponentType<{ className?: string }>> = {
  none: Wallet,
  stripe: CreditCard,
  bank_transfer: Building2,
  sepa_debit: Building2,
  comped: Sparkles,
  other: Wallet,
};

const METHOD_LABELS: Record<PaymentMethodType, string> = {
  none: "Non configurato",
  stripe: "Carta di credito (Stripe)",
  bank_transfer: "Bonifico IBAN",
  sepa_debit: "Addebito SEPA",
  comped: "Regalata (non pagante)",
  other: "Altro provider",
};

export function PaymentMethodCard({
  company,
  onSave,
  isSaving,
  onGenerateCheckout,
  isGeneratingCheckout,
  checkoutUrl,
}: PaymentMethodCardProps) {
  const [method, setMethod] = useState<PaymentMethodType>((company.payment_method as PaymentMethodType) || "none");
  const [iban, setIban] = useState(company.bank_iban || "");
  const [accountHolder, setAccountHolder] = useState(company.bank_account_holder || "");
  const [bankName, setBankName] = useState(company.bank_name || "");
  const [notes, setNotes] = useState(company.payment_notes || "");
  const [bic, setBic] = useState("");
  const [copied, setCopied] = useState(false);
  const [copiedIban, setCopiedIban] = useState(false);
  const [checkoutPeriod, setCheckoutPeriod] = useState<"monthly" | "yearly">("monthly");

  useEffect(() => {
    setMethod((company.payment_method as PaymentMethodType) || "none");
    setIban(company.bank_iban || "");
    setAccountHolder(company.bank_account_holder || "");
    setBankName(company.bank_name || "");
    setNotes(company.payment_notes || "");
    // S2-02: re-hydrate solo al cambio di company.id (no loop con i singoli campi)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id]);

  const handleSave = () => {
    onSave({
      payment_method: method,
      bank_iban: (method === "bank_transfer" || method === "sepa_debit") ? iban.replace(/\s/g, "").toUpperCase() || null : null,
      bank_account_holder: (method === "bank_transfer" || method === "sepa_debit") ? accountHolder || null : null,
      bank_name: (method === "bank_transfer" || method === "sepa_debit") ? bankName || null : null,
      // FIX: notes salvate anche per "comped" (motivo regalo/demo/partner),
      // prima venivano preservate solo per "other".
      payment_notes: (method === "other" || method === "comped") ? notes || null : null,
    });
  };

  const handleCopy = async () => {
    if (checkoutUrl) {
      await navigator.clipboard.writeText(checkoutUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyIban = async () => {
    const formatted = iban.replace(/\s/g, "").toUpperCase();
    if (formatted) {
      await navigator.clipboard.writeText(formatted);
      setCopiedIban(true);
      setTimeout(() => setCopiedIban(false), 2000);
    }
  };

  const ibanValidation = (method === "bank_transfer" || method === "sepa_debit") && iban
    ? validateIban(iban)
    : null;

  const hasChanges =
    method !== (company.payment_method || "none") ||
    ((method === "bank_transfer" || method === "sepa_debit") && (
      iban.replace(/\s/g, "").toUpperCase() !== (company.bank_iban || "") ||
      accountHolder !== (company.bank_account_holder || "") ||
      bankName !== (company.bank_name || "")
    )) ||
    ((method === "other" || method === "comped") && notes !== (company.payment_notes || ""));

  const MethodIcon = METHOD_ICONS[method] ?? Wallet;
  const isConfigured = method !== "none";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MethodIcon className="h-5 w-5" />
            Metodo di Pagamento
          </CardTitle>
          {isConfigured && (
            <Badge variant="default" className="text-xs">
              {METHOD_LABELS[method]}
            </Badge>
          )}
        </div>
        <CardDescription>Configura come l'azienda paga l'abbonamento</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Tipo di pagamento</Label>
          <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethodType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <div className="flex items-center gap-2"><Wallet className="h-4 w-4" /> Non configurato</div>
              </SelectItem>
              <SelectItem value="stripe">
                <div className="flex items-center gap-2"><CreditCard className="h-4 w-4" /> Carta di credito (Stripe)</div>
              </SelectItem>
              <SelectItem value="bank_transfer">
                <div className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Bonifico IBAN</div>
              </SelectItem>
              <SelectItem value="sepa_debit">
                <div className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Addebito SEPA</div>
              </SelectItem>
              <SelectItem value="comped">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-600" /> Regalata (non pagante)
                </div>
              </SelectItem>
              <SelectItem value="other">
                <div className="flex items-center gap-2"><Wallet className="h-4 w-4" /> Altro provider</div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Sezione dedicata stato "comped": spiega l'impatto business */}
        {method === "comped" && (
          <div className="rounded-lg border border-violet-200 dark:border-violet-900 bg-violet-50 dark:bg-violet-950/30 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-600" />
              <p className="text-sm font-semibold text-violet-900 dark:text-violet-100">
                Azienda regalata
              </p>
            </div>
            <p className="text-xs text-violet-800/80 dark:text-violet-200/80">
              L'azienda ha accesso gratuito per policy (demo, partner, early adopter,
              referral). <strong>Non verrà contabilizzata nel MRR</strong> della
              piattaforma. Usa le <em>Note interne</em> per tracciare il motivo.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Motivo / Note interne</Label>
              <Textarea
                placeholder="Es. Demo per evento Milano 2025 · Partner strategico · Referral senior..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="text-sm bg-background"
              />
            </div>
          </div>
        )}

        {method === "stripe" && (
          <div className="space-y-3 pt-2">
            {company.stripe_customer_id && (
              <div className="flex justify-between py-2 border-b text-sm">
                <span className="text-muted-foreground">Stripe Customer ID</span>
                <span className="font-medium font-mono text-xs">{company.stripe_customer_id}</span>
              </div>
            )}
            {onGenerateCheckout && (
              <div className="flex flex-wrap items-center gap-2">
                <Select value={checkoutPeriod} onValueChange={(v) => setCheckoutPeriod(v as "monthly" | "yearly")}>
                  <SelectTrigger className="h-8 w-28 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Mensile</SelectItem>
                    <SelectItem value="yearly">Annuale</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => onGenerateCheckout(checkoutPeriod)} disabled={isGeneratingCheckout}>
                  {isGeneratingCheckout ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <LinkIcon className="h-3 w-3 mr-1" />}
                  Genera Link Pagamento
                </Button>
              </div>
            )}
            {checkoutUrl && (
              <div className="p-3 bg-muted rounded-lg space-y-2">
                <p className="text-sm font-medium">Link di pagamento generato:</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono break-all flex-1">{checkoutUrl}</code>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleCopy}>
                    {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {(method === "bank_transfer" || method === "sepa_debit") && (
          <div className="space-y-3 pt-2">
            {/* IBAN field with validation */}
            <div className="space-y-2">
              <Label>IBAN</Label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Input
                    value={iban}
                    onChange={(e) => setIban(e.target.value)}
                    placeholder="IT60 X054 2811 1010 0000 0123 456"
                    className={ibanValidation ? (ibanValidation.valid ? "border-emerald-500 pr-8" : "border-destructive pr-8") : ""}
                    onBlur={(e) => {
                      if (e.target.value) setIban(formatIban(e.target.value));
                    }}
                  />
                  {ibanValidation && (
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                      {ibanValidation.valid
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        : <AlertCircle className="h-4 w-4 text-destructive" />}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  disabled={!iban}
                  onClick={handleCopyIban}
                  title="Copia IBAN"
                >
                  {copiedIban ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              {ibanValidation && !ibanValidation.valid && ibanValidation.message && (
                <p className="text-xs text-destructive">{ibanValidation.message}</p>
              )}
              {ibanValidation?.valid && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">✓ {ibanValidation.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Intestatario conto</Label>
              <Input value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} placeholder="Nome azienda o persona" />
            </div>

            <div className="space-y-2">
              <Label>Nome banca</Label>
              <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Es. Intesa Sanpaolo" />
            </div>

            <div className="space-y-2">
              <Label>BIC/SWIFT <span className="text-muted-foreground text-xs">(facoltativo, per bonifici internazionali)</span></Label>
              <Input
                value={bic}
                onChange={(e) => setBic(e.target.value.toUpperCase())}
                placeholder="Es. BCITITMM"
                maxLength={11}
              />
            </div>
          </div>
        )}

        {method === "other" && (
          <div className="space-y-2 pt-2">
            <Label>Note / Dettagli provider</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Es. PayPal, Satispay, dettagli di contatto..." rows={3} />
          </div>
        )}

        {hasChanges && (
          <Button
            onClick={handleSave}
            disabled={isSaving || (ibanValidation !== null && !ibanValidation.valid)}
            size="sm"
            className="mt-2"
          >
            {isSaving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
            Salva metodo di pagamento
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
