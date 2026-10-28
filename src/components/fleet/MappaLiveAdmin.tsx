import { FleetMapCanvas } from "./FleetMapCanvas";
import type { TecnicoLivePosition, CantiereGeofence } from "@/types/fleet";
import { STALE_THRESHOLD_SEC } from "@/hooks/useLiveTecnici";
export function MappaLiveAdmin({tecnici,geofences=[],height="480px",onTecnicoClick,className}:{
  tecnici:TecnicoLivePosition[];geofences?:CantiereGeofence[];height?:string;onTecnicoClick?:(id:string)=>void;className?:string;
}) {
  return <div className={className}><FleetMapCanvas height={height} points={[
    ...geofences.map(g=>({lat:g.center_lat,lng:g.center_lng,radius:g.radius_mt,label:g.nome,color:"#ea580c"})),
    ...tecnici.map(t=>({lat:t.lat,lng:t.lng,label:t.fullName,color:t.staleSec>STALE_THRESHOLD_SEC?"#94a3b8":"#2563eb",
      onClick:onTecnicoClick?()=>onTecnicoClick(t.userId):undefined})),
  ]}/></div>;
}
