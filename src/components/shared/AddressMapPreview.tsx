import { Button } from "@/components/ui/button";
import { ExternalLink, Copy, Navigation } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  lat: number;
  lng: number;
  formattedAddress?: string;
  apiKey?: string;
}

export default function AddressMapPreview({ lat, lng, formattedAddress }: Props) {
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  const embedUrl = `https://www.google.com/maps?q=${lat},${lng}&z=15&output=embed`;

  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  const navUrl = isMobile
    ? `google.navigation:q=${lat},${lng}`
    : mapsUrl;

  const copyAddress = async () => {
    const text = formattedAddress || `${lat}, ${lng}`;
    await navigator.clipboard.writeText(text);
    toast({ title: "Indirizzo copiato" });
  };

  return (
    <div className="space-y-2">
      <div className="rounded-lg overflow-hidden border h-[160px]">
        <iframe
          src={embedUrl}
          width="100%"
          height="100%"
          style={{ border: 0 }}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title="Mappa appuntamento"
        />
      </div>
      <div className="flex gap-1.5 flex-wrap">
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" asChild>
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3 w-3" />
            Apri in Maps
          </a>
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={copyAddress}>
          <Copy className="h-3 w-3" />
          Copia
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" asChild>
          <a href={navUrl} target="_blank" rel="noopener noreferrer">
            <Navigation className="h-3 w-3" />
            Naviga
          </a>
        </Button>
      </div>
    </div>
  );
}
