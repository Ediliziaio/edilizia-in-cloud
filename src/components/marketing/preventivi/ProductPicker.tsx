import { useMemo, useState } from "react";
import { haManodoperaConfigurata } from "@/lib/preventivi/avvisiInserimento";
import {
  descrizioneCommerciale,
  prodottoSemplice,
} from "@/lib/preventivi/configurazioneSemplice";
import { MiniaturaDisegnoFamiglia } from "@/components/serramenti/AnteprimaDisegnoFamiglia";
import { haDisegno } from "@/lib/serramenti/disegnoDaFamiglia";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Package,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCatalogItems } from "@/hooks/useCatalogItems";
import { useCatalogCategories } from "@/hooks/useCatalogCategories";
import { useCatalogAree } from '@/hooks/useCatalogAree';
import { useIsMobile } from "@/hooks/use-mobile";
import type { CatalogCategory, CatalogItem } from "@/types/catalogItem";
import { LinkImpostazione } from "@/components/impostazioni/LinkImpostazione";
import {
  corrispondeProdottoCatalogo,
  dettagliProdottoCatalogo,
  prezzoProdottoCatalogo,
  categoriaProdottoCatalogo,
} from "@/lib/preventivi/catalogoPreventivo";

interface Props {
  category?: CatalogCategory | null;
  onBack?: () => void;
  onSelectItem: (item: CatalogItem, contesto?: string) => void;
  attivo?: boolean;
  prodotti?: CatalogItem[];
  ambito?: string;
  nomeArea?: string;
  selectedIds?: Set<string>;
  onToggleItem?: (item: CatalogItem) => void;
}
const DIMENSIONE_PAGINA = 30;
const CATEGORIE_VUOTE: CatalogCategory[] = [];

