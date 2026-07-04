/**
 * CrmMapTab — tab "Mappa" della dashboard commerciale CRM.
 *
 * Mappa d'Italia (tile OpenStreetMap, come le mappe flotta) con un pin per
 * azienda: VERDE = clienti (EiC + clienti servizi), ROSSO = prospect da
 * outreach. Pan/zoom liberi, filtri per tipo/provincia/ricerca, legenda e
 * contatori. Fase 1: posizione da coordinate precise o centroide provincia.
 *
 * Perf: usa CircleMarker (SVG, niente asset icona) — leggero anche con molti
 * punti. Con decine di migliaia di pin si aggiungerà il clustering (Fase 2).
 */
import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useCrmMapPoints, type CrmMapPoint } from "@/hooks/useCrmMapPoints";
import { ITALY_CENTER } from "@/lib/crm/provinceCentroids";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, MapPin, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const COLOR = {
  cliente: "#16a34a", // emerald-600
  prospect: "#dc2626", // red-600
} as const;

/** Forza il ricalcolo dimensione mappa dopo il mount (evita tile a 0px se il
 *  tab era nascosto al primo render). */
function InvalidateOnMount() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 60);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

export function CrmMapTab({ companyId }: { companyId: string }) {
  const { data, isLoading, isError, refetch, isFetching } = useCrmMapPoints(companyId);
  const [tipo, setTipo] = useState<"tutti" | "cliente" | "prospect">("tutti");
  const [provincia, setProvincia] = useState<string>("tutte");
  const [search, setSearch] = useState("");

  const province = useMemo(() => {
    const s = new Set<string>();
    (data?.points ?? []).forEach((p) => { if (p.provincia) s.add(p.provincia); });
    return Array.from(s).sort();
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.points ?? []).filter((p) => {
      if (tipo !== "tutti" && p.tipo !== tipo) return false;
      if (provincia !== "tutte" && p.provincia !== provincia) return false;
      if (q && !p.nome.toLowerCase().includes(q) && !(p.categoria ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, tipo, provincia, search]);

  const shownClienti = filtered.filter((p) => p.tipo === "cliente").length;
  const shownProspect = filtered.length - shownClienti;

  return (
    <div className="space-y-3">
      {/* Filtri */}
      <Card>
        <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Cerca azienda o categoria…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutti</SelectItem>
              <SelectItem value="cliente">🟢 Clienti</SelectItem>
              <SelectItem value="prospect">🔴 Prospect</SelectItem>
            </SelectContent>
          </Select>
          <Select value={provincia} onValueChange={setProvincia}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Provincia" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutte">Tutte le province</SelectItem>
              {province.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching} title="Aggiorna">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </CardContent>
      </Card>

      {/* Mappa */}
      <Card className="overflow-hidden">
        <div className="relative h-[68vh] min-h-[460px] w-full">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Caricamento mappa…
            </div>
          ) : isError ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <AlertTriangle className="h-6 w-6 text-amber-500" />
              <span className="text-sm">Impossibile caricare i dati della mappa.</span>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="mr-1.5 h-4 w-4" /> Riprova
              </Button>
            </div>
          ) : (
            <>
              <MapContainer
                center={ITALY_CENTER}
                zoom={6}
                scrollWheelZoom
                style={{ height: "100%", width: "100%" }}
              >
                <InvalidateOnMount />
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  maxZoom={19}
                />
                {filtered.map((p) => (
                  <CircleMarker
                    key={p.id}
                    center={[p.lat, p.lng]}
                    radius={7}
                    pathOptions={{
                      color: "#ffffff",
                      weight: 1.5,
                      fillColor: COLOR[p.tipo],
                      fillOpacity: p.precise ? 0.9 : 0.65,
                    }}
                  >
                    <Popup>
                      <MapPointPopup p={p} />
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>

              {/* Legenda + contatori (overlay) */}
              <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-md backdrop-blur">
                <div className="mb-1 flex items-center gap-1.5 font-semibold text-slate-700">
                  <MapPin className="h-3.5 w-3.5 text-orange-500" /> Aziende sulla mappa
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLOR.cliente }} />
                  Clienti <span className="font-semibold text-slate-800">{shownClienti}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLOR.prospect }} />
                  Prospect <span className="font-semibold text-slate-800">{shownProspect}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Nota copertura */}
      {data && (
        <p className="px-1 text-xs text-muted-foreground">
          {data.clienti + data.prospect} aziende posizionate
          {data.approssimate > 0 && ` · ${data.approssimate} su centroide provincia (posizione approssimata)`}
          {data.senzaPosizione > 0 && ` · ${data.senzaPosizione} senza provincia/coordinate (non mostrabili)`}
          . La geocodifica stradale precisa arriva in una fase successiva.
        </p>
      )}
    </div>
  );
}

function MapPointPopup({ p }: { p: CrmMapPoint }) {
  return (
    <div className="min-w-[180px] space-y-1">
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: COLOR[p.tipo] }}
        />
        <span className="font-semibold">{p.nome}</span>
      </div>
      <Badge variant={p.tipo === "cliente" ? "default" : "secondary"} className="text-[10px]">
        {p.tipo === "cliente" ? "Cliente" : "Prospect"}
      </Badge>
      {p.categoria && <div className="text-xs text-slate-600">Categoria: {p.categoria}</div>}
      {(p.indirizzo || p.provincia) && (
        <div className="text-xs text-slate-500">
          {p.indirizzo ? `${p.indirizzo}` : ""}
          {p.indirizzo && p.provincia ? " · " : ""}
          {p.provincia ?? ""}{p.regione ? ` (${p.regione})` : ""}
        </div>
      )}
      {!p.precise && (
        <div className="text-[10px] italic text-amber-600">Posizione approssimata (provincia)</div>
      )}
    </div>
  );
}
