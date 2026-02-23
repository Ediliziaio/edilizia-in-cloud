import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Plus, Search, Trash2, Pencil, FileText } from "lucide-react";
import { TemplateDialog } from "./TemplateDialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";

export function EmailTemplatesTab() {
  const { company } = useAuth();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<any>(null);
  const [search, setSearch] = useState("");

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["email-templates", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .eq("company_id", company!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Template eliminato"); qc.invalidateQueries({ queryKey: ["email-templates"] }); },
  });

  const filtered = templates.filter((t: any) => t.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Cerca template..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button onClick={() => { setEditTemplate(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nuovo template
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Caricamento...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">Nessun template trovato</p>
            <Button onClick={() => { setEditTemplate(null); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Crea il tuo primo template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t: any) => (
            <Card key={t.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{t.name}</p>
                    <p className="text-sm text-muted-foreground truncate">{t.subject || "Senza oggetto"}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" onClick={() => { setEditTemplate(t); setDialogOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(t.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground flex justify-between">
                  <span>{t.folder}</span>
                  <span>{format(new Date(t.created_at), "dd MMM yyyy", { locale: it })}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TemplateDialog open={dialogOpen} onOpenChange={setDialogOpen} template={editTemplate} />
    </div>
  );
}
