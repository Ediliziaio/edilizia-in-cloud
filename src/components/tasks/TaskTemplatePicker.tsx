import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LayoutTemplate, Plus, Trash2, Check } from "lucide-react";
import { toast } from "sonner";

interface Template {
  id: string;
  name: string;
  title: string;
  notes: string | null;
  priority: string;
  category: string;
  estimated_hours: number | null;
}

interface TaskTemplatePickerProps {
  // Current form values (to save as template)
  currentTitle: string;
  currentNotes: string;
  currentPriority: string;
  currentCategory: string;
  currentEstimatedHours?: number | null;
  // Apply callback
  onApply: (tpl: Omit<Template, "id" | "name">) => void;
}

const PRIORITY_LABELS: Record<string, string> = {
  bassa: "Bassa", normale: "Normale", alta: "Alta", urgente: "Urgente",
};

export function TaskTemplatePicker({
  currentTitle, currentNotes, currentPriority, currentCategory, currentEstimatedHours, onApply,
}: TaskTemplatePickerProps) {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"list" | "save">("list");
  const [saveName, setSaveName] = useState("");

  const { data: templates = [] } = useQuery({
    queryKey: ["task-templates", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("task_templates")
        .select("id, name, title, notes, priority, category, estimated_hours")
        .eq("company_id", companyId)
        .order("name");
      if (error) return [];
      return data as Template[];
    },
    enabled: !!companyId && open,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!companyId || !saveName.trim()) return;
      const { error } = await supabase
        .from("task_templates")
        .upsert({
          company_id: companyId,
          name: saveName.trim(),
          title: currentTitle || saveName.trim(),
          notes: currentNotes || null,
          priority: currentPriority,
          category: currentCategory,
          estimated_hours: currentEstimatedHours ?? null,
          created_by: user?.id,
        }, { onConflict: "company_id,name" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template salvato");
      queryClient.invalidateQueries({ queryKey: ["task-templates", companyId] });
      setSaveName("");
      setMode("list");
    },
    onError: (e: any) => toast.error("Errore salvataggio template", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["task-templates", companyId] }),
    onError: () => toast.error("Errore eliminazione template"),
  });

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setMode("list"); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <LayoutTemplate className="h-3.5 w-3.5" />
          Template
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        {mode === "list" ? (
          <>
            <div className="p-2 border-b flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Template attività
              </span>
              <button
                className="text-xs text-primary hover:underline flex items-center gap-1"
                onClick={() => { setSaveName(""); setMode("save"); }}
              >
                <Plus className="h-3 w-3" />
                Salva corrente
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {templates.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  Nessun template.<br />
                  <span className="opacity-60">Crea un'attività e salvala come template.</span>
                </p>
              ) : (
                templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-muted group"
                  >
                    <button
                      className="flex-1 text-left min-w-0"
                      onClick={() => {
                        onApply({ title: tpl.title, notes: tpl.notes, priority: tpl.priority, category: tpl.category, estimated_hours: tpl.estimated_hours });
                        setOpen(false);
                        toast.success(`Template "${tpl.name}" applicato`);
                      }}
                    >
                      <p className="text-sm font-medium truncate">{tpl.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {PRIORITY_LABELS[tpl.priority] ?? tpl.priority} · {tpl.category}
                        {tpl.estimated_hours != null && ` · ${tpl.estimated_hours}h`}
                      </p>
                    </button>
                    <button
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                      onClick={() => deleteMutation.mutate(tpl.id)}
                      title="Elimina template"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="p-3 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Salva come template
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Nome template</Label>
              <Input
                placeholder="Es. Sopralluogo standard"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                className="h-8 text-sm"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter" && saveName.trim()) saveMutation.mutate(); }}
              />
            </div>
            <div className="text-[10px] text-muted-foreground space-y-0.5">
              <p>Titolo: <span className="text-foreground">{currentTitle || "(vuoto)"}</span></p>
              <p>Priorità: <span className="text-foreground">{PRIORITY_LABELS[currentPriority]}</span></p>
              <p>Categoria: <span className="text-foreground">{currentCategory}</span></p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 h-8 text-xs"
                onClick={() => saveMutation.mutate()}
                disabled={!saveName.trim() || saveMutation.isPending}
              >
                <Check className="h-3.5 w-3.5 mr-1" />
                Salva
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => setMode("list")}
              >
                Annulla
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
