import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MoreHorizontal, RefreshCw, CheckCircle, Pause, XCircle, Clock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

interface QuickActionsProps {
  company: { id: string; name: string; status: string; trial_ends_at: string | null };
}

export function CompanyQuickActions({ company }: QuickActionsProps) {
  const queryClient = useQueryClient();

  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const { error } = await supabase
        .from("companies")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", company.id);
      if (error) throw error;
    },
    onSuccess: (_, newStatus) => {
      queryClient.invalidateQueries({ queryKey: ["admin-companies-full"] });
      toast.success(`Stato aggiornato a "${newStatus}"`);
    },
    onError: () => toast.error("Errore nel cambio stato"),
  });

  const extendTrialMutation = useMutation({
    mutationFn: async (days: number) => {
      const base = company.trial_ends_at ? new Date(company.trial_ends_at) : new Date();
      const newEnd = new Date(base.getTime() + days * 86400000);
      const { error } = await supabase
        .from("companies")
        .update({
          trial_ends_at: newEnd.toISOString(),
          status: "trial",
          updated_at: new Date().toISOString(),
        })
        .eq("id", company.id);
      if (error) throw error;
    },
    onSuccess: (_, days) => {
      queryClient.invalidateQueries({ queryKey: ["admin-companies-full"] });
      toast.success(`Trial esteso di ${days} giorni`);
    },
    onError: () => toast.error("Errore nell'estensione trial"),
  });

  const statusOptions = [
    { value: "active", label: "Attivo", icon: CheckCircle },
    { value: "trial", label: "Trial", icon: Clock },
    { value: "suspended", label: "Sospeso", icon: Pause },
    { value: "expired", label: "Scaduto", icon: XCircle },
  ].filter((s) => s.value !== company.status);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="text-xs">{company.name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs">
            <RefreshCw className="h-3.5 w-3.5 mr-2" />Cambia stato
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {statusOptions.map((s) => (
              <DropdownMenuItem key={s.value} className="text-xs" onClick={() => statusMutation.mutate(s.value)}>
                <s.icon className="h-3.5 w-3.5 mr-2" />{s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs">
            <Clock className="h-3.5 w-3.5 mr-2" />Estendi trial
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {[7, 14, 30].map((d) => (
              <DropdownMenuItem key={d} className="text-xs" onClick={() => extendTrialMutation.mutate(d)}>
                +{d} giorni
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-xs" onClick={() => window.open(`mailto:${company.name}`)}>
          <Mail className="h-3.5 w-3.5 mr-2" />Invia email
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
