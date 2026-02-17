import { useState, useEffect, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Shield, User, Mail, Loader2, Save, Key, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

function getPasswordStrength(password: string) {
  if (!password) return { label: "", value: 0, color: "" };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 2) return { label: "Debole", value: 33, color: "bg-destructive" };
  if (score <= 3) return { label: "Media", value: 66, color: "bg-yellow-500" };
  return { label: "Forte", value: 100, color: "bg-green-500" };
}

export default function ProfileTab() {
  const { user, profile, refreshAuth } = useAuth();
  const [formData, setFormData] = useState({ firstName: "", lastName: "" });
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const strength = useMemo(() => getPasswordStrength(newPassword), [newPassword]);

  useEffect(() => {
    if (profile) setFormData({ firstName: profile.first_name || "", lastName: profile.last_name || "" });
  }, [profile]);

  const profileMutation = useMutation({
    mutationFn: async () => {
      const errors: Record<string, string> = {};
      if (!formData.firstName.trim()) errors.firstName = "Il nome è obbligatorio";
      if (!formData.lastName.trim()) errors.lastName = "Il cognome è obbligatorio";
      setProfileErrors(errors);
      if (Object.keys(errors).length > 0) throw new Error("validation");
      const { error } = await supabase.from("profiles").update({ first_name: formData.firstName.trim(), last_name: formData.lastName.trim() }).eq("id", profile!.id);
      if (error) throw error;
    },
    onSuccess: () => { refreshAuth(); toast.success("Profilo aggiornato con successo"); },
    onError: (e: Error) => { if (e.message === "validation") return; toast.error(e.message || "Impossibile aggiornare il profilo"); },
  });

  const passwordMutation = useMutation({
    mutationFn: async () => {
      const errors: Record<string, string> = {};
      if (!currentPassword.trim()) errors.current = "Inserisci la password attuale";
      if (!newPassword.trim()) errors.new = "Inserisci la nuova password";
      else if (newPassword.length < 8) errors.new = "Minimo 8 caratteri";
      if (!confirmPassword.trim()) errors.confirm = "Conferma la nuova password";
      else if (newPassword !== confirmPassword) errors.confirm = "Le password non corrispondono";
      setPasswordErrors(errors);
      if (Object.keys(errors).length > 0) throw new Error("validation");
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: user!.email!, password: currentPassword });
      if (signInError) throw new Error("Password attuale non corretta");
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    },
    onSuccess: () => { setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setPasswordErrors({}); toast.success("Password cambiata con successo"); },
    onError: (e: Error) => { if (e.message === "validation") return; toast.error(e.message || "Errore durante il cambio password"); },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" /> Informazioni Profilo</CardTitle>
          <CardDescription>Aggiorna i tuoi dati personali</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <Shield className="h-8 w-8 text-primary" />
            <div>
              <p className="font-medium">Super Admin</p>
              <Badge variant="secondary">Accesso completo alla piattaforma</Badge>
            </div>
          </div>
          <Separator />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">Nome</Label>
              <Input id="firstName" value={formData.firstName} onChange={(e) => { setFormData({ ...formData, firstName: e.target.value }); setProfileErrors(p => ({ ...p, firstName: "" })); }} className={profileErrors.firstName ? "border-destructive" : ""} />
              {profileErrors.firstName && <p className="text-sm text-destructive">{profileErrors.firstName}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Cognome</Label>
              <Input id="lastName" value={formData.lastName} onChange={(e) => { setFormData({ ...formData, lastName: e.target.value }); setProfileErrors(p => ({ ...p, lastName: "" })); }} className={profileErrors.lastName ? "border-destructive" : ""} />
              {profileErrors.lastName && <p className="text-sm text-destructive">{profileErrors.lastName}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{user?.email}</span>
            </div>
            <p className="text-xs text-muted-foreground">L'email non può essere modificata</p>
          </div>
          <Button onClick={() => profileMutation.mutate()} disabled={profileMutation.isPending} className="w-full">
            {profileMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salva Modifiche
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Key className="h-5 w-5" /> Cambia Password</CardTitle>
          <CardDescription>Aggiorna la tua password di accesso</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Password Attuale</Label>
            <div className="relative">
              <Input type={showCurrent ? "text" : "password"} value={currentPassword} onChange={(e) => { setCurrentPassword(e.target.value); setPasswordErrors(p => ({ ...p, current: "" })); }} className={`pr-10 ${passwordErrors.current ? "border-destructive" : ""}`} />
              <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 hover:bg-transparent" onClick={() => setShowCurrent(!showCurrent)}>
                {showCurrent ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
              </Button>
            </div>
            {passwordErrors.current && <p className="text-sm text-destructive">{passwordErrors.current}</p>}
          </div>
          <div className="space-y-2">
            <Label>Nuova Password</Label>
            <div className="relative">
              <Input type={showNew ? "text" : "password"} value={newPassword} onChange={(e) => { setNewPassword(e.target.value); setPasswordErrors(p => ({ ...p, new: "" })); }} placeholder="Minimo 8 caratteri" className={`pr-10 ${passwordErrors.new ? "border-destructive" : ""}`} />
              <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 hover:bg-transparent" onClick={() => setShowNew(!showNew)}>
                {showNew ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
              </Button>
            </div>
            {passwordErrors.new && <p className="text-sm text-destructive">{passwordErrors.new}</p>}
            {newPassword && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Forza password</span>
                  <span className={strength.value === 100 ? "text-green-600" : strength.value === 66 ? "text-yellow-600" : "text-destructive"}>{strength.label}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                  <div className={`h-full transition-all ${strength.color}`} style={{ width: `${strength.value}%` }} />
                </div>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Conferma Nuova Password</Label>
            <div className="relative">
              <Input type={showConfirm ? "text" : "password"} value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setPasswordErrors(p => ({ ...p, confirm: "" })); }} className={`pr-10 ${passwordErrors.confirm ? "border-destructive" : ""}`} />
              <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 hover:bg-transparent" onClick={() => setShowConfirm(!showConfirm)}>
                {showConfirm ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
              </Button>
            </div>
            {passwordErrors.confirm && <p className="text-sm text-destructive">{passwordErrors.confirm}</p>}
          </div>
          <Button onClick={() => passwordMutation.mutate()} disabled={passwordMutation.isPending || !currentPassword || !newPassword} variant="outline" className="w-full">
            {passwordMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Key className="h-4 w-4 mr-2" />}
            Cambia Password
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
