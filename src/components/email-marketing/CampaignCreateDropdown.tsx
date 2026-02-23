import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, FileText, LayoutTemplate, FolderOpen } from "lucide-react";
import { toast } from "sonner";

interface CampaignCreateDropdownProps {
  variant?: "default" | "outline";
  size?: "default" | "sm";
}

export function CampaignCreateDropdown({ variant = "default", size = "sm" }: CampaignCreateDropdownProps) {
  const { effectiveCompany, user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const createDraftMut = useMutation({
    mutationFn: async (htmlContent?: string) => {
      const { data, error } = await supabase
        .from("email_campaigns")
        .insert({
          company_id: effectiveCompany!.id,
          created_by: user!.id,
          name: "Campagna senza titolo",
          status: "draft",
          type: "broadcast",
          html_content: htmlContent || "",
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      navigate(`/azienda/marketing/email/campagna/${data.id}/editor`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={createDraftMut.isPending || !effectiveCompany || !user}>
          <Plus className="h-4 w-4 mr-1" />
          {createDraftMut.isPending ? "Creazione..." : "Crea campagna"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => { setOpen(false); createDraftMut.mutate(undefined); }}>
          <FileText className="h-4 w-4 mr-2" />
          Vuoto
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => { setOpen(false); toast.info("Funzionalità in arrivo"); }}>
          <LayoutTemplate className="h-4 w-4 mr-2" />
          Modelli di email marketing
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => { setOpen(false); toast.info("Funzionalità in arrivo"); }}>
          <FolderOpen className="h-4 w-4 mr-2" />
          I tuoi modelli
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
