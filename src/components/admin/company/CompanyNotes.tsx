import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StickyNote, Send, Loader2, Search } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";

interface CompanyNotesProps {
  companyId: string;
}

export function CompanyNotes({ companyId }: CompanyNotesProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newNote, setNewNote] = useState("");
  const [search, setSearch] = useState("");

  const { data: notes = [], isLoading } = useQuery({
    queryKey: queryKeys.admin.companyNotes(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_notes")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Fetch author names
      const authorIds = [...new Set((data || []).map((n: any) => n.author_id))];
      const authorMap: Record<string, string> = {};
      if (authorIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", authorIds);
        (profiles || []).forEach((p) => {
          authorMap[p.id] = `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Admin";
        });
      }

      return (data || []).map((n: any) => ({
        ...n,
        authorName: authorMap[n.author_id] || "Admin",
      }));
    },
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });

  const addNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      // FIX: prima usava `user!.id` — se la sessione era scaduta o AuthContext
      // non aveva completato il caricamento, questo crashava (null pointer).
      // Ora throw esplicito con messaggio utile per l'utente.
      if (!user?.id) throw new Error("Sessione scaduta: effettua di nuovo il login");
      const { error } = await supabase.from("company_notes").insert({
        company_id: companyId,
        author_id: user.id,
        content,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.companyNotes(companyId) });
      setNewNote("");
      toast.success("Nota aggiunta");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      toast.error("Errore", { description: msg });
    },
  });

  const handleSubmit = () => {
    const trimmed = newNote.trim();
    if (!trimmed) return;
    addNoteMutation.mutate(trimmed);
  };

  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n: any) =>
        (n.content ?? "").toLowerCase().includes(q) ||
        (n.authorName ?? "").toLowerCase().includes(q),
    );
  }, [notes, search]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-primary" />
            Note CRM
            {notes.length > 0 && (
              <Badge variant="secondary" className="text-xs ml-1">
                {notes.length}
              </Badge>
            )}
          </CardTitle>
          {notes.length > 3 && (
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Cerca nelle note..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add note */}
        <div className="space-y-1">
          <div className="flex gap-2">
            <Textarea
              placeholder="Aggiungi una nota..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              className="min-h-[60px] resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
              }}
            />
            <Button
              size="icon"
              onClick={handleSubmit}
              disabled={!newNote.trim() || addNoteMutation.isPending}
              className="shrink-0 self-end"
            >
              {addNoteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Suggerimento: <kbd className="px-1 py-0.5 rounded border bg-muted text-[9px]">⌘/Ctrl + Enter</kbd> per inviare
          </p>
        </div>

        {/* Notes list */}
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : notes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nessuna nota</p>
        ) : filteredNotes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nessuna nota corrisponde a "{search}"
          </p>
        ) : (
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {filteredNotes.map((note: any) => {
              const isMine = note.author_id === user?.id;
              return (
                <div
                  key={note.id}
                  className={
                    isMine
                      ? "p-3 rounded-lg border-l-4 border-l-primary bg-primary/5"
                      : "p-3 rounded-lg border bg-muted/30"
                  }
                >
                  <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium">{note.authorName}</span>
                      {isMine && (
                        <Badge variant="outline" className="text-[9px] h-3.5 px-1">
                          tu
                        </Badge>
                      )}
                    </div>
                    <span
                      className="text-xs text-muted-foreground"
                      title={format(new Date(note.created_at), "dd MMMM yyyy, HH:mm", {
                        locale: it,
                      })}
                    >
                      {formatDistanceToNow(new Date(note.created_at), {
                        addSuffix: true,
                        locale: it,
                      })}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
