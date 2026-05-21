/**
 * ManualArticleAdder — picker articoli "senza scansione" per ScaricoCantiereSheet.
 *
 * Permette di cercare articoli del magazzino sorgente per nome/codice,
 * impostare la quantità e aggiungerli alla lista entries. Alternativa al
 * BatchBarcodeScanner per chi non ha barcode o vuole essere veloce.
 *
 * UX:
 *   - Combobox con search server-side debounced (warehouse_stock by name/code)
 *   - Mostra giacenza disponibile per articolo
 *   - Input quantità + pulsante "Aggiungi"
 *   - Lista entries con possibilità di rimuovere/modificare quantità
 */
import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, X, Loader2, PackageCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import type { BatchScanEntry } from "./BatchBarcodeScanner";

interface StockItem {
  id: string;
  name: string;
  internal_code: string | null;
  quantity: number;
  tracking_mode: "fungible" | "serialized";
  /** v8.6.112 — Origine dell'item: 'warehouse' (gia a magazzino) o 'listino'
   *  (nel catalogo prodotti article_families ma non ancora a stock). Quando
   *  'listino', il click creera lo stock_item al volo. */
  source?: "warehouse" | "listino";
  /** Solo per source='listino': il family_id originale per tracking */
  family_id?: string;
  /** Solo per source='listino': prezzo base acquisto suggerito */
  suggested_unit_cost?: number;
  /** Solo per source='listino': vat_rate suggerita */
  suggested_vat?: number;
}

interface Props {
  companyId: string | undefined;
  warehouseId: string | undefined;
  entries: BatchScanEntry[];
  onEntriesChange: (next: BatchScanEntry[]) => void;
}

