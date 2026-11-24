/**
 * DebitoAiAlert — chiamate AI fatte a credito finito (decisione del 16/11/2026).
 *
 * Quando il provider ha già lavorato e il credito non basta, l'importo diventa un
 * debito (`ai_debiti`) e si scala da solo alla ricarica successiva, compreso
 * l'omaggio mensile del piano. Qui il titolare vede quanto resta da scalare.
 * Niente se non c'è debito aperto.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { formatEur } from "@/modules/ai-agents/lib/creditCalculator";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

export function riepilogoDebitoAi(righe: Array<{ residuo_eur: number | string | null; created_at: string }>) {
  const aperte = righe.filter((r) => Number(r.residuo_eur ?? 0) > 0);
  const totale = aperte.reduce((s, r) => s + Number(r.residuo_eur ?? 0), 0);
  const dal = aperte.reduce<string | null>((min, r) => (!min || r.created_at < min ? r.created_at : min), null);
  return { totale, chiamate: aperte.length, dal };
}

export function DebitoAiAlert({ companyId }: { companyId: string | undefined }) {
  const t = useT();
  const { data } = useQuery({
    queryKey: ["ai-debiti-aperti", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_debiti")
        .select("residuo_eur, created_at")
        .eq("company_id", companyId!)
        .gt("residuo_eur", 0)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return riepilogoDebitoAi(data ?? []);
    },
  });

  if (!data || data.totale <= 0) return null;

  return (
    <Alert className="border-amber-300 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20">
      <AlertTriangle className="h-4 w-4 text-amber-600" />
      <AlertDescription className="text-amber-900 dark:text-amber-200">
        <strong>{t("AI a debito: {totale}", { totale: formatEur(data.totale) })}</strong>{" "}
        ({data.dal
          ? (data.chiamate === 1
            ? t("una chiamata fatta a credito finito dal {data}", { data: new Date(data.dal).toLocaleDateString(intlCampo()) })
            : t("{n} chiamate fatte a credito finito dal {data}", { n: data.chiamate, data: new Date(data.dal).toLocaleDateString(intlCampo()) }))
          : (data.chiamate === 1 ? t("una chiamata fatta a credito finito") : t("{n} chiamate fatte a credito finito", { n: data.chiamate }))}).{" "}
        {t("Si scala da solo alla prossima ricarica, compresi i crediti AI inclusi nel piano.")}
      </AlertDescription>
    </Alert>
  );
}
