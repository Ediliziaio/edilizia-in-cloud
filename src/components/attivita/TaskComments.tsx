import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Send, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";

interface TaskCommentsProps {
  taskId: string;
}

export function TaskComments({ taskId }: TaskCommentsProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");

  const queryKey = ["task-comments", taskId];

  const { data: comments = [] } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_comments" as any)
        .select("*, profile:profiles!task_comments_user_id_fkey(first_name, last_name)")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });
      if (error) {
        // Fallback without join if FK name doesn't match
        const { data: d2, error: e2 } = await supabase
          .from("task_comments" as any)
          .select("*")
          .eq("task_id", taskId)
          .order("created_at", { ascending: true });
        if (e2) throw e2;
        return (d2 || []) as any[];
      }
      return (data || []) as any[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!user) throw new Error("Non autenticato");
      const { error } = await supabase.from("task_comments" as any).insert({
        task_id: taskId,
        user_id: user.id,
        content: text,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setContent("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_comments" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const handleSubmit = () => {
    if (!content.trim()) return;
    addMutation.mutate(content.trim());
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-muted-foreground" />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          Commenti
        </span>
        {comments.length > 0 && (
          <span className="text-[10px] text-muted-foreground ml-auto">{comments.length}</span>
        )}
      </div>

      {comments.length > 0 && (
        <div className="space-y-3 max-h-[300px] overflow-y-auto">
          {comments.map((c: any) => (
            <div key={c.id} className="flex gap-2 group">
              <Avatar className="w-6 h-6 shrink-0 mt-0.5">
                <AvatarFallback className="text-[10px]">
                  {(c.profile?.first_name?.[0] || c.user_id?.[0] || "?").toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-medium">
                    {c.profile ? `${c.profile.first_name} ${c.profile.last_name}` : "Utente"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(c.created_at), "d MMM HH:mm", { locale: it })}
                  </span>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">{c.content}</p>
              </div>
              {c.user_id === user?.id && (
                <button
                  onClick={() => deleteMutation.mutate(c.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0 mt-1"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Scrivi un commento..."
          rows={2}
          className="text-sm min-h-[60px]"
          maxLength={1000}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
          }}
        />
        <Button
          size="sm"
          variant="ghost"
          className="h-auto px-2 self-end"
          onClick={handleSubmit}
          disabled={!content.trim() || addMutation.isPending}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
