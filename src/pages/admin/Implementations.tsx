import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { MessageSquare, Loader2, Eye, EyeOff, Search } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

interface ModuleConfig {
  key: string;
  dbField: "messaging_beta_enabled";
  title: string;
  description: string;
  icon: React.ElementType;
  badgeLabel: string;
}

const MODULES: ModuleConfig[] = [
  {
    key: "messaging_beta",
    dbField: "messaging_beta_enabled",
    title: "Messaggistica (BETA)",
    description: "Modulo di messaggistica con AI per gestire conversazioni e automatizzare task.",
    icon: MessageSquare,
    badgeLabel: "BETA",
  },
];

export default function Implementations() {
  const queryClient = useQueryClient();
  const [dialogModule, setDialogModule] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [bulkConfirm, setBulkConfirm] = useState<{ field: string; value: boolean; count: number } | null>(null);

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["impl-companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name, messaging_beta_enabled")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ companyId, field, value }: { companyId: string; field: string; value: boolean }) => {
      const { error } = await supabase
        .from("companies")
        .update({ [field]: value } as any)
        .eq("id", companyId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["impl-companies"] });
      toast.success(vars.value ? "Modulo attivato" : "Modulo disattivato");
    },
    onError: () => toast.error("Impossibile aggiornare il modulo"),
  });

  const bulkMutation = useMutation({
    mutationFn: async ({ field, value }: { field: string; value: boolean }) => {
      const { error } = await supabase
        .from("companies")
        .update({ [field]: value } as any)
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["impl-companies"] });
      toast.success(vars.value ? "Attivato per tutte le aziende" : "Disattivato per tutte le aziende");
    },
    onError: () => toast.error("Errore nell'operazione bulk"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Implementazioni</h1>
        <p className="text-muted-foreground">Gestisci i moduli attivi per le aziende della piattaforma.</p>
      </div>

      {MODULES.map((mod) => {
        const activeCount = companies.filter((c: any) => c[mod.dbField]).length;
        const allActive = activeCount === companies.length && companies.length > 0;
        const noneActive = activeCount === 0;

        const statusLabel = allActive
          ? "Visibile per tutte le aziende"
          : noneActive
            ? "Non attivo"
            : `Attivo su ${activeCount}/${companies.length} aziende`;

        const StatusIcon = noneActive ? EyeOff : Eye;

        return (
          <Card key={mod.key}>
            {/* Top banner */}
            <div className="flex items-center justify-between px-6 py-3 border-b bg-muted/40 rounded-t-lg">
              <div className="flex items-center gap-2">
                <mod.icon className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">{mod.title}</span>
                <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-700 text-xs">
                  {mod.badgeLabel}
                </Badge>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <StatusIcon className="h-3.5 w-3.5" />
                <span>{statusLabel}</span>
              </div>
            </div>

            {/* Body */}
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{mod.title}</CardTitle>
              <CardDescription>{mod.description}</CardDescription>
            </CardHeader>

            {/* Actions */}
            <CardContent className="flex items-center justify-end gap-2 pt-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDialogModule(mod.key)}
              >
                Abilitato per aziende specifiche
              </Button>
              <Button
                size="sm"
                onClick={() => setBulkConfirm({ field: mod.dbField, value: !allActive, count: companies.length })}
                disabled={bulkMutation.isPending}
                variant={allActive ? "destructive" : "default"}
              >
                {bulkMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {allActive ? "Disattiva funzionalità" : "Attiva funzionalità"}
              </Button>
            </CardContent>

            {/* Selection Dialog */}
            <Dialog open={dialogModule === mod.key} onOpenChange={(open) => { if (!open) { setDialogModule(null); setSearchTerm(""); } }}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Seleziona aziende — {mod.title}</DialogTitle>
                  <DialogDescription>Seleziona le aziende per cui abilitare il modulo.</DialogDescription>
                </DialogHeader>

                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cerca azienda..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>

                <div className="flex gap-2 mb-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => bulkMutation.mutate({ field: mod.dbField, value: true })}
                    disabled={allActive || bulkMutation.isPending}
                  >
                    Seleziona tutte
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => bulkMutation.mutate({ field: mod.dbField, value: false })}
                    disabled={noneActive || bulkMutation.isPending}
                  >
                    Deseleziona tutte
                  </Button>
                </div>

                <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
                  {companies
                    .filter((c: any) => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map((company: any) => (
                    <label
                      key={company.id}
                      className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted cursor-pointer transition-colors"
                    >
                      <Checkbox
                        checked={!!company[mod.dbField]}
                        onCheckedChange={(checked) =>
                          toggleMutation.mutate({
                            companyId: company.id,
                            field: mod.dbField,
                            value: !!checked,
                          })
                        }
                        disabled={toggleMutation.isPending}
                      />
                      <span className="text-sm truncate">{company.name}</span>
                    </label>
                  ))}
                  {companies.filter((c: any) => c.name.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">Nessuna azienda trovata.</p>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </Card>
        );
      })}

      <AlertDialog open={!!bulkConfirm} onOpenChange={(open) => { if (!open) setBulkConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma operazione bulk</AlertDialogTitle>
            <AlertDialogDescription>
              {bulkConfirm?.value
                ? `Stai per attivare il modulo per tutte le ${bulkConfirm?.count} aziende.`
                : `Stai per disattivare il modulo per tutte le ${bulkConfirm?.count} aziende.`}
              {" "}Questa azione avrà effetto immediato.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (bulkConfirm) {
                  bulkMutation.mutate({ field: bulkConfirm.field, value: bulkConfirm.value });
                  setBulkConfirm(null);
                }
              }}
              className={bulkConfirm?.value ? "" : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}
            >
              {bulkConfirm?.value ? "Attiva per tutte" : "Disattiva per tutte"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
