/**
 * Interruttore azienda: come funziona il prelievo di magazzino dal cantiere.
 * · a conferma: l'operaio richiede, l'ufficio approva e scarica.
 * · libero: l'operaio scarica subito (aziende senza magazziniere).
 * Visibile a chi può gestire il magazzino.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PackageCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

export function ImpostazionePrelievoCampo() {
  const { effectiveCompany } = useAuth();
  const permissions = usePermissions();
  const qc = useQueryClient();
  const companyId = effectiveCompany?.id ?? null;
  // Solo chi può davvero salvare sull'azienda (RLS companies): admin o impostazioni cantieri.
  const puoGestire = permissions.isAdmin === true || permissions.canEditSettingsOrders === true;

  const { data: conferma, isLoading } = useQuery({
    queryKey: ["magazzino-prelievo-conferma", companyId],
    enabled: !!companyId && puoGestire,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from("companies").select("magazzino_prelievo_conferma" as never).eq("id", companyId!).maybeSingle();
      if (error) throw error;
      // Colonna nuova, non ancora nei tipi generati.
      return ((data as unknown as { magazzino_prelievo_conferma?: boolean | null } | null)?.magazzino_prelievo_conferma ?? true) as boolean;
    },
  });

  const salva = useMutation({
    mutationFn: async (val: boolean) => {
      const { error } = await supabase.from("companies").update({ magazzino_prelievo_conferma: val } as never).eq("id", companyId!);
      if (error) throw error;
    },
    onMutate: (val) => {
      const prev = qc.getQueryData<boolean>(["magazzino-prelievo-conferma", companyId]);
      qc.setQueryData(["magazzino-prelievo-conferma", companyId], val);
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(["magazzino-prelievo-conferma", companyId], ctx.prev);
      toast.error("Non salvato", { description: e instanceof Error ? e.message : "Riprova." });
    },
    onSuccess: (_d, val) => toast.success(val ? "Prelievo dal cantiere: a conferma" : "Prelievo dal cantiere: libero"),
  });

  if (!puoGestire) return null;

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-3 sm:p-4">
        <div className="flex min-w-0 items-start gap-2.5">
          <PackageCheck className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Prelievo dal cantiere a conferma</p>
            <p className="text-xs text-muted-foreground">
              {conferma
                ? "L'operaio richiede il materiale; tu approvi e la giacenza si scarica dopo la conferma."
                : "Libero: l'operaio scarica subito la giacenza, senza passare da te (azienda senza magazziniere)."}
            </p>
          </div>
        </div>
        {isLoading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Switch checked={!!conferma} onCheckedChange={(v) => salva.mutate(v)} disabled={salva.isPending} />
        )}
      </CardContent>
    </Card>
  );
}
