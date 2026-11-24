import { FleetMapCanvas } from "./FleetMapCanvas";
import type { GpsPosition } from "@/types/fleet";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
type Point=Pick<GpsPosition,"lat"|"lng"|"recorded_at">;
export function PercorsoMap({positions,height="320px"}:{positions:Point[];height?:string}) {
  const t = useT();
  if (!positions.length) return null;
  return <FleetMapCanvas key={positions[0].recorded_at} height={height} route={positions} points={[
    {...positions[0],label:t("Inizio percorso"),color:"#2563eb"},
    {...positions[positions.length-1],label:t("Fine percorso"),color:"#ea580c"},
  ]}/>;
}
