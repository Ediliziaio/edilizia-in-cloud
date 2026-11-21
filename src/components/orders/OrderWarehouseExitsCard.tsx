import { useInfiniteQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowUpFromLine, RefreshCw } from "lucide-react";
import { RiquadroCommessa, TabellaCommessa, type ColonnaTabella } from "@/components/orders/TabellaCommessa";
import { Button } from "@/components/ui/button";
import { formattaQuantitaMovimento } from "@/lib/magazzino/quantitaMovimento";
import { leggiMovimentiMagazzino, type CursoreMovimenti, type MovimentoMagazzino } from "@/lib/magazzino/registroMovimenti";
import { queryKeys } from "@/lib/queryKeys";

const PAGE_SIZE = 20;

const colonne: ColonnaTabella<MovimentoMagazzino>[] = [
  { titolo: "Articolo", principale: true, cella: r => <span className="[overflow-wrap:anywhere]">{r.itemName}</span> },
  { titolo: "Quantità", destra: true, cella: r => `${formattaQuantitaMovimento(Number(r.quantity))} ${r.unit ?? "unità non indicata"}` },
  { titolo: "Operatore", cella: r => r.performerName ?? "Nome non disponibile" },
  { titolo: "Data e ora", cella: r => <time className="whitespace-nowrap tabular-nums" dateTime={r.created_at}>{format(new Date(r.created_at), "dd/MM/yy HH:mm")}</time> },
  { titolo: "Note", cella: r => r.notes ? <span className="[overflow-wrap:anywhere]">{r.notes}</span> : null },
];

export function OrderWarehouseExitsCard({ companyId, orderId }: { companyId: string; orderId: string }) {
  const uscite = useInfiniteQuery({
    queryKey: [...queryKeys.warehouse.movementsRegistry(companyId), "order-exits", orderId],
    initialPageParam: null as CursoreMovimenti | null,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: ({ pageParam, signal }) => leggiMovimentiMagazzino(companyId, {
      orderId,
      page: { after: pageParam, size: PAGE_SIZE + 1 },
    }, signal),
    getNextPageParam: last => {
      if (last.length <= PAGE_SIZE) return undefined;
      const { id, created_at } = last[PAGE_SIZE - 1];
      return { id, created_at };
    },
  });
  const righe = uscite.data?.pages.flatMap(pagina => pagina.slice(0, PAGE_SIZE)) ?? [];

  return (
    <RiquadroCommessa
      titolo="Prelievi e scarichi"
      icona={<ArrowUpFromLine aria-hidden className="h-4 w-4 text-primary" />}
      azioni={(
        <Button variant="ghost" size="sm" disabled={uscite.isFetching} onClick={() => void uscite.refetch()}>
          <RefreshCw aria-hidden className="mr-1.5 h-3.5 w-3.5" />
          Aggiorna uscite
        </Button>
      )}
    >
      {uscite.isLoading && <p role="status" className="text-sm text-muted-foreground">Caricamento uscite…</p>}
      {uscite.isError && <p role="alert" className="text-sm text-destructive">Impossibile caricare tutte le uscite. Riprova con Aggiorna uscite.</p>}
      {!uscite.isLoading && !uscite.isError && righe.length === 0 && (
        <p className="text-sm text-muted-foreground">Nessuna uscita registrata per questo cantiere.</p>
      )}
      {righe.length > 0 && <TabellaCommessa etichetta="Prelievi e scarichi" colonne={colonne} righe={righe} chiave={r => r.id} />}
      {uscite.hasNextPage && (
        <Button className="mt-3" variant="outline" size="sm" disabled={uscite.isFetching} onClick={() => void uscite.fetchNextPage()}>
          {uscite.isFetchingNextPage ? "Caricamento…" : "Mostra altre uscite"}
        </Button>
      )}
    </RiquadroCommessa>
  );
}
