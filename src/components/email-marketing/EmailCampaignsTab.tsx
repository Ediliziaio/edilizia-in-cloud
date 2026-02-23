import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Trash2, Pencil, Send } from "lucide-react";
import { CampaignDialog } from "./CampaignDialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Bozza", variant: "secondary" },
  scheduled: { label: "Pianificata", variant: "outline" },
  sending: { label: "In invio", variant: "default" },
  sent: { label: "Inviata", variant: "default" },
  paused: { label: "In pausa", variant: "destructive" },
};

export function EmailCampaignsTab() {
  const { company } = useAuth();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCampaign, setEditCampaign] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["email-campaigns", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_campaigns")
        .select("*")
        .eq("company_id", company!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Campagna eliminata"); qc.invalidateQueries({ queryKey: ["email-campaigns"] }); },
  });

  const filtered = campaigns.filter((c: any) => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-1 w-full sm:w-auto">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Cerca campagna..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              <SelectItem value="draft">Bozza</SelectItem>
              <SelectItem value="scheduled">Pianificata</SelectItem>
              <SelectItem value="sending">In invio</SelectItem>
              <SelectItem value="sent">Inviata</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => { setEditCampaign(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nuova campagna
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Caricamento...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <Send className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">Nessuna campagna trovata</p>
            <Button onClick={() => { setEditCampaign(null); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Crea la tua prima campagna
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((c: any) => {
            const badge = STATUS_BADGE[c.status] || { label: c.status, variant: "secondary" as const };
            return (
              <Card key={c.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground truncate">{c.name}</span>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                      {c.type === "automation" && <Badge variant="outline">Automazione</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{c.subject}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {c.scheduled_at
                        ? `Pianificata: ${format(new Date(c.scheduled_at), "dd MMM yyyy HH:mm", { locale: it })}`
                        : `Creata: ${format(new Date(c.created_at), "dd MMM yyyy", { locale: it })}`}
                      {c.total_recipients > 0 && ` · ${c.total_recipients} destinatari`}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => { setEditCampaign(c); setDialogOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(c.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CampaignDialog open={dialogOpen} onOpenChange={setDialogOpen} campaign={editCampaign} />
    </div>
  );
}
