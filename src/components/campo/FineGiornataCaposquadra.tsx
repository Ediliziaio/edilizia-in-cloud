/**
 * La sera, il caposquadra vede cosa resta da chiudere (24/11/2026, richiesta del founder): rapportino della
 * squadra per ogni cantiere di oggi (dentro ci sono anche ore, mezzi e km), il materiale per domani, l'uscita.
 * Ogni passo si spunta da solo quando è fatto. Se tutto è fatto, la card lo dice e basta.
 */
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronRight, Circle, MoonStar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMiaGiornata } from "@/hooks/campo/useCampoGiornata";
import { useCampoDayTime } from "@/hooks/campo/useCampoDayTime";
import { useCampoWorkDay } from "@/hooks/campo/useCampoWorkDay";
import { cn } from "@/lib/utils";
import { RIQUADRO, TITOLO_RIQUADRO } from "@/lib/campo/stileCampo";
import { passiFineGiornata } from "@/lib/campo/fineGiornata";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function FineGiornataCaposquadra({ timbra }: { timbra: boolean }) {
  const t = useT();
  const { user, profile } = useAuth();
  const giorno = useCampoWorkDay();
  const giornata = useMiaGiornata(14);
  const dayTime = useCampoDayTime(user?.id, profile?.company_id ?? null);
  const cantieri = (giornata.data?.giorni.find(g => g.giorno === giorno)?.cantieri ?? []).map(c => ({
    order_id: c.order_id, codice: c.codice, capo: !!c.squadra?.sono_caposquadra || c.sono_capocantiere,
  }));
  const ids = cantieri.filter(c => c.capo).map(c => c.order_id);
  const inviati = useQuery({
    queryKey: ["campo-fine-giornata-rapportini", giorno, ids.join(",")],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("campo_rapportini").select("order_id, stato")
        .in("order_id", ids).eq("data_lavoro", giorno).in("stato", ["inviato", "approvato"]);
      if (error) throw error;
      return new Set((data ?? []).map(r => r.order_id as string));
    },
  });
  if (giornata.isLoading || ids.length === 0) return null;
  const passi = passiFineGiornata({
    giorno, cantieri, rapportiniInviati: inviati.data ?? new Set(), timbra,
    dentro: dayTime.summary.state !== "out", haTimbratoOggi: dayTime.todayPunches.length > 0,
  });
  const daFare = passi.filter(p => !p.fatto && p.chiave !== "materiale").length;

  return (
    <section className={cn(RIQUADRO, "border-violet-200 bg-violet-50/60 dark:border-violet-900 dark:bg-violet-950/20")} aria-label={t("Fine giornata")}>
      <h2 className={cn(TITOLO_RIQUADRO, "flex items-center gap-2")}>
        <MoonStar className="size-4 text-violet-700" aria-hidden="true" />
        {daFare === 0 ? t("Giornata chiusa") : t("Fine giornata: {n} da fare", { n: daFare })}
      </h2>
      <ol className="mt-1 divide-y divide-violet-200/60">
        {passi.map(p => (
          <li key={p.chiave}>
            <Link to={p.link} className="flex min-h-12 items-center gap-3 py-1.5">
              {p.fatto
                ? <CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-label={t("Fatto")} />
                : <Circle className="size-5 shrink-0 text-violet-400" aria-hidden="true" />}
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm font-semibold", p.fatto && "text-muted-foreground line-through")}>{t(p.testo)}</span>
                {p.dettaglio && <span className="block truncate text-xs text-muted-foreground">{t(p.dettaglio)}</span>}
              </span>
              {!p.fatto && <ChevronRight className="size-4 shrink-0 text-violet-600" aria-hidden="true" />}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
