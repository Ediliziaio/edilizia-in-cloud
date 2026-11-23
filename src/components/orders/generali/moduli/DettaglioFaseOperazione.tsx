import { useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { FaseOperazione } from "@/hooks/useMovimentiOperazione";
import { useSottofasi } from "@/hooks/useSottofasi";
import { useVociPrevisteFasi } from "@/hooks/useVociPrevisteFasi";
import { formatCurrency } from "@/lib/formatters";
import { righeDistinta } from "@/lib/orders/distintaLavorazioni";
import { dataBreve } from "../piano/formato";

const RIGHE = 20;
const quantita = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 3 });

export default function DettaglioFaseOperazione({ fase, vedeCosti, vedeImporti, apri }: {
  fase: FaseOperazione;
  vedeCosti: boolean;
  vedeImporti: boolean;
  apri: () => void;
}) {
  const sottofasi = useSottofasi(fase.order_id);
  const voci = useVociPrevisteFasi(fase.order_id, vedeCosti);
  const [limite, setLimite] = useState(RIGHE);
  const righe = useMemo(() => righeDistinta([fase], sottofasi.perFase,
    vedeCosti ? voci.data?.filter(v => v.phase_id === fase.id) ?? [] : []), [fase, sottofasi.perFase, vedeCosti, voci.data]);
  const carica = sottofasi.isLoading || (vedeCosti && voci.isLoading);
  const errore = sottofasi.isError || (vedeCosti && voci.isError);

  return <div className="space-y-1.5 overflow-hidden rounded-lg border bg-card">
    <div className="flex flex-wrap items-center justify-between gap-1 px-2 pt-1">
      <h4 className="text-xs font-semibold">{vedeCosti ? "Sottofasi e voci del computo" : "Sottofasi"}</h4>
      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={apri}>
        Apri scheda della fase <ArrowUpRight className="size-3.5" aria-hidden="true" />
      </Button>
    </div>
    {carica && <Skeleton className="m-2 h-16" />}
    {!carica && errore && <p role="status" className="px-2 pb-2 text-xs text-muted-foreground">
      {sottofasi.isError ? "Caricamento delle sottofasi non riuscito." : "Caricamento delle voci di computo non riuscito."}
    </p>}
    {!carica && righe.length === 0 && !errore && <p className="px-2 pb-2 text-xs text-muted-foreground">
      {vedeCosti ? "Nessuna sottofase o voce collegata a questa fase." : "Nessuna sottofase collegata a questa fase."}
    </p>}
    {!carica && righe.length > 0 && <>
      <table aria-label={`Dettaglio ${fase.name}`} className="generale-registro-tabella">
        <thead><tr>
          <th scope="col">Sottofase / Voce</th>
          {vedeCosti && <th scope="col" className="text-right">Quantità</th>}
          <th scope="col" className="text-right">Avanzamento</th>
          <th scope="col">Dal</th>
          <th scope="col">Al</th>
          {vedeCosti && vedeImporti && <th scope="col" className="text-right">Imponibile</th>}
          {vedeCosti && <th scope="col" className="text-right">Costo previsto</th>}
        </tr></thead>
        <tbody>{righe.slice(0, limite).map(riga => <tr key={riga.key}>
          <td>
            <div className="generale-registro-testo" title={riga.descrizione}>
              {riga.codice && <span className="mr-2 font-mono text-[11px] text-muted-foreground">{riga.codice}</span>}
              {riga.descrizione}
            </div>
          </td>
          {vedeCosti && <td className="text-right tabular-nums">{riga.quantita === null ? "—" : [quantita.format(riga.quantita), riga.unita].filter(Boolean).join(" ")}</td>}
          <td className="text-right tabular-nums">{riga.sottofaseId ? `${riga.percentuale}%` : "—"}</td>
          <td>{dataBreve(riga.inizio)}</td><td>{dataBreve(riga.fine)}</td>
          {vedeCosti && vedeImporti && <td className="text-right tabular-nums">{riga.venduto === null ? "—" : formatCurrency(riga.venduto)}</td>}
          {vedeCosti && <td className="text-right tabular-nums">{riga.previsto === null ? "—" : formatCurrency(riga.previsto)}</td>}
        </tr>)}</tbody>
      </table>
      {righe.length > limite && <Button type="button" size="sm" variant="ghost" className="m-1.5 h-7 text-xs"
        onClick={() => setLimite(n => n + RIGHE)}>Mostra altre righe ({righe.length - limite})</Button>}
    </>}
  </div>;
}
