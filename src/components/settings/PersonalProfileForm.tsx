import { useState, useEffect } from "react";
import { User, Mail, Phone, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";


export function PersonalProfileForm() {
  const { profile, user, refreshAuth } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Sync state when profile loads asynchronously
  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name || "");
      setLastName(profile.last_name || "");
      setPhone(profile.phone || "");
    }
  }, [profile]);

  const handleSaveProfile = async () => {
    if (!profile) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim() || null,
        })
        .eq("id", profile.id);

      if (error) throw error;

      await refreshAuth();
      toast.success("Profilo aggiornato", { description: "I tuoi dati sono stati salvati." });
    } catch {
      toast.error("Errore", { description: "Impossibile salvare il profilo." });
    } finally {
      setIsSaving(false);
    }
  };


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Il Mio Profilo
          </CardTitle>
          <CardDescription>Gestisci i tuoi dati personali</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">Nome</Label>
              <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={50} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Cognome</Label>
              <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={50} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> Email
            </Label>
            <Input id="email" value={user?.email || ""} disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground">L'email non può essere modificata da qui.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" /> Telefono
            </Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Es. +39 333 1234567" maxLength={20} />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveProfile} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Salva Profilo
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
