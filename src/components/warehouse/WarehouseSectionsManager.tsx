import { useState } from "react";
import { Plus, Pencil, Trash2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useWarehouseSections, type WarehouseSection } from "@/hooks/useWarehouseSections";

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280", "#78716c",
];

export function WarehouseSectionsManager() {
  const { sections, createSection, updateSection, deleteSection, isPending } = useWarehouseSections();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseSection | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[4]);

  const openNew = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setColor(PRESET_COLORS[4]);
    setDialogOpen(true);
  };

  const openEdit = (s: WarehouseSection) => {
    setEditing(s);
    setName(s.name);
    setDescription(s.description || "");
    setColor(s.color);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!name.trim()) return;
    if (editing) {
      updateSection({ id: editing.id, name: name.trim(), description: description.trim(), color });
    } else {
      createSection({ name: name.trim(), description: description.trim(), color });
    }
    setDialogOpen(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Zone del Magazzino</h3>
        </div>
        <Button variant="outline" size="sm" onClick={openNew}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Nuova Zona
        </Button>
      </div>

      {sections.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          Nessuna zona definita. Crea zone per organizzare il magazzino.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {sections.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-1.5 border rounded-lg px-2.5 py-1.5 text-sm group hover:shadow-sm transition-shadow"
            >
              <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span className="font-medium">{s.name}</span>
              {s.description && (
                <span className="text-xs text-muted-foreground hidden sm:inline truncate max-w-[120px]">
                  — {s.description}
                </span>
              )}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(s)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setDeleteId(s.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifica Zona" : "Nuova Zona"}</DialogTitle>
            <DialogDescription>
              {editing ? "Modifica nome, descrizione e colore" : "Definisci una zona del magazzino"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Es: Scaffale A" />
            </div>
            <div className="space-y-2">
              <Label>Descrizione</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Dettagli opzionali..." />
            </div>
            <div className="space-y-2">
              <Label>Colore</Label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`h-7 w-7 rounded-full border-2 transition-all ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button onClick={handleSave} disabled={!name.trim() || isPending}>
              {editing ? "Salva" : "Crea"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina zona</AlertDialogTitle>
            <AlertDialogDescription>
              La zona verrà rimossa. Gli articoli assegnati a questa zona perderanno l'associazione.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) deleteSection(deleteId); setDeleteId(null); }}>
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
