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
import { Plus, X, Search, Loader2, PackageCheck, XCircle } from "lucide-react";
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

  // Query articoli del magazzino selezionato + opzionale filtro testuale
  const { data: items = [], isLoading } = useQuery<StockItem[]>({
    queryKey: ["manual-adder-stock", companyId, warehouseId, debouncedSearch],
    enabled: !!companyId && !!warehouseId && pickerOpen,
    staleTime: 30_000,
    queryFn: async () => {
      // Mostriamo TUTTI gli articoli del magazzino (anche giacenza 0).
      // L'utente deve poter cercare e selezionare ogni articolo: il warning
      // di disponibilità appare nell'item card (e quantità max limitata).
      let q = supabase
        .from("warehouse_stock")
        .select("id, name, internal_code, quantity, tracking_mode")
        .eq("company_id", companyId!)
        .eq("warehouse_id", warehouseId!);

      if (debouncedSearch) {
        const s = `%${debouncedSearch}%`;
        q = q.or(`name.ilike.${s},internal_code.ilike.${s}`);
      }

      // Ordinamento: prima disponibili, poi a zero. Per nome ASC entro ciascuno.
      q = q.order("quantity", { ascending: false }).order("name", { ascending: true }).limit(200);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as StockItem[];
    },
  });

  const handlePickItem = useCallback((item: StockItem) => {
    setPendingItem(item);
    setPendingQty("1");
    setPickerOpen(false);
  }, []);

  const handleAddEntry = useCallback(() => {
    if (!pendingItem) return;
    const qty = parseFloat(pendingQty) || 0;
    if (qty <= 0) return;
    const safeQty = Math.min(qty, pendingItem.quantity);

    // Se l'articolo è già in lista, somma le quantità
    const existing = entries.find((e) => e.stockItemId === pendingItem.id);
    if (existing) {
      onEntriesChange(
        entries.map((e) =>
          e.stockItemId === pendingItem.id ? { ...e, quantity: e.quantity + safeQty } : e,
        ),
      );
    } else {
      onEntriesChange([
        ...entries,
        {
          id: crypto.randomUUID(),
          stockItemId: pendingItem.id,
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
  }, [pendingItem, pendingQty, entries, onEntriesChange]);

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
      {/* Picker + Quantità + Aggiungi */}
      <div className="grid grid-cols-[1fr_5rem_auto] gap-2 items-end">
        <div className="space-y-1">
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
                      <Search className="h-3.5 w-3.5 mr-2 opacity-50 shrink-0" />
                      <span className="text-muted-foreground truncate">
                        Cerca per nome o codice…
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
                  placeholder="Cerca articolo nel magazzino..."
                  value={search}
                  onValueChange={setSearch}
                />
                {/* Altezza compatta + scroll: il popover si apre SOTTO il
                    trigger e mostra ~5-6 articoli, il resto scrolla. Evita
                    apertura verso l'alto che invadeva tutto lo schermo. */}
                <CommandList className="!max-h-[280px] overscroll-contain">
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
                              <span className={`font-medium text-sm truncate ${noStock ? "text-muted-foreground" : ""}`}>
                                {item.name}
                              </span>
                              {item.internal_code && (
                                <Badge variant="outline" className="text-[10px] h-4 shrink-0 ml-auto">
                                  {item.internal_code}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px]">
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

        <div className="space-y-1">
          <Label className="text-xs">Qtà</Label>
          <Input
            type="number"
            min="1"
            value={pendingQty}
            onChange={(e) => setPendingQty(e.target.value)}
            disabled={!pendingItem}
            className="h-9 text-right tabular-nums"
            max={pendingItem?.quantity ?? undefined}
          />
        </div>

        <Button
          type="button"
          onClick={handleAddEntry}
          disabled={!pendingItem || !pendingQty || parseFloat(pendingQty) <= 0}
          className="h-9 shrink-0"
        >
          <Plus className="h-4 w-4 mr-1" />
          Aggiungi
        </Button>
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
