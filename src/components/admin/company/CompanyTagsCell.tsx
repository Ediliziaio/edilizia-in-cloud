import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";

const TAG_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4"];

interface CompanyTagsCellProps {
  companyId: string;
  tags: Array<{ id: string; tag: string; color: string }>;
}

export function CompanyTagsCell({ companyId, tags }: CompanyTagsCellProps) {
  const [newTag, setNewTag] = useState("");
  const [selectedColor, setSelectedColor] = useState(TAG_COLORS[0]);
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("company_tags").insert({
        company_id: companyId,
        tag: newTag.trim(),
        color: selectedColor,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-tags"] });
      setNewTag("");
      setOpen(false);
    },
    onError: (e: any) => {
      if (e.message?.includes("duplicate") || e.code === "23505") {
        toast.error("Tag già esistente");
      } else {
        toast.error("Errore nell'aggiunta del tag");
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("company_tags").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company-tags"] }),
  });

  return (
    <div className="flex items-center gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
      {tags.map((t) => (
        <Badge
          key={t.id}
          variant="outline"
          className="text-[10px] px-1.5 py-0 gap-0.5 group"
          style={{ borderColor: t.color, color: t.color }}
        >
          {t.tag}
          <button
            onClick={() => deleteMutation.mutate(t.id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </Badge>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="h-5 w-5 rounded border border-dashed border-muted-foreground/40 flex items-center justify-center hover:border-primary transition-colors">
            <Plus className="h-3 w-3 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-52 p-3" align="start">
          <div className="space-y-2">
            <Input
              placeholder="Tag..."
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              className="h-7 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTag.trim()) addMutation.mutate();
              }}
            />
            <div className="flex gap-1">
              {TAG_COLORS.map((c) => (
                <button
                  key={c}
                  className={`h-5 w-5 rounded-full border-2 ${selectedColor === c ? "border-foreground" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setSelectedColor(c)}
                />
              ))}
            </div>
            <Button
              size="sm"
              className="w-full h-7 text-xs"
              disabled={!newTag.trim()}
              onClick={() => addMutation.mutate()}
            >
              Aggiungi
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
