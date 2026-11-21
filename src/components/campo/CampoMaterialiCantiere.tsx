import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useCampoMagazzinoConfig } from "@/hooks/campo/useCampoPrelievo";
import { supabase } from "@/integrations/supabase/client";
import { formattaQuantitaMovimento } from "@/lib/magazzino/quantitaMovimento";
import { queryKeys } from "@/lib/queryKeys";

const PER_PAGINA = 30;

export function CampoMaterialiCantiere({ companyId, orderId }: { companyId: string; orderId: string }) {
  const [aperto, setAperto] = useState(false);
  const config = useCampoMagazzinoConfig();
  const autorizzato = config.userId && config.companyId === companyId &&
    (config.data?.livello === "inventario" || config.data?.livello === "prelievi");
  if (!autorizzato) return null;

  return (
    <details onToggle={event => setAperto(event.currentTarget.open)} className="rounded-2xl border border-border bg-background p-4 shadow-sm">
      <summary className="cursor-pointer text-sm font-semibold text-foreground">Materiali in cantiere</summary>
      {aperto && <RiepilogoMateriali companyId={companyId} orderId={orderId} userId={config.userId} />}
    </details>
  );
}

function RiepilogoMateriali({ companyId, orderId, userId }: { companyId: string; orderId: string; userId: string }) {
  const materiali = useInfiniteQuery({
    queryKey: [...queryKeys.warehouse.campoMateriali(companyId, orderId), userId],
    initialPageParam: 0,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async ({ pageParam, signal }) => {
      const { data, error } = await supabase.rpc("campo_materiali_cantiere", {
        p_azienda: companyId, p_cantiere: orderId, p_offset: pageParam,
      }).abortSignal(signal);
      if (error) throw error;
      return data ?? [];
    },
    getNextPageParam: (ultima, _pagine, offset) => ultima.length > PER_PAGINA ? offset + PER_PAGINA : undefined,
  });

  const righe = materiali.isError ? [] : materiali.data?.pages.flatMap(pagina => pagina.slice(0, PER_PAGINA)) ?? [];
  return (
    <div className="mt-3 space-y-3 text-sm">
      {materiali.isLoading && <p role="status" className="text-muted-foreground">Carico i materiali…</p>}
      {materiali.isError && (
        <div role="alert" className="space-y-2">
          <p>Impossibile aggiornare i materiali.</p>
          <Button variant="outline" size="sm" onClick={() => void materiali.refetch()}>Riprova</Button>
        </div>
      )}
      {materiali.isSuccess && righe.length === 0 && <p className="text-muted-foreground">Nessuna consegna registrata.</p>}
      {righe.length > 0 && (
        <ul className="divide-y">
          {righe.map(riga => {
            const unita = riga.unita_misura ? ` ${riga.unita_misura}` : "";
            return (
              <li key={riga.stock_item_id} className="space-y-1 py-2 first:pt-0">
                <p className="break-words font-medium">{riga.nome}</p>
                <dl className="grid grid-cols-2 gap-2 leading-snug">
                  <div>
                    <dt className="text-xs text-muted-foreground">Consegnato</dt>
                    <dd className="break-words font-semibold tabular-nums">{formattaQuantitaMovimento(Number(riga.consegnato))}{unita}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Residuo</dt>
                    <dd className="break-words font-semibold tabular-nums">
                      {riga.residuo === null ? "Da verificare" : `${formattaQuantitaMovimento(Number(riga.residuo))}${unita}`}
                    </dd>
                  </div>
                </dl>
                {!riga.unita_misura && <p className="text-xs text-muted-foreground">Unità di misura da impostare</p>}
              </li>
            );
          })}
        </ul>
      )}
      {righe.length > 0 && <p className="text-xs text-muted-foreground">Il residuo tiene conto dei resi e dei consumi nei rapportini approvati.</p>}
      {materiali.hasNextPage && !materiali.isError && (
        <Button variant="outline" className="min-h-11 w-full" disabled={materiali.isFetching} onClick={() => void materiali.fetchNextPage()}>
          {materiali.isFetchingNextPage ? "Caricamento…" : "Mostra altri materiali"}
        </Button>
      )}
    </div>
  );
}
