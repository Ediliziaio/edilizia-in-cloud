import { useState } from "react";
import { User, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

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
  const { effectiveCompany, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [fiscalCode, setFiscalCode] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Success step state
  const [showPasswordStep, setShowPasswordStep] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [createdCustomerId, setCreatedCustomerId] = useState("");
  const [passwordCopied, setPasswordCopied] = useState(false);

  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setAddress("");
    setFiscalCode("");
    setSiteAddress("");
    setNotes("");
    setShowPasswordStep(false);
    setGeneratedPassword("");
    setCreatedCustomerId("");
    setPasswordCopied(false);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName.trim()) {
      toast({
        title: "Campo obbligatorio",
        description: "Inserisci il nome del cliente.",
        variant: "destructive",
      });
      return;
    }

    if (!lastName.trim()) {
      toast({
        title: "Campo obbligatorio",
        description: "Inserisci il cognome del cliente.",
        variant: "destructive",
      });
      return;
    }

    if (!email.trim()) {
      toast({
        title: "Campo obbligatorio",
        description: "Inserisci l'email del cliente.",
        variant: "destructive",
      });
      return;
    }

    if (!effectiveCompany?.id) {
      toast({
        title: "Errore",
        description: "Azienda non trovata.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke("create-customer", {
        body: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim() || null,
          address: address.trim() || null,
          fiscal_code: fiscalCode.trim() || null,
          site_address: siteAddress.trim() || null,
          notes: notes.trim() || null,
          company_id: effectiveCompany.id,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // Invalidate customers query
      queryClient.invalidateQueries({ queryKey: ["customers", user?.id] });

      // Show password step
      setCreatedCustomerId(data.user_id);
      setGeneratedPassword(data.password);
      setShowPasswordStep(true);
    } catch (error: any) {
      console.error("Create customer error:", error);
      toast({
        title: "Errore",
        description: error.message || "Si è verificato un errore durante la creazione del cliente.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(generatedPassword);
      setPasswordCopied(true);
      setTimeout(() => setPasswordCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Errore",
        description: "Impossibile copiare la password.",
        variant: "destructive",
      });
    }
  };

  const handleConfirm = () => {
    const customerName = `${firstName} ${lastName}`;
    onCustomerCreated(createdCustomerId, customerName);
    handleClose();
    toast({
      title: "Cliente creato",
      description: `${customerName} è stato selezionato per l'ordine.`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        {!showPasswordStep ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Nuovo Cliente
              </DialogTitle>
              <DialogDescription>
                Crea un nuovo cliente e selezionalo per l'ordine
              </DialogDescription>
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
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dialog-lastName">Cognome *</Label>
                  <Input
                    id="dialog-lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Rossi"
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
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dialog-phone">Telefono</Label>
                <Input
                  id="dialog-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+39 333 1234567"
                />
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
                  onChange={(e) => setFiscalCode(e.target.value)}
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

              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleClose}>
                  Annulla
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Creazione..." : "Crea Cliente"}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Cliente creato!</DialogTitle>
              <DialogDescription>
                Comunica al cliente la password generata per accedere al suo account.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
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
                    className="bg-muted font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={copyPassword}
                  >
                    {passwordCopied ? (
                      <Check className="h-4 w-4 text-primary" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Conserva questa password in un luogo sicuro.
                </p>
              </div>
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
  );
}