export function ProductPicker({
  category,
  onBack,
  onSelectItem,
  attivo = true,
  prodotti,
  ambito = "all",
  nomeArea,
  selectedIds,
  onToggleItem,
}: Props) {
  const [cerca, setCerca] = useState("");
  const [filtroLinea, setFiltroLinea] = useState({ambito, nome:''});
  const linea = filtroLinea.ambito === ambito ? filtroLinea.nome : '';
  const [filtroCategoria, setFiltroCategoria] = useState({ ambito, id: "" });
  const [filtroPagina, setFiltroPagina] = useState({ ambito, numero: 0 });
  const categoria = filtroCategoria.ambito === ambito ? filtroCategoria.id : "";
  const pagina = filtroPagina.ambito === ambito ? filtroPagina.numero : 0;
  const setPagina = (numero: number) => setFiltroPagina({ ambito, numero });
  const categorieQuery = useCatalogCategories();
  const categorie = categorieQuery.data ?? CATEGORIE_VUOTE;
  const macros = useCatalogAree().data ?? [];
  const { items: tutti, isLoading, error, refetch } = useCatalogItems();
  const items = prodotti ?? tutti;
  const isMobile = useIsMobile();
  const categoriaId = category?.id ?? categoria;
  const filtrate = useMemo(
    () =>
      items.filter(
        (i) =>
          (!categoriaId ||
            categoriaProdottoCatalogo(i, categorie, macros).id === categoriaId) &&
          (!linea || dettagliProdottoCatalogo(i,categorie,macros).linea === linea) &&
          corrispondeProdottoCatalogo(i, categorie, cerca, macros),
      ),
    [items, categorie, macros, categoriaId, cerca, linea],
  );
  const paginaCorrente = Math.min(
    pagina,
    Math.max(0, Math.ceil(filtrate.length / DIMENSIONE_PAGINA) - 1),
  );
  const visibili = filtrate.slice(
    paginaCorrente * DIMENSIONE_PAGINA,
    (paginaCorrente + 1) * DIMENSIONE_PAGINA,
  );
  const cambiaCategoria = (id: string) => {
    setFiltroCategoria({ ambito, id });
    setPagina(0);
  };
  const categorieNavigabili = useMemo(() => {
    const gruppi = new Map<
      string,
      { id: string; nome: string; conteggio: number }
    >();
    for (const item of items) {
      const c = categoriaProdottoCatalogo(item, categorie, macros);
      const gruppo = gruppi.get(c.id) ?? { ...c, conteggio: 0 };
      gruppo.conteggio++;
      gruppi.set(c.id, gruppo);
    }
    return [...gruppi.values()].sort((a, b) =>
      a.id === "altri"
        ? 1
        : b.id === "altri"
          ? -1
          : a.nome.localeCompare(b.nome, "it"),
    );
  }, [items, categorie, macros]);
  const linee = [...new Set(items.map(i => dettagliProdottoCatalogo(i,categorie,macros).linea).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'it'));
  const nomeCategoria =
    category?.nome ??
    categorieNavigabili.find((c) => c.id === categoriaId)?.nome ??
    "Tutti i prodotti";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {onBack && (
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 self-start"
          onClick={onBack}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Categorie
        </Button>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-xl border md:grid-cols-[210px_minmax(0,1fr)]">
        {!category && (
          <aside className="hidden min-h-0 overflow-y-auto border-r bg-muted/20 p-3 md:block">
            <p className="mb-3 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Categorie e linee
            </p>
            <nav
              aria-label="Categorie dei prodotti"
              className="divide-y divide-border/60"
            >
              {[
                { id: "", nome: "Tutti i prodotti", conteggio: items.length },
                ...categorieNavigabili,
              ].map((c) => (
                <div key={c.id || "all"} className="py-1 first:pt-0 last:pb-0">
                  <button
                    type="button"
                    aria-pressed={categoriaId === c.id}
                    aria-label={`${c.nome} ${c.conteggio}`}
                    onClick={() => cambiaCategoria(c.id)}
                    className={cn(
                      "flex w-full items-start justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-muted",
                      categoriaId === c.id &&
                        "bg-primary/10 font-semibold text-primary",
                    )}
                  >
                    <span>{c.nome}</span>
                    <span className="shrink-0 text-xs tabular-nums opacity-70">
                      {c.conteggio}
                    </span>
                  </button>
                </div>
              ))}
            </nav>
          </aside>
        )}
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-col",
            category && "md:col-span-2",
          )}
        >
          <div className="shrink-0 space-y-2 border-b bg-background p-3">
            <div className="relative">
              <Search
                className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"
                aria-hidden
              />
              <Input
                aria-label="Cerca nel catalogo prodotti"
                autoFocus={!isMobile && attivo}
                placeholder="Cerca nome, codice, linea o marca…"
                value={cerca}
                onChange={(e) => {
                  setCerca(e.target.value);
                  setPagina(0);
                }}
                className="h-10 pl-9 pr-9"
              />
              {cerca && (
                <button
                  type="button"
                  aria-label="Azzera ricerca prodotti"
                  onClick={() => {
                    setCerca("");
                    setPagina(0);
                  }}
                  className="absolute right-3 top-3 text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {linee.length > 0 && <select aria-label="Filtra per linea" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={linea} onChange={e=>{setFiltroLinea({ambito,nome:e.target.value});cambiaCategoria('');}}>
              <option value="">Tutte le linee</option>
              {linee.map(nome=><option key={nome} value={nome}>{nome}</option>)}
            </select>}
            {!category && (
              <select
                aria-label="Filtra per categoria"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm md:hidden"
                value={categoriaId}
                onChange={(e) => cambiaCategoria(e.target.value)}
              >
                <option value="">Tutti i prodotti</option>
                {categorieNavigabili.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} ({c.conteggio})
                  </option>
                ))}
              </select>
            )}
            {categorieQuery.isError && (
              <p role="alert" className="text-xs text-amber-800">
                Categorie non disponibili: puoi cercare per nome o codice.{" "}
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => void categorieQuery.refetch()}
                >
                  Riprova categorie
                </Button>
              </p>
            )}
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="font-medium">
                {nomeArea ? `${nomeArea} · ` : ""}
                {nomeCategoria}
              </span>
              <span role="status">
                {isLoading
                  ? "Caricamento…"
                  : `${filtrate.length} ${filtrate.length === 1 ? "prodotto" : "prodotti"}`}
              </span>
            </div>
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto p-3"
            aria-label="Prodotti del catalogo"
          >
            {error ? (
              <div role="alert" className="rounded-lg border p-5 text-sm">
                <p>Il catalogo non è disponibile.</p>
                <Button
                  variant="outline"
                  className="mt-3"
                  size="sm"
                  onClick={() => void refetch?.()}
                >
                  Riprova
                </Button>
              </div>
            ) : isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
            ) : !filtrate.length ? (
              <div className="p-8 text-center">
                <Package className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Nessun prodotto corrisponde a categoria e ricerca.
                </p>
                <Button
                  variant="link"
                  onClick={() => {
                    setCerca("");
                    setFiltroLinea({ambito,nome:''});
                    cambiaCategoria("");
                  }}
                >
                  Azzera i filtri
                </Button>
                <LinkImpostazione
                  to="/azienda/impostazioni/listino"
                  className="block text-sm text-primary"
                >
                  Apri il listino prodotti
                </LinkImpostazione>
              </div>
            ) : (
              <div className="space-y-2">
                {onToggleItem && (
                  <div className="flex items-center justify-between gap-2 px-1 py-2 text-xs text-muted-foreground">
                    <span>
                      Spunta più prodotti per modificarli insieme. Le voci con
                      varianti si configurano singolarmente.
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        visibili
                          .filter(prodottoSemplice)
                          .filter(
                            (item) =>
                              !selectedIds?.has(`${item.source}:${item.id}`),
                          )
                          .forEach(onToggleItem)
                      }
                    >
                      Seleziona questa pagina
                    </Button>
                  </div>
                )}
                {visibili.map((item) => {
                  const d = dettagliProdottoCatalogo(item, categorie, macros);
                  return (
                    <div
                      key={`${item.source}-${item.id}`}
                      className="flex items-center gap-2"
                    >
                      {onToggleItem && (
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 accent-orange-500"
                          aria-label={`Seleziona ${item.nome}`}
                          disabled={!prodottoSemplice(item)}
                          checked={
                            selectedIds?.has(`${item.source}:${item.id}`) ??
                            false
                          }
                          onChange={() => onToggleItem(item)}
                        />
                      )}
                      <button
                        type="button"
                        key={`${item.source}-${item.id}`}
                        onClick={() =>
                          onSelectItem(
                            item,
                            [d.categoria, d.linea, d.marca]
                              .filter(Boolean)
                              .join(" · "),
                          )
                        }
                        className="group grid w-full grid-cols-[56px_minmax(0,1fr)] items-center gap-3 rounded-lg border bg-background p-3 text-left transition hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[56px_minmax(0,1fr)_160px_20px]"
                      >
                        <div className="h-14 w-14 overflow-hidden rounded-md bg-muted">
                          {item.source === "family" &&
                          item.family &&
                          haDisegno(item.family) ? (
                            <div className="h-full w-full bg-white p-1">
                              <MiniaturaDisegnoFamiglia
                                family={item.family}
                                className="h-full w-full"
                              />
                            </div>
                          ) : item.immagine_url ? (
                            <img
                              src={item.immagine_url}
                              alt=""
                              className="h-full w-full object-contain"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center">
                              <Package className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold leading-snug">
                            {item.nome}
                          </p>
                          {haManodoperaConfigurata(item) && (
                            <span className="mt-1 inline-block rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                              Manodopera / montaggio previsto
                            </span>
                          )}
                          {[d.categoria, d.linea, d.marca].some(Boolean) && (
                            <p className="mt-1 text-xs font-medium text-primary">
                              {[d.categoria, d.linea, d.marca]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}
                          {d.codice && (
                            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                              {d.codice}
                            </p>
                          )}
                          {descrizioneCommerciale(item.descrizione) &&
                            descrizioneCommerciale(item.descrizione) !==
                              item.nome && (
                              <p
                                className="mt-1 line-clamp-1 text-xs text-muted-foreground"
                                title={descrizioneCommerciale(item.descrizione)}
                              >
                                {descrizioneCommerciale(item.descrizione)}
                              </p>
                            )}
                          <p className="mt-1 text-xs font-medium sm:hidden">
                            {prezzoProdottoCatalogo(item)}
                          </p>
                        </div>
                        <div className="hidden text-right sm:block">
                          <p
                            className={cn(
                              "text-sm font-semibold tabular-nums",
                              !item.prezzo_base_vendita && "text-amber-700",
                            )}
                          >
                            {prezzoProdottoCatalogo(item)}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {prodottoSemplice(item)
                              ? "Quantità e prezzo cliente"
                              : item.source === "family"
                                ? "Configura misure e varianti"
                                : "Imposta la quantità"}
                          </p>
                        </div>
                        <ArrowRight
                          className="hidden h-4 w-4 text-muted-foreground group-hover:text-primary sm:block"
                          aria-hidden
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center justify-between gap-2 border-t bg-background px-4 py-2">
            <span className="text-xs text-muted-foreground">
              {filtrate.length
                ? `${paginaCorrente * DIMENSIONE_PAGINA + 1}–${Math.min((paginaCorrente + 1) * DIMENSIONE_PAGINA, filtrate.length)} di ${filtrate.length}`
                : "0 prodotti"}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                aria-label="Prodotti precedenti"
                disabled={paginaCorrente === 0}
                onClick={() => setPagina(paginaCorrente - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                aria-label="Prodotti successivi"
                disabled={
                  (paginaCorrente + 1) * DIMENSIONE_PAGINA >= filtrate.length
                }
                onClick={() => setPagina(paginaCorrente + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
export default ProductPicker;
