import { useState } from "react";
import { useHrSedi, useCreateHrSede, useUpdateHrSede, useDeleteHrSede, useImportaSediAziendali } from "@/hooks/useHrSedi";
import type { HrSede } from "@/types/hr";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, MapPin, Pencil, Trash2, Navigation, CircleDot } from "lucide-react";
import { toast } from "sonner";

export function TabSedi() {
  const { data: sedi = [], isLoading } = useHrSedi();
  const importaMut = useImportaSediAziendali();
  const [editSede, setEditSede] = useState<HrSede | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const deleteMut = useDeleteHrSede();

  const attive = sedi.filter((s) => s.attiva).length;

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted"><MapPin className="h-5 w-5 text-muted-foreground" /></div>
            <div>
              <p className="text-2xl font-bold">{sedi.length}</p>
              <p className="text-xs text-muted-foreground">Sedi totali</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted"><Navigation className="h-5 w-5 text-muted-foreground" /></div>
            <div>
              <p className="text-2xl font-bold">{attive}</p>
              <p className="text-xs text-muted-foreground">Attive</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted"><CircleDot className="h-5 w-5 text-muted-foreground" /></div>
            <div>
              <p className="text-2xl font-bold">{sedi.filter((s) => s.lat != null && s.lng != null).length}</p>
              <p className="text-xs text-muted-foreground">Con GPS</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{sedi.length} sedi configurate</p>
        <div className="flex items-center gap-2">
          {/* Le "Sedi aziendali" (Impostazioni) sono un'anagrafica separata:
              chi le aveva già create si sentiva dire dall'HR che non
              esistevano sedi. Un click e arrivano anche qui (raggio 200 m). */}
          <Button size="sm" variant="outline" onClick={() => importaMut.mutate()} disabled={importaMut.isPending}>
            {importaMut.isPending ? "Importo..." : "Importa da Sedi aziendali"}
          </Button>
          <Button size="sm" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nuova Sede
          </Button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Caricamento...</div>
      ) : sedi.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nessuna sede configurata. Aggiungi la prima sede per abilitare il geofencing.</CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {sedi.map((sede) => (
            <SedeCard key={sede.id} sede={sede} onEdit={() => setEditSede(sede)} onDelete={() => setDeleteId(sede.id)} />
          ))}
        </div>
      )}

      {/* Create/Edit dialog */}
      {(showNew || editSede) && (
        <SedeDialog
          sede={editSede}
          open={showNew || !!editSede}
          onClose={() => { setShowNew(false); setEditSede(null); }}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina Sede</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione è irreversibile. Se la sede è assegnata a profili HR, il sistema bloccherà l'eliminazione:
              in quel caso disattivala o sposta prima i profili.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteId) deleteMut.mutate(deleteId); setDeleteId(null); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? "Eliminazione..." : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SedeCard({ sede, onEdit, onDelete }: { sede: HrSede; onEdit: () => void; onDelete: () => void }) {
  const hasGps = sede.lat != null && sede.lng != null;

  return (
    <Card className={!sede.attiva ? "opacity-60" : ""}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10 mt-0.5">
              <MapPin className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm">{sede.nome}</h3>
                {!sede.attiva && <Badge variant="secondary" className="text-xs">Inattiva</Badge>}
              </div>
              {sede.indirizzo && <p className="text-xs text-muted-foreground mt-0.5">{sede.indirizzo}</p>}
              {(sede.citta || sede.provincia) && (
                <p className="text-xs text-muted-foreground">
                  {[sede.cap, sede.citta, sede.provincia].filter(Boolean).join(", ")}
                </p>
              )}
              <div className="flex items-center gap-3 mt-2">
                <Badge variant="outline" className="text-xs gap-1">
                  <CircleDot className="h-3 w-3" /> {sede.raggio_mt}m
                </Badge>
                {hasGps ? (
                  <Badge variant="outline" className="text-xs gap-1 border-emerald-300 text-emerald-700">
                    <Navigation className="h-3 w-3" /> GPS
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-muted-foreground">No GPS</Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SedeDialog({ sede, open, onClose }: { sede: HrSede | null; open: boolean; onClose: () => void }) {
  const createMut = useCreateHrSede();
  const updateMut = useUpdateHrSede();
  const isEdit = !!sede;

  const [nome, setNome] = useState(sede?.nome || "");
  const [indirizzo, setIndirizzo] = useState(sede?.indirizzo || "");
  const [citta, setCitta] = useState(sede?.citta || "");
  const [provincia, setProvincia] = useState(sede?.provincia || "");
  const [cap, setCap] = useState(sede?.cap || "");
  const [lat, setLat] = useState(sede?.lat?.toString() || "");
  const [lng, setLng] = useState(sede?.lng?.toString() || "");
  const [raggioMt, setRaggioMt] = useState(sede?.raggio_mt?.toString() || "200");
  const [attiva, setAttiva] = useState(sede?.attiva ?? true);

  const handleSubmit = () => {
    if (!nome.trim()) { toast.error("Il nome è obbligatorio"); return; }

    const parsedLat = lat.trim() ? Number(lat) : null;
    const parsedLng = lng.trim() ? Number(lng) : null;
    const parsedRaggio = Number(raggioMt);

    if (parsedLat != null && (!Number.isFinite(parsedLat) || parsedLat < -90 || parsedLat > 90)) {
      toast.error("Latitudine non valida");
      return;
    }
    if (parsedLng != null && (!Number.isFinite(parsedLng) || parsedLng < -180 || parsedLng > 180)) {
      toast.error("Longitudine non valida");
      return;
    }
    if (!Number.isFinite(parsedRaggio) || parsedRaggio < 10 || parsedRaggio > 5000) {
      toast.error("Il raggio deve essere compreso tra 10 e 5000 metri");
      return;
    }

    const payload: any = {
      nome: nome.trim(),
      indirizzo: indirizzo.trim() || null,
      citta: citta.trim() || null,
      provincia: provincia.trim().toUpperCase() || null,
      cap: cap.trim() || null,
      lat: parsedLat,
      lng: parsedLng,
      raggio_mt: Math.round(parsedRaggio),
      attiva,
    };

    if (isEdit) {
      updateMut.mutate({ id: sede!.id, ...payload }, { onSuccess: onClose });
    } else {
      createMut.mutate(payload, { onSuccess: onClose });
    }
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) { toast.error("Geolocalizzazione non supportata"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        toast.success("Posizione acquisita");
      },
      () => toast.error("Impossibile ottenere la posizione")
    );
  };

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifica Sede" : "Nuova Sede"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Modifica i dati della sede." : "Configura una nuova sede per il geofencing timbrature."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome sede *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Es. Sede centrale" />
          </div>
          <div>
            <Label>Indirizzo</Label>
            <Input value={indirizzo} onChange={(e) => setIndirizzo(e.target.value)} placeholder="Via Roma 1" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>Città</Label>
              <Input value={citta} onChange={(e) => setCitta(e.target.value)} />
            </div>
            <div>
              <Label>Provincia</Label>
              <Input value={provincia} onChange={(e) => setProvincia(e.target.value)} maxLength={2} />
            </div>
            <div>
              <Label>CAP</Label>
              <Input value={cap} onChange={(e) => setCap(e.target.value)} maxLength={5} />
            </div>
          </div>

          {/* GPS */}
          <div className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Coordinate GPS</Label>
              <Button type="button" variant="outline" size="sm" onClick={handleGetLocation}>
                <Navigation className="h-3.5 w-3.5 mr-1" /> Posizione attuale
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">Latitudine</Label>
                <Input type="number" step="0.000001" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="45.4642" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Longitudine</Label>
                <Input type="number" step="0.000001" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="9.1900" />
              </div>
            </div>
          </div>

          {/* Raggio */}
          <div>
            <Label>Raggio geofencing (metri)</Label>
            <Input type="number" min={10} max={5000} value={raggioMt} onChange={(e) => setRaggioMt(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-1">
              Distanza massima dalla sede per validare la timbratura ({Number.isFinite(Number(raggioMt)) ? Math.round(Number(raggioMt)) : 0}m = {Number.isFinite(Number(raggioMt)) ? (Number(raggioMt) / 1000).toFixed(1) : "0.0"}km)
            </p>
          </div>

          {/* Attiva */}
          <div className="flex items-center justify-between">
            <Label>Sede attiva</Label>
            <Switch checked={attiva} onCheckedChange={setAttiva} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Salvataggio..." : isEdit ? "Salva Modifiche" : "Crea Sede"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
