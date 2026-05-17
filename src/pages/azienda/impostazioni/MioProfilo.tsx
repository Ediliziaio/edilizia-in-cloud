/**
 * MioProfilo — Pagina unica "Il mio profilo" nelle impostazioni
 * Include: Dati personali, Sicurezza, Calendari, Notifiche
 * Accessibile a TUTTI i ruoli
 */
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  Camera, User, Save, Loader2, Phone, Mail, Lock, Eye, EyeOff,
  Shield, Check, X, CalendarDays, RefreshCw, Unlink, Clock, Bell,
  BellRing, MessageSquare, FileText, Briefcase, Settings,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { EmailOAuthConnectionsCard } from "@/components/integrations/EmailOAuthConnectionsCard";
// v8.6.36 — MySurveysTab rimosso dal profilo (non era semantica corretta:
// è una LISTA OPERATIVA di sopralluoghi assegnati, non un'impostazione
// personale). Il componente resta disponibile per future dashboard widget.
// import { MySurveysTab } from "@/components/sopralluoghi/MySurveysTab";

// ── Role labels ──
const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin", company_admin: "Admin Azienda",
  company_staff: "Staff", customer: "Cliente", employee: "Dipendente",
  subcontractor: "Subappaltatore", salesperson: "Venditore",
  call_center: "Call Center", referrer: "Segnalatore",
};

