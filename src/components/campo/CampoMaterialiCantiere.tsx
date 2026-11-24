import { useEffect, useId, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronDown, Package, PackagePlus } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useCampoMagazzinoConfig } from "@/hooks/campo/useCampoPrelievo";
import { supabase } from "@/integrations/supabase/client";
import { formattaQuantitaMovimento } from "@/lib/magazzino/quantitaMovimento";
import { queryKeys } from "@/lib/queryKeys";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const PER_PAGINA = 30;

export function CampoMaterialiCantiere({ companyId, orderId, chiuso = false, apri = false }: {
  companyId: string;
  orderId: string;
  chiuso?: boolean;
  apri?: boolean;
}) {
  const t = useT();
  const [aperto, setAperto] = useState(apri);
  const config = useCampoMagazzinoConfig();
  const idPannello = useId();
  const riquadro = useRef<HTMLElement>(null);
  const autorizzato = !config.isError && !!config.userId && config.companyId === companyId &&
    (config.data?.livello === "inventario" || config.data?.livello === "prelievi");
  useEffect(() => {
    if (apri && autorizzato) riquadro.current?.scrollIntoView?.({ block: "center" });
  }, [apri, autorizzato, orderId]);
  if (!autorizzato) return null;

  return (
    <section ref={riquadro} aria-label={t("Materiali in cantiere")} className="rounded-2xl border bg-background p-3 shadow-sm">
      <Button type="button" variant="ghost" aria-expanded={aperto} aria-controls={idPannello}
        onClick={() => setAperto(valore => !valore)}
        className="min-h-11 w-full justify-start gap-2 px-2 text-left font-semibold">
        <Package aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
        <span className="flex-1">{t("Materiali in cantiere")}</span>
        <ChevronDown aria-hidden="true" className={aperto ? "h-4 w-4 rotate-180" : "h-4 w-4"} />
      </Button>
      {config.data?.livello === "prelievi" && !chiuso && (
        <Button asChild variant="outline" className="mt-2 min-h-11 w-full gap-2 text-primary">
          <Link to={`/campo/magazzino?order_id=${encodeURIComponent(orderId)}`}>
            <PackagePlus aria-hidden="true" className="h-4 w-4" /> {t("Preleva materiale")}
          </Link>
        </Button>
      )}
      <div id={idPannello} hidden={!aperto}>
        {aperto && <RiepilogoMateriali companyId={companyId} orderId={orderId} userId={config.userId} />}
      </div>
    </section>
  );
}

export function RiepilogoMateriali({ companyId, orderId, userId }: { companyId: string; orderId: string; userId: string }) {
  const t = useT();
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
      {materiali.isLoading && <p role="status" className="text-muted-foreground">{t("Carico i materiali…")}</p>}
      {materiali.isError && (
        <div role="alert" className="space-y-2">
          <p>{t("Impossibile aggiornare i materiali.")}</p>
          <Button variant="outline" size="sm" onClick={() => void materiali.refetch()}>{t("Riprova")}</Button>
        </div>
      )}
      {materiali.isSuccess && righe.length === 0 && <p className="text-muted-foreground">{t("Nessuna consegna registrata.")}</p>}
      {righe.length > 0 && (
        // Una riga per materiale (24/11): nome a sinistra, arrivati e rimasti a destra. Prima due riquadri grandi a testa.
        <div>
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 border-b pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>{t("Materiale")}</span><span className="text-right">{t("Arrivati")}</span><span className="text-right">{t("Rimasti")}</span>
          </div>
          <ul className="divide-y">
            {righe.map(riga => {
              const unita = riga.unita_misura ? ` ${riga.unita_misura}` : "";
              return (
                <li key={riga.stock_item_id} className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-3 py-2">
                  <span className="min-w-0 break-words font-medium">
                    {riga.nome}
                    {!riga.unita_misura && <span className="block text-xs font-normal text-muted-foreground">{t("Unità di misura da impostare")}</span>}
                  </span>
                  <span aria-label={t("Arrivati")} className="text-right tabular-nums text-muted-foreground">{formattaQuantitaMovimento(Number(riga.consegnato))}{unita}</span>
                  <span aria-label={t("Rimasti")} className="text-right font-bold tabular-nums">
                    {riga.residuo === null ? t("Da verificare") : `${formattaQuantitaMovimento(Number(riga.residuo))}${unita}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {righe.length > 0 && <p className="text-xs text-muted-foreground">{t("Il residuo tiene conto dei resi e dei consumi nei rapportini approvati.")}</p>}
      {materiali.hasNextPage && !materiali.isError && (
        <Button variant="outline" className="min-h-11 w-full" disabled={materiali.isFetching} onClick={() => void materiali.fetchNextPage()}>
          {materiali.isFetchingNextPage ? t("Caricamento…") : t("Mostra altri materiali")}
        </Button>
      )}
    </div>
  );
}
