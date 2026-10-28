import { PipelineCardHeading } from "@/components/orders/PipelineDrag";
import { COLONNE } from "@/lib/acquisti/pipelineAcquisti";
import { OperationalColumnFrame } from "@/components/orders/OperationalBoard";
import {
  PipelineDragScope,
  PipelineMoveCard,
  type PipelineTarget,
} from "@/components/orders/PipelineDrag";
/**
 * La pipeline degli acquisti: cinque colonne, da «Da ordinare» a
 * «Consegnato». Stesso aspetto della pipeline delle commesse (intestazione
 * con la riga colorata, conteggio, importo, «N in ritardo»).
 * I passaggi di stato vengono validati dal controller della pagina.
 * Le colonne mantengono lo scorrimento orizzontale anche sul telefono.
 */
import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { AlertTriangle, FileQuestion, Link2, ShoppingCart } from "lucide-react";
import { BarraScorrimentoOrizzontale } from "@/components/common/BarraScorrimentoOrizzontale";
import { QuoteChip } from "@/components/marketing/preventivi/ui/builderUI";
import { Skeleton } from "@/components/ui/skeleton";
import { ODA_STATUS_CHIP_VARIANT, ODA_STATUS_LABELS } from "@/lib/odaStatus";
import { RDO_STATUS_LABELS } from "@/lib/rdoStatus";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type {
  CartaAcquisto,
  ColonnaAcquisti,
} from "@/lib/acquisti/pipelineAcquisti";
import { DaOrdinareMateriali } from "./DaOrdinareMateriali";

const RDO_CHIP: Record<string, "default" | "blue" | "yellow"> = {
  bozza: "default",
  inviata: "blue",
  in_valutazione: "yellow",
};

function Carta({ c, vedeCosti }: { c: CartaAcquisto; vedeCosti: boolean }) {
  const chip =
    c.tipo === "oda"
      ? {
          variant: ODA_STATUS_CHIP_VARIANT[c.stato] ?? "default",
          label: ODA_STATUS_LABELS[c.stato] ?? c.stato,
        }
      : {
          variant: RDO_CHIP[c.stato] ?? "default",
          label: RDO_STATUS_LABELS[c.stato] ?? c.stato,
        };
  const Icona = c.tipo === "oda" ? ShoppingCart : FileQuestion;
  return (
    <article
      aria-label={`${c.tipo === "oda" ? "Ordine" : "Richiesta d'offerta"} ${c.numero}`}
      className={cn(
        "block rounded-lg border border-slate-200 bg-card p-2 text-xs shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        c.ritardo !== null && "border-orange-300",
      )}
    >
      <PipelineCardHeading>
        <Icona className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Link
          to={c.href}
          aria-label={`${c.tipo === "oda" ? "Ordine" : "Richiesta d’offerta"} ${c.numero}`}
          className="min-w-0 flex-1 truncate font-mono font-semibold"
          title={c.numero}
        >
          {c.numero}
        </Link>
        <QuoteChip
          variant={chip.variant}
          className="shrink-0 !px-1.5 !py-0 text-[10px]"
        >
          {chip.label}
        </QuoteChip>
      </PipelineCardHeading>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {c.tipo === "oda" ? "Ordine d’acquisto" : "Richiesta d’offerta"}
      </p>
      <p className="mt-0.5 truncate text-sm font-medium" title={c.titolo}>
        {c.titolo}
      </p>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground">
        {c.commessa ? (
          <span className="inline-flex items-center gap-0.5 text-primary">
            <Link2 className="h-3 w-3" />
            {c.commessa}
          </span>
        ) : (
          <span>Senza commessa</span>
        )}
        {c.data && (
          <span>
            {c.etichettaData} {format(new Date(c.data), "dd/MM")}
          </span>
        )}
        {c.ritardo !== null && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-destructive/10 px-1.5 font-semibold text-destructive">
            <AlertTriangle className="h-3 w-3" />
            Ritardo: {c.ritardo} giorni
          </span>
        )}
      </div>
      {c.ricezione && c.stato !== "bozza" && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {c.ricezione.complete}/{c.ricezione.righe} righe ricevute ·{" "}
          {c.ricezione.righe - c.ricezione.complete} da completare
          {c.ricezione.parziali ? ` (${c.ricezione.parziali} parziali)` : ""}
        </p>
      )}
      <div className="mt-2 flex min-h-9 items-center justify-between gap-2 border-t border-slate-100 pt-2">
        {c.nota && (
          <p className="min-w-0 truncate text-[11px] text-muted-foreground">
            {c.nota}
          </p>
        )}
        {vedeCosti && c.importo !== null && c.importo > 0 && (
          <span
            className="ml-auto shrink-0 font-semibold tabular-nums"
            title={
              c.tipo === "rfq"
                ? "Offerta migliore ricevuta"
                : "Totale dell'ordine"
            }
          >
            {formatCurrency(c.importo)}
          </span>
        )}
      </div>
    </article>
  );
}

