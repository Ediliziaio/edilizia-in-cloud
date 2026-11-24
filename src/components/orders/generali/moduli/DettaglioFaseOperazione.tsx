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
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const RIGHE = 20;
/** Creato a ogni uso: la lingua può cambiare dopo il caricamento del modulo. */
const quantita = { format: (n: number) => new Intl.NumberFormat(intlCampo(), { maximumFractionDigits: 3 }).format(n) };

export default function DettaglioFaseOperazione({ fase, vedeCosti, vedeImporti, apri }: {
  fase: FaseOperazione;
  vedeCosti: boolean;
  vedeImporti: boolean;
  apri: () => void;
}) {
  const t = useT();
  const sottofasi = useSottofasi(fase.order_id);
  const voci = useVociPrevisteFasi(fase.order_id, vedeCosti);
  const [limite, setLimite] = useState(RIGHE);
  const righe = useMemo(() => righeDistinta([fase], sottofasi.perFase,
    vedeCosti ? voci.data?.filter(v => v.phase_id === fase.id) ?? [] : []), [fase, sottofasi.perFase, vedeCosti, voci.data]);
  const carica = sottofasi.isLoading || (vedeCosti && voci.isLoading);
  const errore = sottofasi.isError || (vedeCosti && voci.isError);

  return <div className="space-y-1.5 overflow-hidden rounded-lg border bg-card">
    <div className="flex flex-wrap items-center justify-between gap-1 px-2 pt-1">
      <h4 className="text-xs font-semibold">{vedeCosti ? t("Sottofasi e voci del computo") : t("Sottofasi")}</h4>
      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={apri}>
        {t("Apri scheda della fase")} <ArrowUpRight className="size-3.5" aria-hidden="true" />
      </Button>
    </div>
    {carica && <Skeleton className="m-2 h-16" />}
    {!carica && errore && <p role="status" className="px-2 pb-2 text-xs text-muted-foreground">
      {sottofasi.isError ? t("Caricamento delle sottofasi non riuscito.") : t("Caricamento delle voci di computo non riuscito.")}
    </p>}
    {!carica && righe.length === 0 && !errore && <p className="px-2 pb-2 text-xs text-muted-foreground">
      {vedeCosti ? t("Nessuna sottofase o voce collegata a questa fase.") : t("Nessuna sottofase collegata a questa fase.")}
    </p>}
    {!carica && righe.length > 0 && <>
      <table aria-label={t("Dettaglio {nome}", { nome: fase.name })} className="generale-registro-tabella">
        <thead><tr>
          <th scope="col">{t("Sottofase / Voce")}</th>
          {vedeCosti && <th scope="col" className="text-right">{t("Quantità")}</th>}
          <th scope="col" className="text-right">{t("Avanzamento")}</th>
          <th scope="col">{t("Dal")}</th>
          <th scope="col">{t("Al")}</th>
          {vedeCosti && vedeImporti && <th scope="col" className="text-right">{t("Imponibile")}</th>}
          {vedeCosti && <th scope="col" className="text-right">{t("Costo previsto")}</th>}
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
        onClick={() => setLimite(n => n + RIGHE)}>{t("Mostra altre righe ({n})", { n: righe.length - limite })}</Button>}
    </>}
  </div>;
}
