import { useState } from "react";
import { FleetMapCanvas } from "./FleetMapCanvas";
import { usePermissions } from "@/hooks/usePermissions";
import { HrQueryError } from "@/components/hr/HrQueryError";
import { Plus, Trash2, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useGeofence } from "@/hooks/useGeofence";
import type { CantiereGeofence, CantiereGeofenceInsert } from "@/types/fleet";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface GeofenceEditorProps {
  companyId: string;
}

/**
 * Lista + editor geofence per cantieri.
 * Clic sulla mappa → imposta centro del nuovo geofence.
 */
export function GeofenceEditor({ companyId }: GeofenceEditorProps) {
  const t = useT();
  const { toast } = useToast();
  const permissions=usePermissions();
  const canEdit=!permissions.isLoading && !permissions.solaLettura && permissions.isAdmin;
  const {
    geofences,
    isLoading,
    isError,
    refetch,
    createGeofence,
    deleteGeofence,
    isCreating,
    isDeleting,
  } = useGeofence(companyId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRadius, setNewRadius] = useState("200");
  const [newLat, setNewLat] = useState<number | null>(null);
  const [newLng, setNewLng] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleMapClick = (lat: number, lng: number) => {
    setNewLat(lat);
    setNewLng(lng);
  };

  const handleCreate = async () => {
    if (!canEdit) return;
    if (!newName.trim() || newLat == null || newLng == null) {
      toast({ title: t("Errore"), description: t("Clicca sulla mappa per scegliere il centro e inserisci un nome"), variant: "destructive" });
      return;
    }

    const input: CantiereGeofenceInsert = {
      company_id: companyId,
      nome: newName.trim(),
      center_lat: newLat,
      center_lng: newLng,
      radius_mt: Math.max(50, Math.min(5000, parseInt(newRadius, 10) || 200)),
    };

    try {
      await createGeofence(input);
      toast({ title: t("Geofence creato"), description: t("\"{nome}\" aggiunto con successo.", { nome: String(input.nome ?? "") }) });
      setDialogOpen(false);
      setNewName("");
      setNewRadius("200");
      setNewLat(null);
      setNewLng(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("Errore");
      toast({ title: t("Errore"), description: msg, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string, nome: string) => {
    if (!canEdit) return;
    setDeletingId(id);
    try {
      await deleteGeofence(id);
      toast({ title: t("Geofence rimosso"), description: t("\"{nome}\" rimosso.", { nome: String(nome ?? "") }) });
    } catch {
      toast({title:t("Zona non rimossa"),description:t("Riprova: il salvataggio non è stato confermato."),variant:"destructive"});
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <MapPin className="h-4 w-4 text-amber-500" />
          {t("Zone di geofence ({n})", { n: geofences.length })}
        </h3>
        <Button
          size="sm"
          className="h-8 gap-1"
          onClick={() => setDialogOpen(true)}
          disabled={!canEdit || isError}
        >
          <Plus className="h-3.5 w-3.5" />
          {t("Aggiungi zona")}
        </Button>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? <HrQueryError label={t("Zone GPS non disponibili")} onRetry={refetch} /> : geofences.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          {t("Nessuna zona di geofence configurata")}
        </p>
      ) : (
        <div className="space-y-2">
          {geofences.map((g: CantiereGeofence) => (
            <div
              key={g.id}
              className="flex items-center gap-3 p-2.5 rounded-lg border bg-card"
            >
              <MapPin className="h-4 w-4 text-amber-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-none truncate">{g.nome}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {g.center_lat.toFixed(4)}, {g.center_lng.toFixed(4)}
                </p>
              </div>
              <Badge variant="outline" className="text-xs shrink-0">
                r {g.radius_mt}m
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                disabled={!canEdit || (isDeleting && deletingId === g.id)}
                onClick={() => handleDelete(g.id, g.nome)}
              >
                {isDeleting && deletingId === g.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Dialog crea geofence */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("Nuovo geofence")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="gf-nome">{t("Nome zona *")}</Label>
              <Input
                id="gf-nome"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("es. Cantiere Via Roma")}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="gf-raggio">{t("Raggio (metri)")}</Label>
              <Input
                id="gf-raggio"
                type="number"
                min={50}
                max={5000}
                value={newRadius}
                onChange={(e) => setNewRadius(e.target.value)}
              />
            </div>

            {newLat != null && newLng != null && (
              <p className="text-xs text-muted-foreground">{t("Centro selezionato: {newLat}, {newLng}", { newLat: newLat.toFixed(5), newLng: newLng.toFixed(5) })}</p>
            )}

            <p className="text-xs text-muted-foreground">
              {t("Clicca sulla mappa per scegliere il centro del geofence.")}
            </p>

            <div className="h-56 rounded-lg overflow-hidden border">
              <FleetMapCanvas height="224px" onMapClick={handleMapClick} points={newLat != null && newLng != null ? [
                {lat:newLat,lng:newLng,radius:Number(newRadius)||200,color:"#ea580c",label:t("Zona da confermare")}
              ] : []} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("Annulla")}</Button>
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t("Crea geofence")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
