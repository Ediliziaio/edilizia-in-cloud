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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";

interface QuickActionsProps {
  company: { id: string; name: string; email: string; status: string; trial_ends_at: string | null };
}

const statusLabels: Record<string, string> = {
  active: "Attivo",
  trial: "Trial",
  suspended: "Sospeso",
  expired: "Scaduto",
};

export function CompanyQuickActions({ company }: QuickActionsProps) {
  const queryClient = useQueryClient();
  const [confirmDialog, setConfirmDialog] = useState<{ status: string; label: string } | null>(null);
  const [confirmExtend, setConfirmExtend] = useState<number | null>(null);

  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const { error } = await supabase
        .from("companies")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", company.id);
      if (error) throw error;
    },
    onSuccess: (_, newStatus) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.companiesFull });
      toast.success(`Stato aggiornato a "${statusLabels[newStatus] || newStatus}"`);
      setConfirmDialog(null);
    },
    onError: () => { toast.error("Errore nel cambio stato"); setConfirmDialog(null); },
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
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.companiesFull });
      toast.success(`Trial esteso di ${days} giorni`);
      setConfirmExtend(null);
    },
    onError: () => { toast.error("Errore nell'estensione trial"); setConfirmExtend(null); },
  });

  const statusOptions = [
    { value: "active", label: "Attivo", icon: CheckCircle },
    { value: "trial", label: "Trial", icon: Clock },
    { value: "suspended", label: "Sospeso", icon: Pause },
    { value: "expired", label: "Scaduto", icon: XCircle },
  ].filter((s) => s.value !== company.status);

  return (
    <>
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
                <DropdownMenuItem key={s.value} className="text-xs" onClick={() => setConfirmDialog({ status: s.value, label: s.label })}>
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
                <DropdownMenuItem key={d} className="text-xs" onClick={() => setConfirmExtend(d)}>
                  +{d} giorni
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-xs" onClick={() => { window.open(`mailto:${company.email}`); toast.success(`Email aperta per ${company.name}`); }}>
            <Mail className="h-3.5 w-3.5 mr-2" />Invia email
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Confirm status change */}
      <AlertDialog open={!!confirmDialog} onOpenChange={(o) => !o && setConfirmDialog(null)}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma cambio stato</AlertDialogTitle>
            <AlertDialogDescription>
              Vuoi cambiare lo stato di <strong>{company.name}</strong> da "{statusLabels[company.status] || company.status}" a "{confirmDialog?.label}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusMutation.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDialog && statusMutation.mutate(confirmDialog.status)}
              disabled={statusMutation.isPending}
              className={confirmDialog?.status === "suspended" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              Conferma
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm trial extension */}
      <AlertDialog open={confirmExtend !== null} onOpenChange={(o) => !o && setConfirmExtend(null)}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma estensione trial</AlertDialogTitle>
            <AlertDialogDescription>
              Vuoi estendere il trial di <strong>{company.name}</strong> di {confirmExtend} giorni?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={extendTrialMutation.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmExtend && extendTrialMutation.mutate(confirmExtend)}
              disabled={extendTrialMutation.isPending}
            >
              Estendi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
