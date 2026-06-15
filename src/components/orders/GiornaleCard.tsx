import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { MapPin, Camera, CloudRain, Sun, Cloud, Snowflake, Wind } from "lucide-react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";

const METEO_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  soleggiato: { label: "Soleggiato", icon: Sun, color: "text-yellow-500" },
  nuvoloso: { label: "Nuvoloso", icon: Cloud, color: "text-slate-500" },
  pioggia: { label: "Pioggia", icon: CloudRain, color: "text-blue-500" },
  neve: { label: "Neve", icon: Snowflake, color: "text-sky-400" },
  "vento forte": { label: "Vento forte", icon: Wind, color: "text-teal-500" },
};

interface GiornaleEntry {
  id: string;
  data_lavori: string;
  condizioni_meteo: string;
  lavorazioni_eseguite: string;
  materiali_utilizzati?: string;
  personale_presente: number;
  note?: string;
  avanzamento_percentuale?: number;
  latitude?: number;
  longitude?: number;
  firma_capocantiere?: string;
  firmato_da?: string;
  giornale_foto?: { id: string; url: string }[];
}

interface GiornaleCardProps {
  entry: GiornaleEntry;
  onClick?: () => void;
  compact?: boolean;
}

export const GiornaleCard = memo(function GiornaleCard({ entry, onClick, compact = false }: GiornaleCardProps) {
  const meteo = METEO_CONFIG[entry.condizioni_meteo] || METEO_CONFIG.soleggiato;
  const MeteoIcon = meteo.icon;
  const fotoCount = entry.giornale_foto?.length || 0;
  const hasFirma = !!entry.firma_capocantiere;

  return (
    <Card
      className={`${onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}
      onClick={onClick}
    >
      <CardContent className={`${compact ? "p-3" : "p-4"} space-y-2`}>
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <MeteoIcon className={`h-4 w-4 shrink-0 ${meteo.color}`} />
            <div>
              <p className="font-semibold text-sm">
                {entry.data_lavori && !Number.isNaN(parseISO(entry.data_lavori).getTime())
                  ? format(parseISO(entry.data_lavori), "EEEE d MMMM", { locale: it })
                  : "—"}
              </p>
              <p className="text-xs text-muted-foreground">{meteo.label} · {entry.personale_presente} operai</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {fotoCount > 0 && (
              <Badge variant="outline" className="text-xs gap-1">
                <Camera className="h-3 w-3" />{fotoCount}
              </Badge>
            )}
            {hasFirma && (
              <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
                ✓ Firmato
              </Badge>
            )}
          </div>
        </div>

        {/* Lavorazioni */}
        <p className={`text-sm ${compact ? "line-clamp-2" : ""} text-foreground`}>
          {entry.lavorazioni_eseguite}
        </p>

        {/* Avanzamento */}
        {entry.avanzamento_percentuale !== undefined && entry.avanzamento_percentuale !== null && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Avanzamento</span>
              <span className="font-medium">{entry.avanzamento_percentuale}%</span>
            </div>
            <Progress value={entry.avanzamento_percentuale} className="h-1.5" />
          </div>
        )}

        {/* GPS coords */}
        {entry.latitude && entry.longitude && !compact && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            <span>{entry.latitude.toFixed(4)}, {entry.longitude.toFixed(4)}</span>
          </div>
        )}

        {/* Note */}
        {entry.note && !compact && (
          <p className="text-xs text-muted-foreground italic">{entry.note}</p>
        )}
      </CardContent>
    </Card>
  );
});
