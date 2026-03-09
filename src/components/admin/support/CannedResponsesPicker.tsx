import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquareText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface CannedResponsesPickerProps {
  onSelect: (content: string) => void;
}

interface CannedResponse {
  id: string;
  title: string;
  content: string;
  category: string;
  shortcut: string | null;
}

export function CannedResponsesPicker({ onSelect }: CannedResponsesPickerProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");

  const { data: responses = [], isLoading } = useQuery({
    queryKey: ["canned-responses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_canned_responses" as never)
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as CannedResponse[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("support_canned_responses" as never)
        .insert({ title: newTitle, content: newContent, created_by: user!.id } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["canned-responses"] });
      setNewTitle("");
      setNewContent("");
      setShowAdd(false);
      toast.success("Risposta rapida aggiunta");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("support_canned_responses" as never)
        .delete()
        .eq("id", id as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["canned-responses"] });
      toast.success("Risposta eliminata");
    },
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" title="Risposte rapide">
          <MessageSquareText className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b flex items-center justify-between">
          <span className="text-sm font-medium">Risposte Rapide</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowAdd(!showAdd)}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        {showAdd && (
          <div className="p-3 border-b space-y-2">
            <Input
              placeholder="Titolo"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="h-8 text-sm"
            />
            <Textarea
              placeholder="Contenuto risposta..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              className="min-h-[60px] text-sm"
            />
            <Button
              size="sm"
              className="w-full h-7 text-xs"
              disabled={!newTitle.trim() || !newContent.trim() || addMutation.isPending}
              onClick={() => addMutation.mutate()}
            >
              Salva
            </Button>
          </div>
        )}

        <ScrollArea className="max-h-[250px]">
          {isLoading ? (
            <p className="text-xs text-muted-foreground text-center py-4">Caricamento...</p>
          ) : responses.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Nessuna risposta salvata</p>
          ) : (
            <div className="p-1">
              {responses.map((r) => (
                <div
                  key={r.id}
                  className="group flex items-center justify-between p-2 rounded hover:bg-muted cursor-pointer"
                  onClick={() => {
                    onSelect(r.content);
                    setOpen(false);
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.content.slice(0, 60)}...</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0 ml-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMutation.mutate(r.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
