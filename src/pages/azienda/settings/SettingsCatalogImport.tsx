/**
 * Sprint C — Catalogo Esteso
 * Pagina Import Listini — combina wizard Excel/CSV + AI PDF + widget AI usage.
 *
 * Rotta: /azienda/impostazioni/catalogo/import  (aggiunta in companyRoutes.tsx)
 */
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Upload, Sparkles } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { ListinoImportWizard } from "@/components/listino-import/ListinoImportWizard";
import { ListinoAIImport } from "@/components/listino-import/ListinoAIImport";
import { AiUsageWidget } from "@/components/settings/AiUsageWidget";

export default function SettingsCatalogImport() {
  // ?tab=ai: dal listino, «Listino fornitore in PDF» apriva la scheda dell'Excel.
  const [parametri] = useSearchParams();
  const [tab, setTab] = useState<"manual" | "ai">(() => (parametri.get("tab") === "ai" ? "ai" : "manual"));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Import Listini</h1>
          <p className="text-sm text-muted-foreground">
            Importa articoli / famiglie / tariffe da Excel, CSV o PDF con AI.
          </p>
        </div>
        <Button asChild variant="ghost">
          <Link to="/azienda/impostazioni/catalogo?tab=articoli">
            <ArrowLeft className="h-4 w-4 mr-2" /> Torna al Catalogo
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "manual" | "ai")}>
            <TabsList>
              <TabsTrigger value="manual">
                <Upload className="h-4 w-4 mr-2" /> Excel / CSV (Wizard)
              </TabsTrigger>
              <TabsTrigger value="ai">
                <Sparkles className="h-4 w-4 mr-2" /> PDF con AI
              </TabsTrigger>
            </TabsList>

            <TabsContent value="manual" className="mt-4">
              <ListinoImportWizard />
            </TabsContent>
            <TabsContent value="ai" className="mt-4">
              <ListinoAIImport />
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-4">
          <AiUsageWidget days={30} />

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Suggerimenti</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-2">
              <p>
                <strong>Excel/CSV:</strong> scarica il template, compila le colonne fisse + eventuali campi
                personalizzati configurati in Impostazioni → Campi Personalizzati.
              </p>
              <p>
                <strong>PDF con AI:</strong> funziona meglio su listini strutturati con tabelle. L'AI mostra
                sempre una preview modificabile prima di importare.
              </p>
              <p>
                I campi personalizzati con tipo select vanno compilati con uno dei valori ammessi (vedi foglio
                "Istruzioni" del template).
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
