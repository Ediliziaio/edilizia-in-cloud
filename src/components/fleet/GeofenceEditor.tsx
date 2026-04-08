import { useState } from "react";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Circle, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
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

// Fix icone Leaflet
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

// ── Map click handler ─────────────────────────────────────────────────────────
function ClickHandler({
  onMapClick,
}: {
  onMapClick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

interface GeofenceEditorProps {
  companyId: string;
}

/**
 * Lista + editor geofence per cantieri.
 * Clic sulla mappa → imposta centro del nuovo geofence.
 */
export function GeofenceEditor({ companyId }: GeofenceEditorProps) {
  const { toast } = useToast();
  const {
    geofences,
    isLoading,
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
    if (!newName.trim() || newLat == null || newLng == null) {
      toast({ title: "Errore", description: "Clicca sulla mappa per scegliere il centro e inserisci un nome", variant: "destructive" });
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
      toast({ title: "Geofence creato", description: `"${input.nome}" aggiunto con successo.` });
      setDialogOpen(false);
      setNewName("");
      setNewRadius("200");
      setNewLat(null);
      setNewLng(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Errore";
      toast({ title: "Errore", description: msg, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string, nome: string) => {
    setDeletingId(id);
    try {
      await deleteGeofence(id);
      toast({ title: "Geofence rimosso", description: `"${nome}" rimosso.` });
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
          Zone di geofence ({geofences.length})
        </h3>
        <Button
          size="sm"
          className="h-8 gap-1"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Aggiungi zona
        </Button>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : geofences.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Nessuna zona di geofence configurata
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
                disabled={isDeleting && deletingId === g.id}
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
            <DialogTitle>Nuovo geofence</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="gf-nome">Nome zona *</Label>
              <Input
                id="gf-nome"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="es. Cantiere Via Roma"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="gf-raggio">Raggio (metri)</Label>
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
              <p className="text-xs text-muted-foreground">
                Centro selezionato: {newLat.toFixed(5)}, {newLng.toFixed(5)}
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              Clicca sulla mappa per scegliere il centro del geofence.
            </p>

            <div className="h-56 rounded-lg overflow-hidden border">
              <MapContainer
                center={[41.9028, 12.4964]}
                zoom={6}
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer
                  attribution='&copy; OpenStreetMap'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <ClickHandler onMapClick={handleMapClick} />
                {newLat != null && newLng != null && (
                  <>
                    <Marker position={[newLat, newLng]} />
                    <Circle
                      center={[newLat, newLng]}
                      radius={parseInt(newRadius, 10) || 200}
                      pathOptions={{ color: "#f59e0b", fillColor: "#fef3c7", fillOpacity: 0.4 }}
                    />
                  </>
                )}
              </MapContainer>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Crea geofence
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
