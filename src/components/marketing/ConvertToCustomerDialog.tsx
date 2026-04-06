import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, UserCheck, AlertTriangle, Copy, Check } from "lucide-react";

interface ConvertToCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: {
    id: string;
    first_name: string;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    province: string | null;
    postal_code: string | null;
    fiscal_code: string | null;
    vat_number: string | null;
    company_name: string | null;
  };
  companyId: string;
  onSuccess: (customerId: string) => void;
}

type Step = "form" | "loading" | "success";

export function ConvertToCustomerDialog({
  open,
  onOpenChange,
  contact,
  companyId,
  onSuccess,
}: ConvertToCustomerDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Pre-compila i campi dai dati del contatto marketing
  const [firstName, setFirstName] = useState(contact.first_name || "");
  const [lastName, setLastName] = useState(contact.last_name || "");
  const [email, setEmail] = useState(contact.email || "");
  const [phone, setPhone] = useState(contact.phone || "");

  // Componi indirizzo da city + province + postal_code
  const composedAddress = [
    contact.address,
    contact.city,
    contact.province ? `(${contact.province})` : null,
    contact.postal_code,
  ]
    .filter(Boolean)
    .join(", ");
  const [address, setAddress] = useState(composedAddress);

  // fiscal_code o vat_number, il primo disponibile
  const [fiscalCode, setFiscalCode] = useState(
    contact.fiscal_code || contact.vat_number || "",
  );

  // company_name nelle note come riferimento
  const [notes, setNotes] = useState(
    contact.company_name ? `Azienda: ${contact.company_name}` : "",
  );

  const [step, setStep] = useState<Step>("form");
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [createdCustomerId, setCreatedCustomerId] = useState("");
  const [copied, setCopied] = useState(false);

  const handleConvert = async () => {
    if (!email.trim()) {
      toast.error("Email obbligatoria per creare l'account cliente");
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("Nome e cognome sono obbligatori");
      return;
    }

    setStep("loading");

    try {
      const { data, error } = await supabase.functions.invoke(
        "convert-contact-to-customer",
        {
          body: {
            contact_id: contact.id,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim() || null,
            address: address.trim() || null,
            fiscal_code: fiscalCode.trim() || null,
            notes: notes.trim() || null,
            company_id: companyId,
          },
        },
      );

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Invalida cache
      queryClient.invalidateQueries({ queryKey: ["marketing_contact", contact.id] });
      queryClient.invalidateQueries({ queryKey: queryKeys.customersList.all });

      setGeneratedPassword(data.password);
      setCreatedCustomerId(data.customer_id);
      setStep("success");
      onSuccess(data.customer_id);
    } catch (err: unknown) {
      setStep("form");
      const message = err instanceof Error ? err.message : "Errore durante la conversione";
      toast.error(message);
    }
  };

  const handleCopyPassword = async () => {
    if (generatedPassword) {
      await navigator.clipboard.writeText(generatedPassword);
      setCopied(true);
      toast.success("Password copiata negli appunti");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleGoToCustomer = () => {
    onOpenChange(false);
    navigate(`/azienda/clienti/${createdCustomerId}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {step === "success" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-emerald-600" />
                Account cliente creato!
              </DialogTitle>
              <DialogDescription>
                Comunica al cliente la password per accedere al portale.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label>Email</Label>
                <Input value={email} readOnly className="bg-muted" />
              </div>
              <div className="space-y-1">
                <Label>Password generata</Label>
                <div className="flex gap-2">
                  <Input value={generatedPassword} readOnly className="bg-muted font-mono" />
                  <Button variant="outline" size="icon" onClick={handleCopyPassword}>
                    {copied
                      ? <Check className="h-4 w-4 text-emerald-600" />
                      : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Conserva questa password — non sarà più visibile.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={handleGoToCustomer}>
                <UserCheck className="h-4 w-4 mr-2" />
                Vai alla scheda cliente
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-emerald-600" />
                Converti in Cliente
              </DialogTitle>
              <DialogDescription>
                Verifica i dati pre-compilati e clicca "Crea account cliente".
                Verrà generata una password e inviata un'email di benvenuto.
              </DialogDescription>
            </DialogHeader>

            {/* Alert se email mancante */}
            {!contact.email && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-700">
                  Il contatto non ha un'email. Inseriscila per creare l'account.
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="cc-fn">Nome *</Label>
                  <Input
                    id="cc-fn"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cc-ln">Cognome *</Label>
                  <Input
                    id="cc-ln"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cc-email">
                  Email *{" "}
                  {!contact.email && (
                    <span className="text-amber-600">(obbligatoria)</span>
                  )}
                </Label>
                <Input
                  id="cc-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cc-phone">Telefono</Label>
                <Input
                  id="cc-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cc-addr">Indirizzo</Label>
                <Textarea
                  id="cc-addr"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cc-cf">CF / P.IVA</Label>
                <Input
                  id="cc-cf"
                  value={fiscalCode}
                  onChange={(e) => setFiscalCode(e.target.value)}
                  maxLength={16}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cc-notes">Note</Label>
                <Textarea
                  id="cc-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Annulla
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={handleConvert}
                disabled={step === "loading"}
              >
                {step === "loading" && (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                )}
                Crea account cliente
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
