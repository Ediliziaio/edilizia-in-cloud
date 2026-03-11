import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StickyNote, Send, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";

interface CompanyNotesProps {
  companyId: string;
}

export function CompanyNotes({ companyId }: CompanyNotesProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newNote, setNewNote] = useState("");

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
      let authorMap: Record<string, string> = {};
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
      const { error } = await supabase.from("company_notes").insert({
        company_id: companyId,
        author_id: user!.id,
        content,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.companyNotes(companyId) });
      setNewNote("");
      toast.success("Nota aggiunta");
    },
    onError: (err: any) => {
      toast.error("Errore", { description: err.message });
    },
  });

  const handleSubmit = () => {
    const trimmed = newNote.trim();
    if (!trimmed) return;
    addNoteMutation.mutate(trimmed);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-primary" />
          Note CRM
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add note */}
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

        {/* Notes list */}
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : notes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nessuna nota</p>
        ) : (
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {notes.map((note: any) => (
              <div key={note.id} className="p-3 rounded-lg border bg-muted/30">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">{note.authorName}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(note.created_at), "dd MMM yyyy, HH:mm", { locale: it })}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{note.content}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
