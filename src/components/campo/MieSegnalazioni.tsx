/**
 * Le mie segnalazioni (24/11/2026): problemi e materiale mancante mandati dal cantiere, con lo stato in
 * parole semplici. L'operaio non legge i ticket: `campo_mie_segnalazioni()` dà solo le sue, ultime 45 giorni.
 */
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, Clock, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { CHIP, RIQUADRO, TITOLO_RIQUADRO } from "@/lib/campo/stileCampo";
import { statoSegnalazione } from "@/lib/campo/segnalazione";
import { dateFnsCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

interface MiaSegnalazione {
  id: string; titolo: string | null; status: string | null; category: string | null;
  merce_stato: string | null; serve_entro: string | null; order_code: string | null; created_at: string;
}

export function MieSegnalazioni() {
  const t = useT();
  const { data = [] } = useQuery({
    queryKey: ["campo-mie-segnalazioni"],
    staleTime: 60_000,
    queryFn: async (): Promise<MiaSegnalazione[]> => {
      const { data: righe, error } = await supabase.rpc("campo_mie_segnalazioni");
      if (error) throw error;
      return (Array.isArray(righe) ? righe : []) as unknown as MiaSegnalazione[];
    },
  });
  if (data.length === 0) return null;
  return (
    <section className={RIQUADRO} aria-label={t("Le mie segnalazioni")}>
      <h2 className={TITOLO_RIQUADRO}>{t("Le mie segnalazioni")}</h2>
      <ul className="mt-1 divide-y">
        {data.slice(0, 8).map(s => {
          const stato = statoSegnalazione(s);
          const Icona = s.category === "materiale_mancante" ? Package : stato.fatto ? CheckCircle2 : Clock;
          return (
            <li key={s.id} className="flex items-start gap-3 py-2.5">
              <Icona className={cn("mt-0.5 size-5 shrink-0", stato.fatto ? "text-emerald-600" : "text-muted-foreground")} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-semibold" dir="auto">{s.titolo}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(s.created_at), "d MMM", { locale: dateFnsCampo() })}
                  {s.order_code ? ` · ${s.order_code}` : ""}
                  {s.serve_entro ? ` · ${t("serve entro {data}", { data: format(new Date(`${s.serve_entro}T12:00:00`), "d MMM", { locale: dateFnsCampo() }) })}` : ""}
                </p>
              </div>
              <span className={cn(CHIP, stato.fatto ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800")}>{t(stato.testo)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
