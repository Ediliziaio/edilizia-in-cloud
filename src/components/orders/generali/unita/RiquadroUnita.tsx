// src/components/orders/generali/unita/RiquadroUnita.tsx
// Il riquadro in Panoramica: quante unità sono libere, prenotate, a compromesso, rogitate,
// in una barra sola; sotto, venduto e incassato. Da telefono solo la barra.
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { PropsScheda } from "@/components/orders/generali/tipiScheda";
import { STILE_STATO, euro } from "@/components/orders/generali/unita/aspetto";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUnitaGenerale } from "@/hooks/useGeneraleUnita";
import { NOMI_STATO, STATI_VENDITA } from "@/lib/orders/generali/unita";
import { riepilogoVendite } from "@/lib/orders/generali/unitaConti";
import { cn } from "@/lib/utils";

export function RiquadroUnita({ riepilogo }: PropsScheda) {
  const telefono = useIsMobile();
  const { data: e } = useUnitaGenerale(riepilogo.generale.id);
  if (!e) return null;
  const r = riepilogoVendite(e);
  // Senza unità il prossimo passo lo dice già «Cosa richiede attenzione».
  if (r.unita === 0) return null;
  return (
    <section aria-labelledby="riquadro-unita-titolo" className="rounded-lg border bg-card px-3 py-2.5 sm:px-4 sm:py-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="riquadro-unita-titolo" className="text-sm font-semibold">Vendite · {r.unita} unità</h2>
        <Link to={{ search: "?scheda=unita" }} className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
          Tabellone <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        {STATI_VENDITA.map((s) => r.conteggi[s] > 0 && (
          <div key={s} className={STILE_STATO[s].punto} style={{ width: `${(r.conteggi[s] / r.unita) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
        {STATI_VENDITA.map((s) => (
          <li key={s} className="inline-flex items-center gap-1">
            <span className={cn("h-2 w-2 rounded-sm", STILE_STATO[s].punto)} aria-hidden="true" />
            <span className="text-muted-foreground">{NOMI_STATO[s].tante}</span>
            <span className="font-medium tabular-nums">{r.conteggi[s]}</span>
          </li>
        ))}
      </ul>
      {!telefono && e.permessi.importi && (
        <dl className="mt-2 grid grid-cols-3 gap-2 border-t pt-2 text-xs">
          <div>
            <dt className="text-muted-foreground">Venduto</dt>
            <dd className="text-sm font-semibold tabular-nums">{euro(r.venduto)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Incassato</dt>
            <dd className="text-sm font-semibold tabular-nums">{euro(r.incassato)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{(r.permute ?? 0) > 0 ? `Da incassare (permute ${euro(r.permute)})` : "Da incassare"}</dt>
            <dd className="text-sm font-semibold tabular-nums">{euro(r.daIncassare)}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
