import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, User, Save, Loader2, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProfileTab() {
  const { user, refreshAuth } = useAuth();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["admin-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("first_name, last_name, avatar_url")
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name ?? "");
      setLastName(profile.last_name ?? "");
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
      await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
      setAvatarPreview(null);
      queryClient.invalidateQueries({ queryKey: ["admin-profile"] });
      refreshAuth();
      toast.success("Avatar rimosso");
    } catch (err: any) {
      toast.error("Errore rimozione avatar");
    }
  };

  // ── Save profile ──
  const updateProfile = useMutation({
    mutationFn: async () => {
      if (!firstName.trim() || !lastName.trim()) throw new Error("Nome e cognome sono obbligatori");
      const { error } = await supabase
        .from("profiles")
        .update({ first_name: firstName.trim(), last_name: lastName.trim() })
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
            <Label>Email</Label>
            <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
              <span className="text-sm text-muted-foreground">{user?.email}</span>
              <Badge variant="outline" className="ml-auto text-xs">Non modificabile</Badge>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Ruolo</Label>
            <div className="flex items-center gap-2">
              <Badge className="bg-primary/10 text-primary hover:bg-primary/20">Super Admin</Badge>
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
    </div>
  );
}
