// src/components/orders/generali/unita/RiquadroUnita.tsx
// Il riquadro in Panoramica: quante unità sono libere, prenotate, a compromesso, rogitate,
// in una ciambella con legenda; sotto, venduto e incassato. Da telefono niente importi.
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpRight, Building2 } from "lucide-react";
import type { PropsScheda } from "@/components/orders/generali/tipiScheda";
import { COLORE_STATO, STILE_STATO, euro } from "@/components/orders/generali/unita/aspetto";
import { Ciambella } from "@/components/orders/generali/design/Ciambella";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUnitaGenerale } from "@/hooks/useGeneraleUnita";
import { NOMI_STATO, STATI_VENDITA } from "@/lib/orders/generali/unita";
import { riepilogoVendite } from "@/lib/orders/generali/unitaConti";
import { cn } from "@/lib/utils";

export function RiquadroUnita({ riepilogo }: PropsScheda) {
  const [parametri, setParametri] = useSearchParams();
  const telefono = useIsMobile();
  const { data: e } = useUnitaGenerale(riepilogo.generale.id);
  if (!e) return null;
  const r = riepilogoVendite(e);
  // Senza unità il prossimo passo lo dice già «Cosa richiede attenzione».
  if (r.unita === 0) return null;
  const destinazione = (stato: string) => { const p = new URLSearchParams(parametri); p.set("scheda", "unita"); p.set("stato-vendita", stato); return { search: `?${p.toString()}` }; };
  return (
    <section aria-labelledby="riquadro-unita-titolo" className="generale-panel generale-sales">
      <header className="generale-panel-heading">
        <div className="generale-panel-title"><span className="generale-section-icon"><Building2 aria-hidden="true" /></span><div><h2 id="riquadro-unita-titolo">Vendite · {r.unita} unità</h2><p>Disponibilità e stato commerciale</p></div></div>
        <Link to={{ search: "?scheda=unita" }} className="generale-text-link">
          Tabellone <ArrowUpRight aria-hidden="true" />
        </Link>
      </header>
      <div className="generale-chart-body">
      <Ciambella dati={STATI_VENDITA.map(s => ({ id: s, nome: NOMI_STATO[s].tante, valore: r.conteggi[s], colore: COLORE_STATO[s] }))} valore={String(r.unita)} etichetta="unità totali" onSeleziona={s => setParametri(new URLSearchParams(destinazione(s).search))} />
      <ul className="generale-chart-legend" aria-label="Distribuzione degli stati di vendita">
        {STATI_VENDITA.map((s) => (
          <li key={s} className="generale-legend-row">
            <span className="generale-legend-name"><span className={cn("generale-legend-dot", STILE_STATO[s].punto)} aria-hidden="true" /><Link className="generale-legend-link" to={destinazione(s)} aria-label={`Filtra unità: ${NOMI_STATO[s].tante}`}>{NOMI_STATO[s].tante}</Link></span>
            <span className="generale-legend-value"><strong>{r.conteggi[s]}</strong><span>{Math.round(r.conteggi[s] / r.unita * 100)}%</span></span>
          </li>
        ))}
      </ul>
      </div>
      {!telefono && e.permessi.importi && (
        <dl className="generale-sales-totals">
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
