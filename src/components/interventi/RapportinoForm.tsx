import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Trash2, Eraser, PenTool } from "lucide-react";
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

export function RapportinoForm({ open, onClose, ticketId, companyId, nextNumero, onSuccess }: Props) {
  const [descrizione, setDescrizione] = useState("");
  const [oreLavoro, setOreLavoro] = useState("1");
  const [firmatoDa, setFirmatoDa] = useState("");
  const [materiali, setMateriali] = useState<MaterialeUsato[]>([]);
  const [hasDrawn, setHasDrawn] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);

  // ── Canvas drawing (pattern identico a FirmaOdV.tsx) ──────────
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

      const { error } = await supabase.from("rapportini_intervento").insert({
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
      });

      if (error) throw error;

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
              <Button type="button" variant="outline" size="sm" onClick={addMateriale} disabled={mutation.isPending} className="gap-1">
                <Plus className="h-3 w-3" />
                Aggiungi
              </Button>
            </div>
            {materiali.length === 0 && (
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
