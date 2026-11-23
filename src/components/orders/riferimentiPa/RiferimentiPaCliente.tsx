/**
 * «Riferimenti appalto» nella scheda cliente (15/11/2026): le righe di order_riferimenti_pa di
 * tutte le commesse del cliente, raggruppate per commessa, col collegamento alla commessa e il
 * pulsante copia sui codici. Le righe sono quelle della Panoramica (RigaRiferimentoPa), qui in
 * versione compatta. Si vede se il cliente è una PA oppure se almeno una commessa ha riferimenti
 * (anche un privato o un'azienda con un CUP). Si modificano dalla commessa.
 */
import { Link } from "react-router-dom";
import { ChevronDown, ExternalLink, Landmark } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  COLONNE_RIFERIMENTO_PA, raggruppaRiferimentiPerCommessa,
  type CommessaDelCliente, type RiferimentoPa,
} from "@/lib/orders/riferimentiPa";
import { RigaRiferimentoPa } from "./RiquadroRiferimentiPa";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export const chiaveRiferimentiPaCliente = (orderIds: string[]) => ["order-riferimenti-pa", "cliente", ...orderIds] as const;

/** Le righe dei riferimenti di più commesse (quelle del cliente). */
export function useRiferimentiPaCliente(orderIds: string[]) {
  return useQuery({
    queryKey: chiaveRiferimentiPaCliente(orderIds),
    enabled: orderIds.length > 0,
    queryFn: async (): Promise<RiferimentoPa[]> => {
      const { data, error } = await supabase
        .from("order_riferimenti_pa")
        .select(COLONNE_RIFERIMENTO_PA)
        .in("order_id", orderIds);
      if (error) throw error;
      return (data ?? []) as unknown as RiferimentoPa[];
    },
  });
}

export interface RiferimentiPaClienteProps {
  commesse: CommessaDelCliente[];
  clientePa: boolean;
  /** id → descrizione degli uffici dell'ente, per scrivere il nome accanto al codice. */
  nomiUffici?: Record<string, string>;
  apertoAllInizio?: boolean;
}

export function RiferimentiPaCliente({ commesse, clientePa, nomiUffici = {}, apertoAllInizio = true }: RiferimentiPaClienteProps) {
  const t = useT();
  const ids = commesse.map((c) => c.id);
  const { data: righe = [], isLoading, isError } = useRiferimentiPaCliente(ids);
  const gruppi = raggruppaRiferimentiPerCommessa(righe, commesse);
  if (!clientePa && gruppi.length === 0) return null;
  const conteggio = gruppi.reduce((n, g) => n + g.righe.length, 0);

  return (
    <Collapsible defaultOpen={apertoAllInizio} data-testid="riferimenti-pa-cliente">
      <CollapsibleTrigger className="flex items-center gap-1 text-xs font-semibold w-full group py-1 hover:bg-muted/50 rounded px-1">
        <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]:-rotate-90" />
        <Landmark className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
        {t("Riferimenti appalto")}
        {conteggio > 0 && <span className="font-normal text-muted-foreground">({conteggio})</span>}
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 px-1 pt-1">
        {isLoading && ids.length > 0 ? (
          <p className="text-[11px] text-muted-foreground">{t("Carico i riferimenti…")}</p>
        ) : isError ? (
          <p className="text-[11px] text-red-700">{t("Non riesco a leggere i riferimenti delle commesse.")}</p>
        ) : gruppi.length === 0 ? (
          <p className="text-[11px] text-amber-800">
            {commesse.length === 0
              ? t("Nessuna commessa: contratto, CIG e CUP si scrivono sulla commessa.")
              : t("Nessuna commessa ha ancora contratto, CIG o CUP: si scrivono nella Panoramica della commessa.")}
          </p>
        ) : (
          gruppi.map(({ commessa, righe: r }) => (
            <section key={commessa.id} className="rounded-lg border bg-muted/20 p-2" aria-label={t("Riferimenti della commessa {codice}", { codice: commessa.order_code ?? "" }).trim()}>
              <Link
                to={`/azienda/ordini/${commessa.id}`}
                className="mb-2 flex min-w-0 items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <span className="shrink-0">{commessa.order_code || t("Commessa")}</span>
                {commessa.description && <span className="truncate font-normal text-muted-foreground" dir="auto">· {commessa.description}</span>}
                <ExternalLink className="ml-auto h-3 w-3 shrink-0" aria-hidden="true" />
              </Link>
              <ol className="divide-y">
                {r.map((riga) => (
                  <RigaRiferimentoPa key={riga.id} r={riga} compatta nomeUfficio={riga.ufficio_id ? nomiUffici[riga.ufficio_id] : null} />
                ))}
              </ol>
            </section>
          ))
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
