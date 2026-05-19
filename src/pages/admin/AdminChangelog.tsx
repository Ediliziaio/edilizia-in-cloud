/**
 * AdminChangelog — v8.6.90
 *
 * Pannello super-admin per creare/modificare/eliminare entries del Changelog.
 * I cambiamenti sono live (cache 5min su query consumer).
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sparkles,
  Pin,
  Bug,
  Shield,
  Megaphone,
  Zap,
  Plus,
  Pencil,
  Trash2,
  Loader2,
} from "lucide-react";
import type { ChangelogEntry } from "@/hooks/useChangelog";

const CATEGORIES = [
  { value: "feature", label: "Nuova funzione", icon: Sparkles, emoji: "✨" },
  { value: "improvement", label: "Miglioramento", icon: Zap, emoji: "🚀" },
  { value: "fix", label: "Bug fix", icon: Bug, emoji: "🐛" },
  { value: "security", label: "Sicurezza", icon: Shield, emoji: "🔒" },
  { value: "announcement", label: "Avviso", icon: Megaphone, emoji: "📢" },
] as const;

interface FormState {
  id?: string;
  title: string;
  body_md: string;
  category: ChangelogEntry["category"];
  emoji: string;
  is_pinned: boolean;
  is_published: boolean;
  cta_url: string;
  cta_label: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  body_md: "",
  category: "improvement",
  emoji: "🚀",
  is_pinned: false,
  is_published: true,
  cta_url: "",
  cta_label: "",
};

export default function AdminChangelog() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<FormState | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["admin-changelog"],
    queryFn: async (): Promise<ChangelogEntry[]> => {
      const { data, error } = await supabase
        .from("platform_changelog_entries")
        .select("*")
        .order("is_pinned", { ascending: false })
        .order("published_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ChangelogEntry[];
    },
  });

  const save = useMutation({
    mutationFn: async (form: FormState) => {
      const payload = {
        title: form.title.trim(),
        body_md: form.body_md.trim(),
        category: form.category,
        emoji: form.emoji.trim() || null,
        is_pinned: form.is_pinned,
        is_published: form.is_published,
        cta_url: form.cta_url.trim() || null,
        cta_label: form.cta_label.trim() || null,
        published_by: user?.id ?? null,
      };
      if (form.id) {
        const { error } = await supabase
          .from("platform_changelog_entries")
          .update(payload)
          .eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("platform_changelog_entries")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing?.id ? "Entry aggiornata" : "Entry pubblicata");
      queryClient.invalidateQueries({ queryKey: ["admin-changelog"] });
      queryClient.invalidateQueries({ queryKey: ["platform-changelog"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error("Errore", { description: e.message }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("platform_changelog_entries")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entry eliminata");
      queryClient.invalidateQueries({ queryKey: ["admin-changelog"] });
      queryClient.invalidateQueries({ queryKey: ["platform-changelog"] });
      setDeletingId(null);
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Changelog</h1>
          <p className="text-muted-foreground text-sm">
            Pubblica gli aggiornamenti che vedranno gli utenti nel drawer
            &quot;Cosa c&apos;è di nuovo&quot;.
          </p>
        </div>
        <Dialog
          open={editing !== null}
          onOpenChange={(v) => setEditing(v ? editing ?? EMPTY_FORM : null)}
        >
          <DialogTrigger asChild>
            <Button onClick={() => setEditing(EMPTY_FORM)}>
              <Plus className="h-4 w-4 mr-2" />
              Nuova entry
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing?.id ? "Modifica entry" : "Nuova entry"}</DialogTitle>
              <DialogDescription>
                Markdown supportato: <code>**bold**</code>, <code>`code`</code>,{" "}
                <code>[link](url)</code>, doppia newline = nuovo paragrafo.
              </DialogDescription>
            </DialogHeader>

            {editing && (
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="cl-title">Titolo</Label>
                  <Input
                    id="cl-title"
                    value={editing.title}
                    onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                    placeholder="Es. Demo Mode: prova tutte le funzioni"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="cl-cat">Categoria</Label>
                    <Select
                      value={editing.category}
                      onValueChange={(v) => {
                        const cat = CATEGORIES.find((c) => c.value === v);
                        setEditing({
                          ...editing,
                          category: v as ChangelogEntry["category"],
                          emoji: cat?.emoji ?? editing.emoji,
                        });
                      }}
                    >
                      <SelectTrigger id="cl-cat">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.emoji} {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="cl-emoji">Emoji</Label>
                    <Input
                      id="cl-emoji"
                      value={editing.emoji}
                      onChange={(e) => setEditing({ ...editing, emoji: e.target.value })}
                      maxLength={4}
                      placeholder="✨"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="cl-body">Descrizione (Markdown)</Label>
                  <Textarea
                    id="cl-body"
                    rows={6}
                    value={editing.body_md}
                    onChange={(e) => setEditing({ ...editing, body_md: e.target.value })}
                    placeholder="Cosa è cambiato in 2-3 frasi. Usa **bold** per i punti chiave."
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="cl-url">URL CTA (opzionale)</Label>
                    <Input
                      id="cl-url"
                      value={editing.cta_url}
                      onChange={(e) => setEditing({ ...editing, cta_url: e.target.value })}
                      placeholder="/azienda/render"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="cl-cta">Label CTA</Label>
                    <Input
                      id="cl-cta"
                      value={editing.cta_label}
                      onChange={(e) => setEditing({ ...editing, cta_label: e.target.value })}
                      placeholder="Scopri"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label htmlFor="cl-pin" className="text-sm">In evidenza</Label>
                    <p className="text-xs text-muted-foreground">
                      Pinned in cima alla lista
                    </p>
                  </div>
                  <Switch
                    id="cl-pin"
                    checked={editing.is_pinned}
                    onCheckedChange={(v) => setEditing({ ...editing, is_pinned: v })}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label htmlFor="cl-pub" className="text-sm">Pubblicato</Label>
                    <p className="text-xs text-muted-foreground">
                      Visibile agli utenti
                    </p>
                  </div>
                  <Switch
                    id="cl-pub"
                    checked={editing.is_published}
                    onCheckedChange={(v) => setEditing({ ...editing, is_published: v })}
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>
                Annulla
              </Button>
              <Button
                onClick={() => editing && save.mutate(editing)}
                disabled={save.isPending || !editing?.title || !editing?.body_md}
              >
                {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editing?.id ? "Salva modifiche" : "Pubblica"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entries ({entries.length})</CardTitle>
          <CardDescription>
            Le pinned sono mostrate in cima. Le non-pubblicate sono nascoste agli utenti.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">Caricamento…</p>}
          {!isLoading && entries.length === 0 && (
            <p className="text-sm text-muted-foreground">Nessuna entry. Crea la prima!</p>
          )}
          {entries.map((e) => {
            const cat = CATEGORIES.find((c) => c.value === e.category);
            const Icon = cat?.icon ?? Sparkles;
            return (
              <div
                key={e.id}
                className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/30 transition-colors"
              >
                <div className="text-2xl shrink-0">{e.emoji ?? "✨"}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-medium text-sm">{e.title}</h3>
                    {e.is_pinned && (
                      <Badge variant="outline" className="h-5 text-[10px]">
                        <Pin className="h-2.5 w-2.5 mr-1" />
                        Pinned
                      </Badge>
                    )}
                    {!(e as unknown as { is_published?: boolean }).is_published && (
                      <Badge variant="secondary" className="h-5 text-[10px]">
                        Bozza
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Icon className="h-3 w-3" />
                    {cat?.label}
                    <span>·</span>
                    <span>{new Date(e.published_at).toLocaleDateString("it-IT")}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() =>
                      setEditing({
                        id: e.id,
                        title: e.title,
                        body_md: e.body_md,
                        category: e.category,
                        emoji: e.emoji ?? "",
                        is_pinned: e.is_pinned,
                        is_published: (e as unknown as { is_published?: boolean }).is_published ?? true,
                        cta_url: e.cta_url ?? "",
                        cta_label: e.cta_label ?? "",
                      })
                    }
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => setDeletingId(e.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <AlertDialog open={deletingId !== null} onOpenChange={(v) => !v && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare definitivamente?</AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;entry verrà rimossa per tutti gli utenti. L&apos;azione è irreversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingId && del.mutate(deletingId)}
              className="bg-destructive text-destructive-foreground"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
