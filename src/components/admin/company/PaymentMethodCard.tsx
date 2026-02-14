import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Wallet, Save, Loader2, Link as LinkIcon, Copy, Check } from "lucide-react";
import type { Company } from "@/types/auth";

type PaymentMethodType = "none" | "stripe" | "bank_transfer" | "other";

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
  onGenerateCheckout?: () => void;
  isGeneratingCheckout?: boolean;
  checkoutUrl?: string | null;
}

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
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMethod((company.payment_method as PaymentMethodType) || "none");
    setIban(company.bank_iban || "");
    setAccountHolder(company.bank_account_holder || "");
    setBankName(company.bank_name || "");
    setNotes(company.payment_notes || "");
  }, [company.id]);

  const handleSave = () => {
    onSave({
      payment_method: method,
      bank_iban: method === "bank_transfer" ? iban || null : null,
      bank_account_holder: method === "bank_transfer" ? accountHolder || null : null,
      bank_name: method === "bank_transfer" ? bankName || null : null,
      payment_notes: method === "other" ? notes || null : null,
    });
  };

  const handleCopy = async () => {
    if (checkoutUrl) {
      await navigator.clipboard.writeText(checkoutUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const hasChanges =
    method !== (company.payment_method || "none") ||
    (method === "bank_transfer" && (iban !== (company.bank_iban || "") || accountHolder !== (company.bank_account_holder || "") || bankName !== (company.bank_name || ""))) ||
    (method === "other" && notes !== (company.payment_notes || ""));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Metodo di Pagamento
        </CardTitle>
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
              <SelectItem value="none">Non configurato</SelectItem>
              <SelectItem value="stripe">Stripe (Carta di credito)</SelectItem>
              <SelectItem value="bank_transfer">Bonifico IBAN</SelectItem>
              <SelectItem value="other">Altro provider</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {method === "stripe" && (
          <div className="space-y-3 pt-2">
            {company.stripe_customer_id && (
              <div className="flex justify-between py-2 border-b text-sm">
                <span className="text-muted-foreground">Stripe Customer ID</span>
                <span className="font-medium font-mono text-xs">{company.stripe_customer_id}</span>
              </div>
            )}
            {onGenerateCheckout && (
              <Button variant="outline" size="sm" onClick={onGenerateCheckout} disabled={isGeneratingCheckout}>
                {isGeneratingCheckout ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <LinkIcon className="h-3 w-3 mr-1" />}
                Genera Link Pagamento
              </Button>
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

        {method === "bank_transfer" && (
          <div className="space-y-3 pt-2">
            <div className="space-y-2">
              <Label>IBAN</Label>
              <Input value={iban} onChange={(e) => setIban(e.target.value)} placeholder="IT60 X054 2811 1010 0000 0123 456" />
            </div>
            <div className="space-y-2">
              <Label>Intestatario conto</Label>
              <Input value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} placeholder="Nome azienda o persona" />
            </div>
            <div className="space-y-2">
              <Label>Nome banca</Label>
              <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Es. Intesa Sanpaolo" />
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
          <Button onClick={handleSave} disabled={isSaving} size="sm" className="mt-2">
            {isSaving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
            Salva metodo di pagamento
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
