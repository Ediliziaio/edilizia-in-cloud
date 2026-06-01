/**
 * ProductSearchDialog — extract da QuoteBuilder per ridurre la dimensione
 * del file principale (3688 → ~3360 righe).
 *
 * Comportamento INVARIATO rispetto alla versione originale:
 *   - Search articoli con filtro categoria
 *   - 4 modalità prezzo: pz / mq / misura_libera / griglia
 *   - Live preview griglia via calcolaPrezzoProdotto async
 *   - Preview superficie per mq (larg × alt × qty)
 *
 * Chiamato in QuoteBuilder dentro lo step "prodotti".
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Package } from "lucide-react";
import type { ArticlePro } from "@/hooks/usePreventivoCosti";

export interface ListinoCategoria {
  id: string;
  nome: string;
  margine_target_percentuale?: number | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  articoli: ArticlePro[];
  categorie: ListinoCategoria[];
  calcolaPrezzoProdotto: (
    prodotto: ArticlePro,
    qty: number,
    x?: number,
    y?: number,
  ) => Promise<{ prezzo_vendita: number; prezzo_acquisto: number; trovato_in_griglia?: boolean }>;
  onConfirm: (p: ArticlePro, qty: number, x?: number, y?: number) => void;
}

export function ProductSearchDialog({
  open,
  onClose,
  articoli,
  categorie,
  calcolaPrezzoProdotto,
  onConfirm,
}: Props) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  const [pending, setPending] = useState<ArticlePro | null>(null);
  const [qty, setQty] = useState("1");
  const [mx, setMx] = useState("");
  const [my, setMy] = useState("");
  const [preview, setPreview] = useState<{ pv: number; trovato: boolean } | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setCat("all");
      setPending(null);
      setQty("1");
      setMx("");
      setMy("");
      setPreview(null);
    }
  }, [open]);

  useEffect(() => {
    if (!pending || pending.modalita_prezzo !== "griglia") {
      setPreview(null);
      return;
    }
    const x = parseFloat(mx),
      y = parseFloat(my);
    if (isNaN(x) || isNaN(y) || x <= 0 || y <= 0) {
      setPreview(null);
      return;
    }
    // P2-9: flag cancelled per evitare setState su unmount o ri-trigger
    // mentre una promise precedente non è ancora risolta.
    let cancelled = false;
    calcolaPrezzoProdotto(pending, parseFloat(qty) || 1, x, y)
      .then((r) => {
        if (!cancelled) {
          setPreview({ pv: r.prezzo_vendita, trovato: r.trovato_in_griglia ?? false });
        }
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      });
    return () => {
      cancelled = true;
    };
    // `calcolaPrezzoProdotto` è ora memoizzata via useCallback in
    // usePreventivoCosti.ts (P2-9): l'identità è stabile finché non cambiano
    // le sue dep interne, quindi includerla nelle deps di questo useEffect
    // non causa re-run spuri.
  }, [mx, my, qty, pending, calcolaPrezzoProdotto]);

  const mqPreview =
    pending?.modalita_prezzo === "mq" && mx && my
      ? parseFloat(mx) * parseFloat(my)
      : null;

  const queryLower = query.toLowerCase();
  const filtered = articoli.filter(
    (a) =>
      (cat === "all" || a.categoria_id === cat) &&
      (query === "" ||
        a.name.toLowerCase().includes(queryLower) ||
        (a.sku || "").toLowerCase().includes(queryLower) ||
        (a.marca || "").toLowerCase().includes(queryLower) ||
        (a.description || "").toLowerCase().includes(queryLower)),
  );

  const handleSelect = (a: ArticlePro) => {
    if (a.modalita_prezzo === "pz" || a.modalita_prezzo === "misura_libera") {
      onConfirm(a, parseFloat(qty) || 1);
      return;
    }
    setPending(a);
  };

  const handleConfirm = () => {
    if (!pending) return;
    const x =
      pending.modalita_prezzo === "mq"
        ? parseFloat(mx) * 1000
        : parseFloat(mx);
    const y =
      pending.modalita_prezzo === "mq"
        ? parseFloat(my) * 1000
        : parseFloat(my);
    onConfirm(pending, parseFloat(qty) || 1, x || undefined, y || undefined);
    setPending(null);
    setMx("");
    setMy("");
  };

  const modalitaBadge = (m: string) => {
    const map: Record<string, { label: string; className: string }> = {
      pz: { label: "A pezzo", className: "bg-gray-100 text-gray-700" },
      mq: { label: "Al mq", className: "bg-blue-100 text-blue-700" },
      misura_libera: {
        label: "Misura libera",
        className: "bg-purple-100 text-purple-700",
      },
      griglia: { label: "Griglia", className: "bg-orange-100 text-orange-700" },
    };
    const b = map[m] || { label: m, className: "bg-gray-100 text-gray-700" };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full ${b.className}`}>
        {b.label}
      </span>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Aggiungi dal listino</DialogTitle>
        </DialogHeader>
        {!pending ? (
          <>
            <div className="flex gap-2">
              <Input
                placeholder="Cerca per nome o SKU..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1"
              />
              <Select value={cat} onValueChange={setCat}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte</SelectItem>
                  {categorie.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <div className="space-y-2 pr-2">
                {filtered.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    Nessun prodotto trovato
                  </p>
                ) : (
                  filtered.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => handleSelect(a)}
                      className="w-full flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 text-left transition-colors"
                    >
                      {a.immagine_url ? (
                        <img width={40} height={40} loading="lazy"
                          src={a.immagine_url}
                          alt=""
                          className="h-10 w-10 object-cover rounded shrink-0"
                        />
                      ) : (
                        <div className="h-10 w-10 bg-muted rounded flex items-center justify-center shrink-0">
                          <Package className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {a.name}
                        </div>
                        {a.sku && (
                          <div className="text-xs text-muted-foreground">
                            {a.sku}
                            {a.marca ? ` · ${a.marca}` : ""}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {modalitaBadge(a.modalita_prezzo || "pz")}
                        {a.prezzo_vendita ? (
                          <span className="text-sm font-medium">
                            €{a.prezzo_vendita.toFixed(2)}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
              <button
                onClick={() => setPending(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                ← Torna
              </button>
              <span className="font-medium">{pending.name}</span>
              {modalitaBadge(pending.modalita_prezzo || "pz")}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Quantità</Label>
                <Input
                  type="number"
                  min="1"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </div>
            </div>
            {(pending.modalita_prezzo === "griglia" ||
              pending.modalita_prezzo === "mq") && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>
                    {pending.modalita_prezzo === "mq"
                      ? "Larghezza (m)"
                      : "Larghezza (mm)"}
                  </Label>
                  <Input
                    type="number"
                    value={mx}
                    onChange={(e) => setMx(e.target.value)}
                    placeholder={
                      pending.modalita_prezzo === "mq" ? "1.20" : "1200"
                    }
                  />
                </div>
                <div>
                  <Label>
                    {pending.modalita_prezzo === "mq"
                      ? "Altezza (m)"
                      : "Altezza (mm)"}
                  </Label>
                  <Input
                    type="number"
                    value={my}
                    onChange={(e) => setMy(e.target.value)}
                    placeholder={
                      pending.modalita_prezzo === "mq" ? "2.10" : "2100"
                    }
                  />
                </div>
              </div>
            )}
            {pending.modalita_prezzo === "mq" && mqPreview != null && (
              <div className="text-sm text-muted-foreground bg-blue-50 rounded p-3">
                Superficie: <b>{mqPreview.toFixed(2)} mq</b> — Prezzo:{" "}
                <b>
                  €
                  {(
                    (pending.prezzo_vendita || 0) *
                    mqPreview *
                    (parseFloat(qty) || 1)
                  ).toFixed(2)}
                </b>
              </div>
            )}
            {pending.modalita_prezzo === "griglia" && preview && (
              <div
                className={`text-sm rounded p-3 ${
                  preview.trovato
                    ? "bg-green-50 text-green-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                {preview.trovato ? (
                  <>
                    Prezzo trovato in griglia:{" "}
                    <b>€{preview.pv.toFixed(2)}</b>
                  </>
                ) : (
                  "Dimensioni non trovate in griglia — verrà usata la cella più vicina"
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setPending(null)}>
                Indietro
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={
                  pending.modalita_prezzo === "griglia" && (!mx || !my)
                }
              >
                Conferma e aggiungi
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default ProductSearchDialog;
