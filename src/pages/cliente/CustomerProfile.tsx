import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [address, setAddress] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Initialize form with profile data
  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name || "");
      setLastName(profile.last_name || "");
      setPhone(profile.phone || "");
      setAddress(profile.address || "");
    }
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) return;
    
    // Validation
    if (!firstName.trim() || !lastName.trim()) {
      toast({
        title: "Errore",
        description: "Nome e cognome sono obbligatori",
        variant: "destructive",
      });
      return;
    }

    if (firstName.trim().length > 50 || lastName.trim().length > 50) {
      toast({
        title: "Errore",
        description: "Nome e cognome devono essere inferiori a 50 caratteri",
        variant: "destructive",
      });
      return;
    }

    if (phone.trim().length > 20) {
      toast({
        title: "Errore",
        description: "Il numero di telefono deve essere inferiore a 20 caratteri",
        variant: "destructive",
      });
      return;
    }

    if (address.trim().length > 200) {
      toast({
        title: "Errore",
        description: "L'indirizzo deve essere inferiore a 200 caratteri",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim() || null,
          address: address.trim() || null,
        })
        .eq("id", user.id);

      if (error) throw error;

      // Refresh auth context to update header
      await refreshAuth();

      toast({
        title: "Profilo aggiornato",
        description: "Le tue informazioni sono state salvate con successo",
      });
    } catch (error) {
      console.error("Error updating profile:", error);
      toast({
        title: "Errore",
        description: "Impossibile aggiornare il profilo. Riprova più tardi.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
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
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <User className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Il Mio Profilo</h1>
          <p className="text-muted-foreground">Gestisci le tue informazioni personali</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Informazioni Personali</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email - Read Only */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={profile.email}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                L'email non può essere modificata
              </p>
            </div>

            {/* Name Fields */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">
                  Nome <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Mario"
                  maxLength={50}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">
                  Cognome <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Rossi"
                  maxLength={50}
                  required
                />
              </div>
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label htmlFor="phone">Telefono</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+39 333 1234567"
                maxLength={20}
              />
            </div>

            {/* Address */}
            <div className="space-y-2">
              <Label htmlFor="address">Indirizzo</Label>
              <Textarea
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Via Roma 123, 20100 Milano (MI)"
                maxLength={200}
                rows={2}
              />
            </div>

            {/* Submit Button */}
            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvataggio...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Salva Modifiche
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
