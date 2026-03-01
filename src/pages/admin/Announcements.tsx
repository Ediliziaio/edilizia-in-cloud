import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Trash2, Megaphone } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: string;
  target_status: string;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
}

function AnnouncementForm({ 
  initial, 
  onSave, 
  isPending 
}: { 
  initial?: Announcement; 
  onSave: (data: any) => void; 
  isPending: boolean;
}) {
  const [title, setTitle] = useState(initial?.title || "");
  const [content, setContent] = useState(initial?.content || "");
  const [type, setType] = useState(initial?.type || "banner");
  const [targetStatus, setTargetStatus] = useState(initial?.target_status || "all");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [expiresAt, setExpiresAt] = useState(initial?.expires_at?.slice(0, 16) || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return toast.error("Inserisci un titolo");
    onSave({
      title: title.trim(),
      content: content.trim(),
      type,
      target_status: targetStatus,
      is_active: isActive,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Titolo</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titolo annuncio" />
      </div>
      <div>
        <Label>Contenuto</Label>
        <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Testo dell'annuncio..." rows={3} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Tipo</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="banner">Banner</SelectItem>
              <SelectItem value="changelog">Changelog</SelectItem>
              <SelectItem value="maintenance">Manutenzione</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Destinatari</Label>
          <Select value={targetStatus} onValueChange={setTargetStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti</SelectItem>
              <SelectItem value="trial">Solo trial</SelectItem>
              <SelectItem value="active">Solo attivi</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Scadenza (opzionale)</Label>
        <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={isActive} onCheckedChange={setIsActive} />
        <Label>Attivo</Label>
      </div>
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
        {initial ? "Aggiorna" : "Crea annuncio"}
      </Button>
    </form>
  );
}

export default function Announcements() {
  const { permissions } = useSuperAdminPermissions();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  if (!permissions.can_view_platform_stats) return <AccessDenied />;

  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ["admin-announcements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_announcements")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Announcement[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase
        .from("platform_announcements")
        .insert({ ...data, created_by: user?.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Annuncio creato");
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
    },
    onError: () => toast.error("Errore nella creazione"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const { error } = await supabase
        .from("platform_announcements")
        .update(data)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Annuncio aggiornato");
      setEditingAnnouncement(null);
      queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
    },
    onError: () => toast.error("Errore nell'aggiornamento"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("platform_announcements")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Annuncio eliminato");
      queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
    },
    onError: () => toast.error("Errore nell'eliminazione"),
  });

  const typeLabels: Record<string, string> = {
    banner: "Banner",
    changelog: "Changelog",
    maintenance: "Manutenzione",
  };

  const targetLabels: Record<string, string> = {
    all: "Tutti",
    trial: "Trial",
    active: "Attivi",
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Annunci</h1>
          <p className="text-muted-foreground">Gestisci banner, changelog e avvisi di manutenzione</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Nuovo Annuncio</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Crea annuncio</DialogTitle></DialogHeader>
            <AnnouncementForm onSave={(d) => createMutation.mutate(d)} isPending={createMutation.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      {announcements.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nessun annuncio creato</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <Card key={a.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Megaphone className="h-4 w-4 text-muted-foreground" />
                      <h3 className="font-semibold">{a.title}</h3>
                      <Badge variant={a.is_active ? "default" : "secondary"} className="text-[10px]">
                        {a.is_active ? "Attivo" : "Disattivo"}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">{typeLabels[a.type] || a.type}</Badge>
                      <Badge variant="outline" className="text-[10px]">→ {targetLabels[a.target_status] || a.target_status}</Badge>
                    </div>
                    {a.content && <p className="text-sm text-muted-foreground">{a.content}</p>}
                    <p className="text-xs text-muted-foreground">
                      Creato il {format(new Date(a.created_at), "d MMM yyyy HH:mm", { locale: it })}
                      {a.expires_at && ` · Scade il ${format(new Date(a.expires_at), "d MMM yyyy HH:mm", { locale: it })}`}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Dialog open={editingAnnouncement?.id === a.id} onOpenChange={(open) => !open && setEditingAnnouncement(null)}>
                      <DialogTrigger asChild>
                        <Button size="icon" variant="ghost" onClick={() => setEditingAnnouncement(a)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Modifica annuncio</DialogTitle></DialogHeader>
                        <AnnouncementForm
                          initial={editingAnnouncement!}
                          onSave={(d) => updateMutation.mutate({ id: a.id, ...d })}
                          isPending={updateMutation.isPending}
                        />
                      </DialogContent>
                    </Dialog>
                    <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(a.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
