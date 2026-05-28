import { Suspense, lazy, useState } from "react";
import { Loader2, Users, RefreshCw, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useLiveTecnici, STALE_THRESHOLD_SEC } from "@/hooks/useLiveTecnici";
import { useGeofence } from "@/hooks/useGeofence";
import { useGeofenceAlert } from "@/hooks/useGeofenceAlert";
import { PercorsoTecnico } from "@/components/fleet/PercorsoTecnico";
import { GeofenceEditor } from "@/components/fleet/GeofenceEditor";
import { GeofenceAlertBanner } from "@/components/fleet/GeofenceAlertBanner";
import { ExportPercorsiButton } from "@/components/fleet/ExportPercorsiButton";
import type { GpsPositionExport } from "@/lib/gps/exportExcel";

// Lazy load della mappa live per non bloccare il bundle
const MappaLiveAdmin = lazy(() =>
  import("@/components/fleet/MappaLiveAdmin").then((m) => ({
    default: m.MappaLiveAdmin,
  }))
);

function MapLoader() {
  return (
    <div className="h-96 flex items-center justify-center border rounded-lg bg-muted/30">
      <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
    </div>
  );
}

/**
 * Tab GPS Percorsi — modulo FleetTrack admin.
 * Mostrato solo se fleet_track_enabled = true sull'azienda.
 */
export function TabGpsPercorsi() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? "";

  const { tecnici, isLoading: tecniciLoading, refresh } = useLiveTecnici(companyId);
  const { geofences } = useGeofence(companyId);
  const { ultimaViolazione, dismissViolazione } = useGeofenceAlert(companyId);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"live" | "storico" | "geofence">("live");
  const [storicoPos, setStoricoPos] = useState<GpsPositionExport[]>([]);
  const [storicoNomeTecnico, setStoricoNomeTecnico] = useState<string>('');
  const [storicoData, setStoricoData] = useState<string>('');

  const onlineTecnici = tecnici.filter((t) => t.staleSec <= STALE_THRESHOLD_SEC);
  const selectedTecnico = tecnici.find((t) => t.userId === selectedUserId) ?? null;

  return (
    <div className="space-y-5">
      {ultimaViolazione && (
        <GeofenceAlertBanner
          violazione={ultimaViolazione}
          onDismiss={() => dismissViolazione(ultimaViolazione.id)}
        />
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Navigation className="h-4 w-4 text-blue-500" />
            GPS FleetTrack
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tracciamento live e storico percorsi dei tecnici
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <Users className="h-3 w-3" />
            {onlineTecnici.length} online
          </Badge>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1"
            onClick={refresh}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Aggiorna
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="h-auto gap-1 p-1">
          <TabsTrigger value="live" className="h-9 text-xs gap-1.5">
            <Navigation className="h-3.5 w-3.5" />
            Mappa live
          </TabsTrigger>
          <TabsTrigger value="storico" className="h-9 text-xs gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Storico percorsi
          </TabsTrigger>
          <TabsTrigger value="geofence" className="h-9 text-xs gap-1.5">
            Zone geofence
          </TabsTrigger>
        </TabsList>

        {/* ── Mappa live ──────────────────────────────────────────────────── */}
        <TabsContent value="live" className="mt-4">
          {tecniciLoading ? (
            <MapLoader />
          ) : tecnici.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-sm text-muted-foreground gap-2 border rounded-lg bg-muted/20">
              <Navigation className="h-8 w-8 opacity-30" />
              <p>Nessun tecnico con tracciamento GPS attivo</p>
              <p className="text-xs">Le posizioni appariranno non appena i tecnici avvieranno il tracciamento dall'app.</p>
            </div>
          ) : (
            <Suspense fallback={<MapLoader />}>
              <MappaLiveAdmin
                tecnici={tecnici}
                geofences={geofences}
                height="480px"
                onTecnicoClick={(userId) => {
                  setSelectedUserId(userId);
                  setActiveTab("storico");
                }}
              />
            </Suspense>
          )}

          {/* Lista tecnici sotto la mappa */}
          {tecnici.length > 0 && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {tecnici.map((t) => {
                const stale = t.staleSec > STALE_THRESHOLD_SEC;
                return (
                  <button
                    key={t.userId}
                    className="flex items-center gap-2.5 p-2.5 rounded-lg border bg-card hover:bg-muted/40 transition-colors text-left"
                    onClick={() => {
                      setSelectedUserId(t.userId);
                      setActiveTab("storico");
                    }}
                  >
                    <span
                      className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ backgroundColor: stale ? "#9ca3af" : "#3b82f6" }}
                    >
                      {t.fullName
                        .split(" ")
                        .map((w) => w[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-none truncate">{t.fullName}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {stale
                          ? `Offline da ${Math.floor(t.staleSec / 60)}m`
                          : `${t.staleSec}s fa`}
                      </p>
                    </div>
                    <Badge
                      variant={stale ? "secondary" : "outline"}
                      className={`text-[10px] shrink-0 ${stale ? "" : "bg-green-50 text-green-700 border-green-200"}`}
                    >
                      {stale ? "offline" : "live"}
                    </Badge>
                  </button>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Storico percorsi ────────────────────────────────────────────── */}
        <TabsContent value="storico" className="mt-4 space-y-4">
          {/* Selettore tecnico */}
          <div className="flex flex-wrap gap-2">
            {tecnici.map((t) => (
              <Button
                key={t.userId}
                variant={selectedUserId === t.userId ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setSelectedUserId(t.userId)}
              >
                {t.fullName}
              </Button>
            ))}
            {tecnici.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nessun tecnico con dati GPS disponibili.
              </p>
            )}
          </div>

          {selectedTecnico && (
            <>
              <div className="flex justify-end">
                <ExportPercorsiButton
                  posizioni={storicoPos}
                  nomeTecnico={storicoNomeTecnico}
                  data={storicoData}
                />
              </div>
              <PercorsoTecnico
                companyId={companyId}
                userId={selectedTecnico.userId}
                fullName={selectedTecnico.fullName}
                onPositionsLoaded={(positions, nomeTecnico, data) => {
                  setStoricoPos(positions);
                  setStoricoNomeTecnico(nomeTecnico);
                  setStoricoData(data);
                }}
              />
            </>
          )}
        </TabsContent>

        {/* ── Geofence ────────────────────────────────────────────────────── */}
        <TabsContent value="geofence" className="mt-4">
          <GeofenceEditor companyId={companyId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
