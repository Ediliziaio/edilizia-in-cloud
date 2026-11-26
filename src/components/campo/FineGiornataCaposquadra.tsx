/**
 * La sera, il caposquadra vede cosa resta da chiudere (24/11/2026, richiesta del founder): rapportino della
 * squadra per ogni cantiere di oggi (dentro ci sono anche ore, mezzi e km), il materiale per domani, l'uscita.
 * Ogni passo si spunta da solo quando è fatto. Se tutto è fatto, la card lo dice e basta.
 */
import { useState } from "react";
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
  // «No, tutto a posto» al materiale: vale per oggi, su questo telefono (piano campo completo 2.8).
  const chiaveMateriale = `fine-giornata-materiale:${user?.id ?? ""}:${giorno}`;
  const [materialeOk, setMaterialeOk] = useState(() => { try { return localStorage.getItem(chiaveMateriale) === "1"; } catch { return false; } });
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
    dentro: dayTime.summary.state !== "out", haTimbratoOggi: dayTime.todayPunches.length > 0, materialeOk,
  });
  const daFare = passi.filter(p => !p.fatto && p.chiave !== "materiale").length;
  const segnaMaterialeOk = () => {
    try { localStorage.setItem(chiaveMateriale, "1"); } catch { /* resta per questa sessione */ }
    setMaterialeOk(true);
  };

  return (
    <section className={RIQUADRO} aria-label={t("Fine giornata")}>
      <h2 className={cn(TITOLO_RIQUADRO, "flex items-center gap-2")}>
        <MoonStar className="size-4 text-primary" aria-hidden="true" />
        {daFare === 0 ? t("Giornata chiusa") : t("Fine giornata: {n} da fare", { n: daFare })}
      </h2>
      <ol className="mt-1 divide-y">
        {passi.map(p => (
          <li key={p.chiave} className="flex items-center gap-2">
            <Link to={p.link} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 py-1.5">
              {p.fatto
                ? <CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-label={t("Fatto")} />
                : <Circle className="size-5 shrink-0 text-muted-foreground/60" aria-hidden="true" />}
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm font-semibold", p.fatto && "text-muted-foreground line-through")}>{t(p.testo)}</span>
                {p.dettaglio && <span className="block truncate text-xs text-muted-foreground">{t(p.dettaglio)}</span>}
              </span>
              {!p.fatto && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
            </Link>
            {p.chiave === "materiale" && !p.fatto && (
              <button type="button" onClick={segnaMaterialeOk} className="min-h-11 shrink-0 rounded-full border px-3 text-xs font-semibold">
                {t("No, tutto a posto")}
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
