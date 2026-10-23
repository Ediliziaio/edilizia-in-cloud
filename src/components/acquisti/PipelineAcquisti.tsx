/**
 * La pipeline degli acquisti: cinque colonne, da «Da ordinare» a
 * «Consegnato». Stesso aspetto della pipeline delle commesse (intestazione
 * con la riga colorata, conteggio, importo, «N in ritardo»), senza
 * trascinamento: lo stato di un ordine cambia dal suo dettaglio.
 * Sul telefono le colonne si impilano.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { AlertTriangle, FileQuestion, Link2, ShoppingCart } from "lucide-react";
import { BarraScorrimentoOrizzontale } from "@/components/common/BarraScorrimentoOrizzontale";
import { QuoteChip } from "@/components/marketing/preventivi/ui/builderUI";
import { Skeleton } from "@/components/ui/skeleton";
import { ODA_STATUS_CHIP_VARIANT, ODA_STATUS_LABELS } from "@/lib/odaStatus";
import { RDO_STATUS_LABELS } from "@/lib/rdoStatus";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { CartaAcquisto, ColonnaAcquisti } from "@/lib/acquisti/pipelineAcquisti";
import { DaOrdinareMateriali } from "./DaOrdinareMateriali";

const RDO_CHIP: Record<string, "default" | "blue" | "yellow"> = { bozza: "default", inviata: "blue", in_valutazione: "yellow" };

function Carta({ c, vedeCosti }: { c: CartaAcquisto; vedeCosti: boolean }) {
  const chip = c.tipo === "oda"
    ? { variant: ODA_STATUS_CHIP_VARIANT[c.stato] ?? "default", label: ODA_STATUS_LABELS[c.stato] ?? c.stato }
    : { variant: RDO_CHIP[c.stato] ?? "default", label: RDO_STATUS_LABELS[c.stato] ?? c.stato };
  const Icona = c.tipo === "oda" ? ShoppingCart : FileQuestion;
  return (
    <Link
      to={c.href}
      aria-label={`${c.tipo === "oda" ? "Ordine" : "Richiesta d'offerta"} ${c.numero}`}
      className={cn(
        "block rounded-lg border bg-card px-2.5 py-2 text-xs shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        c.ritardo !== null && "border-orange-300",
      )}
    >
      <div className="flex items-center gap-1.5">
        <Icona className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="font-mono font-semibold">{c.numero}</span>
        <QuoteChip variant={chip.variant} className="!px-1.5 !py-0 text-[10px]">{chip.label}</QuoteChip>
        {vedeCosti && c.importo !== null && c.importo > 0 && (
          <span className="ml-auto shrink-0 font-semibold tabular-nums" title={c.tipo === "rfq" ? "Offerta migliore ricevuta" : "Totale dell'ordine"}>
            {formatCurrency(c.importo)}
          </span>
        )}
      </div>
      <p className="mt-1 truncate text-sm font-medium" title={c.titolo}>{c.titolo}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground">
        {c.commessa ? (
          <span className="inline-flex items-center gap-0.5 text-primary"><Link2 className="h-3 w-3" />{c.commessa}</span>
        ) : (
          <span>Senza commessa</span>
        )}
        {c.data && <span>{c.etichettaData} {format(new Date(c.data), "dd/MM")}</span>}
        {c.ritardo !== null && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-destructive/10 px-1.5 font-semibold text-destructive">
            <AlertTriangle className="h-3 w-3" />{c.ritardo}gg
          </span>
        )}
      </div>
      {c.nota && <p className="mt-0.5 truncate text-muted-foreground">{c.nota}</p>}
    </Link>
  );
}

function Colonna({ col, vedeCosti, puoAgire, caricamento }: { col: ColonnaAcquisti; vedeCosti: boolean; puoAgire: boolean; caricamento: boolean }) {
  const inRitardo = col.carte.filter((c) => c.ritardo !== null).length;
  const larga = col.id === "da_ordinare";
  return (
    <section
      aria-label={`Colonna ${col.titolo}`}
      className={cn("flex w-full shrink-0 flex-col md:w-[264px]", larga && "md:w-[340px]")}
    >
      <div className="shrink-0 rounded-t-lg border-b bg-muted/60 px-3 py-2" style={{ borderTopWidth: 3, borderTopColor: col.colore }}>
        <div className="flex items-center justify-between gap-1">
          <h3 className="min-w-0 truncate text-sm font-bold">{col.titolo}</h3>
          <span
            className="rounded-full px-2 py-0.5 text-xs font-bold tabular-nums text-white shadow-sm"
            style={{ backgroundColor: col.colore }}
            data-testid={`conteggio-${col.id}`}
          >
            {col.conteggio}
          </span>
        </div>
        <p className="mt-0.5 h-4 truncate text-[11px] leading-4 text-muted-foreground">
          {vedeCosti && col.importo > 0 ? `${formatCurrency(col.importo)} · ` : ""}{col.descrizione}
        </p>
        <div className="mt-1 flex h-5 items-center">
          {inRitardo > 0 && (
            <span className="rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-orange-700 ring-1 ring-orange-200">
              {inRitardo} in ritardo
            </span>
          )}
        </div>
      </div>
      <div className="min-w-0 flex-1 rounded-b-lg bg-muted/10 p-2 md:max-h-[calc(100vh-330px)] md:overflow-y-auto">
        {caricamento ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {larga && <DaOrdinareMateriali materiali={col.materiali} puoAgire={puoAgire} vedeCosti={vedeCosti} />}
            {col.carte.map((c) => <Carta key={`${c.tipo}-${c.id}`} c={c} vedeCosti={vedeCosti} />)}
            {!larga && col.carte.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground/60">—</p>
            )}
            {col.nascoste > 0 && (
              <p className="py-1 text-center text-[11px] text-muted-foreground">
                Altri {col.nascoste} più vecchi nell'elenco.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export function PipelineAcquisti({
  colonne,
  vedeCosti,
  puoAgire,
  caricamento,
}: {
  colonne: ColonnaAcquisti[];
  vedeCosti: boolean;
  puoAgire: boolean;
  caricamento: boolean;
}) {
  const [scorrimento, setScorrimento] = useState<HTMLDivElement | null>(null);
  return (
    <div>
      <div ref={setScorrimento} className="pb-1 md:overflow-x-auto md:[scrollbar-width:none] md:[&::-webkit-scrollbar]:hidden">
        <div className="flex flex-col gap-3 md:w-max md:flex-row md:items-start">
          {colonne.map((col) => (
            <Colonna key={col.id} col={col} vedeCosti={vedeCosti} puoAgire={puoAgire} caricamento={caricamento} />
          ))}
        </div>
      </div>
      <BarraScorrimentoOrizzontale contenitore={scorrimento} className="max-md:hidden" />
    </div>
  );
}
