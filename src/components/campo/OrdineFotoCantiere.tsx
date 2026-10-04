/**
 * Foto di cantiere della commessa, lato ufficio.
 *
 * Le foto scattate dal campo arrivano qui con data, ora e coordinate impresse
 * sull'immagine: è la differenza fra "il cliente contesta" e "ecco la foto
 * delle 14:32 con il GPS del cantiere".
 */
import { useState } from "react";
import { Camera, Plus, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFotoCantiere } from "@/hooks/useFotoCantiere";
import { FotoGrid } from "@/components/foto-cantiere/FotoGrid";
import { FotoUploader } from "@/components/foto-cantiere/FotoUploader";

export function OrdineFotoCantiere({ orderId }: { orderId: string }) {
  const { foto, isLoading, upload, isUploading, elimina, getSignedUrl } = useFotoCantiere(orderId);
  // Il modulo di caricamento serve di rado: stava sempre aperto sotto la galleria
  // e occupava più spazio delle foto stesse. Si apre dal pulsante.
  const [caricaAperto, setCaricaAperto] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Camera className="h-4 w-4" />
          Foto cantiere
          {foto.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">({foto.length})</span>
          )}
        </CardTitle>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={caricaAperto}
          aria-controls="foto-cantiere-carica"
          onClick={() => setCaricaAperto((aperto) => !aperto)}
        >
          {caricaAperto ? <X className="mr-1.5 h-4 w-4" /> : <Plus className="mr-1.5 h-4 w-4" />}
          {caricaAperto ? "Chiudi" : "Aggiungi foto"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {caricaAperto && (
          <div id="foto-cantiere-carica">
            <FotoUploader
              onUpload={async (params) => {
                const esito = await upload({ files: params.files, descrizione: params.descrizione });
                setCaricaAperto(false);
                return esito;
              }}
              isUploading={isUploading}
            />
          </div>
        )}
        <FotoGrid foto={foto} isLoading={isLoading} onElimina={elimina} getSignedUrl={getSignedUrl} />
      </CardContent>
    </Card>
  );
}
