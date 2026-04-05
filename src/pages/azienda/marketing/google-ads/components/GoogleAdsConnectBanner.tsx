/**
 * Banner visualizzato quando l'account Google Ads non è ancora collegato
 * o non ci sono dati disponibili nel periodo selezionato.
 *
 * @param title - Titolo del banner
 * @param description - Descrizione contestuale
 * @param showImportHint - Se true mostra il suggerimento sull'importazione dati
 */
import { Megaphone, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface GoogleAdsConnectBannerProps {
  title?: string;
  description?: string;
  showImportHint?: boolean;
}

export function GoogleAdsConnectBanner({
  title = "Collega il tuo account Google Ads",
  description = "Visualizza in tempo reale le performance delle tue campagne pubblicitarie: spesa, click, impressioni e conversioni.",
  showImportHint = false,
}: GoogleAdsConnectBannerProps) {
  return (
    <Card className="border-dashed border-2 border-muted-foreground/30">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Megaphone className="h-8 w-8 text-primary" />
        </div>
        <div className="space-y-1 max-w-sm">
          <h3 className="font-semibold text-lg">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {showImportHint && (
          <p className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2 max-w-md">
            💡 I dati vengono sincronizzati automaticamente ogni giorno dalla tua campagna Google Ads. Assicurati che la sincronizzazione sia attiva nelle impostazioni.
          </p>
        )}
        <Button variant="outline" className="gap-2" asChild>
          <a
            href="https://ads.google.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="h-4 w-4" />
            Vai a Google Ads
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