function Colonna({
  col,
  vedeCosti,
  puoAgire,
  caricamento,
  targets,
}: {
  targets: PipelineTarget[];
  col: ColonnaAcquisti;
  vedeCosti: boolean;
  puoAgire: boolean;
  caricamento: boolean;
}) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const elenco = new URLSearchParams(params);
  elenco.set("tab", "acquisto");
  elenco.set("vista", "elenco");
  elenco.set("stato", "ricevuti");
  const inRitardo = col.carte.filter((c) => c.ritardo !== null).length;
  const larga = col.id === "da_ordinare";
  return (
    <OperationalColumnFrame
      id={col.id}
      label={col.titolo}
      color={col.colore}
      count={col.conteggio}
      alert={inRitardo ? `${inRitardo} in ritardo` : undefined}
      hint={`${vedeCosti && col.importo > 0 ? `${formatCurrency(col.importo)} · ` : ""}${col.descrizione}`}
    >
      {caricamento ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {larga && (col.materiali.length > 0 || col.carte.length === 0) && (
            <DaOrdinareMateriali
              materiali={col.materiali}
              puoAgire={puoAgire}
              vedeCosti={vedeCosti}
            />
          )}
          {col.carte.map((c) => (
            <PipelineMoveCard
              key={`${c.tipo}-${c.id}`}
              id={`${c.tipo}:${c.id}`}
              label={c.numero}
              onOpen={() => navigate(c.href)}
              stage={col.id}
              targets={targets}
            >
              <Carta c={c} vedeCosti={vedeCosti} />
            </PipelineMoveCard>
          ))}
          {!larga && col.carte.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground/60">
              Nessun acquisto in questa fase
            </p>
          )}
          {col.nascoste > 0 && (
            <Link
              to={`/azienda/ordini?${elenco}`}
              className="block py-2 text-center text-xs font-medium text-primary hover:underline"
            >
              Vedi tutti i {col.conteggio} ordini ricevuti
            </Link>
          )}
        </div>
      )}
    </OperationalColumnFrame>
  );
}

export function PipelineAcquisti({
  colonne,
  vedeCosti,
  puoAgire,
  caricamento,
  onMove,
  saving,
}: {
  colonne: ColonnaAcquisti[];
  onMove?: (id: string, target: string) => void;
  saving?: boolean;
  vedeCosti: boolean;
  puoAgire: boolean;
  caricamento: boolean;
}) {
  const [scorrimento, setScorrimento] = useState<HTMLDivElement | null>(null);
  if (!caricamento && colonne.every((col) => col.conteggio === 0))
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        Nessun elemento per questi filtri. Cambia contenuto o consulta lo
        storico.
      </div>
    );
  return (
    <PipelineDragScope onMove={puoAgire ? onMove : undefined} disabled={saving}>
      <div>
        <BarraScorrimentoOrizzontale
          contenitore={scorrimento}
          className="mb-2"
        />
        <div
          ref={setScorrimento}
          className="overflow-x-auto pb-2 [scrollbar-width:thin]"
        >
          <div className="flex w-max min-w-full items-start gap-2">
            {colonne.map((col) => (
              <Colonna
                targets={COLONNE.map((c) => ({ id: c.id, label: c.titolo }))}
                key={col.id}
                col={col}
                vedeCosti={vedeCosti}
                puoAgire={puoAgire}
                caricamento={caricamento}
              />
            ))}
          </div>
        </div>
      </div>
    </PipelineDragScope>
  );
}
