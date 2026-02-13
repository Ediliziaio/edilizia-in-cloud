import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export default function CreateCustomer() {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const { toast } = useToast();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [fiscalCode, setFiscalCode] = useState("");
  const [address, setAddress] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Success dialog state
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [passwordCopied, setPasswordCopied] = useState(false);

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
    if (!effectiveCompany?.id) {
      toast({ title: "Errore", description: "Azienda non trovata.", variant: "destructive" });
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
          company_id: effectiveCompany.id,
          fiscal_code: fiscalCode.trim() || null,
          site_address: siteAddress.trim() || null,
          notes: notes.trim() || null,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setGeneratedPassword(data.password);
      setShowSuccessDialog(true);
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
      toast({ title: "Errore", description: "Impossibile copiare la password.", variant: "destructive" });
    }
  };

  const handleDialogClose = () => {
    setShowSuccessDialog(false);
    navigate("/azienda/clienti");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Nuovo Cliente</h1>
          <p className="text-muted-foreground">Aggiungi un nuovo cliente all'azienda</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Dati Cliente
            </CardTitle>
            <CardDescription>
              Inserisci i dati del nuovo cliente. Verrà generata automaticamente una password per l'accesso.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Dati anagrafici */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Dati Anagrafici</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">Nome *</Label>
                  <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Mario" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Cognome *</Label>
                  <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Rossi" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fiscalCode">CF / P.IVA</Label>
                <Input
                  id="fiscalCode"
                  value={fiscalCode}
                  onChange={(e) => setFiscalCode(e.target.value)}
                  placeholder="RSSMRA80A01H501U o 01234567890"
                  maxLength={16}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="mario.rossi@email.com" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Telefono</Label>
                <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+39 333 1234567" />
              </div>
            </div>

            <Separator />

            {/* Indirizzi */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Indirizzi</h3>
              <div className="space-y-2">
                <Label htmlFor="address">Indirizzo Residenza / Sede Legale</Label>
                <Textarea id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Via Roma 1, 00100 Roma" rows={2} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="siteAddress">Indirizzo Cantiere</Label>
                <Textarea id="siteAddress" value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} placeholder="Via del Cantiere 5, 00100 Roma" rows={2} />
              </div>
            </div>

            <Separator />

            {/* Note */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Note</h3>
              <div className="space-y-2">
                <Label htmlFor="notes">Note Aggiuntive</Label>
                <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note interne sul cliente..." rows={3} />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-4 pt-4">
              <Button type="button" variant="outline" onClick={() => navigate("/azienda/clienti")}>
                Annulla
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Creazione..." : "Crea Cliente"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cliente creato con successo!</DialogTitle>
            <DialogDescription>
              Il cliente <strong>{firstName} {lastName}</strong> è stato creato.
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
                <Input value={generatedPassword} readOnly className="bg-muted font-mono" />
                <Button type="button" variant="outline" size="icon" onClick={copyPassword}>
                  {passwordCopied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Conserva questa password in un luogo sicuro. Non sarà più possibile visualizzarla.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleDialogClose}>Chiudi e torna alla lista</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
