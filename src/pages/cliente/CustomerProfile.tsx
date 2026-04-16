import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { User, Save, Loader2 } from "lucide-react";

export default function CustomerProfile() {
  const { user, profile, refreshAuth } = useAuth();
  const { toast } = useToast();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [fiscalCode, setFiscalCode] = useState("");
  const [address, setAddress] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [notes, setNotes] = useState("");

  // Popola il form SOLO alla prima comparsa del profilo per evitare di
  // sovrascrivere quanto l'utente sta digitando se AuthContext refetcha.
  const initializedForUser = useRef<string | null>(null);
  useEffect(() => {
    if (!profile?.id) return;
    if (initializedForUser.current === profile.id) return;
    initializedForUser.current = profile.id;
    setFirstName(profile.first_name || "");
    setLastName(profile.last_name || "");
    setPhone(profile.phone || "");
    setFiscalCode(profile.fiscal_code || "");
    setAddress(profile.address || "");
    setSiteAddress(profile.site_address || "");
    setNotes(profile.notes || "");
  }, [profile?.id, profile]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Utente non autenticato");
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim() || null,
          address: address.trim() || null,
          fiscal_code: fiscalCode.trim() || null,
          site_address: siteAddress.trim() || null,
          notes: notes.trim() || null,
        })
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await refreshAuth();
      toast({ title: "Profilo aggiornato", description: "Le tue informazioni sono state salvate con successo" });
    },
    onError: (error: Error) => {
      console.error("Errore aggiornamento profilo:", error);
      toast({ title: "Errore", description: "Impossibile aggiornare il profilo. Riprova più tardi.", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      toast({ title: "Errore", description: "Nome e cognome sono obbligatori", variant: "destructive" });
      return;
    }
    if (firstName.trim().length > 50 || lastName.trim().length > 50) {
      toast({ title: "Errore", description: "Nome e cognome devono essere inferiori a 50 caratteri", variant: "destructive" });
      return;
    }
    if (phone.trim().length > 20) {
      toast({ title: "Errore", description: "Il numero di telefono deve essere inferiore a 20 caratteri", variant: "destructive" });
      return;
    }
    updateMutation.mutate();
  };

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <User className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Il Mio Profilo</h1>
          <p className="text-sm text-muted-foreground">Gestisci le tue informazioni personali</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Account Section */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Account</p>
          <div className="bg-background border border-border/60 rounded-2xl p-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={profile.email} disabled className="bg-muted rounded-xl h-11" />
              <p className="text-xs text-muted-foreground">L'email non può essere modificata</p>
            </div>
          </div>
        </div>

        {/* Personal Info Section */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Dati Personali</p>
          <div className="bg-background border border-border/60 rounded-2xl p-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">Nome <span className="text-destructive">*</span></Label>
                <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Mario" maxLength={50} required className="rounded-xl h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Cognome <span className="text-destructive">*</span></Label>
                <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Rossi" maxLength={50} required className="rounded-xl h-11" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fiscalCode">CF / P.IVA</Label>
              <Input id="fiscalCode" value={fiscalCode} onChange={(e) => setFiscalCode(e.target.value)} placeholder="RSSMRA80A01H501U o 01234567890" maxLength={16} className="rounded-xl h-11" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Telefono</Label>
              <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+39 333 1234567" maxLength={20} className="rounded-xl h-11" />
            </div>
          </div>
        </div>

        {/* Addresses Section */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Indirizzi</p>
          <div className="bg-background border border-border/60 rounded-2xl p-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="address">Indirizzo Residenza / Sede Legale</Label>
              <Textarea id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Via Roma 123, 20100 Milano (MI)" maxLength={200} rows={2} className="rounded-xl" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="siteAddress">Indirizzo Cantiere</Label>
              <Textarea id="siteAddress" value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} placeholder="Via del Cantiere 5, 00100 Roma" maxLength={200} rows={2} className="rounded-xl" />
            </div>
          </div>
        </div>

        {/* Notes Section */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Note</p>
          <div className="bg-background border border-border/60 rounded-2xl p-4">
            <div className="space-y-2">
              <Label htmlFor="notes">Note Aggiuntive</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note aggiuntive..." maxLength={500} rows={3} className="rounded-xl" />
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <Button type="submit" disabled={updateMutation.isPending} className="w-full rounded-2xl py-3.5 h-auto text-base font-semibold">
          {updateMutation.isPending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvataggio...</>
          ) : (
            <><Save className="mr-2 h-4 w-4" />Salva Modifiche</>
          )}
        </Button>
      </form>
    </div>
  );
}
