import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { MessageSquare, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["impl-companies"] }),
    onError: () => toast({ title: "Errore", description: "Impossibile aggiornare il modulo.", variant: "destructive" }),
  });

  const bulkMutation = useMutation({
    mutationFn: async ({ field, value }: { field: string; value: boolean }) => {
      const { error } = await supabase
        .from("companies")
        .update({ [field]: value } as any)
        .neq("id", "00000000-0000-0000-0000-000000000000"); // update all
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["impl-companies"] });
      toast({ title: vars.value ? "Attivato per tutte" : "Disattivato per tutte" });
    },
    onError: () => toast({ title: "Errore", variant: "destructive" }),
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

        return (
          <Card key={mod.key}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <mod.icon className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">{mod.title}</CardTitle>
                  <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-700">
                    {mod.badgeLabel}
                  </Badge>
                </div>
                <Badge variant="secondary">
                  Attivo su {activeCount}/{companies.length} aziende
                </Badge>
              </div>
              <CardDescription>{mod.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => bulkMutation.mutate({ field: mod.dbField, value: true })}
                  disabled={allActive || bulkMutation.isPending}
                >
                  Attiva per tutte
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => bulkMutation.mutate({ field: mod.dbField, value: false })}
                  disabled={activeCount === 0 || bulkMutation.isPending}
                >
                  Disattiva per tutte
                </Button>
              </div>

              <div className="border rounded-lg p-4">
                <p className="text-sm font-medium mb-3">Aziende</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {companies.map((company: any) => (
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
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
