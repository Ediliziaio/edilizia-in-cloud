import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { RfqSupplier } from "@/hooks/useSupplierRfqs";
import { TRASPORTO_LABELS } from "@/lib/acquisti/confronto";
import { toast } from "sonner";
export function RdoCondizioniOfferta({
  fornitore: f,
  chiusa,
  onSave,
  onEditingChange,
}: {
  fornitore: RfqSupplier;
  chiusa: boolean;
  onSave: (
    updates: import("@/integrations/supabase/types").TablesUpdate<"supplier_rfq_suppliers">,
  ) => Promise<unknown>;
  onEditingChange: (editing: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [tipo, setTipo] = useState(f.trasporto_tipo ?? "da_confermare");
  const [costo, setCosto] = useState(
    f.costo_trasporto == null ? "" : String(f.costo_trasporto),
  );
  const [note, setNote] = useState(f.disponibilita_note ?? "");
  const [busy, setBusy] = useState(false);
  const nome = f.suppliers?.name ?? "Fornitore";
  const close = () => {
    setEditing(false);
    onEditingChange(false);
  };
  const salva = async () => {
    const value = costo.trim() === "" ? null : Number(costo);
    if (
      tipo === "extra" &&
      (value == null || !Number.isFinite(value) || value < 0)
    ) {
      toast.error("Indica un costo di trasporto maggiore o uguale a zero.");
      return;
    }
    setBusy(true);
    try {
      await onSave({
        trasporto_tipo: tipo,
        costo_trasporto: tipo === "extra" ? value : null,
        disponibilita_note: note.trim() || null,
      });
      close();
    } catch {
      toast.error("Condizioni non salvate. Le modifiche restano aperte.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      {!editing ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold">Trasporto e disponibilità</p>
            {!chiusa && (
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Modifica trasporto e disponibilità ${nome}`}
                onClick={() => {
                  setTipo(f.trasporto_tipo ?? "da_confermare");
                  setCosto(
                    f.costo_trasporto == null ? "" : String(f.costo_trasporto),
                  );
                  setNote(f.disponibilita_note ?? "");
                  setEditing(true);
                  onEditingChange(true);
                }}
              >
                Modifica
              </Button>
            )}
          </div>
          <p className="text-xs text-slate-600">
            {TRASPORTO_LABELS[f.trasporto_tipo ?? "da_confermare"]}
            {f.trasporto_tipo === "extra" && f.costo_trasporto != null
              ? ` · ${Number(f.costo_trasporto).toLocaleString("it-IT", { style: "currency", currency: "EUR" })} + IVA`
              : ""}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">
            {f.disponibilita_note || "Disponibilità e vincoli non specificati."}
          </p>
        </>
      ) : (
        <div className="space-y-3">
          <div>
            <Label htmlFor={`trasporto-${f.id}`}>Trasporto</Label>
            <select
              id={`trasporto-${f.id}`}
              value={tipo}
              disabled={busy}
              onChange={(e) => setTipo(e.target.value as typeof tipo)}
              className="mt-1 h-10 w-full rounded-md border bg-white px-2 text-sm"
            >
              {Object.entries(TRASPORTO_LABELS).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {tipo === "extra" && (
            <div>
              <Label htmlFor={`costo-${f.id}`}>
                Costo trasporto, IVA esclusa (€)
              </Label>
              <Input
                id={`costo-${f.id}`}
                type="number"
                min="0"
                step="0.01"
                value={costo}
                disabled={busy}
                onChange={(e) => setCosto(e.target.value)}
              />
            </div>
          )}
          <div>
            <Label htmlFor={`disponibilita-${f.id}`}>
              Disponibilità e vincoli
            </Label>
            <Textarea
              id={`disponibilita-${f.id}`}
              value={note}
              disabled={busy}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Es. disponibile a magazzino, consegna in due lotti…"
            />
          </div>
          <p className="text-[11px] text-slate-500">
            Il totale del documento deve già comprendere il trasporto. Senza
            totale documento, l’extra si somma alle righe.
          </p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={busy} onClick={close}>
              Annulla
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void salva()}>
              {busy ? "Salvataggio…" : "Salva condizioni"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
