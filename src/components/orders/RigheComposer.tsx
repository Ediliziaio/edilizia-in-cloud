import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2, Info, Plus, Trash2, ListPlus, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import type { RigaDocumento } from "@/types/fatturazione";

/**
 * RigheComposer — composizione FLESSIBILE delle righe di un documento fiscale
 * (fattura, proforma, DDT, nota di credito) a partire dagli articoli di una
 * commessa. Condiviso per non duplicare la UI (checkbox articoli + righe libere)
 * su 4 dialog. Uso: `const { righe, totals, node } = useRigheComposer({...})`,
 * poi si rende `node` nell'area anteprima e si usa `righe` per creare il doc.
 *
 * Non tutte le righe devono essere articoli: puoi escludere articoli e/o
 * aggiungere righe DESCRITTIVE libere (prestazioni, servizi, note).
 */

export interface RigaComposerItem {
  id: string;
  name: string;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  vat_rate: number | null;
  discount_percent: number | null;
  position: number | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function fmt(value: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(value);
}

/** Riga documento da un articolo (id stabile = item.id → la selezione non salta). */
export function buildRigaFromItem(item: RigaComposerItem, defaultVat: number): RigaDocumento {
  const qty = item.quantity ?? 1;
  const unitPrice = item.unit_price ?? 0;
  const discountPct = item.discount_percent ?? 0;
  const aliquotaNum = item.vat_rate ?? defaultVat;
  const prezzoNetto = discountPct > 0 ? round2(unitPrice * (1 - discountPct / 100)) : unitPrice;
  const imponibile = round2(prezzoNetto * qty);
  const imposta = round2(imponibile * aliquotaNum / 100);
  let descrizione = item.name;
  if (item.description) descrizione += `\n${item.description}`;
  return {
    id: item.id,
    numero_linea: 0,
    descrizione,
    quantita: qty,
    unita_misura: "pz",
    prezzo_unitario: prezzoNetto,
    ...(discountPct > 0 && { sconto_percentuale: discountPct }),
    imponibile,
    aliquota_iva: String(aliquotaNum),
    imposta,
    totale_riga: round2(imponibile + imposta),
  };
}

interface FreeLine {
  id: string;
  descrizione: string;
  quantita: number;
  prezzo: number;
  aliquota: number;
}

function freeLineToRiga(fl: FreeLine, defaultVat: number): RigaDocumento {
  const qty = fl.quantita > 0 ? fl.quantita : 1;
  const price = fl.prezzo || 0;
  const aliquotaNum = Math.max(0, fl.aliquota ?? defaultVat);
  const imponibile = round2(price * qty);
  const imposta = round2(imponibile * aliquotaNum / 100);
  return {
    id: fl.id,
    numero_linea: 0,
    descrizione: fl.descrizione.trim() || "Prestazione",
    quantita: qty,
    unita_misura: "pz",
    prezzo_unitario: price,
    imponibile,
    aliquota_iva: String(aliquotaNum),
    imposta,
    totale_riga: round2(imponibile + imposta),
  };
}

export interface UseRigheComposerResult {
  /** Righe finali composte (articoli inclusi + righe libere), numero_linea in sequenza. */
  righe: RigaDocumento[];
  totals: { imponibile: number; iva: number; lordo: number };
  /** Blocco UI da rendere nell'area anteprima del dialog. */
  node: ReactNode;
}

export function useRigheComposer({
  orderItems,
  defaultVat,
  itemsLoading = false,
  open,
  label = "Righe documento",
  freeLinesLabel = "Righe descrittive (prestazioni, servizi, note)",
}: {
  orderItems: RigaComposerItem[];
  defaultVat: number;
  itemsLoading?: boolean;
  /** stato apertura dialog: al passaggio a true si resetta la composizione. */
  open: boolean;
  label?: string;
  freeLinesLabel?: string;
}): UseRigheComposerResult {
  const [excludedItemIds, setExcludedItemIds] = useState<Set<string>>(new Set());
  const [freeLines, setFreeLines] = useState<FreeLine[]>([]);
  const [draft, setDraft] = useState({ descrizione: "", quantita: "1", prezzo: "", aliquota: "" });

  useEffect(() => {
    if (open) {
      setExcludedItemIds(new Set());
      setFreeLines([]);
      setDraft({ descrizione: "", quantita: "1", prezzo: "", aliquota: "" });
    }
  }, [open]);

  const includedItemRighe = useMemo(
    () => orderItems.filter((it) => !excludedItemIds.has(it.id)).map((it) => buildRigaFromItem(it, defaultVat)),
    [orderItems, excludedItemIds, defaultVat],
  );

  const righe = useMemo(() => {
    const free = freeLines.map((fl) => freeLineToRiga(fl, defaultVat));
    return [...includedItemRighe, ...free].map((r, i) => ({ ...r, numero_linea: i + 1 }));
  }, [includedItemRighe, freeLines, defaultVat]);

  const totals = useMemo(() => ({
    imponibile: righe.reduce((s, r) => s + r.imponibile, 0),
    iva: righe.reduce((s, r) => s + r.imposta, 0),
    lordo: righe.reduce((s, r) => s + r.totale_riga, 0),
  }), [righe]);

  const toggleItem = (id: string) => setExcludedItemIds((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const addFreeLine = () => {
    const descrizione = draft.descrizione.trim();
    if (!descrizione) { toast.error("Scrivi una descrizione per la riga"); return; }
    setFreeLines((prev) => [...prev, {
      id: crypto.randomUUID(),
      descrizione,
      quantita: Math.max(1, Number(draft.quantita) || 1),
      prezzo: Math.max(0, Number(draft.prezzo.replace(",", ".")) || 0),
      aliquota: draft.aliquota.trim() ? Math.max(0, Number(draft.aliquota)) : defaultVat,
    }]);
    setDraft({ descrizione: "", quantita: "1", prezzo: "", aliquota: "" });
  };
  const removeFreeLine = (id: string) => setFreeLines((prev) => prev.filter((f) => f.id !== id));

  const node = (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-amber-500" />
        {label} ({righe.length})
      </p>

      {itemsLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {orderItems.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-muted/60">
                <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Package className="h-3 w-3" /> Articoli · {includedItemRighe.length}/{orderItems.length} inclusi
                </span>
                <div className="flex gap-2">
                  <button type="button" className="text-[10px] font-medium text-primary hover:underline" onClick={() => setExcludedItemIds(new Set())}>Tutti</button>
                  <button type="button" className="text-[10px] font-medium text-muted-foreground hover:underline" onClick={() => setExcludedItemIds(new Set(orderItems.map((i) => i.id)))}>Nessuno</button>
                </div>
              </div>
              <div className="divide-y max-h-48 overflow-auto">
                {orderItems.map((item) => {
                  const riga = buildRigaFromItem(item, defaultVat);
                  const included = !excludedItemIds.has(item.id);
                  return (
                    <label
                      key={item.id}
                      className={`grid grid-cols-[22px_1fr_44px_74px_40px_74px] gap-1 px-3 py-2 text-xs items-start cursor-pointer transition-colors hover:bg-muted/30 ${included ? "" : "opacity-45"}`}
                    >
                      <Checkbox checked={included} onCheckedChange={() => toggleItem(item.id)} className="mt-0.5" />
                      <span className="leading-tight line-clamp-2 text-gray-800">{riga.descrizione}</span>
                      <span className="text-right tabular-nums text-muted-foreground">{riga.quantita}</span>
                      <span className="text-right tabular-nums text-muted-foreground">{fmt(riga.prezzo_unitario)}</span>
                      <span className="text-right tabular-nums text-muted-foreground">{riga.aliquota_iva}%</span>
                      <span className="text-right tabular-nums font-medium">{fmt(riga.totale_riga)}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-lg border overflow-hidden">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/60 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <ListPlus className="h-3 w-3" /> {freeLinesLabel}
            </div>
            {freeLines.length > 0 && (
              <div className="divide-y">
                {freeLines.map((fl) => {
                  const riga = freeLineToRiga(fl, defaultVat);
                  return (
                    <div key={fl.id} className="grid grid-cols-[1fr_44px_74px_40px_74px_26px] gap-1 px-3 py-2 text-xs items-center">
                      <span className="leading-tight line-clamp-2 text-gray-800">{riga.descrizione}</span>
                      <span className="text-right tabular-nums text-muted-foreground">{riga.quantita}</span>
                      <span className="text-right tabular-nums text-muted-foreground">{fmt(riga.prezzo_unitario)}</span>
                      <span className="text-right tabular-nums text-muted-foreground">{riga.aliquota_iva}%</span>
                      <span className="text-right tabular-nums font-medium">{fmt(riga.totale_riga)}</span>
                      <button type="button" onClick={() => removeFreeLine(fl.id)} className="justify-self-end text-muted-foreground hover:text-red-600" title="Rimuovi riga">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="grid grid-cols-[1fr_52px_72px_52px_auto] gap-1.5 border-t bg-background p-2 items-center">
              <Input
                value={draft.descrizione}
                onChange={(e) => setDraft((d) => ({ ...d, descrizione: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFreeLine(); } }}
                placeholder="Descrizione (es. Manodopera, Sopralluogo…)"
                className="h-8 text-xs"
              />
              <Input value={draft.quantita} onChange={(e) => setDraft((d) => ({ ...d, quantita: e.target.value }))} inputMode="decimal" placeholder="Qtà" className="h-8 text-xs text-right" title="Quantità" />
              <Input value={draft.prezzo} onChange={(e) => setDraft((d) => ({ ...d, prezzo: e.target.value }))} inputMode="decimal" placeholder="Prezzo" className="h-8 text-xs text-right" title="Prezzo unitario (netto)" />
              <Input value={draft.aliquota} onChange={(e) => setDraft((d) => ({ ...d, aliquota: e.target.value }))} inputMode="decimal" placeholder={`${defaultVat}`} className="h-8 text-xs text-right" title="Aliquota IVA %" />
              <Button type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={addFreeLine}>
                <Plus className="h-3.5 w-3.5" /> Aggiungi
              </Button>
            </div>
          </div>

          {righe.length === 0 && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-700">
              <Info className="h-4 w-4 shrink-0" />
              <span>Nessuna riga selezionata: includi un articolo o aggiungi una riga descrittiva.</span>
            </div>
          )}

          {righe.length > 0 && (
            <div className="rounded-lg border bg-muted/30 px-3 py-2 space-y-0.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Imponibile</span>
                <span className="tabular-nums">{fmt(totals.imponibile)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>IVA</span>
                <span className="tabular-nums">{fmt(totals.iva)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold pt-1 border-t border-dashed">
                <span>Totale</span>
                <span className="tabular-nums text-primary">{fmt(totals.lordo)}</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  return { righe, totals, node };
}
