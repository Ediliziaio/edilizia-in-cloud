/**
 * Foto di cantiere della commessa, lato ufficio.
 *
 * Le foto scattate dal campo arrivano qui con data, ora e coordinate impresse
 * sull'immagine: è la differenza fra "il cliente contesta" e "ecco la foto
 * delle 14:32 con il GPS del cantiere".
 */
import { Camera } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFotoCantiere } from "@/hooks/useFotoCantiere";
import { FotoGrid } from "@/components/foto-cantiere/FotoGrid";
import { FotoUploader } from "@/components/foto-cantiere/FotoUploader";

export function OrdineFotoCantiere({ orderId }: { orderId: string }) {
  const { foto, isLoading, upload, isUploading, elimina, getSignedUrl } = useFotoCantiere(orderId);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Camera className="h-4 w-4" />
          Foto cantiere
          {foto.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">({foto.length})</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <FotoGrid foto={foto} isLoading={isLoading} onElimina={elimina} getSignedUrl={getSignedUrl} />
        <FotoUploader onUpload={({ files, descrizione }) => upload({ files, descrizione })} isUploading={isUploading} />
      </CardContent>
    </Card>
  );
}
