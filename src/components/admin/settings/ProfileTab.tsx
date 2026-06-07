import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Camera, User, Save, Loader2, Trash2, Phone, Clock, CalendarDays, ArrowRight } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  platform_manager: "Manager",
  platform_sales: "Sales",
  platform_support: "Support",
  platform_marketing: "Marketing",
  platform_implementation: "Implementation",
  company_admin: "Admin Azienda",
  company_staff: "Staff",
  customer: "Cliente",
  employee: "Dipendente",
  salesperson: "Commerciale",
  call_center: "Call Center",
  referrer: "Segnalatore",
};

export default function ProfileTab() {
  const { user, refreshAuth } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["admin-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("first_name, last_name, avatar_url, phone, last_login_at, created_at")
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: userRoles } = useQuery({
    queryKey: ["admin-profile-roles", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data?.map((r) => r.role) ?? [];
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

  // ── Avatar ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Carica un file immagine valido");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("L'immagine deve essere inferiore a 2 MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    setIsUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `admin/${user.id}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(path);

      const urlWithCache = `${publicUrl}?t=${Date.now()}`;

      await supabase
        .from("profiles")
        .update({ avatar_url: urlWithCache })
        .eq("id", user.id);

      queryClient.invalidateQueries({ queryKey: ["admin-profile"] });
      refreshAuth();
      toast.success("Avatar aggiornato");
    } catch (err: any) {
      toast.error("Errore upload avatar", { description: err.message });
      setAvatarPreview(null);
    } finally {
      setIsUploading(false);
    }
  };

  const removeAvatar = async () => {
    if (!user?.id) return;
    try {
      const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
      if (error) throw error;
      setAvatarPreview(null);
      queryClient.invalidateQueries({ queryKey: ["admin-profile"] });
      refreshAuth();
      toast.success("Avatar rimosso");
    } catch {
      toast.error("Errore rimozione avatar");
    }
  };

  // ── Save profile ──
  const updateProfile = useMutation({
    mutationFn: async () => {
      if (!firstName.trim() || !lastName.trim()) throw new Error("Nome e cognome sono obbligatori");
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim() || null,
        })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-profile"] });
      refreshAuth();
      toast.success("Profilo aggiornato");
    },
    onError: (err: any) => toast.error(err.message || "Errore aggiornamento"),
  });

  const avatarUrl = avatarPreview ?? profile?.avatar_url ?? null;
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Profilo</h1>
        <p className="text-muted-foreground">
          Gestisci le tue informazioni personali visibili nella piattaforma.
        </p>
      </div>

      {/* Avatar card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Foto profilo</CardTitle>
          <CardDescription>
            Formati supportati: JPG, PNG, GIF. Dimensione massima: 2 MB.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="relative">
              <Avatar className="h-20 w-20">
                <AvatarImage src={avatarUrl ?? undefined} alt="Avatar" />
                <AvatarFallback className="text-lg bg-primary/10 text-primary">
                  {initials || <User className="h-8 w-8" />}
                </AvatarFallback>
              </Avatar>
              {isUploading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/80">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="gap-2"
              >
                <Camera className="h-4 w-4" />
                {isUploading ? "Caricamento..." : "Cambia foto"}
              </Button>
              {profile?.avatar_url && (
                <Button variant="ghost" size="sm" onClick={removeAvatar} className="gap-2 text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                  Rimuovi foto
                </Button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
        </CardContent>
      </Card>

      {/* Personal info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informazioni personali</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="prof-firstName">Nome</Label>
              <Input
                id="prof-firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Mario"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prof-lastName">Cognome</Label>
              <Input
                id="prof-lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Rossi"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prof-phone" className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" /> Telefono
            </Label>
            <Input
              id="prof-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Es. +39 333 1234567"
              maxLength={20}
            />
          </div>

          <div className="space-y-2">
            <Label>Email</Label>
            <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
              <span className="text-sm text-muted-foreground">{user?.email}</span>
              <Badge variant="outline" className="ml-auto text-xs">Non modificabile</Badge>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Ruolo</Label>
            <div className="flex items-center gap-2 flex-wrap">
              {userRoles && userRoles.length > 0 ? (
                userRoles.map((role) => (
                  <Badge key={role} className="bg-primary/10 text-primary hover:bg-primary/20">
                    {ROLE_LABELS[role] ?? role}
                  </Badge>
                ))
              ) : (
                <Badge className="bg-primary/10 text-primary hover:bg-primary/20">—</Badge>
              )}
            </div>
          </div>

          <Separator />

          <div className="flex justify-end">
            <Button
              onClick={() => updateProfile.mutate()}
              disabled={updateProfile.isPending}
              className="gap-2"
            >
              {updateProfile.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salva modifiche
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Account info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informazioni account</CardTitle>
          <CardDescription>Dettagli sul tuo account e ultimo accesso.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
              <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Account creato il</p>
                <p className="text-sm font-medium">
                  {profile?.created_at
                    ? format(new Date(profile.created_at), "dd MMM yyyy", { locale: it })
                    : "—"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Ultimo accesso</p>
                <p className="text-sm font-medium">
                  {profile?.last_login_at
                    ? format(new Date(profile.last_login_at), "dd MMM yyyy, HH:mm", { locale: it })
                    : "Mai"}
                </p>
              </div>
            </div>
          </div>

          <Separator />

          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => navigate("/admin/impostazioni/sicurezza")}
          >
            Gestisci sicurezza
            <ArrowRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
