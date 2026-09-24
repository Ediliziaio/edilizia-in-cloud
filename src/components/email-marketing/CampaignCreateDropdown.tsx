import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, FileText, LayoutTemplate, FolderOpen, Search, Loader2, Palette } from "lucide-react";
import { toast } from "sonner";
import { useEmailMarketingBase } from "./useEmailMarketingBase";

interface CampaignCreateDropdownProps {
  variant?: "default" | "outline";
  size?: "default" | "sm";
}

export function CampaignCreateDropdown({ variant = "default", size = "sm" }: CampaignCreateDropdownProps) {
  const { effectiveCompany, user } = useAuth();
  const navigate = useNavigate();
  const emailBase = useEmailMarketingBase();
  const qc = useQueryClient();
  // La lista resta in cache 2 minuti: senza questo, tornando indietro dopo
  // aver creato una campagna si leggeva ancora «Nessuna campagna» (24/09/2026).
  const aggiornaLista = () => qc.invalidateQueries({ queryKey: queryKeys.emailCampaigns.all });
  const [open, setOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");

  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ["email-templates-for-campaign", effectiveCompany?.id],
    enabled: !!effectiveCompany?.id && templateDialogOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("id, name, subject, html_content, type")
        .eq("company_id", effectiveCompany!.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const createDraftMut = useMutation({
    mutationFn: async (opts?: { htmlContent?: string; navigateTo?: "editor" | "builder" }) => {
      if (!effectiveCompany?.id || !user?.id) throw new Error("Sessione non disponibile");
      const { data, error } = await supabase
        .from("email_campaigns")
        .insert({
          company_id: effectiveCompany!.id,
          created_by: user!.id,
          name: "Campagna senza titolo",
          status: "draft",
          type: "broadcast",
          html_content: opts?.htmlContent || "",
        })
        .select("id")
        .single();
      if (error) throw error;
      return { id: data.id, navigateTo: opts?.navigateTo || "editor" };
    },
    onSuccess: (data) => {
      aggiornaLista();
      if (data.navigateTo === "builder") {
        navigate(`${emailBase}/campagna/${data.id}/builder`);
      } else {
        navigate(`${emailBase}/campagna/${data.id}/editor`);
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  const createFromTemplateMut = useMutation({
    mutationFn: async (template: any) => {
      if (!effectiveCompany?.id || !user?.id) throw new Error("Sessione non disponibile");
      const { data, error } = await supabase
        .from("email_campaigns")
        .insert({
          company_id: effectiveCompany!.id,
          created_by: user!.id,
          name: `Campagna da: ${template.name}`,
          status: "draft",
          type: "broadcast",
          html_content: template.html_content || "",
          subject: template.subject || "",
          template_id: template.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      aggiornaLista();
      setTemplateDialogOpen(false);
      navigate(`${emailBase}/campagna/${data.id}/editor`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filteredTemplates = templates.filter((t: any) =>
    t.name.toLowerCase().includes(templateSearch.toLowerCase())
  );

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant={variant} size={size} disabled={createDraftMut.isPending || !effectiveCompany || !user}>
            <Plus className="h-4 w-4 mr-1" />
            {createDraftMut.isPending ? "Creazione..." : "Crea campagna"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => { setOpen(false); createDraftMut.mutate({ navigateTo: "editor" }); }}>
            <FileText className="h-4 w-4 mr-2" />
            Editor standard
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => { setOpen(false); createDraftMut.mutate({ navigateTo: "builder" }); }}>
            <Palette className="h-4 w-4 mr-2" />
            Progettazione custom
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => { setOpen(false); navigate(`${emailBase}?tab=modelli`); }}>
            <LayoutTemplate className="h-4 w-4 mr-2" />
            Modelli di email marketing
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => { setOpen(false); setTemplateDialogOpen(true); setTemplateSearch(""); }}>
            <FolderOpen className="h-4 w-4 mr-2" />
            I tuoi modelli
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Template picker dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Scegli un template</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Cerca template..."
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
              autoFocus
            />
          </div>
          <ScrollArea className="max-h-72">
            {templatesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredTemplates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {templates.length === 0 ? "Nessun template creato. Crea un template dalla tab Modelli." : "Nessun risultato"}
              </p>
            ) : (
              <div className="space-y-1">
                {filteredTemplates.map((t: any) => (
                  <button
                    key={t.id}
                    className="w-full text-left px-3 py-2.5 rounded-md hover:bg-muted transition-colors"
                    onClick={() => createFromTemplateMut.mutate(t)}
                    disabled={createFromTemplateMut.isPending}
                  >
                    <p className="text-sm font-medium">{t.name}</p>
                    {t.subject && <p className="text-xs text-muted-foreground truncate">{t.subject}</p>}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
