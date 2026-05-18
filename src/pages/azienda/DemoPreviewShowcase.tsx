/**
 * DemoPreviewShowcase — v8.6.63
 *
 * Pagina di anteprima per visualizzare il comportamento del Feature Preview
 * Mode senza dover modificare lo stato DB. Routing temporaneo per demo
 * commerciale / QA. Mostra come si comporta una pagina con:
 *   - FeaturePreviewProvider
 *   - FeaturePreviewBanner (con benefit espandibili)
 *   - FeatureActionGuard sui bottoni
 *   - DemoWatermark sul mockup
 *
 * Per testare:
 *   1. Super-admin imposta "render_ai" come "Demo" per la company
 *   2. Login lato company → naviga su /azienda/preview-demo
 *   3. Vedi tutto il flusso senza dover modificare pagine reali
 */
import {
  FeaturePreviewProvider, FeaturePreviewBanner, FeatureActionGuard, DemoWatermark,
} from "@/components/feature-preview";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Upload, Download, Share2 } from "lucide-react";

export default function DemoPreviewShowcase() {
  return (
    <FeaturePreviewProvider
      featureKey="render_ai"
      featureLabel="Render AI"
      description="Trasforma le foto del tuo cantiere in render fotorealistici professionali per i preventivi"
      benefits={[
        "Render fotorealistici illimitati",
        "Upload da smartphone direttamente in cantiere",
        "Personalizzazione finestre, facciate, pavimenti, illuminazione",
        "Esportazione HD per preventivi e social",
        "Allegabile a preventivi e ordini con 1 click",
      ]}
      forcePreview // Showcase: forza il preview mode indipendentemente dal DB
    >
      <div className="space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Render AI</h1>
          <p className="text-muted-foreground">
            Trasforma le foto in render professionali per chiudere preventivi più velocemente
          </p>
        </div>

        {/* Banner Preview — mostrato solo se feature è in mode preview */}
        <FeaturePreviewBanner />

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Upload card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4" /> Carica foto cantiere
              </CardTitle>
              <CardDescription>
                Punta la fotocamera al muro/facciata e lascia che l'AI faccia il resto.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="title">Titolo progetto</Label>
                <Input id="title" placeholder="Es: Villa Rossi - facciata sud" />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo intervento</Label>
                <Input placeholder="Sostituzione serramenti, intonacatura…" />
              </div>

              <FeatureActionGuard actionLabel="Carica foto">
                <Button className="w-full" size="lg">
                  <Upload className="h-4 w-4 mr-2" />
                  Carica foto cantiere
                </Button>
              </FeatureActionGuard>
            </CardContent>
          </Card>

          {/* Anteprima con watermark */}
          <Card className="relative overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> Anteprima render
              </CardTitle>
              <CardDescription>
                Esempio di output: in demo vedi un'anteprima statica.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative aspect-video rounded-lg bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 flex items-center justify-center overflow-hidden">
                <Sparkles className="h-12 w-12 text-slate-500" />
                <DemoWatermark variant="diagonal" />
              </div>
              <div className="mt-3 flex gap-2">
                <FeatureActionGuard actionLabel="Scarica render">
                  <Button variant="outline" size="sm" className="flex-1">
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Scarica HD
                  </Button>
                </FeatureActionGuard>
                <FeatureActionGuard actionLabel="Condividi con cliente">
                  <Button variant="outline" size="sm" className="flex-1">
                    <Share2 className="h-3.5 w-3.5 mr-1.5" />
                    Condividi
                  </Button>
                </FeatureActionGuard>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Storico render mock */}
        <Card className="relative overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Render recenti</CardTitle>
            <CardDescription>
              Cronologia render generati per i tuoi clienti
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="relative aspect-square rounded-lg bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-950/30 dark:to-orange-950/20 flex items-center justify-center overflow-hidden">
                  <span className="text-2xl">🏗️</span>
                  <DemoWatermark variant="ribbon-tr" label="DEMO" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Info dev */}
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">
              <strong>Per devs:</strong> questa pagina mostra il pattern Feature Preview.
              Se la feature <code className="bg-muted px-1 py-0.5 rounded">render_ai</code> è
              in <code className="bg-muted px-1 py-0.5 rounded">access_level=&apos;preview&apos;</code>:
              banner ambra in cima, dot pulsante sui bottoni, popup unlock al click,
              watermark sui mockup. Se è <code className="bg-muted px-1 py-0.5 rounded">enabled</code>:
              tutto pulito, niente preview.
            </p>
          </CardContent>
        </Card>
      </div>
    </FeaturePreviewProvider>
  );
}
