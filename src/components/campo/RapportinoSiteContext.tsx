import { useQuery } from "@tanstack/react-query";
import { HardHat } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function RapportinoSiteContext({ orderId, companyId, compatto = false }: { orderId?: string; companyId: string | null; compatto?: boolean }) {
  const t = useT();
  const { data: order, isError, isLoading, refetch } = useQuery({
    queryKey: ["campo-rapportino-cantiere", companyId, orderId],
    enabled: !!orderId && !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("orders")
        .select("id, order_code, description, indirizzo_lavori")
        .eq("id", orderId!).eq("company_id", companyId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  if (compatto) {
    const indirizzo = [order?.order_code, order?.description || order?.indirizzo_lavori].filter(Boolean).join(" · ");
    return <p aria-label={t("Cantiere della registrazione")} title={indirizzo} className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
      {indirizzo || t("Cantiere")}
    </p>;
  }
  return <div className="mt-2 flex min-w-0 items-start gap-2 text-sm" aria-label={t("Cantiere del rapportino")}>
    <HardHat className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
    <div className="min-w-0">
      {order ? <>
        <p className="font-semibold text-foreground">{order.order_code || t("Cantiere")}</p>
        <p className="line-clamp-2 break-words text-muted-foreground">{order.description || order.indirizzo_lavori}</p>
      </> : <p className="text-muted-foreground">{isLoading ? t("Caricamento cantiere…") : t("Dati del cantiere non disponibili")}</p>}
      {isError && <button type="button" onClick={() => refetch()} className="min-h-11 text-primary underline">{t("Riprova cantiere")}</button>}
    </div>
  </div>;
}
