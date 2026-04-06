/**
 * Lista degli operai (ruolo employee) con gestione documenti e cantieri.
 * Usato nel tab "Operai" di SettingsPeople.tsx.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { HardHat, ExternalLink, Loader2, UserCheck, UserX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

export function OperaiCampoList() {
  const { effectiveCompany } = useAuth();
  const companyId = (effectiveCompany as any)?.id ?? "";
  const qc = useQueryClient();

  const { data: operai = [], isLoading } = useQuery({
    queryKey: ["operai-campo-list", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select(`
          user_id, role,
          profile:profiles(id, first_name, last_name, email)
        `)
        .eq("company_id", companyId)
        .eq("role", "employee");
      return data ?? [];
    },
    enabled: !!companyId,
  });

  // Conta cantieri attivi per ogni operaio
  const { data: cantieriCount = {} } = useQuery({
    queryKey: ["operai-cantieri-count", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("order_campo_assignments")
        .select("user_id")
        .eq("company_id", companyId);
      const counts: Record<string, number> = {};
      (data ?? []).forEach((a: any) => {
        counts[a.user_id] = (counts[a.user_id] ?? 0) + 1;
      });
      return counts;
    },
    enabled: !!companyId,
  });

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="animate-spin h-6 w-6" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Banner informativo */}
      <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
        <HardHat className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
        <div>
          <p className="font-medium">Utenti Area Campo</p>
          <p className="text-amber-700 text-xs mt-0.5">
            Questi utenti accedono tramite{" "}
            <a href="https://lavori.ediliziaincloud.com" target="_blank" rel="noreferrer" className="underline font-medium">
              lavori.ediliziaincloud.com
            </a>
            {" "}— non dal portale principale.
          </p>
        </div>
      </div>

      {operai.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <UserX className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Nessun operaio registrato</p>
            <p className="text-xs text-muted-foreground mt-1">
              Crea un utente con ruolo &quot;Operaio&quot; nella scheda Utenti
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {operai.map((op: any) => {
            const p = op.profile;
            const nrCantieri = cantieriCount[op.user_id] ?? 0;
            return (
              <Card key={op.user_id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center font-bold text-amber-700">
                        {p?.first_name?.[0]}{p?.last_name?.[0]}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{p?.first_name} {p?.last_name}</p>
                        <p className="text-xs text-muted-foreground">{p?.email}</p>
                        <div className="flex gap-2 mt-1">
                          <Badge variant="outline" className="text-[10px]">
                            {nrCantieri} cantier{nrCantieri === 1 ? "e" : "i"}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700">
                            <UserCheck className="h-2.5 w-2.5 mr-1" />Operaio
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => window.open(`/azienda/ordini?operaio=${op.user_id}`, "_blank")}
                        title="Vedi cantieri assegnati"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
