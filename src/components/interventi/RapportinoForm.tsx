import { useState, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Trash2, Eraser, PenTool, Package, Search } from "lucide-react";
import { toast } from "sonner";
import type { MaterialeUsato } from "@/types/interventi";

interface Props {
  open: boolean;
  onClose: () => void;
  ticketId: string;
  companyId: string;
  nextNumero: number;
  onSuccess: () => void;
}

interface ArticoloMagazzino {
  id: string;
  name: string;
  quantity: number;
  unit_cost: number;
}

interface MaterialeConId extends MaterialeUsato {
  stock_item_id?: string | null;
  prezzo_unitario?: number | null;
}

export function RapportinoForm({ open, onClose, ticketId, companyId, nextNumero, onSuccess }: Props) {
  const { effectiveCompany } = useAuth();
  const [descrizione, setDescrizione] = useState("");
  const [oreLavoro, setOreLavoro] = useState("1");
  const [firmatoDa, setFirmatoDa] = useState("");
  const [materiali, setMateriali] = useState<MaterialeConId[]>([]);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Picker magazzino
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchArticoli, setSearchArticoli] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);

  // Query articoli magazzino
  const { data: articoli = [] } = useQuery({
    queryKey: ["warehouse-stock-picker", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      const { data, error } = await supabase
        .from("warehouse_stock")
        .select("id, name, quantity, unit_cost")
        .eq("company_id", effectiveCompany.id)
        .gt("quantity", 0)
        .order("name");
      if (error) throw error;
      return (data ?? []) as ArticoloMagazzino[];
    },
    enabled: !!effectiveCompany?.id && open,
  });

  const articoliFiltrati = articoli.filter((a) =>
    a.name.toLowerCase().includes(searchArticoli.toLowerCase())
  );

  // ── Canvas drawing ────────────────────────────────────────────
  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDrawingRef.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const endDraw = () => { isDrawingRef.current = false; };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  // ── Materiali ─────────────────────────────────────────────────
  const addMateriale = () => {
    setMateriali((prev) => [...prev, { descrizione: "", quantita: 1, unita: "pz" }]);
  };

  const addMaterialeFromStock = (articolo: ArticoloMagazzino) => {
    setMateriali((prev) => [...prev, {
      descrizione: articolo.name,
      quantita: 1,
      unita: "pz",
      stock_item_id: articolo.id,
      prezzo_unitario: articolo.unit_cost,
    }]);
    setPickerOpen(false);
    setSearchArticoli("");
  };

  const updateMateriale = (idx: number, field: keyof MaterialeUsato, value: string | number) => {
    setMateriali((prev) => prev.map((m, i) => i === idx ? { ...m, [field]: value } : m));
  };

  const removeMateriale = (idx: number) => {
    setMateriali((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Submit ────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: async () => {
      if (!descrizione.trim()) throw new Error("La descrizione è obbligatoria");

      const firmaData = hasDrawn ? canvasRef.current?.toDataURL("image/png") ?? null : null;

      const { data: rapportino, error } = await supabase
        .from("rapportini_intervento")
        .insert({
          ticket_id: ticketId,
          company_id: companyId,
          numero: nextNumero,
          descrizione: descrizione.trim(),
          ore_lavoro: parseFloat(oreLavoro) || 0,
          materiali_usati: materiali,
          firma_cliente: firmaData,
          firmato_da: firmatoDa.trim() || null,
          firmato_il: firmaData ? new Date().toISOString() : null,
          stato: firmaData ? "firmato" : "bozza",
        })
        .select("id")
        .single();

      if (error) throw error;

      // Salva anche nella tabella tipizzata rapportino_materiali (per articoli con FK magazzino)
      const materialiConId = materiali.filter((m) => m.stock_item_id);
      if (materialiConId.length > 0 && rapportino?.id) {
        const righe = materialiConId.map((m) => ({
          rapportino_id: rapportino.id,
          company_id: companyId,
          stock_item_id: m.stock_item_id!,
          descrizione: m.descrizione,
          quantita: m.quantita,
          unita_misura: m.unita,
          prezzo_unitario: m.prezzo_unitario ?? null,
        }));
        const { error: matErr } = await supabase
          .from("rapportino_materiali")
          .insert(righe);
        if (matErr) console.error("Errore salvataggio materiali tipizzati:", matErr);
        // Non è bloccante — il JSONB è già salvato
      }

      // Aggiorna ticket: in_lavorazione se firmato
      if (firmaData) {
        await supabase.from("tickets").update({ status: "in_lavorazione" }).eq("id", ticketId);
      }
    },
    onSuccess: () => {
      toast.success("Rapportino salvato con successo");
      onSuccess();
      handleClose();
    },
    onError: (err: Error) => toast.error(err.message || "Errore nel salvataggio del rapportino"),
  });

  const handleClose = () => {
    setDescrizione("");
    setOreLavoro("1");
    setFirmatoDa("");
    setMateriali([]);
    setHasDrawn(false);
    setPickerOpen(false);
    setSearchArticoli("");
    clearCanvas();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenTool className="h-5 w-5 text-orange-500" />
            Rapportino #{nextNumero}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Descrizione */}
          <div className="space-y-1.5">
            <Label htmlFor="descrizione">Descrizione lavori eseguiti *</Label>
            <Textarea
              id="descrizione"
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              placeholder="Descrivere in dettaglio i lavori effettuati..."
              rows={4}
              disabled={mutation.isPending}
            />
          </div>

          {/* Ore lavoro */}
          <div className="space-y-1.5">
            <Label htmlFor="ore">Ore di lavoro</Label>
            <Input
              id="ore"
              type="number"
              min="0"
              step="0.5"
              value={oreLavoro}
              onChange={(e) => setOreLavoro(e.target.value)}
              disabled={mutation.isPending}
              className="w-32"
            />
          </div>

          {/* Materiali */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Materiali usati</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPickerOpen((v) => !v)}
                  disabled={mutation.isPending}
                  className="gap-1 text-blue-700 border-blue-300 hover:bg-blue-50"
                >
                  <Package className="h-3 w-3" />
                  Da Magazzino
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addMateriale}
                  disabled={mutation.isPending}
                  className="gap-1"
                >
                  <Plus className="h-3 w-3" />
                  Manuale
                </Button>
              </div>
            </div>

            {/* Picker articoli magazzino */}
            {pickerOpen && (
              <div className="border rounded-lg p-3 bg-blue-50/50 space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <Input
                    placeholder="Cerca articolo..."
                    value={searchArticoli}
                    onChange={(e) => setSearchArticoli(e.target.value)}
                    className="pl-8 h-8 text-sm"
                    autoFocus
                  />
                </div>
                {articoliFiltrati.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-2">
                    {articoli.length === 0 ? "Nessun articolo in magazzino" : "Nessun risultato"}
                  </p>
                ) : (
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {articoliFiltrati.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => addMaterialeFromStock(a)}
                        className="w-full text-left px-3 py-2 rounded-md hover:bg-blue-100 transition-colors text-sm flex items-center justify-between"
                      >
                        <span className="font-medium">{a.name}</span>
                        <span className="text-xs text-gray-500">
                          {a.quantity} disponibili
                          {a.unit_cost > 0 && ` · €${a.unit_cost.toFixed(2)}`}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {materiali.length === 0 && !pickerOpen && (
              <p className="text-xs text-gray-400">Nessun materiale aggiunto</p>
            )}
            {materiali.map((m, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input
                  placeholder="Descrizione"
                  value={m.descrizione}
                  onChange={(e) => updateMateriale(i, "descrizione", e.target.value)}
                  disabled={mutation.isPending}
                  className="flex-1"
                />
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={m.quantita}
                  onChange={(e) => updateMateriale(i, "quantita", parseFloat(e.target.value) || 0)}
                  disabled={mutation.isPending}
                  className="w-20"
                />
                <Input
                  placeholder="pz"
                  value={m.unita}
                  onChange={(e) => updateMateriale(i, "unita", e.target.value)}
                  disabled={mutation.isPending}
                  className="w-16"
                />
                {(m as MaterialeConId).stock_item_id && (
                  <Package className="h-4 w-4 text-blue-500 shrink-0" title="Dal magazzino" />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeMateriale(i)}
                  disabled={mutation.isPending}
                  aria-label="Rimuovi materiale"
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            ))}
          </div>

          {/* Firma cliente */}
          <div className="space-y-2">
            <Label>Firma del cliente</Label>
            <Input
              placeholder="Nome e cognome del cliente"
              value={firmatoDa}
              onChange={(e) => setFirmatoDa(e.target.value)}
              disabled={mutation.isPending}
            />
            <div className="border rounded-lg overflow-hidden bg-gray-50">
              <div className="flex items-center justify-between px-3 py-2 border-b bg-white">
                <span className="text-xs text-gray-500">Firma qui sotto</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearCanvas}
                  disabled={mutation.isPending}
                  className="gap-1 text-xs h-7"
                  aria-label="Cancella firma"
                >
                  <Eraser className="h-3 w-3" />
                  Cancella
                </Button>
              </div>
              <canvas
                ref={canvasRef}
                width={560}
                height={150}
                className="w-full touch-none cursor-crosshair"
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={endDraw}
                aria-label="Area firma"
              />
            </div>
            {!hasDrawn && (
              <p className="text-xs text-gray-400">Opzionale — se il cliente non è presente, salva come bozza</p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>
            Annulla
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !descrizione.trim()}
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {hasDrawn ? "Salva e Firma" : "Salva Bozza"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
