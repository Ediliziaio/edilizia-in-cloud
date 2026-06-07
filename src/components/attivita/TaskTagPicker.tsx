import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tag, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Palette predefinita per nuovi tag
const COLOR_PALETTE = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#64748b",
];

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface TaskTagPickerProps {
  taskId: string;
  assignedTags: Tag[];
  onChanged: () => void;
}

export function TaskTagPicker({ taskId, assignedTags, onChanged }: TaskTagPickerProps) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(COLOR_PALETTE[0]);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const assignedIds = new Set(assignedTags.map((t) => t.id));

  const { data: allTags = [] } = useQuery({
    queryKey: ["task-tags", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("task_tags")
        .select("id, name, color")
        .eq("company_id", companyId)
        .order("name");
      if (error) { toast.error("Errore caricamento tag"); return []; }
      return data as Tag[];
    },
    enabled: !!companyId && open,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ tagId, assigned }: { tagId: string; assigned: boolean }) => {
      if (assigned) {
        const { error } = await supabase
          .from("task_tag_assignments")
          .delete()
          .eq("task_id", taskId)
          .eq("tag_id", tagId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("task_tag_assignments")
          .insert({ task_id: taskId, tag_id: tagId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-tags-assigned", taskId] });
      onChanged();
    },
    onError: () => toast.error("Errore aggiornamento tag"),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!newName.trim() || !companyId) return;
      const { data, error } = await supabase
        .from("task_tags")
        .insert({ company_id: companyId, name: newName.trim(), color: newColor })
        .select("id")
        .single();
      if (error) throw error;
      // Assegna subito al task corrente
      const { error: assignError } = await supabase.from("task_tag_assignments").insert({ task_id: taskId, tag_id: data.id });
      if (assignError) throw assignError;
    },
    onSuccess: () => {
      setNewName("");
      setCreating(false);
      queryClient.invalidateQueries({ queryKey: ["task-tags", companyId] });
      queryClient.invalidateQueries({ queryKey: ["task-tags-assigned", taskId] });
      onChanged();
    },
    onError: (e: any) => toast.error("Errore creazione tag", { description: e.message }),
  });

  const filtered = allTags.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-foreground">
          <Tag className="h-3.5 w-3.5 mr-1" />
          Aggiungi etichetta
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <Input
          ref={inputRef}
          placeholder="Cerca etichette..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 text-sm mb-2"
          autoFocus
        />

        <div className="max-h-48 overflow-y-auto space-y-0.5">
          {filtered.map((tag) => {
            const assigned = assignedIds.has(tag.id);
            return (
              <button
                key={tag.id}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors text-left",
                )}
                onClick={() => toggleMutation.mutate({ tagId: tag.id, assigned })}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="flex-1 truncate">{tag.name}</span>
                {assigned && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
              </button>
            );
          })}
          {filtered.length === 0 && !creating && (
            <p className="text-xs text-muted-foreground text-center py-2">
              {search ? `Nessun tag per "${search}"` : "Nessun tag ancora"}
            </p>
          )}
        </div>

        <div className="border-t mt-2 pt-2">
          {creating ? (
            <div className="space-y-2">
              <Input
                placeholder="Nome etichetta"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-7 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newName.trim()) createMutation.mutate();
                  if (e.key === "Escape") setCreating(false);
                }}
              />
              <div className="flex flex-wrap gap-1.5">
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={cn(
                      "w-5 h-5 rounded-full border-2 transition-transform",
                      newColor === c ? "border-foreground scale-110" : "border-transparent",
                    )}
                    style={{ backgroundColor: c }}
                    onClick={() => setNewColor(c)}
                  />
                ))}
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  onClick={() => createMutation.mutate()}
                  disabled={!newName.trim() || createMutation.isPending}
                >
                  Crea
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => { setCreating(false); setNewName(""); }}
                >
                  Annulla
                </Button>
              </div>
            </div>
          ) : (
            <button
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
              onClick={() => { setCreating(true); setSearch(""); }}
            >
              <Plus className="h-3.5 w-3.5" />
              Crea nuova etichetta
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