export function ManualArticleAdder({ companyId, warehouseId, entries, onEntriesChange }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [pendingItem, setPendingItem] = useState<StockItem | null>(null);
  const [pendingQty, setPendingQty] = useState("1");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 200);
    return () => clearTimeout(t);
  }, [search]);

  // v8.6.112 — Query DUAL: warehouse_stock + article_families (listino prodotti).
  // L'utente puo selezionare articoli sia gia a magazzino, sia presenti nel
  // listino prodotti ma mai ricevuti. Al pick di un listino item, lo
  // stock_item viene creato al volo con i dati pre-popolati.
  const { data: items = [], isLoading } = useQuery<StockItem[]>({
    queryKey: ["manual-adder-stock-listino", companyId, warehouseId, debouncedSearch],
    enabled: !!companyId && !!warehouseId && pickerOpen,
    staleTime: 30_000,
    queryFn: async () => {
      const filter = debouncedSearch ? `%${debouncedSearch}%` : null;

      // ── Query 1: warehouse_stock (articoli a magazzino) ─────────────────
      let wsQ = supabase
        .from("warehouse_stock")
        .select("id, name, internal_code, quantity, tracking_mode")
        .eq("company_id", companyId!)
        .eq("warehouse_id", warehouseId!);
      if (filter) {
        wsQ = wsQ.or(`name.ilike.${filter},internal_code.ilike.${filter}`);
      }
      wsQ = wsQ.order("quantity", { ascending: false }).order("name", { ascending: true }).limit(150);

      // ── Query 2: article_families (listino prodotti) ────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let afQ = (supabase as any)
        .from("article_families")
        .select("id, nome, descrizione, prezzo_base_acquisto, vat_rate")
        .eq("company_id", companyId!)
        .eq("attivo", true);
      if (filter) {
        afQ = afQ.ilike("nome", filter);
      }
      afQ = afQ.order("nome", { ascending: true }).limit(50);

      const [wsRes, afRes] = await Promise.all([wsQ, afQ]);
      if (wsRes.error) throw wsRes.error;

      const warehouseItems: StockItem[] = (wsRes.data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        internal_code: r.internal_code,
        quantity: r.quantity,
        tracking_mode: r.tracking_mode as "fungible" | "serialized",
        source: "warehouse" as const,
      }));

      // Skip listino se la query fallisce (es. tabella non esiste in qualche
      // company) -> mostriamo solo warehouse, no errore bloccante.
      if (afRes.error) {
        console.warn("[ManualArticleAdder] article_families query failed:", afRes.error);
        return warehouseItems;
      }

      // Dedup: se un nome (lowercase) e gia in warehouse, SKIP il duplicato
      // listino (l'utente vuole l'item gia a magazzino).
      const warehouseNamesLower = new Set(
        warehouseItems.map((i) => i.name.toLowerCase().trim()),
      );

      const listinoItems: StockItem[] = (afRes.data as Array<{
        id: string; nome: string; descrizione: string | null;
        prezzo_base_acquisto: number | null; vat_rate: number | null;
      }>)
        .filter((r) => !warehouseNamesLower.has(r.nome.toLowerCase().trim()))
        .map((r) => ({
          id: `listino:${r.id}`, // prefix per distinguere al pick
          name: r.nome,
          internal_code: null,
          quantity: 0,
          tracking_mode: "fungible" as const,
          source: "listino" as const,
          family_id: r.id,
          suggested_unit_cost: r.prezzo_base_acquisto ?? undefined,
          suggested_vat: r.vat_rate ?? undefined,
        }));

      return [...warehouseItems, ...listinoItems];
    },
  });

  const handlePickItem = useCallback((item: StockItem) => {
    setPendingItem(item);
    setPendingQty("1");
    setPickerOpen(false);
  }, []);

  const handleAddEntry = useCallback(async () => {
    if (!pendingItem) return;
    const qty = parseFloat(pendingQty) || 0;
    if (qty <= 0) return;

    // v8.6.112 — Se l'item viene dal listino (no warehouse_stock yet),
    // crea lo stock_item al volo con i dati del listino.
    let realStockItemId = pendingItem.id;
    let realQuantityAvailable = pendingItem.quantity;
    if (pendingItem.source === "listino" && pendingItem.family_id && companyId && warehouseId) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: inserted, error } = await (supabase as any)
          .from("warehouse_stock")
          .insert({
            company_id: companyId,
            warehouse_id: warehouseId,
            name: pendingItem.name,
            quantity: 0,
            unit_cost: pendingItem.suggested_unit_cost ?? 0,
            vat_rate: pendingItem.suggested_vat ?? 22,
            tracking_mode: "fungible",
            min_stock_level: 0,
          })
          .select("id")
          .single();
        if (error) throw error;
        realStockItemId = inserted.id;
        realQuantityAvailable = qty; // appena creato, accetta qualsiasi qty
      } catch (err) {
        console.error("[ManualArticleAdder] listino->warehouse create failed:", err);
        return; // skip silenzioso
      }
    }

    const safeQty = pendingItem.source === "listino" ? qty : Math.min(qty, realQuantityAvailable);

    // Se l'articolo è già in lista, somma le quantità
    const existing = entries.find((e) => e.stockItemId === realStockItemId);
    if (existing) {
      onEntriesChange(
        entries.map((e) =>
          e.stockItemId === realStockItemId ? { ...e, quantity: e.quantity + safeQty } : e,
        ),
      );
    } else {
      onEntriesChange([
        ...entries,
        {
          id: crypto.randomUUID(),
          stockItemId: realStockItemId,
          itemName: pendingItem.name,
          quantity: safeQty,
          serialNumbers: [],
          rawCode: pendingItem.internal_code ?? "",
          trackingMode: pendingItem.tracking_mode,
          resolutionStatus: "matched",
        } as BatchScanEntry,
      ]);
    }

    setPendingItem(null);
    setPendingQty("1");
    setSearch("");
  }, [pendingItem, pendingQty, entries, onEntriesChange, companyId, warehouseId]);

  const handleRemoveEntry = useCallback(
    (entryId: string) => {
      onEntriesChange(entries.filter((e) => e.id !== entryId));
    },
    [entries, onEntriesChange],
  );

  const handleUpdateQty = useCallback(
    (entryId: string, newQty: number) => {
      onEntriesChange(
        entries.map((e) => (e.id === entryId ? { ...e, quantity: Math.max(0, newQty) } : e)),
      );
    },
    [entries, onEntriesChange],
  );

  const totalArticoli = useMemo(
    () => entries.reduce((sum, e) => sum + (e.quantity || 0), 0),
    [entries],
  );

  if (!warehouseId) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-center text-xs text-muted-foreground">
        Seleziona prima un magazzino sorgente per aggiungere articoli a mano.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* v8.6.105 — Layout mobile-first: su mobile picker articolo full-width,
          quantità + bottone su seconda riga. Su desktop torna 3-col compatto. */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_5rem_auto] gap-2 items-end">
        <div className="space-y-1 md:col-span-1">
          <Label className="text-xs">Articolo</Label>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <div className="relative">
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-start text-left font-normal h-9 truncate pr-9"
                >
                  {pendingItem ? (
                    <span className="truncate">{pendingItem.name}</span>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5 mr-2 opacity-50 shrink-0" />
                      <span className="text-muted-foreground truncate">
                        Seleziona articolo dal magazzino…
                      </span>
                    </>
                  )}
                </Button>
              </PopoverTrigger>
              {pendingItem && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingItem(null);
                    setPendingQty("1");
                    setSearch("");
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
                  aria-label="Cancella selezione"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              )}
            </div>
            <PopoverContent
              className="w-[var(--radix-popover-trigger-width)] p-0"
              align="start"
              side="bottom"
              sideOffset={4}
              avoidCollisions={false}
            >
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Filtra per nome o codice…"
                  value={search}
                  onValueChange={setSearch}
                />
                {/* Altezza compatta + scroll. Wheel handler manuale: dentro
                    un Dialog, cmdk a volte intercetta gli eventi wheel per
                    la navigazione frecce. Scrolliamo programmaticamente. */}
                <CommandList
                  className="!max-h-[280px] overscroll-contain"
                  onWheel={(e) => {
                    e.currentTarget.scrollTop += e.deltaY;
                  }}
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin mr-2" />
                      Caricamento…
                    </div>
                  ) : items.length === 0 ? (
                    <CommandEmpty className="py-6 text-center text-xs text-muted-foreground">
                      {debouncedSearch
                        ? `Nessun articolo trovato per "${debouncedSearch}"`
                        : "Nessun articolo in questo magazzino"}
                    </CommandEmpty>
                  ) : (
                    <CommandGroup>
                      {items.map((item) => {
                        const noStock = item.quantity <= 0;
                        return (
                          <CommandItem
                            key={item.id}
                            value={item.id}
                            onSelect={() => handlePickItem(item)}
                            className="flex flex-col items-start gap-0.5 py-2 cursor-pointer"
                          >
                            <div className="flex items-center gap-2 w-full">
                              <span className={`font-medium text-sm truncate ${noStock && item.source !== "listino" ? "text-muted-foreground" : ""}`}>
                                {item.name}
                              </span>
                              {/* v8.6.112 — Badge source: distingue articoli magazzino
                                  da articoli del listino prodotti (mai ricevuti). */}
                              {item.source === "listino" ? (
                                <Badge variant="outline" className="text-[10px] h-4 shrink-0 ml-auto bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300">
                                  📋 Listino
                                </Badge>
                              ) : item.internal_code ? (
                                <Badge variant="outline" className="text-[10px] h-4 shrink-0 ml-auto">
                                  {item.internal_code}
                                </Badge>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-2 text-[11px]">
                              {item.source === "listino" ? (
                                <>
                                  <PackageCheck className="h-2.5 w-2.5 text-blue-600" />
                                  <span className="text-blue-700 dark:text-blue-300">
                                    Da listino · l'articolo verrà creato a magazzino
                                    {item.suggested_unit_cost ? ` · ${item.suggested_unit_cost.toFixed(2)}€` : ""}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <PackageCheck className={`h-2.5 w-2.5 ${noStock ? "text-destructive" : "text-emerald-600"}`} />
                                  <span className={noStock ? "text-destructive" : "text-muted-foreground"}>
                                    Giacenza:{" "}
                                    <span className="font-semibold tabular-nums">{item.quantity}</span>{" "}
                                    pz
                                  </span>
                                  {noStock && (
                                    <Badge variant="destructive" className="text-[9px] h-4">esaurito</Badge>
                                  )}
                                  {item.tracking_mode === "serialized" && (
                                    <Badge variant="secondary" className="text-[9px] h-4">SN</Badge>
                                  )}
                                </>
                              )}
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Su mobile: qtà + bottone su 2a riga con il bottone full-width.
            Su desktop: layout 3-col inline come prima. */}
        <div className="flex gap-2 items-end md:contents">
          <div className="space-y-1 flex-1 md:flex-none">
            <Label className="text-xs">Qtà</Label>
            <Input
              type="number"
              min="1"
              value={pendingQty}
              onChange={(e) => setPendingQty(e.target.value)}
              disabled={!pendingItem}
              className="h-10 text-right tabular-nums md:h-9"
              max={pendingItem?.quantity ?? undefined}
            />
          </div>

          <Button
            type="button"
            onClick={handleAddEntry}
            disabled={!pendingItem || !pendingQty || parseFloat(pendingQty) <= 0}
            className="h-10 shrink-0 flex-1 md:flex-none md:h-9"
          >
            <Plus className="h-4 w-4 mr-1" />
            Aggiungi
          </Button>
        </div>
      </div>

      {/* Lista entries aggiunte */}
      {entries.length > 0 && (
        <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Articoli da scaricare ({entries.length})
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              Totale unità: <strong>{totalArticoli}</strong>
            </span>
          </div>
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-2 bg-background rounded-md border px-2 py-1.5 text-xs"
              >
                <span className="truncate flex-1 min-w-0">
                  {entry.itemName ?? entry.rawCode ?? "—"}
                </span>
                <Input
                  type="number"
                  min="1"
                  value={entry.quantity}
                  onChange={(e) => handleUpdateQty(entry.id, parseFloat(e.target.value) || 0)}
                  className="h-7 w-16 text-right tabular-nums text-xs"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => handleRemoveEntry(entry.id)}
                  aria-label="Rimuovi"
                >
                  <X className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