// ── Calendar Icons ──
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}
function OutlookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <path d="M24 7.387v10.478c0 .23-.08.424-.238.58a.792.792 0 01-.582.238h-8.646v-12.5h8.646c.23 0 .425.079.582.237A.789.789 0 0124 7.387z" fill="#0364B8" />
      <path d="M14.534 6.183v12.5l-1.183.567L1.2 13.467A.79.79 0 011 12.82V5.883c0-.143.033-.277.1-.4a.79.79 0 01.667-.4L13.35 5.05c.36 0 .675.127.942.38.266.254.4.56.4.92l-.158-.167z" fill="#0A2767" />
      <rect x="6" y="8" width="6" height="8" rx="3" fill="#28A8EA" />
    </svg>
  );
}
function AppleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
export default function MioProfilo() {
  const { user, role, refreshAuth, effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;
  // v8.6.36 — surveysEnabled rimosso (la tab Sopralluoghi non era nel posto giusto).

  // ── Profile data ──
  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("first_name, last_name, avatar_url, phone, email, created_at, last_login_at")
        .eq("id", user!.id).single();
      if (error) throw error;
      return data;
    },
  });

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name ?? "");
      setLastName(profile.last_name ?? "");
      setPhone(profile.phone ?? "");
    }
  }, [profile]);

  // v8.6.36 — Dirty-state: il bottone "Salva Modifiche" è abilitato solo
  // se l'utente ha effettivamente cambiato qualcosa rispetto al DB.
  // Evita salvataggi inutili e dà feedback visivo immediato.
  const profileDirty = !!profile && (
    firstName !== (profile.first_name ?? "") ||
    lastName !== (profile.last_name ?? "") ||
    phone !== (profile.phone ?? "")
  );

  // ── Avatar ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    if (!file.type.startsWith("image/")) { toast.error("Carica un file immagine valido"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Max 2 MB"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    setIsUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `users/${user.id}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      const urlWithCache = `${publicUrl}?t=${Date.now()}`;
      await supabase.from("profiles").update({ avatar_url: urlWithCache }).eq("id", user.id);
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      queryClient.invalidateQueries({ queryKey: ["chat-profiles"] });
      refreshAuth();
      toast.success("Foto aggiornata!");
    } catch (err: any) {
      toast.error("Errore upload", { description: err.message });
      setAvatarPreview(null);
    } finally { setIsUploading(false); }
  };

  const removeAvatar = async () => {
    if (!user?.id) return;
    await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
    setAvatarPreview(null);
    queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    refreshAuth();
    toast.success("Foto rimossa");
  };

  // ── Save profile ──
  const updateProfile = useMutation({
    mutationFn: async () => {
      if (!firstName.trim() || !lastName.trim()) throw new Error("Nome e cognome obbligatori");
      const { error } = await supabase.from("profiles")
        .update({ first_name: firstName.trim(), last_name: lastName.trim(), phone: phone.trim() || null })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      queryClient.invalidateQueries({ queryKey: ["chat-profiles"] });
      refreshAuth();
      toast.success("Profilo salvato!");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // ── Password ──
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  const handleChangePassword = async () => {
    if (newPw.length < 8) { toast.error("Minimo 8 caratteri"); return; }
    if (newPw !== confirmPw) { toast.error("Le password non coincidono"); return; }
    setChangingPw(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;
      setNewPw(""); setConfirmPw("");
      toast.success("Password aggiornata!");
    } catch (err: any) {
      toast.error(err.message);
    } finally { setChangingPw(false); }
  };

  // ── Calendar connections ──
  const { data: googleConn } = useQuery({
    queryKey: ["google-calendar-connection", companyId, user?.id],
    enabled: !!companyId && !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("google_calendar_connections").select("*")
        .eq("company_id", companyId!).eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });
  const { data: appleConn } = useQuery({
    queryKey: ["apple-calendar-connection", companyId, user?.id],
    enabled: !!companyId && !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("apple_calendar_connections").select("*")
        .eq("company_id", companyId!).eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });
  const { data: googleSettings } = useQuery({
    queryKey: ["google-calendar-settings", companyId, user?.id],
    enabled: !!companyId && !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("google_calendar_settings").select("*")
        .eq("company_id", companyId!).eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });

  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const connectGoogle = async () => {
    if (!companyId || !user?.id) return;
    setConnectingGoogle(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("google-calendar-auth", {
        body: { action: "get-auth-url", company_id: companyId, user_id: user.id },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.url) {
        const popup = window.open(res.data.url, "google-cal-auth", "width=500,height=700,left=400,top=100");
        const pollInterval = setInterval(() => {
          if (popup?.closed) {
            clearInterval(pollInterval);
            setConnectingGoogle(false);
            queryClient.invalidateQueries({ queryKey: ["google-calendar-connection"] });
          }
        }, 1000);
        setTimeout(() => { clearInterval(pollInterval); setConnectingGoogle(false); }, 300_000);
      }
    } catch (err: any) {
      toast.error("Errore connessione Google", { description: err.message });
      setConnectingGoogle(false);
    }
  };

  const disconnectGoogle = async () => {
    if (!companyId || !user?.id) return;
    await supabase.from("google_calendar_connections").delete()
      .eq("company_id", companyId).eq("user_id", user.id);
    await supabase.from("google_calendar_settings").delete()
      .eq("company_id", companyId).eq("user_id", user.id);
    queryClient.invalidateQueries({ queryKey: ["google-calendar-connection"] });
    queryClient.invalidateQueries({ queryKey: ["google-calendar-settings"] });
    toast.success("Google Calendar disconnesso");
  };

  const [syncing, setSyncing] = useState(false);
  const syncGoogle = async () => {
    if (!companyId || !user?.id) return;
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.functions.invoke("google-calendar-sync", {
        body: { company_id: companyId, user_id: user.id },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      toast.success("Sincronizzazione completata!");
    } catch (err: any) {
      toast.error(err.message);
    } finally { setSyncing(false); }
  };

  // ── Notification preferences (local state, will persist to DB when table exists) ──
  const [notifPrefs, setNotifPrefs] = useState({
    email_new_order: true,
    email_order_update: true,
    email_new_message: true,
    email_new_task: true,
    push_new_order: true,
    push_order_update: false,
    push_new_message: true,
    push_new_task: true,
    email_marketing: false,
    email_weekly_report: true,
  });

  const toggleNotif = (key: keyof typeof notifPrefs) => {
    setNotifPrefs(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const avatarUrl = avatarPreview ?? profile?.avatar_url ?? null;
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />

      {/* ── Header con avatar ── */}
      <div className="flex items-center gap-5 mb-6">
        <div className="relative group">
          <Avatar className="h-20 w-20 ring-4 ring-primary/10">
            <AvatarImage src={avatarUrl ?? undefined} />
            <AvatarFallback className="text-2xl bg-primary/10 text-primary font-bold">
              {initials || <User className="h-8 w-8" />}
            </AvatarFallback>
          </Avatar>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary text-white flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors"
          >
            {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
          </button>
          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/80">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
        </div>
        <div>
          <h2 className="text-lg font-semibold">{firstName} {lastName}</h2>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="text-[10px] h-5">
              {ROLE_LABELS[role ?? ""] ?? role}
            </Badge>
            {profile?.avatar_url && (
              <button onClick={removeAvatar} className="text-xs text-destructive hover:underline">
                Rimuovi foto
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="profilo" className="w-full">
        <TabsList className="w-full justify-start bg-muted/50 h-10 p-1 mb-6">
          <TabsTrigger value="profilo" className="gap-1.5 text-xs sm:text-sm">
            <User className="h-3.5 w-3.5" /> Profilo
          </TabsTrigger>
          <TabsTrigger value="sicurezza" className="gap-1.5 text-xs sm:text-sm">
            <Shield className="h-3.5 w-3.5" /> Sicurezza
          </TabsTrigger>
          <TabsTrigger value="calendari" className="gap-1.5 text-xs sm:text-sm">
            <CalendarDays className="h-3.5 w-3.5" /> Calendari
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-1.5 text-xs sm:text-sm">
            <Mail className="h-3.5 w-3.5" /> Email
          </TabsTrigger>
          <TabsTrigger value="notifiche" className="gap-1.5 text-xs sm:text-sm">
            <Bell className="h-3.5 w-3.5" /> Notifiche
          </TabsTrigger>
        </TabsList>

        {/* ════════════ TAB PROFILO ════════════ */}
        {/* v8.6.37 — Grid 2 colonne su lg+: dati personali (2/3) + cronologia (1/3).
            Riempie meglio lo spazio della pagina che era troppo vuoto a destra. */}
        <TabsContent value="profilo" className="mt-0">
          <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Dati personali</CardTitle>
              <CardDescription>Le informazioni che vengono mostrate nella chat, calendario e nel team.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fn">Nome</Label>
                  <Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ln">Cognome</Label>
                  <Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> Email</Label>
                <Input value={user?.email || ""} disabled className="bg-muted" />
                <p className="text-xs text-muted-foreground">Contatta l'admin per modificare l'email.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> Telefono</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+39 333 1234567" />
              </div>
              <div className="flex items-center justify-between pt-2">
                {profileDirty ? (
                  <p className="text-xs text-amber-600 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                    Modifiche non salvate
                  </p>
                ) : (
                  <span />
                )}
                <Button
                  onClick={() => updateProfile.mutate()}
                  disabled={updateProfile.isPending || !profileDirty}
                >
                  {updateProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Salva Modifiche
                </Button>
              </div>
            </CardContent>
          </Card>
          </div>

          {/* Colonna laterale: cronologia account */}
          <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Cronologia account</CardTitle>
              <CardDescription>Informazioni di utilizzo del tuo account.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Account creato</p>
                  <p className="font-medium">
                    {profile?.created_at ? format(new Date(profile.created_at), "d MMMM yyyy", { locale: it }) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Ultimo accesso</p>
                  <p className="font-medium">
                    {profile?.last_login_at ? format(new Date(profile.last_login_at), "d MMM yyyy, HH:mm", { locale: it }) : "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          </div>
          </div>
        </TabsContent>

        {/* ════════════ TAB SICUREZZA ════════════ */}
        {/* v8.6.37 — Grid 2 colonne su lg+: cambio password + privacy GDPR */}
        <TabsContent value="sicurezza" className="mt-0">
          <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Lock className="h-4 w-4" /> Cambia Password
              </CardTitle>
              <CardDescription>Scegli una password sicura con almeno 8 caratteri.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nuova Password</Label>
                <div className="relative">
                  <Input type={showPw ? "text" : "password"} value={newPw}
                    onChange={(e) => setNewPw(e.target.value)} placeholder="Minimo 8 caratteri" />
                  <button onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    type="button" aria-label={showPw ? "Nascondi password" : "Mostra password"}>
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {/* v8.6.36 — Password strength indicator (5 livelli) */}
                {newPw.length > 0 && (() => {
                  let score = 0;
                  if (newPw.length >= 8) score++;
                  if (newPw.length >= 12) score++;
                  if (/[A-Z]/.test(newPw) && /[a-z]/.test(newPw)) score++;
                  if (/\d/.test(newPw)) score++;
                  if (/[^A-Za-z0-9]/.test(newPw)) score++;
                  const labels = ["Troppo debole", "Debole", "Media", "Buona", "Forte"];
                  const colors = ["bg-red-500", "bg-orange-500", "bg-amber-500", "bg-lime-500", "bg-emerald-500"];
                  return (
                    <div className="space-y-1 pt-0.5">
                      <div className="flex gap-1">
                        {[0, 1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className={`h-1 flex-1 rounded-full transition-colors ${i < score ? colors[score - 1] : "bg-muted"}`}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Sicurezza: <span className="font-medium">{labels[Math.max(0, score - 1)] ?? "Troppo debole"}</span>
                        {score < 3 && newPw.length >= 8 && (
                          <span className="ml-2 text-amber-600">· aggiungi maiuscole, numeri o simboli</span>
                        )}
                      </p>
                    </div>
                  );
                })()}
              </div>
              <div className="space-y-1.5">
                <Label>Conferma Password</Label>
                <Input type={showPw ? "text" : "password"} value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)} placeholder="Ripeti la password" />
                {newPw && confirmPw && newPw !== confirmPw && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <X className="h-3 w-3" /> Le password non coincidono
                  </p>
                )}
                {newPw && confirmPw && newPw === confirmPw && newPw.length >= 8 && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <Check className="h-3 w-3" /> Le password coincidono
                  </p>
                )}
              </div>
              <div className="flex justify-end pt-2">
                <Button variant="outline" onClick={handleChangePassword}
                  disabled={changingPw || !newPw || newPw !== confirmPw || newPw.length < 8}>
                  {changingPw ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
                  Aggiorna Password
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* v8.6.36 — Card "Privacy" pulita: rimosso duplicato date
              account (già nella tab Profilo). Focus su GDPR + sicurezza. */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" /> Privacy & dati personali
              </CardTitle>
              <CardDescription>Esercita i tuoi diritti GDPR sui dati conservati dalla piattaforma.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-muted bg-muted/30 p-3 text-sm text-muted-foreground">
                <p>
                  Per richiedere la <strong>cancellazione</strong> del tuo account o l'<strong>esportazione</strong> dei tuoi dati
                  personali (Regolamento UE 2016/679, art. 15-17), contatta l'amministratore della tua azienda
                  o scrivi a <a href="mailto:privacy@ediliziaincloud.it" className="text-primary hover:underline">privacy@ediliziaincloud.it</a>.
                </p>
              </div>
            </CardContent>
          </Card>
          </div>
        </TabsContent>

        {/* ════════════ TAB CALENDARI ════════════ */}
        {/* v8.6.37 — Grid 2 colonne su lg+: Google (con dettagli) span 2,
            Outlook + Apple side-by-side. Riempie meglio orizzontalmente. */}
        <TabsContent value="calendari" className="mt-0">
          <div className="grid gap-5 lg:grid-cols-2">
          <div className="lg:col-span-2">
          {/* Google Calendar */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-white border shadow-sm flex items-center justify-center">
                    <GoogleIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Google Calendar</CardTitle>
                    <CardDescription>Sincronizza eventi e disponibilità</CardDescription>
                  </div>
                </div>
                {googleConn ? (
                  <Badge variant="default" className="bg-green-100 text-green-700 border-green-200 gap-1">
                    <Check className="h-3 w-3" /> Connesso
                  </Badge>
                ) : (
                  <Badge variant="secondary">Non connesso</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {googleConn ? (
                <div className="space-y-4">
                  <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="font-medium text-green-800 dark:text-green-300 text-sm">Calendario collegato</span>
                    </div>
                    <p className="text-xs text-green-700 dark:text-green-400">
                      Account: {googleConn.google_email ?? "Google Account"}
                    </p>
                    {googleConn.last_synced_at && (
                      <p className="text-xs text-green-600/70 mt-1">
                        Ultima sync: {format(new Date(googleConn.last_synced_at), "d MMM yyyy, HH:mm", { locale: it })}
                      </p>
                    )}
                  </div>
                  {googleSettings && (
                    <div className="text-sm space-y-1">
                      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Impostazioni sync</p>
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Calendario: <strong>{googleSettings.primary_calendar_id ?? "Principale"}</strong></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Modalità: <strong>{googleSettings.sync_mode === "two_way" ? "Bidirezionale" : "Solo lettura"}</strong></span>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={syncGoogle} disabled={syncing} className="gap-2">
                      {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Sincronizza ora
                    </Button>
                    <Button size="sm" variant="ghost" onClick={disconnectGoogle} className="gap-2 text-destructive hover:text-destructive">
                      <Unlink className="h-3.5 w-3.5" /> Disconnetti
                    </Button>
                  </div>
                </div>
              ) : (
                /* v8.6.38 — Onboarding compresso: 3 bullet inline invece di
                    card colorata che occupava tutto lo spazio. CTA primaria
                    subito visibile. */
                <div className="space-y-4">
                  <ul className="text-sm text-muted-foreground space-y-1.5">
                    <li className="flex items-start gap-2"><Check className="h-3.5 w-3.5 shrink-0 mt-0.5 text-green-600" /> Appuntamenti sincronizzati automaticamente</li>
                    <li className="flex items-start gap-2"><Check className="h-3.5 w-3.5 shrink-0 mt-0.5 text-green-600" /> Il team vede la tua disponibilità</li>
                    <li className="flex items-start gap-2"><Check className="h-3.5 w-3.5 shrink-0 mt-0.5 text-green-600" /> Evita sovrapposizioni con appuntamenti personali</li>
                  </ul>
                  <Button onClick={connectGoogle} disabled={connectingGoogle} className="gap-2 w-full sm:w-auto">
                    {connectingGoogle ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon className="h-4 w-4" />}
                    Collega Google Calendar
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          </div>

          {/* Outlook */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-white border shadow-sm flex items-center justify-center">
                    <OutlookIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Microsoft Outlook</CardTitle>
                    <CardDescription>Calendar di Microsoft 365</CardDescription>
                  </div>
                </div>
                <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Prossimamente</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                L'integrazione con Microsoft Outlook Calendar sarà disponibile a breve.
              </p>
            </CardContent>
          </Card>

          {/* Apple Calendar */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-white border shadow-sm flex items-center justify-center">
                    <AppleIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Apple Calendar</CardTitle>
                    <CardDescription>iCloud Calendar via CalDAV</CardDescription>
                  </div>
                </div>
                {/* v8.6.38 — Badge coerente con Outlook: se il bottone
                    è disabled, mostra "Prossimamente" non "Non connesso".
                    Quando l'integrazione sarà completata, restaurare il
                    badge "Non connesso" originale. */}
                {appleConn ? (
                  <Badge variant="default" className="bg-green-100 text-green-700 border-green-200 gap-1">
                    <Check className="h-3 w-3" /> Connesso
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1">
                    <Clock className="h-3 w-3" /> Prossimamente
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {appleConn ? (
                <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 p-4">
                  <p className="text-sm font-medium text-green-800 flex items-center gap-2">
                    <Check className="h-4 w-4" /> Apple Calendar collegato
                  </p>
                  <p className="text-xs text-green-700 mt-1">Account: {appleConn.apple_id_email ?? "iCloud"}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  L'integrazione con Apple Calendar (iCloud via CalDAV) sarà disponibile a breve.
                  Richiederà una password specifica per le app generata nelle impostazioni Apple ID.
                </p>
              )}
            </CardContent>
          </Card>
          </div>
        </TabsContent>

        {/* ════════════ TAB EMAIL — connessioni personali ════════════ */}
        {/* v8.6.38 — Rimossa card info blu duplicata: il titolo era
            ripetuto nella card EmailOAuthConnectionsCard sotto. Il
            messaggio "ogni utente collega il proprio" è ora compresso
            in piccolo testo sopra (subtitle) — niente più sezione
            colorata che ruba spazio. */}
        <TabsContent value="email" className="mt-0 space-y-3">
          <p className="text-xs text-muted-foreground flex items-start gap-2 px-1">
            <Mail className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Ogni utente collega il proprio Gmail o Outlook. Vedi solo le tue connessioni;
              le email di altri membri del team non sono visibili.
            </span>
          </p>
          <EmailOAuthConnectionsCard scope="user" />
        </TabsContent>

        {/* v8.6.36 — tab Sopralluoghi rimossa (era una lista operativa,
            non un'impostazione personale). Per vedere i tuoi sopralluoghi
            assegnati vai a /azienda/sopralluoghi. */}

        {/* ════════════ TAB NOTIFICHE ════════════ */}
        {/* v8.6.38 — Refactor in TABELLA event-based: una riga per ogni
            evento, due colonne switch (Email + Push). Più compatto e
            scansionabile rispetto a 3 card con eventi duplicati nelle
            colonne Email/Push.

            Sezione separata sotto: notifiche solo-email (newsletter, report). */}
        <TabsContent value="notifiche" className="mt-0 space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4" /> Notifiche per evento
              </CardTitle>
              <CardDescription>Scegli per ogni evento se vuoi ricevere notifica via email, push (browser/app) o entrambe.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {/* Header colonne */}
              <div className="hidden sm:grid grid-cols-[1fr_72px_72px] gap-2 px-4 pt-2 pb-2 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <div>Evento</div>
                <div className="text-center flex items-center justify-center gap-1"><Mail className="h-3 w-3" /> Email</div>
                <div className="text-center flex items-center justify-center gap-1"><BellRing className="h-3 w-3" /> Push</div>
              </div>
              <NotifMatrixRow
                icon={Briefcase}
                label="Nuovo ordine / cantiere"
                desc="Quando viene creato un nuovo ordine assegnato a te"
                emailChecked={notifPrefs.email_new_order}
                pushChecked={notifPrefs.push_new_order}
                onEmailToggle={() => toggleNotif("email_new_order")}
                onPushToggle={() => toggleNotif("push_new_order")}
              />
              <NotifMatrixRow
                icon={RefreshCw}
                label="Aggiornamento ordine"
                desc="Cambi di stato su ordini in cui sei coinvolto"
                emailChecked={notifPrefs.email_order_update}
                pushChecked={notifPrefs.push_order_update}
                onEmailToggle={() => toggleNotif("email_order_update")}
                onPushToggle={() => toggleNotif("push_order_update")}
              />
              <NotifMatrixRow
                icon={MessageSquare}
                label="Nuovo messaggio chat"
                desc="Messaggi diretti e menzioni nelle chat"
                emailChecked={notifPrefs.email_new_message}
                pushChecked={notifPrefs.push_new_message}
                onEmailToggle={() => toggleNotif("email_new_message")}
                onPushToggle={() => toggleNotif("push_new_message")}
              />
              <NotifMatrixRow
                icon={FileText}
                label="Nuova attività assegnata"
                desc="Quando ti viene assegnata un'attività"
                emailChecked={notifPrefs.email_new_task}
                pushChecked={notifPrefs.push_new_task}
                onEmailToggle={() => toggleNotif("email_new_task")}
                onPushToggle={() => toggleNotif("push_new_task")}
                isLast
              />
            </CardContent>
          </Card>

          {/* Altro: solo-email (newsletter, report) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="h-4 w-4" /> Email periodiche
              </CardTitle>
              <CardDescription>Newsletter e riepiloghi automatici via email.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              <NotifRow icon={Mail} label="Email di marketing" desc="Newsletter e novità della piattaforma"
                checked={notifPrefs.email_marketing} onChange={() => toggleNotif("email_marketing")} />
              <NotifRow icon={FileText} label="Report settimanale" desc="Riepilogo attività della settimana via email"
                checked={notifPrefs.email_weekly_report} onChange={() => toggleNotif("email_weekly_report")} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Notification row component (per Email periodiche, single-channel) ──
function NotifRow({
  icon: Icon, label, desc, checked, onChange,
}: {
  icon: React.ElementType; label: string; desc: string; checked: boolean; onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-3 px-1 hover:bg-muted/30 rounded-lg transition-colors">
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

// v8.6.38 — Matrix row per "Notifiche per evento": una riga = un evento,
// 2 colonne switch (Email + Push). Più compatto e scansionabile rispetto
// alla vecchia struttura 3 card con eventi duplicati.
function NotifMatrixRow({
  icon: Icon, label, desc, emailChecked, pushChecked, onEmailToggle, onPushToggle, isLast,
}: {
  icon: React.ElementType;
  label: string;
  desc: string;
  emailChecked: boolean;
  pushChecked: boolean;
  onEmailToggle: () => void;
  onPushToggle: () => void;
  isLast?: boolean;
}) {
  return (
    <div className={`grid grid-cols-[1fr_72px_72px] gap-2 px-4 py-3 ${!isLast ? "border-b" : ""} items-center hover:bg-muted/30 transition-colors`}>
      <div className="flex items-center gap-3 min-w-0">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{label}</p>
          <p className="text-xs text-muted-foreground line-clamp-2">{desc}</p>
        </div>
      </div>
      <div className="flex justify-center">
        <Switch checked={emailChecked} onCheckedChange={onEmailToggle} aria-label={`Email: ${label}`} />
      </div>
      <div className="flex justify-center">
        <Switch checked={pushChecked} onCheckedChange={onPushToggle} aria-label={`Push: ${label}`} />
      </div>
    </div>
  );
}
