import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PropsScheda } from "@/components/orders/generali/tipiScheda";
import { STILE_STATO } from "@/components/orders/generali/unita/aspetto";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUnitaGenerale } from "@/hooks/useGeneraleUnita";
import { NOMI_STATO, STATI_VENDITA, type StatoVendita } from "@/lib/orders/generali/unita";
import { riepilogoVendite } from "@/lib/orders/generali/unitaConti";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function RiquadroUnita({ riepilogo }: PropsScheda) {
  const t = useT();
  const [parametri] = useSearchParams();
  const telefono = useIsMobile();
  const { data } = useUnitaGenerale(riepilogo.generale.id);
  const vendite = data ? riepilogoVendite(data) : null;
  const quante = vendite?.unita ?? riepilogo.figlie.filter(f => !f.divisa).length;
  if (!quante) return null;

  const destinazione = (stato?: StatoVendita) => {
    const p = new URLSearchParams(parametri);
    p.set("scheda", "unita");
    if (telefono) p.delete("vista-unita");
    else p.set("vista-unita", "tabella");
    if (stato) p.set("stato-vendita", stato);
    else p.delete("stato-vendita");
    return { search: p.toString() };
  };

  return (
    <section aria-labelledby="riquadro-unita-titolo" className="generale-panel flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 sm:px-4">
      <h2 id="riquadro-unita-titolo" className="flex items-center gap-2 text-sm font-semibold">
        <span className="generale-section-icon"><Building2 aria-hidden="true" /></span>
        {t("Unità e vendite")} <span className="generale-count">{quante}</span>
      </h2>
      {vendite && <ul aria-label={t("Stati di vendita")} className="flex flex-wrap gap-1.5">
        {STATI_VENDITA.filter(s => vendite.conteggi[s] > 0).map(s => (
          <li key={s}>
            <Link to={destinazione(s)} className="inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2 text-xs hover:bg-muted">
              <span className={cn("size-2 rounded-full", STILE_STATO[s].punto)} aria-hidden="true" />
              {t(NOMI_STATO[s].tante)} <strong className="tabular-nums">{vendite.conteggi[s]}</strong>
            </Link>
          </li>
        ))}
      </ul>}
      <Button asChild variant="ghost" size="sm" className="ml-auto">
        <Link to={destinazione()}>{t("Apri le unità")} <ArrowRight className="size-4" aria-hidden="true" /></Link>
      </Button>
    </section>
  );
}
